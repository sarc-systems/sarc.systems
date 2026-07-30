// Library Map view (experimental) — a force-directed diagram of explicit
// editorial relationships between Library entries. See CLAUDE.md § Library
// map view. Deliberately NOT a knowledge graph or similarity visualization:
// every edge here is something SARC actually declared in front matter —
// creators[].ref (a person/group credited on a work) and related[].ref (an
// editorial cross-reference, with its relation type carried through from
// data/library.yaml's controlled vocabulary). No inferred edges, no shared-
// subject/tag edges, no clustering.
//
// Architecture: Library data (/library/index.json) -> buildGraph() (nodes +
// edges, seeded initial positions, precomputed radii, edge categories) ->
// relayout() (the force-directed layout orchestrator, used for both initial
// load and every filter change) -> renderInitial()/updatePositions() (SVG) ->
// interaction (pan/zoom/hover/click/selection). This file owns all of it and
// runs independently of library-filter.js — the two communicate only via one
// event, `library:filter-change` (fired by library-filter.js on every
// filter/view change) plus this file reading location.search once at startup
// for the same information, since script load order means the very first
// firing of that event predates its own listener existing. Visibility of the
// whole view (#library-map hidden or not) is still owned by
// library-filter.js, same as Images.
//
// Layout model (see CLAUDE.md § Library "Map view" for the full rationale):
//   - Deterministic seeded initialization: every node's initial position is a
//     pure function of its stable library_id (a small hash -> seeded PRNG),
//     never Math.random() — the same graph produces substantially the same
//     layout on every reload.
//   - Connected components are treated as layout units: each component gets
//     its own small local force simulation (warm-started from current
//     positions so filter changes preserve survivors' spatial continuity),
//     then components are deterministically packed into a shared coordinate
//     space (sorted by size then id, multi-row shelf packing) so islands stay
//     visually separate without scattering across arbitrary empty space.
//   - relayout(visibleIds) is the one orchestrator for both the initial full
//     load and every filter change — it never partially applies only some of
//     its steps. Selection deliberately does NOT go through it: selecting a
//     node runs a separate, much lighter reheatNeighborhood() (a bounded
//     local relax giving the selected node's neighborhood breathing room,
//     with the rest of the graph nudged only a small capped amount so the
//     neighborhood has room to expand into) plus the existing pan-only
//     recenter — selection must never regenerate the whole graph or destroy
//     the user's mental map of it.
//   - The simulation always runs to convergence synchronously and then stops
//     — this is a settled map, not a continuously drifting physics demo.
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
// Image nodes: selection-dependent. Only the SELECTED node and its direct
// neighbors render using their primary_image (already processed/cropped by
// Hugo for index.json elsewhere — no separate map-specific derivative);
// every other entry — even one with an image — shows the abstract type
// shape until it becomes selected or adjacent. This keeps a dense map
// legible at rest (no images-for-everyone-at-once) while still using images
// to disambiguate same-titled entries exactly where it matters: around the
// current focus. Both representations exist in the DOM for any entry that
// has an image (a cheap className toggle switches between them — no
// destroy/recreate on every selection change); the image `href` itself is
// only set the first time a node actually becomes image-active, so hovering
// or selecting around the graph doesn't eagerly fetch hundreds of images.
// Collision uses a STATIC radius per node regardless of which
// representation is currently showing — the larger, image-node footprint
// for any entry that HAS an image, even while it's rendering as the smaller
// abstract shape — so selecting a node never needs to re-run collision or
// repack the graph, only re-render that one node's own visual.
//
// Selection-Centered Navigation: clicking a node makes it the *selection* —
// a stable point of focus that persists until another node is selected, a
// filter change removes it, or it's explicitly cleared (click away /
// Escape). Selecting recenters the graph on it (an animated pan, current
// zoom preserved — see animateViewBox()) and shows a persistent card ("where
// I am"). The Selection Hierarchy (is-selected/is-neighbor/is-connected,
// plus the unstyled "unrelated" default) is driven ENTIRELY by the
// selection, never by hover — hovering a different node never replaces or
// dims it. Hover is a separate, secondary layer: it shows its own transient
// card ("what I'm considering next"), a light .is-hovered outline on that
// one node, AND marks its touching edges as the strongest emphasis tier with
// a relationship label near the midpoint — all gone the instant the hover
// ends, while the selection's card and tiers stay exactly as they were.
// Clicking a card (either one) is the only mouse gesture that navigates away
// to the entry's real page — clicking a node only selects it. Keyboard
// access takes the simpler, fully-reliable path instead: Enter/Space on a
// focused node always navigates directly, since neither card is
// independently reachable by Tab.
(function () {
  "use strict";

  var container = document.getElementById("library-map");
  var svg = document.getElementById("library-map-svg");
  if (!container || !svg) return;
  var edgesG = document.getElementById("library-map-edges");
  var nodesG = document.getElementById("library-map-nodes");
  var labelsG = null; // created lazily on first hover label — see setHovered()
  var emptyEl = document.getElementById("library-map-empty");
  var SVGNS = "http://www.w3.org/2000/svg";
  var HUB_TYPES = { person: true, group: true, organization: true };
  var FALLBACK_STYLE = { color: "dark-grey", shape: "circle", label: "Other" };
  var SUMMARY_MAX = 110;
  var VIEW_ANIM_MS = 320;

  // Abstract-shape / image-node sizes — kept in sync with createShape()/
  // createNodeVisual() below, which is also where these numbers are used to
  // actually draw each node. Collision uses nodeRadius() (further down),
  // derived from these same constants, so the two can never silently drift
  // apart from each other.
  var SHAPE_SIZE = { hub: 6, leaf: 4 };
  var IMAGE_SIZE = { hub: 11, leaf: 9 };

  // Every relation_type in data/library.yaml's controlled vocabulary maps to
  // exactly one of three restrained line styles — see CLAUDE.md § Library
  // "Map view" for the full rationale. A creator-kind edge (author, artist,
  // composer, designer, developer, manufacturer, founder, …) is always
  // structural — "who made this" is as structural a fact as "part of."
  // Unmapped relation types (future additions to data/library.yaml) fall
  // back to "contextual" as the least-assertive default rather than failing
  // silently into "structural."
  var RELATION_CATEGORY = {
    "part-of": "structural", "made-with": "structural", "implements": "structural",
    "programmed-in": "structural", "based-at": "structural", "commissioned-by": "structural",
    "created-at": "structural", "collaborator-of": "structural", "version-of": "structural", "edition-of": "structural",
    "release-of": "structural", "recording-of": "structural", "performance-of": "structural",
    "influenced-by": "historical", "successor-to": "historical", "predecessor-to": "historical",
    "affiliated-with": "contextual", "used-by": "contextual", "compatible-with": "contextual",
    "discusses": "contextual", "related-work": "contextual", "related-reading": "contextual",
    "documents": "contextual"
  };
  function edgeCategory(kind, label) {
    if (kind === "creator") return "structural";
    return RELATION_CATEGORY[label] || "contextual";
  }

  var W = 1000, H = 700; // reference canvas — only used as the initial pre-layout
                          // viewBox and the packing pass's target aspect ratio;
                          // the real extent always comes from fitViewportTo().
  var nodes = [], edges = [];
  var nodeById = {}, entryById = {}, nodeEls = {}, nodeShapeEls = {}, nodeImageEls = {}, edgeEls = {};
  var nodeComponent = {}; // recomputed per visible set on every relayout — see computeComponents()
  var typeStyles = {};
  var sel = { type: [], subject: [] };
  var visible = {}; // id -> bool, the current filtered set
  var currentVB = { x: 0, y: 0, w: W, h: H };
  var selectedId = null; // the persistent selection — see module comment
  var hoveredId = null; // the transient hover preview, independent of selectedId
  var didPan = false; // true when the current gesture moved the map — see initPanZoom
  var viewAnim = null; // in-flight viewBox animation handle, if any — see animateViewBox()

  function matchesEntry(e) {
    var typeOk = sel.type.length === 0 || sel.type.indexOf(e.public_type) !== -1;
    var subjOk = sel.subject.length === 0 || sel.subject.some(function (s) {
      return (e.subjects || []).indexOf(s) !== -1;
    });
    return typeOk && subjOk;
  }

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // Read the URL directly for the initial filter state — see the note above
  // on why this can't just wait for the first library:filter-change event.
  function readSelFromURL() {
    var params = new URLSearchParams(location.search);
    sel.type = (params.get("type") || "").split(",").filter(Boolean);
    sel.subject = (params.get("subject") || "").split(",").filter(Boolean);
  }

  // --- Deterministic seeded PRNG, keyed by a node's stable library_id — see
  // module comment. A 32-bit FNV-1a hash of the id seeds a small mulberry32
  // generator; both are tiny, dependency-free, and produce the same sequence
  // every time for the same id, which is the whole point. ------------------
  function hashId(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seededRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // The image-node footprint is a square; its worst-case (corner-to-corner)
  // reach is its circumscribed-circle radius, not its half-width — a plain
  // half-width radius would pass a naive center-distance collision check
  // while two image nodes still visibly overlapped at the corners. The
  // abstract shapes (circle/diamond/triangle) get a small multiplier over
  // their base size for the same reason — see createShape()'s own
  // diamond/triangle point math, which reaches slightly past `size` itself.
  // This is a STATIC radius: any entry that has an image gets the LARGER
  // image-node radius regardless of whether it's currently rendering as the
  // smaller abstract shape (see the module comment on why) — collision and
  // packing never need to change when a selection changes, only that one
  // node's own visual.
  function nodeRadius(hub, hasImage) {
    if (hasImage) {
      var s = hub ? IMAGE_SIZE.hub : IMAGE_SIZE.leaf;
      return s * Math.SQRT2;
    }
    var size = hub ? SHAPE_SIZE.hub : SHAPE_SIZE.leaf;
    return size * 1.3;
  }

  // --- Stage 1: Library data -> graph model -------------------------------
  function buildGraph(entries) {
    entries.forEach(function (e) {
      entryById[e.library_id] = e;
      var hub = !!HUB_TYPES[e.type];
      var hasImage = !!(e.primary_image && e.primary_image.url);
      var rng = seededRng(hashId(e.library_id));
      nodeById[e.library_id] = {
        id: e.library_id,
        title: e.title,
        type: e.type,
        publicType: e.public_type,
        url: e.url,
        hub: hub,
        hasImage: hasImage,
        radius: nodeRadius(hub, hasImage),
        imageShown: false, // has this node's image href ever been set? see showNodeImage()
        x: W / 2 + (rng() - 0.5) * W * 0.8,
        y: H / 2 + (rng() - 0.5) * H * 0.8,
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
      edges.push({ source: a, target: b, kind: kind, label: label || "", category: edgeCategory(kind, label) });
    }
    entries.forEach(function (e) {
      (e.creators || []).forEach(function (c) {
        if (c.ref) addEdge(c.ref, e.library_id, "creator", c.role);
      });
      (e.related || []).forEach(function (r) {
        if (r.ref) addEdge(e.library_id, r.ref, "related", r.relation);
      });
    });
  }

  // Plain union-find, restricted to a given node/edge subset — filtering
  // changes reachability (a node visible only through a now-hidden edge
  // becomes its own singleton), so this is recomputed on every relayout, not
  // just once at load.
  function computeComponents(nodeList, edgeList) {
    var parent = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
    nodeList.forEach(function (n) { parent[n.id] = n.id; });
    edgeList.forEach(function (e) { if (parent[e.source] !== undefined && parent[e.target] !== undefined) union(e.source, e.target); });
    var groups = {};
    nodeList.forEach(function (n) {
      var root = find(n.id);
      (groups[root] || (groups[root] = [])).push(n);
    });
    var comp = {};
    nodeList.forEach(function (n) { comp[n.id] = find(n.id); });
    return { comp: comp, groups: Object.keys(groups).map(function (k) { return groups[k]; }) };
  }

  // --- Stage 2: layout ------------------------------------------------------
  // One shared pairwise force+collision iteration, used by both
  // layoutComponent() (a component's own internal nodes, uniform damping)
  // and reheatNeighborhood() (the whole visible graph, variable damping so
  // the selected neighborhood gets full movement while everything else gets
  // only a small capped nudge). Kept as one function so the two callers can
  // never silently drift out of sync on the actual force math.
  var BASE_K = 34; // ideal inter-node spacing — a tuned constant, not derived
                    // from total node count: each component gets its own
                    // small local simulation now, so "how crowded is the
                    // WHOLE graph" no longer needs to factor into this.
  var COLLISION_PAD = 4;
  function forceIteration(nodeList, edgeList, dampingFor, maxSpeedFor) {
    var repulsionK = BASE_K * BASE_K;
    var minDistSq = Math.max(1, repulsionK * 0.001);
    var springK = 0.02;
    var i, j, n;
    for (i = 0; i < nodeList.length; i++) { nodeList[i].fx = 0; nodeList[i].fy = 0; }
    for (i = 0; i < nodeList.length; i++) {
      for (j = i + 1; j < nodeList.length; j++) {
        var a = nodeList[i], b = nodeList[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) distSq = minDistSq;
        var dist = Math.sqrt(distSq);
        var force = repulsionK / distSq;
        // Collision: an additional strong corrective push once the two
        // nodes' actual rendered footprints (radius, precomputed once in
        // buildGraph — see nodeRadius()) would overlap, on top of the
        // generic inverse-square repulsion above. Without this, two large
        // image nodes could still settle overlapping if the generic
        // repulsion alone happened to reach equilibrium too close in.
        var minSep = a.radius + b.radius + COLLISION_PAD;
        if (dist < minSep) force += (minSep - dist) * 0.5;
        var fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      }
    }
    edgeList.forEach(function (e) {
      var a = nodeById[e.source], b = nodeById[e.target];
      var dx = a.x - b.x, dy = a.y - b.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      var force = springK * (dist - BASE_K);
      var fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.fx -= fx; a.fy -= fy;
      b.fx += fx; b.fy += fy;
    });
    var totalMove = 0;
    for (i = 0; i < nodeList.length; i++) {
      n = nodeList[i];
      var damping = dampingFor ? dampingFor(n) : 0.85;
      n.vx = (n.vx + n.fx) * damping;
      n.vy = (n.vy + n.fy) * damping;
      var maxSpeed = maxSpeedFor ? maxSpeedFor(n) : BASE_K * 2;
      var speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > maxSpeed) { n.vx = n.vx / speed * maxSpeed; n.vy = n.vy / speed * maxSpeed; }
      n.x += n.vx; n.y += n.vy;
      totalMove += Math.abs(n.vx) + Math.abs(n.vy);
    }
    return totalMove / (nodeList.length || 1);
  }

  // A component's internal layout. n<=2 is a fast path (65% of a typical
  // Library-sized graph's components are singletons or pairs — running a
  // general iterative sim on a system with nothing to converge toward is
  // pure overhead): a singleton keeps whatever position it already has
  // (seeded or warm-started); a pair is placed directly at rest-length
  // apart, preserving their existing relative direction if they already
  // have one so warm-starting stays meaningful across filter changes. n>=3
  // warm-starts from current x/y (only genuinely new nodes use their seeded
  // initial placement) and runs the shared force+collision iteration to
  // convergence, with a fixed uniform damping — this is a component's own
  // small simulation, not a slice of one huge global one.
  function layoutComponent(compNodes, compEdges) {
    if (compNodes.length <= 1) return;
    if (compNodes.length === 2) {
      var a = compNodes[0], b = compNodes[1];
      var dx = a.x - b.x, dy = a.y - b.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var target = a.radius + b.radius + COLLISION_PAD + BASE_K * 0.5;
      if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }
      var scale = (target - dist) / 2 / dist;
      a.x += dx * scale; a.y += dy * scale;
      b.x -= dx * scale; b.y -= dy * scale;
      return;
    }
    var maxIterations = 200;
    for (var iter = 0; iter < maxIterations; iter++) {
      // A weak centering force keeps THIS component's own nodes from
      // drifting away from their own local center while they settle,
      // independent of where the component will later be packed.
      var cx = 0, cy = 0, i;
      for (i = 0; i < compNodes.length; i++) { cx += compNodes[i].x; cy += compNodes[i].y; }
      cx /= compNodes.length; cy /= compNodes.length;
      compNodes.forEach(function (n) { n.fx = (n.fx || 0); n.fy = (n.fy || 0); });
      var avg = forceIterationWithCentering(compNodes, compEdges, cx, cy);
      if (avg < 0.05) break;
    }
    resolveOverlapsOnly(compNodes);
  }

  // A dedicated cleanup pass, direct positional correction rather than
  // force integration: in a densely triangulated cluster, competing spring
  // attraction can reach a converged equilibrium (forceIterationWithCentering's
  // avg-movement threshold triggers) that still leaves a couple of nodes
  // closer than their combined collision radius — the generic collision
  // FORCE nudges them apart but has to share the tug-of-war with every other
  // force in the same iteration, and isn't guaranteed to fully win. This
  // runs after a component (or the reheat moving-set) has already settled
  // into its overall shape, so it only has small residual overlaps left to
  // resolve and converges in a handful of iterations.
  function resolveOverlapsOnly(nodeList) {
    var maxIter = 40;
    for (var iter = 0; iter < maxIter; iter++) {
      var anyOverlap = false;
      for (var i = 0; i < nodeList.length; i++) {
        for (var j = i + 1; j < nodeList.length; j++) {
          var a = nodeList[i], b = nodeList[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var minSep = a.radius + b.radius + COLLISION_PAD;
          if (dist < minSep) {
            anyOverlap = true;
            var push = (minSep - dist) / 2 + 0.5;
            var ux = dx / dist, uy = dy / dist;
            a.x += ux * push; a.y += uy * push;
            b.x -= ux * push; b.y -= uy * push;
          }
        }
      }
      if (!anyOverlap) break;
    }
  }
  // Same as forceIteration but adds a weak pull toward a given center —
  // split out so the shared reheat path (which centers on nothing, the
  // whole visible graph stays where it is) doesn't pay for it.
  function forceIterationWithCentering(nodeList, edgeList, cx, cy) {
    var repulsionK = BASE_K * BASE_K;
    var minDistSq = Math.max(1, repulsionK * 0.001);
    var springK = 0.02, damping = 0.85, maxSpeed = BASE_K * 2;
    var i, j;
    for (i = 0; i < nodeList.length; i++) { nodeList[i].fx = 0; nodeList[i].fy = 0; }
    for (i = 0; i < nodeList.length; i++) {
      for (j = i + 1; j < nodeList.length; j++) {
        var a = nodeList[i], b = nodeList[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) distSq = minDistSq;
        var dist = Math.sqrt(distSq);
        var force = repulsionK / distSq;
        var minSep = a.radius + b.radius + COLLISION_PAD;
        if (dist < minSep) force += (minSep - dist) * 0.5;
        var fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      }
    }
    edgeList.forEach(function (e) {
      var a = nodeById[e.source], b = nodeById[e.target];
      var dx = a.x - b.x, dy = a.y - b.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      var force = springK * (dist - BASE_K);
      var fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.fx -= fx; a.fy -= fy;
      b.fx += fx; b.fy += fy;
    });
    var totalMove = 0;
    for (i = 0; i < nodeList.length; i++) {
      var n = nodeList[i];
      n.fx += (cx - n.x) * 0.01;
      n.fy += (cy - n.y) * 0.01;
      n.vx = (n.vx + n.fx) * damping;
      n.vy = (n.vy + n.fy) * damping;
      var speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > maxSpeed) { n.vx = n.vx / speed * maxSpeed; n.vy = n.vy / speed * maxSpeed; }
      n.x += n.vx; n.y += n.vy;
      totalMove += Math.abs(n.vx) + Math.abs(n.vy);
    }
    return totalMove / nodeList.length;
  }

  // Component bounding box — the union of every node's own radius-inflated
  // footprint. This IS the box packComponents() packs, with only a small
  // constant gutter added between boxes (not another full radius on top —
  // that would double-count the same margin and waste viewport space across
  // what's typically dozens of small islands).
  function componentBounds(compNodes) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    compNodes.forEach(function (n) {
      minX = Math.min(minX, n.x - n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  var PACK_GUTTER = 24;
  // Deterministic multi-row shelf packing (next-fit-decreasing-height):
  // components are placed left-to-right into rows up to a target row width,
  // wrapping when a component would exceed it, using whichever sort order
  // the caller provides. A typical Library-sized graph is heavily fragmented
  // (a large majority of components are singletons or pairs, not "one giant
  // component plus a few stragglers") — a naive single-row strip would
  // either produce one very long ribbon of tiny islands or need a
  // pre-chosen wrap width; this instead derives a target width from the
  // total packed area and the reference canvas's own aspect ratio, so the
  // result stays roughly as wide as it is tall regardless of how fragmented
  // the visible set happens to be. Two sort strategies, see relayout():
  // sortBySizeId (cold start — no prior arrangement to respect, so pack for
  // density) and sortByPosition (every relayout after that — see its own
  // comment on why "already sorted by size/id" is wrong there).
  function sortBySizeId(ga, gb) {
    if (gb.length !== ga.length) return gb.length - ga.length;
    var ida = ga.reduce(function (m, n) { return n.id < m ? n.id : m; }, ga[0].id);
    var idb = gb.reduce(function (m, n) { return n.id < m ? n.id : m; }, gb[0].id);
    return ida < idb ? -1 : ida > idb ? 1 : 0;
  }
  // Reading-order (top-to-bottom, then left-to-right) by each component's
  // CURRENT centroid — used for every relayout after the first so a filter
  // change's repack preserves roughly "what was near what," rather than
  // reshuffling into an unrelated size/id order every time.
  var POSITION_ROW = 120; // bucket height for the "top-to-bottom" pass, in canvas units
  function sortByPosition(ga, gb) {
    var ba = componentBounds(ga), bb = componentBounds(gb);
    var acx = (ba.minX + ba.maxX) / 2, acy = (ba.minY + ba.maxY) / 2;
    var bcx = (bb.minX + bb.maxX) / 2, bcy = (bb.minY + bb.maxY) / 2;
    var rowA = Math.round(acy / POSITION_ROW), rowB = Math.round(bcy / POSITION_ROW);
    if (rowA !== rowB) return rowA - rowB;
    return acx - bcx;
  }
  function packComponents(groups, sortFn) {
    if (!groups.length) return;
    var sorted = groups.slice().sort(sortFn || sortBySizeId);
    var boxes = sorted.map(function (g) { return { nodes: g, bounds: componentBounds(g) }; });
    var totalArea = boxes.reduce(function (sum, b) { return sum + (b.bounds.w + PACK_GUTTER) * (b.bounds.h + PACK_GUTTER); }, 0);
    var targetW = Math.max(BASE_K * 4, Math.sqrt(totalArea * (W / H)));

    var cursorX = 0, cursorY = 0, rowH = 0;
    boxes.forEach(function (box) {
      var bw = box.bounds.w + PACK_GUTTER, bh = box.bounds.h + PACK_GUTTER;
      if (cursorX > 0 && cursorX + bw > targetW) {
        cursorX = 0;
        cursorY += rowH;
        rowH = 0;
      }
      var offsetX = cursorX - box.bounds.minX;
      var offsetY = cursorY - box.bounds.minY;
      box.nodes.forEach(function (n) { n.x += offsetX; n.y += offsetY; });
      cursorX += bw;
      rowH = Math.max(rowH, bh);
    });
  }

  var VIEWPORT_PAD = 40;
  function boundsOf(nodeList) {
    if (!nodeList.length) return { minX: 0, minY: 0, maxX: W, maxY: H };
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodeList.forEach(function (n) {
      minX = Math.min(minX, n.x - n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }
  function fitTargetFor(nodeList) {
    var b = boundsOf(nodeList);
    var w = Math.max(W * 0.15, b.maxX - b.minX + VIEWPORT_PAD * 2);
    var h = Math.max(H * 0.15, b.maxY - b.minY + VIEWPORT_PAD * 2);
    var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }

  var hasLaidOutOnce = false;
  // --- relayout(): the one orchestrator for a full load or a filter change.
  // Never applies only some of its steps — recompute components -> lay out
  // each one (warm-started) -> pack -> fit viewport -> render positions.
  // Deliberately NOT used by selection — see reheatNeighborhood(). The very
  // first call (cold start, nothing on screen yet) packs by size/id
  // (packComponents/sortBySizeId) — there's no prior arrangement to
  // respect, so pack purely for density. Every call after that instead
  // packs by each component's CURRENT reading-order position
  // (sortByPosition): components keep their internal layout warm-started
  // from before (so a node whose only connections just got hidden doesn't
  // reset to a random spot) AND get fully repacked into a tight arrangement
  // every time — critical for a filter that shrinks the visible set a lot
  // (say, to one public type): the survivors' OLD positions were spread out
  // to accommodate hundreds of now-hidden nodes, so simply leaving them in
  // place (or only nudging apart actual overlaps) would strand a small
  // filtered set across a huge, mostly-empty viewport. Repacking by current
  // position instead of by size/id keeps "what was near what" roughly
  // intact while still closing every gap the hidden nodes left behind. ----
  function relayout(visibleIds, opts) {
    opts = opts || {};
    var idSet = {};
    visibleIds.forEach(function (id) { idSet[id] = true; });
    visible = idSet;

    var visibleNodes = nodes.filter(function (n) { return idSet[n.id]; });
    var visibleEdges = edges.filter(function (e) { return idSet[e.source] && idSet[e.target]; });

    var built = computeComponents(visibleNodes, visibleEdges);
    nodeComponent = built.comp;
    built.groups.forEach(function (g) {
      var gEdges = visibleEdges.filter(function (e) {
        var compOf = nodeComponent[e.source];
        return compOf === nodeComponent[g[0].id];
      });
      layoutComponent(g, gEdges);
    });
    packComponents(built.groups, hasLaidOutOnce ? sortByPosition : sortBySizeId);
    hasLaidOutOnce = true;

    var target = fitTargetFor(visibleNodes);
    if (opts.animateFit && !reduceMotion()) {
      animateViewBox(target, { tweenExtent: true });
    } else {
      currentVB = target;
      applyViewBox();
    }

    applyVisibility(idSet);
    updatePositions(visibleNodes, visibleEdges);
    applySelectionTiers();
    repositionVisibleCards();

    var anyVisible = visibleNodes.length > 0;
    if (emptyEl) emptyEl.hidden = anyVisible || nodes.length === 0;
    if (selectedId && !idSet[selectedId]) deselectNode();
    if (hoveredId && !idSet[hoveredId]) clearHovered();
  }

  function applyVisibility(idSet) {
    nodes.forEach(function (n) {
      var g = nodeEls[n.id];
      if (g) g.style.display = idSet[n.id] ? "" : "none";
    });
    edges.forEach(function (e, i) {
      var line = edgeEls[i];
      if (!line) return;
      var show = idSet[e.source] && idSet[e.target];
      line.style.display = show ? "" : "none";
    });
  }

  // --- Stage 3: render -------------------------------------------------------
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // The abstract-type shape — always present for every node (the base
  // graph), shown whenever the node isn't currently image-active. See
  // createNodeGroup() for how this and the image visual coexist.
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
    shapeEl.setAttribute("class", "map-shape map-node-shape");
    shapeEl.style.fill = fill;
    return shapeEl;
  }

  // The image-node visual — built (but left without an href, and hidden) for
  // every node that HAS a primary_image, regardless of whether it starts out
  // image-active. See showNodeImage() for when the href actually gets set.
  function createImageVisual(n, style) {
    var s = n.hub ? IMAGE_SIZE.hub : IMAGE_SIZE.leaf;
    var group = el("g", { "class": "map-shape map-node-image", "display": "none" });
    var bg = el("rect", {
      "class": "map-image-node-bg",
      x: -s, y: -s, width: s * 2, height: s * 2
    });
    bg.style.stroke = "var(--colorplan-" + style.color + ")";
    group.appendChild(bg);
    var imageEl = el("image", {
      "class": "map-image-node-img",
      x: -s, y: -s, width: s * 2, height: s * 2,
      preserveAspectRatio: "xMidYMid slice"
    });
    group.appendChild(imageEl);
    return { group: group, imageEl: imageEl };
  }

  // Sets the image href the first time a node becomes image-active — see the
  // module comment on why this is lazy rather than set for every hasImage
  // node up front.
  function showNodeImage(n) {
    if (!n.hasImage || n.imageShown) return;
    var entry = entryById[n.id];
    var img = entry && entry.primary_image;
    var imgEls = nodeImageEls[n.id];
    if (!img || !img.url || !imgEls) return;
    imgEls.imageEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", img.url);
    imgEls.imageEl.setAttribute("href", img.url);
    n.imageShown = true;
  }

  function setNodeImageActive(n, active) {
    var shapeEl = nodeShapeEls[n.id];
    var imgEls = nodeImageEls[n.id];
    if (!n.hasImage || !imgEls) return;
    if (active) showNodeImage(n);
    imgEls.group.style.display = active ? "" : "none";
    if (shapeEl) shapeEl.style.display = active ? "none" : "";
  }

  function renderInitial() {
    edgesG.innerHTML = "";
    nodesG.innerHTML = "";
    edgeEls = {};
    nodeEls = {}; nodeShapeEls = {}; nodeImageEls = {};

    edges.forEach(function (e, i) {
      var a = nodeById[e.source], b = nodeById[e.target];
      var line = el("line", {
        "class": "map-edge map-edge--" + e.category,
        x1: a.x, y1: a.y, x2: b.x, y2: b.y
      });
      line.dataset.source = e.source;
      line.dataset.target = e.target;
      line.dataset.index = i;
      edgesG.appendChild(line);
      edgeEls[i] = line;
    });

    nodes.forEach(function (n) {
      var style = typeStyles[n.publicType] || FALLBACK_STYLE;
      var g = el("g", { "class": "map-node", transform: "translate(" + n.x + "," + n.y + ")" });
      var shapeEl = createShape(style, n.hub ? SHAPE_SIZE.hub : SHAPE_SIZE.leaf);
      g.appendChild(shapeEl);
      nodeShapeEls[n.id] = shapeEl;
      if (n.hasImage) {
        var imgVis = createImageVisual(n, style);
        g.appendChild(imgVis.group);
        nodeImageEls[n.id] = imgVis;
      }

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

  // Updates on-screen positions for a given (usually "currently visible")
  // subset only — called after relayout() and after reheatNeighborhood(),
  // never rebuilds DOM structure (that only happens once, in
  // renderInitial()).
  function updatePositions(nodeList, edgeList) {
    nodeList.forEach(function (n) {
      var g = nodeEls[n.id];
      if (g) g.setAttribute("transform", "translate(" + n.x + "," + n.y + ")");
    });
    edgeList.forEach(function (e) {
      var a = nodeById[e.source], b = nodeById[e.target];
      var idx = edges.indexOf(e);
      var line = edgeEls[idx];
      if (line) { line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y); }
    });
    repositionEdgeLabel();
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

  // Candidate directions/distances positionCardFor() probes when the default
  // corner placement would cover another node — see that function's comment.
  var CARD_DIRS = [
    { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
  ];
  var CARD_DISTANCES = [14, 50, 90, 140];

  // Split out from showCardFor() so panning/zooming can re-run just the
  // positioning math (a node's on-screen point moves with the viewBox even
  // though its own SVG-space x/y never changes) without re-populating a
  // card's content on every pointermove tick.
  //
  // A selected node's own direct neighbors are, by construction, usually the
  // CLOSEST nodes to it (spring attraction pulls connected nodes together) —
  // so always offsetting the card the same fixed +14/+14 from the node
  // frequently parks it directly on top of exactly the neighbors it's meant
  // to help the user see. Instead, try the default corner first, and if that
  // would cover another currently-visible node, probe a handful of other
  // directions/distances and use whichever leaves the fewest nodes hidden
  // underneath (ties favor the smallest distance, then the default corner).
  function positionCardFor(ctrl, n) {
    if (!ctrl || ctrl.root.hidden) return;
    var containerRect = container.getBoundingClientRect();
    var basePos = nodeScreenPosition(n);
    var originX = basePos.x - containerRect.left, originY = basePos.y - containerRect.top;
    var cardRect = ctrl.root.getBoundingClientRect();
    var maxLeft = Math.max(4, containerRect.width - cardRect.width - 4);
    var maxTop = Math.max(4, containerRect.height - cardRect.height - 4);

    var otherPts = [];
    nodes.forEach(function (nd) {
      if (nd.id === n.id || !visible[nd.id]) return;
      var p = nodeScreenPosition(nd);
      otherPts.push({ x: p.x - containerRect.left, y: p.y - containerRect.top });
    });
    function coveredCount(left, top) {
      var count = 0;
      for (var i = 0; i < otherPts.length; i++) {
        var p = otherPts[i];
        if (p.x >= left && p.x <= left + cardRect.width && p.y >= top && p.y <= top + cardRect.height) count++;
      }
      return count;
    }

    var best = null;
    for (var d = 0; d < CARD_DISTANCES.length && (!best || best.covered > 0); d++) {
      var dist = CARD_DISTANCES[d];
      for (var i = 0; i < CARD_DIRS.length; i++) {
        var dir = CARD_DIRS[i];
        var left = Math.max(4, Math.min(originX + dir.dx * dist, maxLeft));
        var top = Math.max(4, Math.min(originY + dir.dy * dist, maxTop));
        var covered = coveredCount(left, top);
        if (!best || covered < best.covered) best = { left: left, top: top, covered: covered };
        if (covered === 0) break;
      }
    }
    ctrl.root.style.left = best.left + "px";
    ctrl.root.style.top = best.top + "px";
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
  // Recomputed fresh on every selection change and on every relayout. Also
  // owns which nodes are currently image-active (selected + direct
  // neighbors only — see module comment). --------------------------------
  function applySelectionTiers() {
    nodes.forEach(function (n) {
      var g = nodeEls[n.id];
      if (g) g.classList.remove("is-selected", "is-neighbor", "is-connected");
      setNodeImageActive(n, false);
    });
    Object.keys(edgeEls).forEach(function (i) { edgeEls[i].classList.remove("is-active"); });

    if (!selectedId || !nodeEls[selectedId]) {
      nodesG.classList.remove("has-selection");
      return;
    }
    nodesG.classList.add("has-selection");
    nodeEls[selectedId].classList.add("is-selected");
    setNodeImageActive(nodeById[selectedId], true);

    var direct = {};
    neighborsOf(selectedId).forEach(function (nid) {
      direct[nid] = true;
      var g = nodeEls[nid];
      if (g) g.classList.add("is-neighbor");
      if (nodeById[nid]) setNodeImageActive(nodeById[nid], true);
    });

    var comp = nodeComponent[selectedId];
    nodes.forEach(function (n) {
      if (n.id === selectedId || direct[n.id]) return;
      var g = nodeEls[n.id];
      if (g && nodeComponent[n.id] === comp) g.classList.add("is-connected");
    });

    edges.forEach(function (e, i) {
      if (e.source === selectedId || e.target === selectedId) {
        var line = edgeEls[i];
        if (line) line.classList.add("is-active");
      }
    });
  }

  // The neighborhood used by reheatNeighborhood() below — selected node,
  // its direct neighbors, and their neighbors in turn, restricted to the
  // currently visible set.
  function localNeighborhood(id) {
    var out = {}; out[id] = true;
    var ring1 = neighborsOf(id).filter(function (nid) { return visible[nid]; });
    ring1.forEach(function (nid) { out[nid] = true; });
    ring1.forEach(function (nid) {
      neighborsOf(nid).forEach(function (nid2) { if (visible[nid2]) out[nid2] = true; });
    });
    return Object.keys(out);
  }

  // A short, bounded local relax giving the selected node's neighborhood
  // additional space — deliberately NOT relayout(): the full visible graph
  // is retained exactly where it is, nothing is repacked or refit. The
  // moving set (selection + its neighborhood, see localNeighborhood()) gets
  // full-strength movement; every OTHER currently-visible node gets a small
  // capped nudge rather than being held perfectly immovable — a fully rigid
  // "wall" of frozen neighbors can trap a hub node's neighborhood with
  // nowhere to expand into, especially for an entry embedded deep inside a
  // densely-linked component. Capping the rest-of-graph's total displacement
  // (a few pixels) keeps the mental map intact while still giving the
  // neighborhood something to push against that can yield a little. Skipped
  // entirely under reduced motion — the point is legibility, not motion.
  var REHEAT_ITER = 40;
  var REHEAT_REST_DAMPING = 0.12;
  var REHEAT_REST_CAP = 6;
  function reheatNeighborhood(id) {
    var movingIds = {};
    localNeighborhood(id).forEach(function (nid) { movingIds[nid] = true; });
    var visibleNodes = nodes.filter(function (n) { return visible[n.id]; });
    var visibleEdges = edges.filter(function (e) { return visible[e.source] && visible[e.target]; });
    if (visibleNodes.length < 3) return;

    visibleNodes.forEach(function (n) { n._reheatX0 = n.x; n._reheatY0 = n.y; });
    for (var iter = 0; iter < REHEAT_ITER; iter++) {
      forceIteration(
        visibleNodes, visibleEdges,
        function (n) { return movingIds[n.id] ? 0.85 : REHEAT_REST_DAMPING; },
        function (n) { return movingIds[n.id] ? BASE_K * 2 : BASE_K * 0.3; }
      );
      visibleNodes.forEach(function (n) {
        if (movingIds[n.id]) return;
        var ddx = n.x - n._reheatX0, ddy = n.y - n._reheatY0;
        var d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d > REHEAT_REST_CAP) {
          var s = REHEAT_REST_CAP / d;
          n.x = n._reheatX0 + ddx * s;
          n.y = n._reheatY0 + ddy * s;
          n.vx = 0; n.vy = 0;
        }
      });
    }
    resolveOverlapsOnly(visibleNodes.filter(function (n) { return movingIds[n.id]; }));
    updatePositions(visibleNodes, visibleEdges);
  }

  // Clicking a node makes it the new selection: recompute the tiers, show
  // its persistent card, give its neighborhood room to breathe, and animate
  // the graph to recenter on it. Selecting the node that's already selected
  // is a no-op — there's nothing to redo.
  function selectNode(id) {
    if (id === selectedId) return;
    selectedId = id;
    if (!reduceMotion()) reheatNeighborhood(id);
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
  // selection's tiers, card, or the simulation — see module comment. Also
  // marks the hovered node's touching edges as the strongest emphasis tier
  // and shows each one's relationship label near its midpoint (only while
  // that specific hover lasts). Hovering the already-selected node is a
  // no-op (its card is already the persistent one on screen). ------------
  function ensureLabelsLayer() {
    if (labelsG) return labelsG;
    labelsG = el("g", { id: "library-map-edge-labels" });
    svg.appendChild(labelsG);
    return labelsG;
  }
  var hoveredEdgeIdx = [];
  var edgeLabelEls = [];
  function showHoveredEdges(id) {
    hoveredEdgeIdx = [];
    edges.forEach(function (e, i) {
      if (e.source !== id && e.target !== id) return;
      if (!visible[e.source] || !visible[e.target]) return;
      hoveredEdgeIdx.push(i);
      var line = edgeEls[i];
      if (line) line.classList.add("is-hovered");
      if (!e.label) return;
      var a = nodeById[e.source], b = nodeById[e.target];
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var label = el("text", { "class": "map-edge-label", x: mx, y: my });
      label.textContent = e.label;
      ensureLabelsLayer().appendChild(label);
      edgeLabelEls.push(label);
    });
  }
  function clearHoveredEdges() {
    hoveredEdgeIdx.forEach(function (i) { var line = edgeEls[i]; if (line) line.classList.remove("is-hovered"); });
    hoveredEdgeIdx = [];
    edgeLabelEls.forEach(function (l) { l.remove(); });
    edgeLabelEls = [];
  }
  function repositionEdgeLabel() {
    if (!edgeLabelEls.length || !hoveredEdgeIdx.length) return;
    hoveredEdgeIdx.forEach(function (i, idx) {
      var e = edges[i], label = edgeLabelEls[idx];
      if (!e || !label) return;
      var a = nodeById[e.source], b = nodeById[e.target];
      label.setAttribute("x", (a.x + b.x) / 2);
      label.setAttribute("y", (a.y + b.y) / 2);
    });
  }

  function setHovered(id) {
    if (id === hoveredId) return;
    if (hoveredId && nodeEls[hoveredId]) nodeEls[hoveredId].classList.remove("is-hovered");
    clearHoveredEdges();
    hoveredId = id;
    if (!id || id === selectedId) {
      hideCardFor(hoverCard);
      return;
    }
    if (nodeEls[id]) nodeEls[id].classList.add("is-hovered");
    showHoveredEdges(id);
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

  // --- One shared viewBox animation owner — both the pan-only "recenter on
  // selection" (extent unchanged, current zoom preserved) and the "fit to
  // viewport" transition after a filter change (extent tweened too) go
  // through this single helper, so a filter change and a selection in quick
  // succession can never leave two independent rAF loops fighting over
  // currentVB — the newer call always cancels whatever's in flight first.
  // Respects prefers-reduced-motion by jumping instantly instead. ---------
  function animateViewBox(target, opts) {
    opts = opts || {};
    if (viewAnim) { cancelAnimationFrame(viewAnim); viewAnim = null; }
    if (reduceMotion()) {
      currentVB = target;
      applyViewBox();
      repositionVisibleCards();
      return;
    }
    var startX = currentVB.x, startY = currentVB.y, startW = currentVB.w, startH = currentVB.h;
    var tweenExtent = !!opts.tweenExtent;
    var duration = opts.duration || VIEW_ANIM_MS;
    var startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var t = Math.min(1, (ts - startTime) / duration);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out-quad
      currentVB.x = startX + (target.x - startX) * eased;
      currentVB.y = startY + (target.y - startY) * eased;
      if (tweenExtent) {
        currentVB.w = startW + (target.w - startW) * eased;
        currentVB.h = startH + (target.h - startH) * eased;
      }
      applyViewBox();
      repositionVisibleCards();
      viewAnim = t < 1 ? requestAnimationFrame(step) : null;
    }
    viewAnim = requestAnimationFrame(step);
  }

  // Recenter: pans so the selected node lands at the current viewBox's
  // center — "a consistent focal position" — WITHOUT changing the current
  // zoom/extent, and without refitting to content (selection must not
  // regenerate or reframe the whole graph, only draw attention to a point
  // within it).
  function recenterOn(n) {
    if (!n) return;
    animateViewBox({ x: n.x - currentVB.w / 2, y: n.y - currentVB.h / 2, w: currentVB.w, h: currentVB.h }, { tweenExtent: false });
  }

  function applyViewBox() {
    svg.setAttribute("viewBox", currentVB.x + " " + currentVB.y + " " + currentVB.w + " " + currentVB.h);
  }

  // --- Filtering: same field as Catalog/Images. Rebuilds the visible
  // subgraph's layout via relayout() rather than just toggling display —
  // see module comment and CLAUDE.md § Library "Map view". ----------------
  function applyFilter() {
    if (!nodes.length) return;
    var visibleIds = entries().filter(matchesEntry).map(function (e) { return e.library_id; });
    relayout(visibleIds, { animateFit: true });
  }
  function entries() { return nodes.map(function (n) { return entryById[n.id]; }).filter(Boolean); }

  // --- Pan + zoom via viewBox — no dependency, minimal interaction only ---
  function initPanZoom() {
    var panning = false, start = null;
    svg.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".map-node")) return;
      if (viewAnim) { cancelAnimationFrame(viewAnim); viewAnim = null; }
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
      if (viewAnim) { cancelAnimationFrame(viewAnim); viewAnim = null; }
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
      renderInitial();
      var visibleIds = data.entries.filter(matchesEntry).map(function (e) { return e.library_id; });
      relayout(visibleIds, { animateFit: false });
    })
    .catch(function () { /* Map view stays empty; Catalog/Images are unaffected */ });

  document.addEventListener("library:filter-change", function (ev) {
    sel.type = (ev.detail && ev.detail.type) || [];
    sel.subject = (ev.detail && ev.detail.subject) || [];
    if (nodes.length) applyFilter();
  });
})();
