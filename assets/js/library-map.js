// Library Map view (experimental) — a force-directed diagram of explicit
// editorial relationships between Library entries. See CLAUDE.md § Library
// map view. Deliberately NOT a knowledge graph or similarity visualization:
// every edge here is something SARC actually declared in front matter —
// creators[].ref (a person/group credited on a work) and related[].ref (an
// editorial cross-reference, with its relation type carried through from
// data/library.yaml's controlled vocabulary). No inferred edges, no shared-
// subject/tag edges, no clustering.
//
// Architecture (kept as separate stages on purpose, per CLAUDE.md):
//   Library data (/library/index.json, already the canonical client-side
//     export used elsewhere) -> buildGraph() (nodes + edges) -> layout()
//     (positions) -> render() (SVG) -> interaction (pan/zoom/hover/click).
// This file owns all of it and runs independently of library-filter.js —
// the two communicate only via one event, `library:filter-change` (fired by
// library-filter.js on every filter/view change) plus this file reading
// location.search once at startup for the same information, since script
// load order means the very first firing of that event happens before this
// file's listener exists. Visibility of the whole view (#library-map hidden
// or not) is still owned by library-filter.js, same as Images.
//
// Node Type Encoding: color + shape are keyed by PUBLIC type (person/group/
// organization/work/event/place/concept — index.json's `public_type` per
// entry, styled via `public_type_styles`), not an entry's specific type
// (release/composition/essay/…) — see CLAUDE.md § Library "Public Type vs
// Specific Type". Both are resolved once at build time from data/library.yaml
// via partials/library-public-types.html, the one canonical map shared with
// the Type filter chip swatches (library-filters.html). This file never
// hard-codes a color, and the Type filter itself only ever operates on
// public_type (`matchesEntry()` below, and the chip values it reads from
// `library:filter-change` / the URL) — specific type stays purely
// descriptive, shown as `type_label` on preview cards.
//
// Image nodes: any entry with a primary_image renders using that image
// (already processed/cropped by Hugo for index.json elsewhere — no separate
// map-specific derivative) instead of the abstract shape; entries without
// one keep the type shape/color. This, not permanent text, is what tells a
// same-titled person and a work of that name apart at a glance; the preview
// cards below resolve any remaining ambiguity on demand.
//
// Selection-Centered Navigation: clicking a node makes it the *selection* —
// a stable point of focus that persists until another node is selected, a
// filter change removes it, or it's explicitly cleared (click away /
// Escape). Selecting recenters the graph on it (an animated pan, current
// zoom preserved — see recenterOn()) and shows a persistent card ("where I
// am"). The Selection Hierarchy (is-selected/is-neighbor/is-connected, plus
// the unstyled "unrelated" default) is driven ENTIRELY by the selection,
// never by hover — hovering a different node never replaces or dims it.
// Hover is a separate, secondary layer: it shows its own transient card
// ("what I'm considering next") and a light .is-hovered outline on that one
// node, both gone the instant the hover ends, while the selection's card and
// tiers stay exactly as they were. Clicking a card (either one) is the only
// mouse gesture that navigates away to the entry's real page — clicking a
// node only selects it. Keyboard access takes the simpler, fully-reliable
// path instead: Enter/Space on a focused node always navigates directly,
// since neither card is independently reachable by Tab.
(function () {
  "use strict";

  var container = document.getElementById("library-map");
  var svg = document.getElementById("library-map-svg");
  if (!container || !svg) return;
  var edgesG = document.getElementById("library-map-edges");
  var nodesG = document.getElementById("library-map-nodes");
  var emptyEl = document.getElementById("library-map-empty");
  var SVGNS = "http://www.w3.org/2000/svg";
  var HUB_TYPES = { person: true, group: true, organization: true };
  var FALLBACK_STYLE = { color: "dark-grey", shape: "circle", label: "Other" };
  var SUMMARY_MAX = 110;
  var RECENTER_MS = 300;

  var W = 1000, H = 700;
  var nodes = [], edges = [];
  var nodeById = {}, entryById = {}, nodeEls = {}, edgeEls = [];
  var nodeComponent = {};
  var typeStyles = {};
  var sel = { type: [], subject: [] };
  var currentVB = { x: 0, y: 0, w: W, h: H };
  var selectedId = null; // the persistent selection — see module comment
  var hoveredId = null; // the transient hover preview, independent of selectedId
  var didPan = false; // true when the current gesture moved the map — see initPanZoom
  var panAnimHandle = null; // in-flight recenter animation, if any

  function matchesEntry(e) {
    var typeOk = sel.type.length === 0 || sel.type.indexOf(e.public_type) !== -1;
    var subjOk = sel.subject.length === 0 || sel.subject.some(function (s) {
      return (e.subjects || []).indexOf(s) !== -1;
    });
    return typeOk && subjOk;
  }

  // Read the URL directly for the initial filter state — see the note above
  // on why this can't just wait for the first library:filter-change event.
  function readSelFromURL() {
    var params = new URLSearchParams(location.search);
    sel.type = (params.get("type") || "").split(",").filter(Boolean);
    sel.subject = (params.get("subject") || "").split(",").filter(Boolean);
  }

  // --- Stage 1: Library data -> graph model -------------------------------
  function buildGraph(entries) {
    entries.forEach(function (e) {
      entryById[e.library_id] = e;
      nodeById[e.library_id] = {
        id: e.library_id,
        title: e.title,
        type: e.type,
        publicType: e.public_type,
        url: e.url,
        hub: !!HUB_TYPES[e.type],
        x: W / 2 + (Math.random() - 0.5) * W * 0.8,
        y: H / 2 + (Math.random() - 0.5) * H * 0.8,
        vx: 0, vy: 0
      };
    });
    nodes = entries.map(function (e) { return nodeById[e.library_id]; });

    var seen = {};
    function addEdge(a, b, kind, label) {
      if (!nodeById[a] || !nodeById[b] || a === b) return;
      var key = a + ">" + b + ":" + kind + ":" + label;
      if (seen[key]) return;
      seen[key] = true;
      edges.push({ source: a, target: b, kind: kind, label: label || "" });
    }
    entries.forEach(function (e) {
      (e.creators || []).forEach(function (c) {
        if (c.ref) addEdge(c.ref, e.library_id, "creator", c.role);
      });
      (e.related || []).forEach(function (r) {
        if (r.ref) addEdge(e.library_id, r.ref, "related", r.relation);
      });
    });

    nodeComponent = computeComponents();
  }

  // Connected components (plain union-find) — used only to tell "in the same
  // connected neighborhood as the selected node, just not directly adjacent"
  // apart from "no path at all," the third and fourth tiers of the
  // selection hierarchy below. Not exposed/visualized on its own.
  function computeComponents() {
    var parent = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
    nodes.forEach(function (n) { parent[n.id] = n.id; });
    edges.forEach(function (e) { union(e.source, e.target); });
    var comp = {};
    nodes.forEach(function (n) { comp[n.id] = find(n.id); });
    return comp;
  }

  // --- Stage 2: layout — a small dependency-free force simulation, run to
  // completion synchronously (not animated frame-by-frame): the spec calls
  // for a layout that "settles quickly" and then "becomes essentially
  // static," which an instant compute-then-render satisfies more plainly
  // than an animated settle-in-view ever could, with zero risk of the
  // "continuously drifting layout" this is explicitly meant to avoid. This
  // initial layout never re-runs on selection — selecting a node only pans
  // the view (recenterOn()), it doesn't recompute positions. ---
  function layout() {
    if (!nodes.length) return;
    var k = Math.sqrt((W * H) / nodes.length);
    var repulsionK = k * k;
    // Random initial placement means a few pairs land almost on top of each
    // other by chance. `|| 0.01` only catches an exact-zero distSq, not a
    // merely tiny one — a near-coincident pair could still divide by
    // something like 0.0001 and get an in-one-step force in the hundreds of
    // thousands, flinging a node permanently off into a corner with nothing
    // strong enough (spring/centering are comparatively weak) to ever pull it
    // back. Floor distSq relative to k so the worst-case single-pair force
    // stays bounded regardless of how unlucky the random start was.
    var minDistSq = Math.max(1, repulsionK * 0.001);
    var springK = 0.02;
    var damping = 0.85;
    var maxIterations = 400;
    // A second, independent safeguard: cap how far any node can move in one
    // iteration, so no combination of forces (not just the repulsion case
    // above) can ever teleport a node across the canvas in a single step.
    var maxSpeed = k * 2;
    for (var iter = 0; iter < maxIterations; iter++) {
      for (var i = 0; i < nodes.length; i++) { nodes[i].fx = 0; nodes[i].fy = 0; }
      for (i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i], b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var distSq = dx * dx + dy * dy;
          if (distSq < minDistSq) distSq = minDistSq;
          var dist = Math.sqrt(distSq);
          var force = repulsionK / distSq;
          var fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.fx += fx; a.fy += fy;
          b.fx -= fx; b.fy -= fy;
        }
      }
      edges.forEach(function (e) {
        var a = nodeById[e.source], b = nodeById[e.target];
        var dx = a.x - b.x, dy = a.y - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var force = springK * (dist - k);
        var fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.fx -= fx; a.fy -= fy;
        b.fx += fx; b.fy += fy;
      });
      var totalMove = 0;
      for (i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.fx += (W / 2 - n.x) * 0.01;
        n.fy += (H / 2 - n.y) * 0.01;
        n.vx = (n.vx + n.fx) * damping;
        n.vy = (n.vy + n.fy) * damping;
        var speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > maxSpeed) { n.vx = n.vx / speed * maxSpeed; n.vy = n.vy / speed * maxSpeed; }
        n.x += n.vx; n.y += n.vy;
        totalMove += Math.abs(n.vx) + Math.abs(n.vy);
      }
      if (totalMove / nodes.length < 0.05) break;
    }
  }

  // --- Stage 3: render -----------------------------------------------------
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // One shape element per the node's public type — see the module comment.
  // All carry the shared "map-shape" class CSS uses for the emphasis
  // (opacity) tiers, and an inline fill color (the one thing CSS can't know,
  // since it varies node-to-node by type). Used as the fallback whenever an
  // entry has no primary image — see createNodeVisual().
  function createShape(style, size) {
    var fill = "var(--colorplan-" + style.color + ")";
    var shapeEl;
    if (style.shape === "square") {
      shapeEl = el("rect", { x: -size, y: -size, width: size * 2, height: size * 2 });
    } else if (style.shape === "diamond") {
      var d = size * 1.15;
      shapeEl = el("polygon", { points: "0,-" + d + " " + d + ",0 0," + d + " -" + d + ",0" });
    } else if (style.shape === "triangle") {
      var t = size * 1.3;
      shapeEl = el("polygon", { points: "0,-" + t + " " + t + "," + (t * 0.75) + " -" + t + "," + (t * 0.75) });
    } else {
      shapeEl = el("circle", { r: size });
    }
    shapeEl.setAttribute("class", "map-shape");
    shapeEl.style.fill = fill;
    return shapeEl;
  }

  // The entry's own primary image when it has one (same processed asset
  // index.json already exports for the chance-selection panel — no separate
  // map thumbnail derivative), framed in a small square with a border so it
  // still reads as "a node," not a loose picture; falls back to the type
  // shape otherwise. Both cases return an element already carrying the
  // "map-shape" class(es) the emphasis-tier CSS keys off. The frame's border
  // carries the node's public-type color — image nodes still read as their
  // broad type at a glance without ever recoloring the artwork itself.
  function createNodeVisual(n, style, entry) {
    var img = entry && entry.primary_image;
    if (!img || !img.url) return createShape(style, n.hub ? 6 : 4);
    var s = n.hub ? 11 : 9;
    var group = el("g", { "class": "map-image-node" });
    var bg = el("rect", {
      "class": "map-shape map-image-node-bg",
      x: -s, y: -s, width: s * 2, height: s * 2
    });
    bg.style.stroke = "var(--colorplan-" + style.color + ")";
    group.appendChild(bg);
    var imageEl = el("image", {
      "class": "map-shape map-image-node-img",
      x: -s, y: -s, width: s * 2, height: s * 2,
      preserveAspectRatio: "xMidYMid slice"
    });
    imageEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", img.url);
    imageEl.setAttribute("href", img.url);
    group.appendChild(imageEl);
    return group;
  }

  function render() {
    edgesG.innerHTML = "";
    nodesG.innerHTML = "";
    edgeEls = [];
    nodeEls = {};

    edges.forEach(function (e) {
      var a = nodeById[e.source], b = nodeById[e.target];
      var line = el("line", {
        "class": "map-edge map-edge--" + e.kind,
        x1: a.x, y1: a.y, x2: b.x, y2: b.y
      });
      line.dataset.source = e.source;
      line.dataset.target = e.target;
      edgesG.appendChild(line);
      edgeEls.push(line);
    });

    nodes.forEach(function (n) {
      var style = typeStyles[n.publicType] || FALLBACK_STYLE;
      var entry = entryById[n.id];
      var g = el("g", { "class": "map-node", transform: "translate(" + n.x + "," + n.y + ")" });
      g.appendChild(createNodeVisual(n, style, entry));

      g.tabIndex = 0;
      g.setAttribute("role", "link");
      g.setAttribute("aria-label", n.title + " (" + (style.label || "Other") + ")");
      g.addEventListener("pointerenter", function () { setHovered(n.id); });
      g.addEventListener("pointerleave", function () { clearHovered(); });
      g.addEventListener("focus", function () { setHovered(n.id); });
      g.addEventListener("blur", function () { clearHovered(); });
      // A click selects this node (see module comment) — it does not
      // navigate. Keyboard activation is the simpler, always-reliable path:
      // it navigates directly, since neither card is independently
      // reachable by Tab.
      g.addEventListener("click", function () { selectNode(n.id); });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (n.url) location.href = n.url; }
      });

      nodesG.appendChild(g);
      nodeEls[n.id] = g;
    });
  }

  function neighborsOf(id) {
    var out = [];
    edges.forEach(function (e) {
      if (e.source === id) out.push(e.target);
      else if (e.target === id) out.push(e.source);
    });
    return out;
  }

  // --- Preview cards: two independent catalog-style cards (image + title +
  // creator/year + short summary) — see module comment. Each is its own
  // small controller over one DOM subtree so the same population/position/
  // show/hide logic can run against either without duplication. -----------
  function makeCardController(rootEl) {
    if (!rootEl) return null;
    return {
      root: rootEl,
      media: rootEl.querySelector(".library-map-card-media"),
      title: rootEl.querySelector(".library-map-card-title"),
      subtitle: rootEl.querySelector(".library-map-card-subtitle"),
      summary: rootEl.querySelector(".library-map-card-summary")
    };
  }

  var selectedCard = makeCardController(document.getElementById("library-map-card"));
  var hoverCard = makeCardController(document.getElementById("library-map-hover-card"));

  function nodeScreenPosition(n) {
    var rect = svg.getBoundingClientRect();
    return {
      x: rect.left + (n.x - currentVB.x) / currentVB.w * rect.width,
      y: rect.top + (n.y - currentVB.y) / currentVB.h * rect.height
    };
  }

  function populateCard(ctrl, entry) {
    if (ctrl.media) {
      ctrl.media.innerHTML = "";
      var img = entry.primary_image;
      if (img) {
        var imgEl = document.createElement("img");
        imgEl.src = img.url;
        imgEl.alt = "";
        imgEl.style.objectPosition = img.pos || "center";
        imgEl.loading = "lazy";
        imgEl.decoding = "async";
        ctrl.media.appendChild(imgEl);
        ctrl.media.hidden = false;
      } else {
        ctrl.media.hidden = true;
      }
    }
    if (ctrl.title) ctrl.title.textContent = entry.title;
    if (ctrl.subtitle) {
      var bits = [];
      if (entry.creator_names) bits.push(entry.creator_names);
      // Specific type (Composition, Album, Essay, …) is real disambiguating
      // metadata for a work — but on a person's or group's own card it would
      // just restate the obvious ("Person"), so it's suppressed there
      // exactly like library-record.html's catalog kicker.
      if (entry.type_label && entry.type !== "person" && entry.type !== "group") bits.push(entry.type_label);
      if (entry.year) bits.push(entry.year);
      ctrl.subtitle.textContent = bits.join(" · ");
    }
    if (ctrl.summary) {
      var summary = entry.summary || "";
      if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX - 1).trim() + "…";
      ctrl.summary.textContent = summary;
      ctrl.summary.hidden = !summary;
    }
  }

  // Split out from showCardFor() so panning/zooming can re-run just the
  // positioning math (a node's on-screen point moves with the viewBox even
  // though its own SVG-space x/y never changes) without re-populating a
  // card's content on every pointermove tick.
  function positionCardFor(ctrl, n) {
    if (!ctrl || ctrl.root.hidden) return;
    var containerRect = container.getBoundingClientRect();
    var pos = nodeScreenPosition(n);
    var left = pos.x - containerRect.left + 14;
    var top = pos.y - containerRect.top + 14;
    // Measure after unhiding, then clamp so it never overflows the map frame.
    var cardRect = ctrl.root.getBoundingClientRect();
    left = Math.max(4, Math.min(left, containerRect.width - cardRect.width - 4));
    top = Math.max(4, Math.min(top, containerRect.height - cardRect.height - 4));
    ctrl.root.style.left = left + "px";
    ctrl.root.style.top = top + "px";
  }

  function showCardFor(ctrl, id) {
    if (!ctrl) return;
    var n = nodeById[id], entry = entryById[id];
    if (!n || !entry) return;
    ctrl.root.dataset.entryId = id;
    populateCard(ctrl, entry);
    ctrl.root.hidden = false;
    positionCardFor(ctrl, n);
  }

  function hideCardFor(ctrl) {
    if (ctrl) { ctrl.root.hidden = true; delete ctrl.root.dataset.entryId; }
  }

  // Called on every pan/zoom step so any visible card tracks its node
  // instead of staying pinned to its old screen position while the graph
  // moves underneath it.
  function repositionVisibleCards() {
    [selectedCard, hoverCard].forEach(function (ctrl) {
      if (!ctrl || ctrl.root.hidden) return;
      var id = ctrl.root.dataset.entryId;
      var n = id && nodeById[id];
      if (n) positionCardFor(ctrl, n);
    });
  }

  [selectedCard, hoverCard].forEach(function (ctrl) {
    if (!ctrl) return;
    ctrl.root.addEventListener("click", function () {
      var id = ctrl.root.dataset.entryId;
      var entry = id && entryById[id];
      if (entry && entry.url) location.href = entry.url;
    });
  });

  // --- Selection hierarchy: four visual tiers, driven only by selectedId —
  // hover never touches this (see module comment):
  //   1. is-selected  — the selected node itself
  //   2. is-neighbor  — directly connected to it
  //   3. is-connected — same connected component, but not directly adjacent
  //      ("connected background")
  //   4. (default under .has-selection, no extra class) — a different
  //      component entirely ("unrelated"), recedes the most
  // Recomputed fresh on every selection change and on every filter change. --
  function applySelectionTiers() {
    nodes.forEach(function (n) {
      var g = nodeEls[n.id];
      if (g) g.classList.remove("is-selected", "is-neighbor", "is-connected");
    });
    edgeEls.forEach(function (line) { line.classList.remove("is-active"); });

    if (!selectedId || !nodeEls[selectedId]) {
      nodesG.classList.remove("has-selection");
      return;
    }
    nodesG.classList.add("has-selection");
    nodeEls[selectedId].classList.add("is-selected");

    var direct = {};
    neighborsOf(selectedId).forEach(function (nid) {
      direct[nid] = true;
      var g = nodeEls[nid];
      if (g) g.classList.add("is-neighbor");
    });

    var comp = nodeComponent[selectedId];
    nodes.forEach(function (n) {
      if (n.id === selectedId || direct[n.id]) return;
      var g = nodeEls[n.id];
      if (g && nodeComponent[n.id] === comp) g.classList.add("is-connected");
    });

    edgeEls.forEach(function (line) {
      if (line.dataset.source === selectedId || line.dataset.target === selectedId) {
        line.classList.add("is-active");
      }
    });
  }

  // Clicking a node makes it the new selection: recompute the tiers, show
  // its persistent card, and animate the graph to recenter on it. Selecting
  // the node that's already selected is a no-op — there's nothing to redo.
  function selectNode(id) {
    if (id === selectedId) return;
    selectedId = id;
    applySelectionTiers();
    showCardFor(selectedCard, id);
    // The hover card only ever shows something OTHER than the selection —
    // now that this node IS the selection, its hover card (if it happened
    // to be the thing just hovered) would be redundant with the new
    // selected card.
    if (hoveredId === id) hideCardFor(hoverCard);
    recenterOn(nodeById[id]);
  }

  // A selection has no other way to clear once made (otherwise it would be
  // a one-way ratchet toward whatever's clicked last) — clicking away from
  // every node/card, or pressing Escape, drops it.
  function deselectNode() {
    if (!selectedId) return;
    selectedId = null;
    applySelectionTiers();
    hideCardFor(selectedCard);
  }

  // --- Hover: a secondary, transient layer that never touches the
  // selection's tiers or card. Hovering the already-selected node is a
  // no-op (its card is already the persistent one on screen). -------------
  function setHovered(id) {
    if (id === hoveredId) return;
    if (hoveredId && nodeEls[hoveredId]) nodeEls[hoveredId].classList.remove("is-hovered");
    hoveredId = id;
    if (!id || id === selectedId) {
      hideCardFor(hoverCard);
      return;
    }
    if (nodeEls[id]) nodeEls[id].classList.add("is-hovered");
    showCardFor(hoverCard, id);
  }

  function clearHovered() { setHovered(null); }

  document.addEventListener("click", function (ev) {
    // A drag-to-pan gesture that started and ended over the empty canvas
    // still fires a trailing "click" — without this check that click would
    // read as "clicked away" and wipe out the selection the user was just
    // panning around to look at.
    if (didPan) { didPan = false; return; }
    if (ev.target.closest && (ev.target.closest(".map-node") || ev.target.closest(".library-map-card"))) return;
    deselectNode();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") deselectNode();
  });

  // --- Recenter: an animated pan (current zoom preserved) so the selected
  // node lands at the current viewBox's center — "a consistent focal
  // position" without abrupt jumps. Deliberately pan-only: this file's
  // layout() runs once, synchronously, to completion, and selecting a node
  // never re-triggers it (see that function's comment) — only the viewBox
  // moves. Respects prefers-reduced-motion by jumping instantly instead. ---
  function recenterOn(n) {
    if (!n) return;
    if (panAnimHandle) { cancelAnimationFrame(panAnimHandle); panAnimHandle = null; }
    var targetX = n.x - currentVB.w / 2;
    var targetY = n.y - currentVB.h / 2;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      currentVB.x = targetX; currentVB.y = targetY;
      applyViewBox();
      repositionVisibleCards();
      return;
    }
    var startX = currentVB.x, startY = currentVB.y, startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var t = Math.min(1, (ts - startTime) / RECENTER_MS);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out-quad
      currentVB.x = startX + (targetX - startX) * eased;
      currentVB.y = startY + (targetY - startY) * eased;
      applyViewBox();
      repositionVisibleCards();
      panAnimHandle = t < 1 ? requestAnimationFrame(step) : null;
    }
    panAnimHandle = requestAnimationFrame(step);
  }

  function applyViewBox() {
    svg.setAttribute("viewBox", currentVB.x + " " + currentVB.y + " " + currentVB.w + " " + currentVB.h);
  }

  // --- Filtering: same field as Catalog/Images, applied by hiding rather
  // than removing (v1 — see CLAUDE.md for what a later pass might change) ---
  function applyFilter() {
    var visible = {};
    nodes.forEach(function (n) {
      var entry = entryById[n.id];
      var show = entry ? matchesEntry(entry) : false;
      visible[n.id] = show;
      var g = nodeEls[n.id];
      if (g) g.style.display = show ? "" : "none";
    });
    var anyVisible = nodes.some(function (n) { return visible[n.id]; });
    edgeEls.forEach(function (line) {
      var show = visible[line.dataset.source] && visible[line.dataset.target];
      line.style.display = show ? "" : "none";
    });
    if (emptyEl) emptyEl.hidden = anyVisible || nodes.length === 0;
    // A selection or hover that's just been filtered out shouldn't linger.
    if (selectedId && !visible[selectedId]) deselectNode();
    if (hoveredId && !visible[hoveredId]) clearHovered();
  }

  // --- Pan + zoom via viewBox — no dependency, minimal interaction only ---
  function initPanZoom() {
    var panning = false, start = null;
    svg.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".map-node")) return;
      if (panAnimHandle) { cancelAnimationFrame(panAnimHandle); panAnimHandle = null; }
      panning = true;
      didPan = false;
      start = { x: ev.clientX, y: ev.clientY, vx: currentVB.x, vy: currentVB.y };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!panning) return;
      var rect = svg.getBoundingClientRect();
      var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      // A few pixels of jitter shouldn't count as "the user dragged the map"
      // — only past this threshold do we treat the gesture as a pan rather
      // than a click, so the click-away deselect handler above can tell them
      // apart (see its own comment).
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
      currentVB.x = start.vx - dx * (currentVB.w / rect.width);
      currentVB.y = start.vy - dy * (currentVB.h / rect.height);
      applyViewBox();
      repositionVisibleCards();
    });
    ["pointerup", "pointercancel"].forEach(function (evt) {
      svg.addEventListener(evt, function () { panning = false; });
    });
    svg.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      if (panAnimHandle) { cancelAnimationFrame(panAnimHandle); panAnimHandle = null; }
      var rect = svg.getBoundingClientRect();
      var mx = currentVB.x + (ev.clientX - rect.left) / rect.width * currentVB.w;
      var my = currentVB.y + (ev.clientY - rect.top) / rect.height * currentVB.h;
      var scale = ev.deltaY > 0 ? 1.1 : 0.9;
      var newW = Math.max(150, Math.min(W * 4, currentVB.w * scale));
      var newH = Math.max(105, Math.min(H * 4, currentVB.h * scale));
      currentVB.x = mx - (ev.clientX - rect.left) / rect.width * newW;
      currentVB.y = my - (ev.clientY - rect.top) / rect.height * newH;
      currentVB.w = newW; currentVB.h = newH;
      applyViewBox();
      repositionVisibleCards();
    }, { passive: false });
  }

  readSelFromURL();
  initPanZoom();

  fetch(new URL("index.json", location.href).href, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.entries || !data.entries.length) return;
      typeStyles = data.public_type_styles || {};
      buildGraph(data.entries);
      layout();
      render();
      applyFilter();
    })
    .catch(function () { /* Map view stays empty; Catalog/Images are unaffected */ });

  document.addEventListener("library:filter-change", function (ev) {
    sel.type = (ev.detail && ev.detail.type) || [];
    sel.subject = (ev.detail && ev.detail.subject) || [];
    if (nodes.length) applyFilter();
  });
})();
