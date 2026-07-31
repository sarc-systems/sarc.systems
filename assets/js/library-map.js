// Library Map view (experimental) — a force-directed diagram of explicit
// editorial relationships between Library entries. See CLAUDE.md § Library
// map view. Deliberately NOT a knowledge graph or similarity visualization:
// every edge here is something SARC actually declared in front matter —
// creators[].ref (a person/group credited on a work) and related[].ref (an
// editorial cross-reference, with its relation type carried through from
// data/library.yaml's controlled vocabulary). No inferred edges, no shared-
// subject/tag edges, no clustering.
//
// Architecture (Canvas — a from-scratch rewrite of the previous SVG
// implementation): Library data (/library/index.json) -> buildGraph()
// (nodes + edges, seeded initial positions, precomputed radii, edge
// categories) -> relayout() (the layout orchestrator, used for both initial
// load and every filter change, driving a continuous whole-graph force
// simulation — see runContinuousSettle()) -> a spatial grid index
// (buildSpatialIndex()) for pointer hit-testing -> two stacked <canvas>
// layers, redrawn via invalidate()/requestAnimationFrame only while
// something is actually changing (an active settle/drag/pan/zoom), coming
// to a full stop once things are genuinely at rest -> interaction (pan,
// zoom, hover, click-to-select, and node dragging — startDrag()/
// updateDrag()/endDrag() — all via hit-testing, since Canvas has no
// per-node DOM elements). This file owns all of it and runs independently
// of library-filter.js — the two communicate only via one event,
// `library:filter-change` (fired by library-filter.js on every filter/view
// change) plus this file reading location.search once at startup for the
// same information, since script load order means the very first firing of
// that event predates its own listener existing. Visibility of the whole
// view (#library-map hidden or not) is still owned by library-filter.js,
// same as Images.
//
// The force simulation itself is completely renderer-agnostic: buildGraph(),
// computeComponents(), forceIterationWithCentering(), runContinuousSettle(),
// resolveOverlapsOnly(), relayout() all operate on plain
// {id,x,y,vx,vy,radius,fx,fy} node objects and a plain edge array — none of
// them touch a canvas, an SVG element, or the DOM. Only
// the renderer (drawBackground()/drawInteraction()), the spatial index, and
// the interaction layer below know a Canvas exists. This separation was
// already true of the previous SVG implementation's physics code; migrating
// the render layer only required rewriting renderInitial()/updatePositions()/
// createShape() and everything hover/click/pan/zoom-related, not the layout
// engine itself.
//
// Layout model (see CLAUDE.md § Library "Map view" for the full rationale):
//   - Deterministic seeded initialization: every node's initial position is a
//     pure function of its stable library_id (a small hash -> seeded PRNG),
//     never Math.random() — the same graph produces substantially the same
//     layout on every reload.
//   - The WHOLE visible graph settles as one continuous simulation (warm-
//     started from current positions so filter changes preserve survivors'
//     spatial continuity) — full pairwise repulsion between every visible
//     node, not scoped to a connected component, is what keeps disconnected
//     clusters and singletons visually separate from each other. An earlier
//     design ran each component's own small local simulation in isolation
//     and then deterministically packed the results into shelf rows
//     afterward; that separate packing step read as an ugly, physics-less
//     jump no matter how it was eased (direct user feedback), so it's gone
//     — inter-component spacing is now an emergent property of the same
//     repulsion that untangles each component's own internal edges, the way
//     mainstream interactive force graphs (Obsidian, Gephi, d3-force) work.
//   - relayout(visibleIds) is the one orchestrator for both the initial full
//     load and every filter change — it never partially applies only some of
//     its steps. Selection deliberately does NOT go through it, and does not
//     move anything at all, camera included — selecting only recomputes the
//     Selection Hierarchy's tiers and shows the selected card (see
//     selectNode()). An earlier design also nudged the selected node's
//     neighbors apart for breathing room and animated the camera to recenter
//     on every selection; per direct user feedback both read as disconcerting
//     motion breaking visual continuity, so a click now only ever changes
//     which tiers/card are showing — the graph and the camera stay exactly
//     where they were.
//   - The settle runs continuously, one animation frame at a time, with a
//     decaying alpha (1 -> ~0, the standard force-simulation convergence
//     model — see runContinuousSettle()) rather than a fixed batch of
//     iterations: a large, densely-connected graph genuinely needs more time
//     to untangle than a small one, and a fixed iteration cap was freezing
//     it mid-tangle rather than at an actual rest state. It still comes to a
//     genuine stop once alpha decays low enough — this is a settled map
//     that takes as long as it needs to settle, not a perpetually drifting
//     physics demo.
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
// current focus. isImageActive(n) below is the single source of truth for
// this (both the background and interaction layers call it, so they can
// never disagree on which nodes currently show an image). The actual <img>
// object backing an image-node is created lazily, the first time a node
// becomes image-active (getNodeImage() below) — hovering or selecting around
// the graph doesn't eagerly fetch hundreds of images up front.
//
// Selection-Centered Navigation: clicking a node makes it the *selection* —
// a stable point of focus that persists until another node is selected, a
// filter change removes it, or it's explicitly cleared (click away /
// Escape). Selecting neither moves the node nor pans the camera — per
// direct user feedback the camera move read as unwanted motion — it only
// shows a persistent card ("where I am"). The Selection Hierarchy
// (selected/neighbor/connected, plus the unstyled "unrelated" default) is
// driven ENTIRELY by the selection, never by hover — hovering a different
// node never replaces or dims it. Hover is a
// separate, secondary layer: it shows its own transient card ("what I'm
// considering next"), a light dashed outline on that one node, AND marks its
// touching edges as the strongest emphasis tier with a relationship label
// near the midpoint — all gone the instant the hover ends, while the
// selection's card and tiers stay exactly as they were. This is also why
// hover changes only ever invalidate the *interaction* canvas layer, never
// the background one — see the module comment on invalidate()/
// invalidateHover() below.
//
// Clicking a card (either one) is the only mouse gesture that navigates away
// to the entry's real page — clicking a node only selects it. Keyboard
// access to individual nodes is intentionally NOT reproduced in Canvas mode:
// unlike the previous SVG implementation (one focusable <g> per node), a
// <canvas> has no per-shape accessibility subtree for a screen reader or Tab
// order to hook into, and building a synthetic one (a hidden list of every
// node, kept in sync with the visible/filtered set) would be real,
// maintenance-heavy machinery for a view whose own accessibility story
// already rests elsewhere: Catalog is the complete, semantic, fully
// keyboard-navigable listing of the same entries (see CLAUDE.md § Library
// Accessibility — "Catalog remains the full semantic fallback"). What Map
// still keeps keyboard-accessible: Escape clears the selection; the
// pan/zoom/filter controls around the map are ordinary HTML; and once a
// selection exists (via a pointer click), its persistent card's title is a
// real link, reachable by Tab like any other page content.
(function () {
  "use strict";

  var container = document.getElementById("library-map");
  var bgCanvas = document.getElementById("library-map-bg-canvas");
  var fxCanvas = document.getElementById("library-map-fx-canvas");
  if (!container || !bgCanvas || !fxCanvas) return;
  var bgCtx = bgCanvas.getContext("2d");
  var fxCtx = fxCanvas.getContext("2d");
  var emptyEl = document.getElementById("library-map-empty");
  var HUB_TYPES = { person: true, group: true, organization: true };
  var FALLBACK_STYLE = { color: "dark-grey", shape: "circle", label: "Other" };
  var SUMMARY_MAX = 110;

  // Abstract-shape / image-node sizes, in WORLD units — kept in sync with
  // drawShapeNode()/drawImageNode() below, which turn these into on-screen
  // pixel sizes by multiplying by the current camera scale (see
  // fitTransform()). Collision uses nodeRadius() (further down), derived
  // from these same constants, so the two can never silently drift apart.
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

  var W = 1000, H = 700; // reference WORLD size — only used as the initial
                          // seed-spread extent and a minimum-size floor for
                          // the first-load viewport fit. Not a pixel size:
                          // actual on-screen sizing comes entirely from the
                          // container's real CSS box (see resizeCanvases()).
  var nodes = [], edges = [];
  var nodeById = {}, entryById = {};
  var nodeComponent = {}; // recomputed per visible set on every relayout — see computeComponents()
  var typeStyles = {};
  var sel = { type: [], subject: [] };
  var visible = {}; // id -> bool, the current filtered set
  var currentVB = { x: 0, y: 0, w: W, h: H };
  var selectedId = null; // the persistent selection — see module comment
  var hoveredId = null; // the transient hover preview, independent of selectedId
  var didPan = false; // true when the current gesture moved the map — see initPointerHandling()
  var draggedNode = null; // the node currently pinned to the pointer, if any — see startDrag()
  var dragTarget = null; // {x,y} world coords the dragged node is pinned to, updated each pointermove
  var didDrag = false; // true once a press-on-a-node gesture has crossed the drag threshold — see initPointerHandling()

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
  // their base size for the same reason — see drawShapeNode()'s own
  // diamond/triangle point math, which reaches slightly past `size` itself.
  // This is a STATIC radius: any entry that has an image gets the LARGER
  // image-node radius regardless of whether it's currently rendering as the
  // smaller abstract shape (see the module comment on why) — collision and
  // packing never need to change when a selection changes, only what that
  // one node's own draw call looks like.
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
  // forceIterationWithCentering() below is the graph's one force+collision
  // iteration — repulsion, edge springs (rate now varying modestly by
  // relation category — see SPRING_CATEGORY_MULT), collision, and a weak
  // centering pull — used by both the continuous settle scheduler and a
  // drag's reheated sim, for the whole visible graph together. Entirely
  // renderer-agnostic — see module comment.
  var BASE_K = 34; // ideal inter-node spacing — a tuned constant. Since the
                    // whole visible graph now settles as one simulation
                    // (not split per component), this is the one spacing
                    // constant governing every visible node's repulsion —
                    // if the graph grows much larger than today's ~550
                    // nodes, this is the first constant to revisit.
  var COLLISION_PAD = 4;
  // How firmly an edge's spring pulls its two nodes toward BASE_K apart,
  // relative to the base springK — modest, deliberately not "wildly
  // different" per direct user feedback: a structural edge (a creator
  // credit, part-of, made-with, …) is the firmest claim this graph makes
  // about a relationship, so it keeps the full baseline pull; a contextual
  // edge (affiliated-with, discusses, related-reading, …) is the loosest,
  // so it's allowed to stretch further before its spring resists; historical
  // (influenced-by, successor-to, …) sits between the two. This is the same
  // three-way category already used for line style (solid/dashed/dotted —
  // see edgeCategory()), now also expressed physically, not just visually.
  var SPRING_CATEGORY_MULT = { structural: 1, historical: 0.7, contextual: 0.5 };

  // A dedicated cleanup pass, direct positional correction rather than
  // force integration: in a densely triangulated cluster, competing spring
  // attraction can reach a converged equilibrium (alpha decayed below
  // SIM_ALPHA_MIN) that still leaves a couple of nodes closer than their
  // combined collision radius — the generic collision FORCE nudges them
  // apart but has to share the tug-of-war with every other force in the
  // same iteration, and isn't guaranteed to fully win. This runs after the
  // whole visible graph has already settled into its overall shape, so it
  // only has small residual overlaps left to resolve and converges in a
  // handful of iterations.
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
  // The graph's one force+collision iteration: pairwise repulsion (with a
  // collision correction once two nodes' actual rendered footprints —
  // radius, precomputed once in buildGraph, see nodeRadius() — would
  // overlap, on top of the generic inverse-square repulsion, since two
  // large image nodes could otherwise settle overlapping), edge springs
  // (rate scaled per edge by SPRING_CATEGORY_MULT — see its own comment),
  // and a weak pull toward a given center. `alpha` (0..1) scales the net
  // force applied each tick — the continuous settle scheduler decays it
  // from 1 toward ~0 over the course of a settle, tapering movement
  // smoothly to rest rather than cutting off at an arbitrary fixed
  // iteration count. Defaults to 1 (no taper) so other callers are
  // unaffected.
  function forceIterationWithCentering(nodeList, edgeList, cx, cy, alpha) {
    if (alpha === undefined) alpha = 1;
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
      var mult = SPRING_CATEGORY_MULT[e.category] !== undefined ? SPRING_CATEGORY_MULT[e.category] : 1;
      var force = springK * mult * (dist - BASE_K);
      var fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.fx -= fx; a.fy -= fy;
      b.fx += fx; b.fy += fy;
    });
    var totalMove = 0;
    for (i = 0; i < nodeList.length; i++) {
      var n = nodeList[i];
      n.fx += (cx - n.x) * 0.01;
      n.fy += (cy - n.y) * 0.01;
      n.fx *= alpha; n.fy *= alpha;
      n.vx = (n.vx + n.fx) * damping;
      n.vy = (n.vy + n.fy) * damping;
      var speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > maxSpeed) { n.vx = n.vx / speed * maxSpeed; n.vy = n.vy / speed * maxSpeed; }
      n.x += n.vx; n.y += n.vy;
      totalMove += Math.abs(n.vx) + Math.abs(n.vy);
    }
    return totalMove / nodeList.length;
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

  // --- Continuous settle scheduler: ONE simulation spans the WHOLE visible
  // graph together — full pairwise repulsion between every visible node
  // (not just within a connected component), springs/collision only for
  // actual edges, and a weak pull toward the visible set's own live
  // centroid (forceIterationWithCentering, unchanged). This replaces an
  // earlier two-phase design (each component settled in isolation, then a
  // separate deterministic packComponents() step translated whole
  // components into tidy shelf rows) — per direct user feedback, that
  // second step read as an ugly, disconnected jump no matter how it was
  // eased, because it wasn't physics at all, just a geometric sort bolted
  // on afterward. Removing it entirely and letting inter-component spacing
  // emerge from the SAME repulsion that untangles each component's own
  // edges is both simpler (one code path, not two) and closer to how every
  // mainstream interactive force graph actually works (Obsidian, Gephi,
  // d3-force default behavior) — disconnected nodes/clusters naturally
  // settle apart from each other because they repel each other, not
  // because something re-sorted them into a grid.
  //
  // Alpha (1 -> ~0) is the standard force-simulation convergence model
  // (these constants are d3-force's own long-tuned defaults — alphaMin=
  // 0.001, decay derived so alpha crosses it in ~300 ticks — reimplemented
  // here in plain vanilla JS, not imported). Per the user's own explicit
  // choice: this runs every frame for as long as the graph actually needs
  // to settle, rather than a fixed iteration cap — but it still comes to a
  // genuine rest and stops (not perpetual motion): once alpha decays below
  // ALPHA_MIN, positions have essentially stopped moving on their own, so
  // continuing to tick costs CPU for no visible benefit. SIM_SAFETY_TICKS
  // is a generous cap so a pathological configuration can't tick forever —
  // a normal settle finishes via alpha decay well before it.
  //
  // SIM_SPEED is a pure playback-speed control, separate from all of the
  // above: 1.0 ticks the simulation at the rate this file was originally
  // tuned at (3 ticks per rendered frame); 0.3 (the current setting, per
  // direct user feedback that the original pace read as too fast/abrupt)
  // advances the simulation at 30% of that rate — nodes visibly move more
  // slowly and the whole settle takes proportionally longer in wall-clock
  // time, but reaches the exact same final positions and convergence
  // criteria, since neither the force math nor alpha decay themselves
  // change. Implemented as a fractional tick-budget accumulator (rather
  // than rounding SIM_SPEED*3 to a whole number of ticks per frame) so the
  // speed control stays precise at any value, not just ones that divide
  // evenly into whole ticks-per-frame. ------------------------------------
  var SIM_TICKS_PER_FRAME_BASE = 3;
  var SIM_SPEED = 0.3;
  var SIM_ALPHA_MIN = 0.001;
  var SIM_ALPHA_DECAY = 1 - Math.pow(SIM_ALPHA_MIN, 1 / 300);
  var SIM_SAFETY_TICKS = 3000;
  var simFrameHandle = null;
  var currentSim = null; // the whole-graph sim currently ticking, if any — see
                          // ensureSimRunning(), which drag reheats/reuses directly.
  var relayoutGen = 0; // bumped on every relayout() call; guards a superseded
                        // settle's completion callback from firing after a
                        // newer filter change has already started its own.

  function settleTick(sim) {
    var cx = 0, cy = 0, i;
    for (i = 0; i < sim.nodes.length; i++) { cx += sim.nodes[i].x; cy += sim.nodes[i].y; }
    cx /= sim.nodes.length; cy /= sim.nodes.length;
    forceIterationWithCentering(sim.nodes, sim.edges, cx, cy, sim.alpha);
    // Pin the dragged node (if any) back to the pointer's current world
    // position AFTER the physics step, overriding whatever force/velocity
    // integration just computed for it — every OTHER node still feels
    // repulsion/spring pull from wherever the dragged node currently is
    // (computed just above, before the override), so the rest of the graph
    // genuinely responds to the drag in real time; only the dragged node
    // itself is exempt from the physics that would otherwise move it.
    if (draggedNode) { draggedNode.x = dragTarget.x; draggedNode.y = dragTarget.y; draggedNode.vx = 0; draggedNode.vy = 0; }
    sim.alpha += (0 - sim.alpha) * SIM_ALPHA_DECAY;
    sim.ticks++;
    if (sim.alpha < SIM_ALPHA_MIN || sim.ticks > SIM_SAFETY_TICKS) sim.done = true;
  }

  function runContinuousSettle(sim, gen, onDone) {
    if (simFrameHandle) cancelAnimationFrame(simFrameHandle);
    currentSim = sim;
    // prefers-reduced-motion: same alpha-decay convergence, same final
    // quality — just run to completion synchronously in one pass instead of
    // animating it across frames.
    if (reduceMotion()) {
      while (!sim.done) settleTick(sim);
      currentSim = null;
      onDone();
      return;
    }
    var tickBudget = 0; // fractional accumulator — see SIM_SPEED comment above
    function frame() {
      if (gen !== relayoutGen) return; // superseded — a newer relayout() owns the map now
      tickBudget += SIM_TICKS_PER_FRAME_BASE * SIM_SPEED;
      var ticksThisFrame = Math.floor(tickBudget);
      tickBudget -= ticksThisFrame;
      for (var t = 0; t < ticksThisFrame && !sim.done; t++) settleTick(sim);
      // Approximate hit-testing and a visible "watch it relax" repaint
      // while the settle is still in progress — see the module comment.
      buildSpatialIndex(sim.nodes);
      invalidate();
      if (!sim.done) {
        simFrameHandle = requestAnimationFrame(frame);
      } else {
        simFrameHandle = null;
        currentSim = null;
        onDone();
      }
    }
    simFrameHandle = requestAnimationFrame(frame);
  }

  // --- Node dragging: pins one node to the pointer while everything else
  // keeps responding to it in real time via the SAME continuous simulation
  // used for every other settle — see settleTick()'s pin-override above.
  // DRAG_ALPHA is a moderate reheat, not a full alpha=1 reset: grabbing one
  // node shouldn't cause the whole graph to violently re-settle from
  // scratch the way a fresh relayout() does, just wake up enough that
  // nearby nodes visibly yield as the dragged node moves through them.
  var DRAG_ALPHA = 0.4;
  // Starts a fresh whole-graph sim if the graph is currently at rest, or
  // simply boosts the alpha of whichever sim is already ticking — either
  // way, called on every drag movement so a long, slow drag (during which
  // alpha may have already decayed back down) keeps reheating rather than
  // freezing mid-drag.
  function ensureSimRunning(minAlpha) {
    if (currentSim && !currentSim.done) {
      if (currentSim.alpha < minAlpha) currentSim.alpha = minAlpha;
      return;
    }
    relayoutGen++;
    var gen = relayoutGen;
    var visibleNodes = nodes.filter(function (n) { return visible[n.id]; });
    var visibleEdges = edges.filter(function (e) { return visible[e.source] && visible[e.target]; });
    if (visibleNodes.length < 2) return; // nothing to simulate
    var sim = { nodes: visibleNodes, edges: visibleEdges, alpha: minAlpha, ticks: 0, done: false };
    runContinuousSettle(sim, gen, function () { finishRelayout(gen, visibleNodes, visible, {}); });
  }

  // Called once the drag threshold is crossed (see initPointerHandling()) —
  // not on the initial pointerdown itself, so a plain click on a node still
  // reaches the click handler as a selection rather than a zero-distance drag.
  function startDrag(n) {
    draggedNode = n;
    dragTarget = { x: n.x, y: n.y };
    didDrag = true;
    setHovered(null); // suppress hover switching to neighboring nodes while dragging — see module comment
    ensureSimRunning(DRAG_ALPHA);
    invalidateHover();
  }
  function updateDrag(worldX, worldY) {
    if (!draggedNode) return;
    dragTarget.x = worldX; dragTarget.y = worldY;
    // Move the dragged node itself immediately, not just at the next
    // physics tick — it should track the pointer with zero latency; only
    // the REST of the graph's reaction is paced by the simulation's own
    // frame rate (see settleTick()'s pin-override, which keeps re-asserting
    // this same position every tick so physics never fights the pin).
    draggedNode.x = worldX; draggedNode.y = worldY;
    draggedNode.vx = 0; draggedNode.vy = 0;
    ensureSimRunning(DRAG_ALPHA);
    invalidate();
  }
  // Unpins the node — the already-running simulation (if any) simply keeps
  // decaying and converging exactly like any other settle from here, per
  // the module comment's "cool the simulation; freeze after convergence."
  function endDrag() {
    draggedNode = null;
    dragTarget = null;
    invalidate();
  }

  // The deterministic tail that used to end relayout() synchronously — now
  // runs once the whole-graph continuous settle has actually converged (or
  // hit its safety cap), never mid-settle.
  //
  // Per direct user feedback, the camera is NOT automatically re-fit/
  // recentered after every settle any more. The one-time first-load fit
  // that used to live here has moved to relayout() itself, applied
  // synchronously against the freshly-seeded positions before the settle
  // even starts (see that function's own comment) — waiting for THIS
  // deferred completion to fit the viewport meant that fit could land
  // however long the initial settle actually took (a real second or more
  // at SIM_SPEED), which if the user had already clicked something by then
  // showed up as an unexplained little zoom seemingly caused by their
  // selection. Every relayout after the very first (a filter change, most
  // commonly) leaves the current pan/zoom exactly where the user left it:
  // the graph still settles underneath, but the camera itself is the
  // user's to control from then on, never snapped or re-centered out from
  // under them.
  function finishRelayout(gen, visibleNodes, idSet) {
    if (gen !== relayoutGen) return; // superseded
    resolveOverlapsOnly(visibleNodes);

    buildSpatialIndex(visibleNodes);
    invalidate();

    var anyVisible = visibleNodes.length > 0;
    if (emptyEl) emptyEl.hidden = anyVisible || nodes.length === 0;
    if (selectedId && !idSet[selectedId]) deselectNode();
    if (hoveredId && !idSet[hoveredId]) clearHovered();
  }

  // --- relayout(): the one orchestrator for a full load or a filter change.
  // Never applies only some of its steps — recompute components (still
  // needed for the Selection Hierarchy's "connected" tier — see
  // drawBackground() — even though layout itself is no longer split by
  // component) -> on the true first call only, fit the viewport to the
  // freshly-seeded positions immediately, synchronously, before anything
  // else — see the comment on that block below for why it happens HERE and
  // not after the settle completes -> settle the whole visible graph
  // continuously (runContinuousSettle(), above) -> once it's genuinely
  // converged, resolve any residual overlap and rebuild the spatial index
  // (finishRelayout(), above). Deliberately NOT used by selection —
  // selectNode() never repositions anything or touches the camera, only
  // recomputes the Selection Hierarchy's tiers. -----------------------------
  function relayout(visibleIds) {
    relayoutGen++;
    var gen = relayoutGen;
    if (simFrameHandle) { cancelAnimationFrame(simFrameHandle); simFrameHandle = null; }

    var idSet = {};
    visibleIds.forEach(function (id) { idSet[id] = true; });
    visible = idSet;

    var visibleNodes = nodes.filter(function (n) { return idSet[n.id]; });
    var visibleEdges = edges.filter(function (e) { return idSet[e.source] && idSet[e.target]; });

    // The one-time initial fit — applied here, synchronously, against the
    // just-seeded (not yet settled) positions, before the browser has
    // painted anything from this call at all, rather than deferred until
    // the settle finishes converging (which can take a real second or more
    // at SIM_SPEED). Waiting meant this fit could land at whatever moment
    // the settle happened to finish — if the user had already clicked
    // something by then, the fit's arrival showed up as an unexplained
    // little zoom seemingly caused by their selection. Doing it immediately
    // means the very first frame ever painted is already reasonably framed,
    // and nothing later ever re-fits the viewport on its own again.
    if (!hasLaidOutOnce) {
      hasLaidOutOnce = true;
      currentVB = fitTargetFor(visibleNodes);
    }

    var built = computeComponents(visibleNodes, visibleEdges);
    nodeComponent = built.comp;

    function done() { finishRelayout(gen, visibleNodes, idSet); }
    if (visibleNodes.length >= 2) {
      runContinuousSettle({ nodes: visibleNodes, edges: visibleEdges, alpha: 1, ticks: 0, done: false }, gen, done);
    } else {
      done();
    }
  }

  // --- Stage 3: spatial index -----------------------------------------------
  // A uniform grid, not a quadtree: simpler to write correctly, and plenty
  // fast at this graph's scale (a few hundred to ~1,000 nodes). Rebuilt
  // whenever positions settle (after relayout/reheat/pan-triggered nothing —
  // pan/zoom don't move WORLD positions, only the camera, so the index only
  // needs rebuilding when node x/y actually change). Bucket size matches
  // BASE_K (the same "ideal spacing" constant the force simulation already
  // uses), so a hit test only ever needs to check the current cell plus its
  // 8 neighbors.
  var spatialGrid = {};
  function gridKey(cx, cy) { return cx + "," + cy; }
  function buildSpatialIndex(nodeList) {
    spatialGrid = {};
    nodeList.forEach(function (n) {
      var cx = Math.floor(n.x / BASE_K), cy = Math.floor(n.y / BASE_K);
      var k = gridKey(cx, cy);
      (spatialGrid[k] || (spatialGrid[k] = [])).push(n);
    });
  }
  // Nearest visible node to a world point, within `radius` world units —
  // the caller (hover/click handlers) is responsible for converting a
  // screen-space hit radius into world units first, via hitRadiusWorld(),
  // so targets stay easy to hit at any zoom level.
  function hitTestWorld(wx, wy, radius) {
    var cx = Math.floor(wx / BASE_K), cy = Math.floor(wy / BASE_K);
    var best = null, bestDist = Infinity;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var cell = spatialGrid[gridKey(cx + dx, cy + dy)];
        if (!cell) continue;
        for (var i = 0; i < cell.length; i++) {
          var n = cell[i];
          if (!visible[n.id]) continue;
          var ddx = n.x - wx, ddy = n.y - wy;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          var r = Math.max(n.radius, radius);
          if (d <= r && d < bestDist) { bestDist = d; best = n; }
        }
      }
    }
    return best;
  }

  // --- Stage 4: camera transform + Canvas rendering -------------------------
  // The ONE shared transform — used for drawing nodes, drawing edges, hit
  // testing, and card anchoring alike (per the migration's own design goal:
  // one source of truth for world<->screen conversion, never duplicated
  // math that could drift out of sync). fitTransform(w, h) returns a
  // uniform scale (never stretching x/y independently) plus an offset that
  // centers `currentVB`'s world-space rect within a `w`x`h` CSS-pixel box —
  // this reproduces the previous SVG's `viewBox`+`preserveAspectRatio=
  // "xMidYMid meet"` letterboxing behavior exactly, rather than the
  // non-uniform stretch a naive width-independent/height-independent mapping
  // would produce.
  function fitTransform(w, h) {
    var scale = Math.min(w / currentVB.w, h / currentVB.h);
    var contentW = currentVB.w * scale, contentH = currentVB.h * scale;
    return {
      scale: scale,
      offsetX: (w - contentW) / 2 - currentVB.x * scale,
      offsetY: (h - contentH) / 2 - currentVB.y * scale
    };
  }
  // Canvas-local (0,0-origin) screen position — what drawing and hit-test
  // conversion both use.
  function worldToLocal(x, y, w, h) {
    var t = fitTransform(w, h);
    return { x: x * t.scale + t.offsetX, y: y * t.scale + t.offsetY };
  }
  // Pointer event (clientX/clientY) -> world coordinates, for hit-testing
  // and panning.
  function screenToWorld(clientX, clientY) {
    var rect = fxCanvas.getBoundingClientRect();
    var t = fitTransform(rect.width, rect.height);
    return { x: (clientX - rect.left - t.offsetX) / t.scale, y: (clientY - rect.top - t.offsetY) / t.scale };
  }
  // A fixed ~13 CSS-px hit radius (within the spec's suggested 10-16px
  // range), converted to world units for the current zoom level so targets
  // stay comfortably clickable whether zoomed in or out — always somewhat
  // larger than a node's own drawn radius, never smaller.
  var HIT_RADIUS_PX = 13;
  function hitRadiusWorld() {
    var rect = fxCanvas.getBoundingClientRect();
    var t = fitTransform(rect.width, rect.height);
    return HIT_RADIUS_PX / t.scale;
  }

  // CSS custom properties resolved to concrete color/font values once and
  // cached — a canvas 2D context has no idea what `var(--signal)` means, so
  // every color/font this file draws with is resolved through here instead
  // of being hard-coded, keeping this file as the single non-duplicating
  // consumer of the site's existing Colorplan/type-scale custom properties
  // (see CLAUDE.md § Colorplan palette). The cache is cleared and a repaint
  // requested on a live prefers-color-scheme change, since (unlike an
  // inline SVG `style="fill:var(--x)"`, which the browser re-resolves for
  // free) a Canvas draw call bakes in a literal color string at call time.
  var colorCache = {};
  function cssVar(name) {
    if (!(name in colorCache)) {
      colorCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
    }
    return colorCache[name];
  }
  if (window.matchMedia) {
    var schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var onSchemeChange = function () { colorCache = {}; invalidate(); };
    if (schemeQuery.addEventListener) schemeQuery.addEventListener("change", onSchemeChange);
  }

  // Only the SELECTED node and its direct neighbors ever show their image —
  // see the module comment on Image nodes. Both drawBackground() and
  // drawInteraction() call this so they can never disagree about which
  // nodes are currently image-active.
  function isImageActive(n) {
    if (!n.hasImage) return false;
    if (n.id === selectedId) return true;
    if (selectedId) {
      var neighbors = neighborsOf(selectedId);
      if (neighbors.indexOf(n.id) !== -1) return true;
    }
    return false;
  }

  // Lazily creates (once) the <img> backing an image-active node, and
  // requests a repaint when it finishes loading — mirrors the previous
  // implementation's "only set the href the first time a node actually
  // becomes image-active" behavior; nodeImageCache[id] existing is now
  // itself the "already requested" gate.
  var nodeImageCache = {};
  function getNodeImage(n) {
    if (!n.hasImage) return null;
    if (nodeImageCache[n.id]) return nodeImageCache[n.id];
    var entry = entryById[n.id];
    var url = entry && entry.primary_image && entry.primary_image.url;
    if (!url) return null;
    var img = new Image();
    img.onload = function () { invalidate(); };
    img.src = url;
    nodeImageCache[n.id] = img;
    return img;
  }

  function setEdgeDash(ctx, category) {
    if (category === "historical") ctx.setLineDash([4, 3]);
    else if (category === "contextual") ctx.setLineDash([1, 3]);
    else ctx.setLineDash([]);
  }

  function drawShapeNode(ctx, n, p, style, scale) {
    var size = (n.hub ? SHAPE_SIZE.hub : SHAPE_SIZE.leaf) * scale;
    ctx.fillStyle = cssVar("--colorplan-" + style.color);
    ctx.beginPath();
    if (style.shape === "square") {
      ctx.rect(p.x - size, p.y - size, size * 2, size * 2);
    } else if (style.shape === "diamond") {
      var d = size * 1.15;
      ctx.moveTo(p.x, p.y - d);
      ctx.lineTo(p.x + d, p.y);
      ctx.lineTo(p.x, p.y + d);
      ctx.lineTo(p.x - d, p.y);
      ctx.closePath();
    } else if (style.shape === "triangle") {
      var t = size * 1.3;
      ctx.moveTo(p.x, p.y - t);
      ctx.lineTo(p.x + t, p.y + t * 0.75);
      ctx.lineTo(p.x - t, p.y + t * 0.75);
      ctx.closePath();
    } else {
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // preserveAspectRatio="xMidYMid slice" equivalent: scale the source image
  // up to COVER the square (not fit within it), centered, then clip to the
  // square — matches the previous SVG <image>'s crop behavior exactly.
  function drawImageNode(ctx, n, p, style, scale) {
    var s = (n.hub ? IMAGE_SIZE.hub : IMAGE_SIZE.leaf) * scale;
    ctx.fillStyle = cssVar("--paper-2");
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    var img = getNodeImage(n);
    if (img && img.complete && img.naturalWidth) {
      var side = s * 2;
      var fit = Math.max(side / img.naturalWidth, side / img.naturalHeight);
      var dw = img.naturalWidth * fit, dh = img.naturalHeight * fit;
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x - s, p.y - s, side, side);
      ctx.clip();
      ctx.drawImage(img, p.x - dw / 2, p.y - dh / 2, dw, dh);
      ctx.restore();
    }
    ctx.strokeStyle = cssVar("--colorplan-" + style.color);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
  }

  function nodeVisualHalfSize(n, scale, showImage) {
    return showImage ? (n.hub ? IMAGE_SIZE.hub : IMAGE_SIZE.leaf) * scale : (n.hub ? SHAPE_SIZE.hub : SHAPE_SIZE.leaf) * scale;
  }

  // --- Background layer: the full graph at rest, plus the Selection
  // Hierarchy's four opacity tiers (see module comment — driven ENTIRELY by
  // selectedId, never by hover). Redrawn whenever anything that could change
  // WHAT's drawn or WHERE happens: layout (relayout/reheat), a filter
  // change, a resize, a pan/zoom step, or a selection change (since that
  // changes every node's opacity tier, not just the selected node's own
  // appearance) — see invalidate() below. Edges are NOT dimmed by
  // selection (matching the previous SVG/CSS behavior exactly: only
  // `.is-active`, touching the selected node, and `.is-hovered`, drawn on
  // the interaction layer, ever change edge styling) — only node opacity
  // participates in the four-tier ladder. --------------------------------
  function drawBackground() {
    var rect = bgCanvas.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    bgCtx.clearRect(0, 0, w, h);
    if (!nodes.length) return;
    var t = fitTransform(w, h);

    var hasSel = !!(selectedId && nodeById[selectedId] && visible[selectedId]);
    var direct = {};
    if (hasSel) neighborsOf(selectedId).forEach(function (id) { direct[id] = true; });
    var selComp = hasSel ? nodeComponent[selectedId] : null;

    function tierAlpha(n) {
      if (!hasSel) return 1;
      if (n.id === selectedId) return 1;
      if (direct[n.id]) return 0.85;
      if (nodeComponent[n.id] === selComp) return 0.4;
      return 0.12;
    }

    // Edges first — drawn under nodes, matching the previous SVG paint
    // order (edges group before nodes group).
    edges.forEach(function (e) {
      if (!visible[e.source] || !visible[e.target]) return;
      var a = nodeById[e.source], b = nodeById[e.target];
      var pa = worldToLocal(a.x, a.y, w, h), pb = worldToLocal(b.x, b.y, w, h);
      var active = hasSel && (e.source === selectedId || e.target === selectedId);
      bgCtx.beginPath();
      bgCtx.moveTo(pa.x, pa.y);
      bgCtx.lineTo(pb.x, pb.y);
      setEdgeDash(bgCtx, e.category);
      bgCtx.strokeStyle = active ? cssVar("--signal") : cssVar("--gray-2");
      bgCtx.lineWidth = active ? 1.5 : 1;
      bgCtx.stroke();
    });
    bgCtx.setLineDash([]);

    nodes.forEach(function (n) {
      if (!visible[n.id]) return;
      var p = worldToLocal(n.x, n.y, w, h);
      var style = typeStyles[n.publicType] || FALLBACK_STYLE;
      var showImage = isImageActive(n);
      bgCtx.globalAlpha = tierAlpha(n);
      if (showImage) drawImageNode(bgCtx, n, p, style, t.scale);
      else drawShapeNode(bgCtx, n, p, style, t.scale);
      if (n.id === selectedId) {
        var half = nodeVisualHalfSize(n, t.scale, showImage);
        bgCtx.globalAlpha = 1;
        bgCtx.beginPath();
        bgCtx.setLineDash([]);
        bgCtx.strokeStyle = cssVar("--signal");
        bgCtx.lineWidth = 2;
        bgCtx.arc(p.x, p.y, half + 3, 0, Math.PI * 2);
        bgCtx.stroke();
      }
    });
    bgCtx.globalAlpha = 1;
  }

  // --- Interaction layer: hover and/or an in-progress drag (see module
  // comment — neither touches the selection's tiers, so this never needs
  // the background layer's tierAlpha() logic). A hovered node's touching
  // edges are drawn here at the strongest emphasis, each with its
  // relationship label near the midpoint if it has one — both gone the
  // instant the hover ends. Cheap enough to redraw on every hover/pan/zoom/
  // drag tick without touching the (potentially much larger) background
  // layer. Hover is suppressed for the duration of a drag (startDrag()
  // calls setHovered(null)), so in practice these two blocks are mutually
  // exclusive, but each is written to stand alone regardless. -------------
  function drawInteraction() {
    var rect = fxCanvas.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    fxCtx.clearRect(0, 0, w, h);
    var t = fitTransform(w, h);

    if (draggedNode && visible[draggedNode.id]) {
      var dp = worldToLocal(draggedNode.x, draggedNode.y, w, h);
      var dhalf = nodeVisualHalfSize(draggedNode, t.scale, isImageActive(draggedNode));
      fxCtx.beginPath();
      fxCtx.setLineDash([]);
      fxCtx.strokeStyle = cssVar("--signal");
      fxCtx.lineWidth = 2;
      fxCtx.arc(dp.x, dp.y, dhalf + 3, 0, Math.PI * 2);
      fxCtx.stroke();
    }

    if (!hoveredId || hoveredId === selectedId) return;
    var n = nodeById[hoveredId];
    if (!n || !visible[hoveredId]) return;

    edges.forEach(function (e) {
      if (e.source !== hoveredId && e.target !== hoveredId) return;
      if (!visible[e.source] || !visible[e.target]) return;
      var a = nodeById[e.source], b = nodeById[e.target];
      var pa = worldToLocal(a.x, a.y, w, h), pb = worldToLocal(b.x, b.y, w, h);
      fxCtx.beginPath();
      fxCtx.setLineDash([]);
      fxCtx.moveTo(pa.x, pa.y);
      fxCtx.lineTo(pb.x, pb.y);
      fxCtx.strokeStyle = cssVar("--signal");
      fxCtx.lineWidth = 2;
      fxCtx.stroke();
      if (e.label) {
        var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        fxCtx.font = "8px " + cssVar("--font-mono");
        fxCtx.textAlign = "center";
        fxCtx.textBaseline = "middle";
        fxCtx.lineJoin = "round";
        fxCtx.lineWidth = 3;
        fxCtx.strokeStyle = cssVar("--paper");
        fxCtx.strokeText(e.label, mx, my);
        fxCtx.fillStyle = cssVar("--ink");
        fxCtx.fillText(e.label, mx, my);
      }
    });

    var p = worldToLocal(n.x, n.y, w, h);
    var half = nodeVisualHalfSize(n, t.scale, isImageActive(n));
    fxCtx.beginPath();
    fxCtx.setLineDash([2, 2]);
    fxCtx.strokeStyle = cssVar("--signal");
    fxCtx.lineWidth = 1;
    fxCtx.arc(p.x, p.y, half + 3, 0, Math.PI * 2);
    fxCtx.stroke();
    fxCtx.setLineDash([]);
  }

  // Event-driven repaint scheduling — the map does not run a continuous
  // animation loop. invalidate() marks BOTH layers dirty (used for anything
  // that can change node/edge appearance or position: layout, filtering,
  // selection, pan/zoom, resize); invalidateHover() marks only the
  // interaction layer (used for hover changes, which per the module comment
  // never affect the background's own appearance). Either way, at most one
  // requestAnimationFrame is ever pending at a time.
  var rafHandle = null, bgDirty = true, fxDirty = true;
  function scheduleFrame() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(function () {
      rafHandle = null;
      if (bgDirty) { drawBackground(); bgDirty = false; }
      if (fxDirty) { drawInteraction(); fxDirty = false; }
    });
  }
  function invalidate() { bgDirty = true; fxDirty = true; scheduleFrame(); }
  function invalidateHover() { fxDirty = true; scheduleFrame(); }

  // HiDPI-aware sizing: the canvas BUFFER is CSS size * devicePixelRatio,
  // scaled back down via ctx.setTransform so every draw call above can stay
  // in ordinary CSS-pixel coordinates. Re-run whenever the container's box
  // actually changes size (ResizeObserver), not on every frame.
  function resizeCanvases() {
    var rect = container.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    [bgCanvas, fxCanvas].forEach(function (cv) {
      cv.width = Math.max(1, Math.round(rect.width * dpr));
      cv.height = Math.max(1, Math.round(rect.height * dpr));
      cv.style.width = rect.width + "px";
      cv.style.height = rect.height + "px";
    });
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    invalidate();
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
  // small controller over one DOM subtree so the same population/show/hide
  // logic can run against either without duplication. Position is FIXED, not
  // node-relative — see the CSS (.library-map-card / .library-map-card--hover):
  // the selected card always sits in the canvas's upper-right corner, the
  // hover card always in the upper-left, regardless of where the node
  // itself is on screen. An earlier design anchored each card near its own
  // node (probing several directions/distances to dodge covering it or
  // other nodes) and had to reposition on every pan/zoom/settle tick; fixed
  // corners are simpler, predictable, and per direct user feedback read
  // better than a card that chases the node around. -------------------------
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

  function showCardFor(ctrl, id) {
    if (!ctrl) return;
    var n = nodeById[id], entry = entryById[id];
    if (!n || !entry) return;
    ctrl.root.dataset.entryId = id;
    populateCard(ctrl, entry);
    ctrl.root.hidden = false;
  }

  function hideCardFor(ctrl) {
    if (ctrl) { ctrl.root.hidden = true; delete ctrl.root.dataset.entryId; }
  }

  [selectedCard, hoverCard].forEach(function (ctrl) {
    if (!ctrl) return;
    ctrl.root.addEventListener("click", function () {
      var id = ctrl.root.dataset.entryId;
      var entry = id && entryById[id];
      if (entry && entry.url) location.href = entry.url;
    });
  });

  // Clicking a node makes it the new selection: show its persistent card —
  // that's it. Selection no longer moves anything OR pans the camera: an
  // earlier design both nudged the neighborhood apart for breathing room
  // AND animated the view to recenter on the selection; per direct user
  // feedback both read as disconcerting motion breaking visual continuity,
  // so a click now only ever updates which tiers/card are showing, leaving
  // the graph and the camera exactly where they were. Selecting the node
  // that's already selected is a no-op — there's nothing to redo.
  function selectNode(id) {
    if (id === selectedId) return;
    selectedId = id;
    invalidate();
    showCardFor(selectedCard, id);
    // The hover card only ever shows something OTHER than the selection —
    // now that this node IS the selection, its hover card (if it happened
    // to be the thing just hovered) would be redundant with the new
    // selected card.
    if (hoveredId === id) hideCardFor(hoverCard);
  }

  // A selection has no other way to clear once made (otherwise it would be
  // a one-way ratchet toward whatever's clicked last) — clicking away from
  // every node/card, or pressing Escape, drops it.
  function deselectNode() {
    if (!selectedId) return;
    selectedId = null;
    invalidate();
    hideCardFor(selectedCard);
  }

  // --- Hover: a secondary, transient layer that never touches the
  // selection's tiers, card, or the simulation — see module comment. Hovering
  // the already-selected node is a no-op (its card is already the
  // persistent one on screen). ------------------------------------------
  function setHovered(id) {
    if (id === hoveredId) return;
    hoveredId = id;
    invalidateHover();
    if (!id || id === selectedId) {
      hideCardFor(hoverCard);
      return;
    }
    showCardFor(hoverCard, id);
  }

  function clearHovered() { setHovered(null); }

  // --- Pointer handling: pan, zoom, hover, and click/select-or-deselect all
  // live on the interaction (top) canvas, since it's the one receiving
  // pointer events (see CSS: the background canvas has pointer-events:
  // none). Hover hit-testing, panning, and dragging all share one
  // pointermove listener since they all need the same screen->world
  // conversion on every move anyway.
  //
  // Pressing down ON A NODE doesn't immediately start a drag — it becomes a
  // dragCandidate first, promoted to an actual drag (startDrag()) only once
  // the pointer crosses the same movement threshold panning already uses.
  // Below that threshold, releasing is a plain click-to-select; a candidate
  // that IS promoted sets didDrag so the trailing click event (which still
  // fires after a completed drag) doesn't ALSO select/deselect the node —
  // matching didPan's existing role for the panning gesture. Pressing down
  // on empty canvas is unambiguous (there's nothing to drag) and starts a
  // pan immediately, same as before. ---------------------------------------
  function initPointerHandling() {
    var panning = false, start = null, dragCandidate = null;
    fxCanvas.addEventListener("pointerdown", function (ev) {
      didPan = false;
      start = { x: ev.clientX, y: ev.clientY, vx: currentVB.x, vy: currentVB.y };
      var world = screenToWorld(ev.clientX, ev.clientY);
      var hit = hitTestWorld(world.x, world.y, hitRadiusWorld());
      if (hit) {
        dragCandidate = hit;
        panning = false;
      } else {
        dragCandidate = null;
        panning = true;
      }
      fxCanvas.setPointerCapture(ev.pointerId);
    });
    fxCanvas.addEventListener("pointermove", function (ev) {
      if (draggedNode) {
        var w = screenToWorld(ev.clientX, ev.clientY);
        updateDrag(w.x, w.y);
        return;
      }
      if (dragCandidate) {
        var ddx = ev.clientX - start.x, ddy = ev.clientY - start.y;
        if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) {
          var promoted = dragCandidate;
          dragCandidate = null;
          startDrag(promoted);
          var w2 = screenToWorld(ev.clientX, ev.clientY);
          updateDrag(w2.x, w2.y);
        }
        return; // suppress hover while a node is pressed, threshold crossed or not
      }
      if (panning) {
        var rect = fxCanvas.getBoundingClientRect();
        var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        // A few pixels of jitter shouldn't count as "the user dragged the
        // map" — only past this threshold do we treat the gesture as a pan
        // rather than a click, so the click handlers below can tell them
        // apart.
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
        var t = fitTransform(rect.width, rect.height);
        currentVB.x = start.vx - dx / t.scale;
        currentVB.y = start.vy - dy / t.scale;
        invalidate();
        return;
      }
      var world = screenToWorld(ev.clientX, ev.clientY);
      var hit = hitTestWorld(world.x, world.y, hitRadiusWorld());
      setHovered(hit ? hit.id : null);
    });
    ["pointerup", "pointercancel"].forEach(function (evt) {
      fxCanvas.addEventListener(evt, function () {
        panning = false;
        dragCandidate = null;
        if (draggedNode) endDrag();
      });
    });
    // Cards now sit at FIXED screen corners (see CSS), which can put one of
    // them directly under the cursor when a node near that corner is
    // hovered/selected — the browser then routes the pointer to the
    // (opaque) card element instead of the canvas, firing pointerleave
    // here. Clearing hover in response would hide the card, re-exposing the
    // canvas underneath and re-triggering hover on the very next move —
    // the classic flicker loop this exact pattern caused once already, in
    // the previous anchor-near-the-node card design. relatedTarget is the
    // element the pointer is now over; if that's one of our own cards, the
    // pointer hasn't actually left the widget, so the hover stays exactly
    // as it was — the card the user is now pointing at keeps showing.
    fxCanvas.addEventListener("pointerleave", function (ev) {
      if (panning || draggedNode || dragCandidate) return;
      var to = ev.relatedTarget;
      if (to && to.closest && to.closest(".library-map-card")) return;
      setHovered(null);
    });
    fxCanvas.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      // Zoom-to-cursor: capture the world point under the pointer, resize
      // the extent, then shift x/y so that same world point is still under
      // the pointer afterward. Deliberately not solved algebraically in one
      // step — fitTransform's scale is min(w/vb.w, h/vb.h), a coupled
      // function of BOTH extent dimensions, so recomputing "before" and
      // "after" via the one shared transform and diffing is simpler and
      // can't drift out of sync with fitTransform's own definition.
      var before = screenToWorld(ev.clientX, ev.clientY);
      var scale = ev.deltaY > 0 ? 1.1 : 0.9;
      currentVB.w = Math.max(150, Math.min(W * 4, currentVB.w * scale));
      currentVB.h = Math.max(105, Math.min(H * 4, currentVB.h * scale));
      var after = screenToWorld(ev.clientX, ev.clientY);
      currentVB.x += before.x - after.x;
      currentVB.y += before.y - after.y;
      invalidate();
    }, { passive: false });
    fxCanvas.addEventListener("click", function (ev) {
      if (didPan) { didPan = false; return; }
      if (didDrag) { didDrag = false; return; } // a completed drag isn't also a click-select
      var world = screenToWorld(ev.clientX, ev.clientY);
      var hit = hitTestWorld(world.x, world.y, hitRadiusWorld());
      if (hit) selectNode(hit.id);
      else deselectNode();
    });
  }

  // Clicks outside the map entirely (the hint bar, or elsewhere on the
  // page) also clear the selection; clicks ON the canvas are handled by its
  // own click listener above (which needs the didPan guard first), clicks
  // on a card navigate via their own listener, and clicks within
  // .library-controls (the Type/Subject filter chips, Clear button, and
  // Catalog/Images/Map view switch — see layouts/library/list.html) are
  // excluded too: adjusting what the map itself is showing is not
  // "navigating away" from it, so a selection survives a filter change as
  // long as the selected entry is still in the new visible set — the SAME
  // rule relayout()'s own `if (selectedId && !idSet[selectedId])
  // deselectNode()` guard already applies for the case where it genuinely
  // isn't (e.g. filtering to a type the selection doesn't belong to).
  document.addEventListener("click", function (ev) {
    if (ev.target.closest && (ev.target.closest("#library-map-fx-canvas") || ev.target.closest(".library-map-card") || ev.target.closest(".library-controls"))) return;
    deselectNode();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") deselectNode();
  });

  // --- Filtering: same field as Catalog/Images. Rebuilds the visible
  // subgraph's layout via relayout() rather than just toggling display —
  // see module comment and CLAUDE.md § Library "Map view". ----------------
  function applyFilter() {
    if (!nodes.length) return;
    var visibleIds = entries().filter(matchesEntry).map(function (e) { return e.library_id; });
    relayout(visibleIds);
  }
  function entries() { return nodes.map(function (n) { return entryById[n.id]; }).filter(Boolean); }

  readSelFromURL();
  resizeCanvases();
  initPointerHandling();
  if (window.ResizeObserver) {
    new ResizeObserver(function () { resizeCanvases(); }).observe(container);
  } else {
    window.addEventListener("resize", resizeCanvases);
  }

  fetch(new URL("index.json", location.href).href, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.entries || !data.entries.length) return;
      typeStyles = data.public_type_styles || {};
      buildGraph(data.entries);
      var visibleIds = data.entries.filter(matchesEntry).map(function (e) { return e.library_id; });
      relayout(visibleIds);
    })
    .catch(function () { /* Map view stays empty; Catalog/Images are unaffected */ });

  document.addEventListener("library:filter-change", function (ev) {
    sel.type = (ev.detail && ev.detail.type) || [];
    sel.subject = (ev.detail && ev.detail.subject) || [];
    if (nodes.length) applyFilter();
  });
})();
