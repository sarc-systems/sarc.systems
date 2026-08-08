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
// detectCommunities(), forceIterationWithCentering(), runContinuousSettle(),
// resolveOverlapsOnce(), relayout() all operate on plain
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
// Image nodes: selection-dependent. Only the SELECTED node and its
// neighbors up to 3rd order (direct neighbors, plus their own neighbors,
// out two more hops — the 2nd/3rd-order tier sharing one capped budget, see
// MAP_VISUALS.selectionImages) render using their primary_image (already
// processed/cropped by Hugo for index.json elsewhere — no separate
// map-specific derivative); every other entry — even one with an image —
// shows the abstract type shape until it becomes selected or falls within
// that radius. This keeps a dense map
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
// shows a persistent card ("where I am"). Selection is shareable: a
// `?select=<library.id>` query param (this file's own, never library-
// filter.js's — see setSelectURLParam()/readSelFromURL()/
// applyPendingSelection()/restoreSelectionFromURL() below) is pushed on
// every user-initiated select/deselect, coexists with type/subject/view in
// the same query string (library-filter.js's toURL() preserves it verbatim
// across its own rewrites), and is restored — or, if the id no longer
// exists or isn't currently visible, quietly stripped via
// history.replaceState rather than left dangling — on Back/Forward via this
// file's own popstate listener, registered after library-filter.js's (see
// script load order above) so `visible` is already current for the landed-
// on URL by the time it runs. Restoring never re-triggers a history write,
// moves the graph, or reheats the simulation — it's the exact same
// selectNode()/deselectNode() a click uses. The Selection Hierarchy
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
  // Hub sizing is data-driven, not a hardcoded type list: a public type
  // renders as a hub node when data/library.yaml's public_types marks it
  // `hub: true`, fetched at runtime via typeStyles[publicType].hub (see
  // "Stage 1: Library data -> graph model" below and docs/library-v2.md
  // § 12.2) — so a future Collection's own vocabulary can declare its own
  // hub types the same way, with no engine-side edit required.
  var FALLBACK_STYLE = { color: "dark-grey", shape: "circle", label: "Other" };
  var SUMMARY_MAX = 110;

  // Abstract-shape / image-node sizes, in WORLD units — kept in sync with
  // drawShapeNode()/drawImageNode() below, which turn these into on-screen
  // pixel sizes by multiplying by the current camera scale (see
  // fitTransform()). Collision uses nodeRadius() (further down), derived
  // from these same constants, so the two can never silently drift apart.
  var SHAPE_SIZE = { hub: 6, leaf: 4 };
  var IMAGE_SIZE = { hub: 11, leaf: 9 };

  // --- Visual Hierarchy Pass: degree-based sizing, community fields,
  // cross-community edge curvature, and restrained selection/hover states.
  // Every tunable number introduced for this pass lives here, not scattered
  // through the render/layout code below. -----------------------------------
  var MAP_VISUALS = {
    nodeDegreeScale: { min: 0.85, max: 1.5, factor: 0.12 },
    // fillOpacity/strokeOpacity are deliberately much lower than the spec's
    // own suggested starting values (0.04/0.05) — this graph's communities
    // overlap heavily in the force-directed layout (a community is a purely
    // visual annotation, not a layout constraint, so nothing pulls same-
    // community nodes into a tidy non-overlapping region), and ordinary
    // canvas alpha-compositing stacks each overlapping hull's opacity on
    // top of the last. At the spec's suggested values this compounded into
    // a visible haze across most of the graph, not the "visible only after
    // looking for it" restraint the spec calls for — confirmed visually
    // (real browser screenshot) before tuning down, not guessed.
    // selected*/hovered* are the opacities used for the ONE hull matching
    // the current selection/hover's own community — see drawCommunityFields()
    // and the fx-layer hover overlay in drawInteraction(). Every other hull
    // stays at the plain fillOpacity/strokeOpacity above.
    communityFields: {
      enabled: true, minNodes: 6, padding: 36, fillOpacity: 0.02, strokeOpacity: 0.025, updateEveryFrames: 4,
      selectedFillOpacity: 0.045, selectedStrokeOpacity: 0.06,
      hoveredFillOpacity: 0.03, hoveredStrokeOpacity: 0.04
    },
    crossCommunityEdges: { opacityMultiplier: 0.72, curvatureMin: 8, curvatureMax: 42 },
    // opacitySteps[0] = 1st-degree (direct) neighbors, [1] = 2nd degree,
    // [2] = 3rd degree, ... — a node/edge farther than the array's length
    // clamps to the LAST value (the floor), same as a node the selection
    // can't reach at all (different component). A flat single "everyone
    // else" tier read as too subtle in practice (direct user feedback) —
    // this is deliberately a much steeper falloff than that first attempt.
    selection: { opacitySteps: [1, 0.5, 0.25, 0.1], selectedScale: 1.12, hoveredScale: 1.08 },
    // Second-order image nodes (see isImageActive()) are capped, not
    // unlimited — a high-degree hub's two-hop neighborhood can be large
    // enough to cover the map in photos otherwise. The selected node and
    // its DIRECT neighbors are never capped, only the second hop.
    // zoomTiers is optional and ordered widest-extent-first: the first
    // entry whose `minExtent` the current viewBox width is still above
    // wins, so zooming further out can only ever REDUCE the budget, never
    // increase it past secondOrderLimit. hysteresis (world units) — the
    // viewBox has to cross a tier boundary by more than this before the
    // budget actually changes, so a couple of stray wheel ticks right at a
    // boundary don't flicker the image population back and forth.
    selectionImages: {
      secondOrderLimit: 16,
      zoomTiers: [
        { minExtent: 2200, limit: 6 },
        { minExtent: 900, limit: 12 }
      ],
      hysteresis: 80
    }
  };

  // Every relation_type in the Collection's own controlled vocabulary maps
  // to exactly one of three restrained line styles — see CLAUDE.md § Library
  // "Map view" for the full rationale. Data-driven, not a hardcoded JS map:
  // fetched per-Collection as relationCategory (data.relation_category —
  // sibling export to relation_inverse, sourced from data/library.yaml's
  // relation_categories, or a future Collection's own equivalent — see
  // docs/library-v2.md § 12.2), populated alongside typeStyles right before
  // buildGraph() runs. A creator-kind edge (author, artist, composer,
  // designer, developer, manufacturer, founder, …) is always structural —
  // "who made this" is as structural a fact as "part of." An unmapped
  // relation type falls back to "contextual" as the least-assertive default
  // rather than failing silently into "structural."
  var relationCategory = {};
  function edgeCategory(kind, label) {
    if (kind === "creator") return "structural";
    return relationCategory[label] || "contextual";
  }

  var W = 1000, H = 700; // reference WORLD size — only used as the initial
                          // seed-spread extent and a minimum-size floor for
                          // the first-load viewport fit. Not a pixel size:
                          // actual on-screen sizing comes entirely from the
                          // container's real CSS box (see resizeCanvases()).
  var nodes = [], edges = [];
  var nodeById = {}, entryById = {};
  // edgesByPair: "idA|idB" (ids sorted lexicographically, so lookup doesn't
  // care which side is source/target) -> every edge connecting that pair —
  // built once in buildGraph()'s addEdge(), consumed by the relationship
  // bridge panel below for O(1)-average direct lookup and O(degree)
  // second-order (shared-intermediary) lookup, never a per-hover scan of
  // the whole edge list. See "Relationship bridge panel" section below.
  var edgesByPair = {};
  function pairKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
  // Community membership (label propagation, see detectCommunities()) is
  // recomputed only when the visible graph itself changes (relayout — a
  // filter change or the initial load), never per settle-tick or per drag,
  // since topology (not position) is all that determines it. communityHulls
  // holds the current cached, drawable hull geometry (world-space points,
  // already padded) — see recomputeCommunityHulls(), which DOES rerun
  // periodically while positions are actively settling.
  var nodeCommunity = {}, communityMembers = {}, communityHulls = [];
  var communityTickCounter = 0;
  // graphAdjacency: id -> [neighbor ids], rebuilt once per relayout (see
  // buildAdjacency()) — shared with detectCommunities() and consumed by
  // computeSelectionDistances() below for the stepped-by-hop-distance
  // dimming a selection drives (see module comment on selectNode()).
  // selectionDistance: id -> hop count FROM the current selection, or
  // absent for a node the BFS never reached (different component / not
  // currently visible) — recomputed whenever the selection changes AND
  // whenever a relayout leaves the selection in place but changes the
  // reachable set (a filter change).
  var graphAdjacency = {}, selectionDistance = {};
  var typeStyles = {};
  var sel = { type: [], subject: [] };
  var visible = {}; // id -> bool, the current filtered set
  var currentVB = { x: 0, y: 0, w: W, h: H };
  var selectedId = null; // the persistent selection — see module comment
  // pendingSelectId: a `?select=<library.id>` requested via the URL (a deep
  // link, or a Back/Forward navigation that lands before the graph exists
  // yet) that can't be applied until buildGraph()/relayout() have run — see
  // readSelFromURL() and applyPendingSelection() below. Cleared once used.
  var pendingSelectId = null;
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

  // Read the URL directly for the initial filter (and requested selection)
  // state — see the note above on why this can't just wait for the first
  // library:filter-change event.
  function readSelFromURL() {
    var params = new URLSearchParams(location.search);
    sel.type = (params.get("type") || "").split(",").filter(Boolean);
    sel.subject = (params.get("subject") || "").split(",").filter(Boolean);
    pendingSelectId = params.get("select") || null;
  }

  // The one place that writes the `select` query param — every other piece
  // of shareable state (type/subject/view) is library-filter.js's; this is
  // the sole exception, since selection is entirely this file's own state.
  // `mode` is "push" for a direct user action (click a node, click away,
  // Escape — each becomes its own Back/Forward-able step) or "replace" for
  // a programmatic cleanup (an invalid or filtered-out id, at load or after
  // a filter change) that must not add a new history entry. Popstate
  // restoration itself (see the popstate listener below) never calls this
  // at all in its normal path — the browser already updated the URL for us
  // — only its own invalid-id cleanup uses "replace".
  function setSelectURLParam(id, mode) {
    var params = new URLSearchParams(location.search);
    if (id) params.set("select", id); else params.delete("select");
    var qs = params.toString();
    var url = location.pathname + (qs ? "?" + qs : "");
    if (mode === "push") history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }

  // Applies a `?select=` requested via the URL once the graph actually
  // exists (see pendingSelectId above) — selectNode() itself never moves
  // the graph or camera, so this is a plain, silent restore. The URL
  // already carries this id (that's where it came from), so no history
  // write on success; an id that doesn't exist or isn't currently visible
  // under the active filters is quietly stripped instead (replaceState —
  // not a new entry) rather than left dangling in the address bar.
  function applyPendingSelection() {
    if (!pendingSelectId) return;
    var id = pendingSelectId;
    pendingSelectId = null;
    if (nodeById[id] && visible[id]) {
      selectNode(id);
    } else {
      setSelectURLParam(null, "replace");
    }
  }

  // Back/Forward: restore or clear the selection to match the URL we just
  // landed on. Registered after library-filter.js's own popstate listener
  // (script load order — see module comment), so by the time this runs,
  // that listener has already re-applied type/subject/view and (via the
  // synchronous library:filter-change dispatch) this file's own `visible`
  // set already reflects the new filter state.
  function restoreSelectionFromURL() {
    var id = new URLSearchParams(location.search).get("select") || null;
    if (!nodes.length) { pendingSelectId = id; return; } // graph not loaded yet
    if (id === selectedId) return;
    if (!id) {
      deselectNode();
      return;
    }
    if (nodeById[id] && visible[id]) {
      selectNode(id);
    } else {
      if (selectedId) deselectNode();
      setSelectURLParam(null, "replace");
    }
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
      var hub = !!(typeStyles[e.public_type] && typeStyles[e.public_type].hub);
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
      // Cross-community curvature (see edgeGeometry()) needs a per-edge
      // sign + variance that's stable across every render and never
      // recomputed per frame — derived once here from the same key that
      // already dedupes edges, so two edges between the same pair of nodes
      // (different kind/label) get independently deterministic curves.
      var h = hashId(key);
      var edge = {
        source: a, target: b, kind: kind, label: label || "", category: edgeCategory(kind, label),
        _curveSign: (h & 1) ? 1 : -1, _curveVariance: seededRng(h)()
      };
      edges.push(edge);
      var pk = pairKey(a, b);
      (edgesByPair[pk] || (edgesByPair[pk] = [])).push(edge);
    }
    entries.forEach(function (e) {
      (e.creators || []).forEach(function (c) {
        if (c.ref) addEdge(c.ref, e.library_id, "creator", c.role);
      });
      (e.related || []).forEach(function (r) {
        if (r.ref) addEdge(e.library_id, r.ref, "related", r.relation);
      });
    });

    // Degree-based sizing: a node's on-screen size communicates STRUCTURAL
    // connectivity across the whole fetched graph (never just the currently
    // visible/filtered subset — a hub shouldn't visually shrink just because
    // a filter currently hides some of its neighbors), computed once here
    // and cached on the node — see MAP_VISUALS.nodeDegreeScale. A nonlinear
    // (sqrt) mapping, clamped to [min, max], keeps a few very high-degree
    // hubs from dominating the composition while still giving isolated
    // nodes a smaller-but-clearly-visible floor. node.radius (used by both
    // collision and hit-testing) is overwritten here so there is exactly
    // one place — not two — that determines a node's effective footprint.
    var degree = {};
    edges.forEach(function (e) {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    });
    var ds = MAP_VISUALS.nodeDegreeScale;
    nodes.forEach(function (n) {
      n.degree = degree[n.id] || 0;
      n.sizeScale = Math.max(ds.min, Math.min(ds.max, ds.min + Math.sqrt(n.degree) * ds.factor));
      n.radius = nodeRadius(n.hub, n.hasImage) * n.sizeScale;
    });
  }

  // Community detection (label propagation) — deliberately NOT the same
  // thing as a connected component: an edge only exists between two nodes
  // that are, by definition, already in the same component, so components
  // alone could never produce a "cross-community" edge for §4 of the
  // Visual Hierarchy Pass to style differently. Label propagation is the
  // simplest well-known community algorithm that actually subdivides a
  // single large, densely-connected component into smaller neighborhoods —
  // no npm dependency exists or is allowed here (see CLAUDE.md), and this
  // is a few dozen lines of plain iteration, not a Louvain-grade modularity
  // optimizer. Determinism matters as much as it does everywhere else in
  // this file (same graph -> same layout -> same communities on reload), so
  // the per-iteration node visit order is shuffled with the same seeded PRNG
  // used for initial node placement, keyed by iteration index rather than
  // Math.random(); tie-breaking among equally-frequent neighbor labels sorts
  // lexicographically so it never depends on object key enumeration order.
  // Runs to a fixed point or maxIter, whichever comes first — typically a
  // handful of passes. Called ONCE per relayout() (topology-driven, not
  // position-driven), never per settle-tick or per drag — see the module
  // comment on nodeCommunity above.
  function buildAdjacency(nodeList, edgeList) {
    var adjacency = {};
    nodeList.forEach(function (n) { adjacency[n.id] = []; });
    edgeList.forEach(function (e) {
      if (adjacency[e.source]) adjacency[e.source].push(e.target);
      if (adjacency[e.target]) adjacency[e.target].push(e.source);
    });
    return adjacency;
  }
  function detectCommunities(nodeList, edgeList, adjacency) {
    var label = {};
    nodeList.forEach(function (n) { label[n.id] = n.id; });
    // Synchronous (Jacobi-style) updates: every node's next label is
    // computed from the SAME frozen snapshot of the previous iteration,
    // then all applied at once. An earlier asynchronous version (each node
    // updated in place immediately, next node sees the fresh value)
    // verifiably failed on the simplest adversarial case — two dense
    // cliques joined by a single bridge edge — because one clique's label
    // could cross the bridge and flood the entire other clique within the
    // SAME pass, merging two communities that should stay separate and
    // silently defeating §4's whole cross-community-edge distinction.
    // Synchronous updates need the bridge to survive multiple full passes
    // before it can flood the far side, giving each clique's own internal
    // majority a real chance to hold. This also makes per-node visit order
    // irrelevant to the result (every node reads only the frozen snapshot),
    // so the previous seeded per-iteration shuffle is gone — determinism no
    // longer depends on it at all.
    var maxIter = 20;
    for (var iter = 0; iter < maxIter; iter++) {
      var next = {};
      var changed = false;
      nodeList.forEach(function (n) {
        var neighbors = adjacency[n.id];
        if (!neighbors.length) { next[n.id] = label[n.id]; return; }
        var counts = {};
        neighbors.forEach(function (nb) { counts[label[nb]] = (counts[label[nb]] || 0) + 1; });
        var bestLabel = label[n.id], bestCount = counts[label[n.id]] || 0;
        Object.keys(counts).sort().forEach(function (l) {
          if (counts[l] > bestCount) { bestCount = counts[l]; bestLabel = l; }
        });
        next[n.id] = bestLabel;
        if (bestLabel !== label[n.id]) changed = true;
      });
      label = next;
      if (!changed) break;
    }
    var members = {};
    nodeList.forEach(function (n) { (members[label[n.id]] || (members[label[n.id]] = [])).push(n.id); });
    return { label: label, members: members };
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

  // --- Spatialized overlap cleanup: a dedicated uniform grid. Cell size is
  // derived from the ACTUAL largest radius present in
  // this node list (image nodes are meaningfully bigger than abstract
  // shapes) so that any genuinely overlapping pair is guaranteed to fall
  // within the immediate 3x3 cell neighborhood — no pair beyond that
  // distance could possibly overlap, so nothing farther ever needs checking.
  // Replaces the previous O(n^2) all-pairs scan; still does exactly ONE pass
  // per call, same as before (see settleTick()'s own comment on why this
  // stays folded into the animated per-tick loop rather than a synchronous
  // final batch).
  function resolveOverlapsOnce(nodeList) {
    if (nodeList.length < 2) return false;
    var maxR = 0;
    for (var i = 0; i < nodeList.length; i++) if (nodeList[i].radius > maxR) maxR = nodeList[i].radius;
    var cell = Math.max(BASE_K, maxR * 2 + COLLISION_PAD);
    var grid = {};
    function key(cx, cy) { return cx + "," + cy; }
    for (i = 0; i < nodeList.length; i++) {
      var n = nodeList[i];
      n._gidx = i; // stable per-pass index — lets neighboring cells agree on
                    // which of a pair "owns" resolving it, so each unordered
                    // pair is corrected exactly once per call, matching the
                    // old i<j loop's own guarantee.
      var k = key(Math.floor(n.x / cell), Math.floor(n.y / cell));
      (grid[k] || (grid[k] = [])).push(n);
    }
    var anyOverlap = false;
    for (i = 0; i < nodeList.length; i++) {
      var a = nodeList[i];
      var acx = Math.floor(a.x / cell), acy = Math.floor(a.y / cell);
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var bucket = grid[key(acx + dx, acy + dy)];
          if (!bucket) continue;
          for (var j = 0; j < bucket.length; j++) {
            var b = bucket[j];
            if (b._gidx <= a._gidx) continue; // each pair resolved once, from the lower-index side
            var ddx = a.x - b.x, ddy = a.y - b.y;
            var dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
            var minSep = a.radius + b.radius + COLLISION_PAD;
            if (dist < minSep) {
              anyOverlap = true;
              var push = (minSep - dist) / 2 + 0.5;
              var ux = ddx / dist, uy = ddy / dist;
              a.x += ux * push; a.y += uy * push;
              b.x -= ux * push; b.y -= uy * push;
              // This correction only ever touches position, never velocity —
              // so on the very next tick, force integration (still carrying
              // whatever velocity brought the pair together) drives them
              // straight back toward each other, gets pushed apart again,
              // and repeats. In a dense cluster (typically near the visual
              // center, where degree and thus overlap pressure is highest)
              // many such pairs doing this in lockstep reads as a persistent
              // high-frequency shimmer rather than a settle. Canceling the
              // closing component of relative velocity along the same
              // normal — standard inelastic-collision damping — means a
              // corrected pair actually stops approaching instead of
              // re-colliding next frame.
              var relVx = a.vx - b.vx, relVy = a.vy - b.vy;
              var closing = relVx * ux + relVy * uy;
              if (closing < 0) {
                a.vx -= ux * closing * 0.5; a.vy -= uy * closing * 0.5;
                b.vx += ux * closing * 0.5; b.vy += uy * closing * 0.5;
              }
            }
          }
        }
      }
    }
    return anyOverlap;
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
  //
  // Deliberately still exact O(n^2) pairwise repulsion, NOT a Barnes-Hut/
  // grid many-body approximation — tried and rejected during this pass (see
  // git history / PR notes): aggregating a spread-out cluster into a single
  // center-of-mass point systematically UNDERCOUNTS true inverse-square
  // repulsion between it and anything outside it (Jensen's inequality — the
  // mean of 1/d^2 over a cluster's members always exceeds 1/(mean d)^2),
  // which is a property of monopole many-body approximation applied to an
  // inverse-square law, not an implementation bug. Verified empirically
  // with a full realistic-alpha-decay settle on two 20-node clusters: exact
  // pairwise correctly grows their separation (41.4 -> 50.8), while both a
  // Barnes-Hut quadtree (any theta fast enough to matter) and a uniform
  // grid near/far split settled them CLOSER together (down to ~32-36) —
  // silently breaking "disconnected components remain separated through the
  // same global physics," a property this file's own module comment calls
  // load-bearing. A correct fix exists (quadrupole-order correction terms,
  // not just center-of-mass) but is materially more complex than this pass
  // warrants; until then, exact repulsion is the only implementation that
  // doesn't risk that regression. At today's ~635-node scale this loop
  // costs low-single-digit milliseconds per tick (well inside a 16ms frame
  // budget under the existing SIM_SPEED throttling) — see the benchmark
  // notes for actual measurements.
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
  // (these constants started as d3-force's own long-tuned defaults —
  // alphaMin=0.001, decay derived so alpha crosses it in ~300 ticks —
  // reimplemented here in plain vanilla JS, not imported). Per the user's
  // own explicit choice: this runs every frame for as long as the graph
  // actually needs to settle, rather than a fixed iteration cap — but it
  // still comes to a genuine rest and stops (not perpetual motion): once
  // alpha decays below ALPHA_MIN, positions have essentially stopped
  // moving on their own, so continuing to tick costs CPU for no visible
  // benefit. SIM_SAFETY_TICKS is a generous cap so a pathological
  // configuration can't tick forever — a normal settle finishes via alpha
  // decay well before it.
  //
  // IMPORTANT: SIM_ALPHA_DECAY is a FIXED rate, deliberately NOT derived
  // from SIM_ALPHA_MIN (an earlier version computed it as
  // `1 - Math.pow(SIM_ALPHA_MIN, 1/300)`, which self-calibrates the decay
  // rate to whatever ALPHA_MIN currently is — meaning alpha always crossed
  // ALPHA_MIN in exactly ~300 ticks no matter how low ALPHA_MIN was set,
  // silently defeating it as a "settle longer" control; per direct user
  // feedback that the map was settling too early, lowering ALPHA_MIN alone
  // had done nothing, because of this coupling). The rate below is fixed
  // once, computed from the original 0.001-in-300-ticks reference point;
  // with a fixed rate, a LOWER ALPHA_MIN genuinely requires more ticks to
  // reach — the two are now properly independent.
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
  var SIM_ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 300); // fixed rate — see comment above
  var SIM_ALPHA_MIN = 0.00001; // much lower than the old 0.001 — per direct
                                // user feedback the map was calling itself
                                // settled too early; now takes roughly
                                // 500 ticks to cross instead of 300.
  var SIM_SAFETY_TICKS = 3000;
  // Once alpha crosses SIM_ALPHA_MIN, settleTick() switches from force
  // integration to calling resolveOverlapsOnce() once per tick — still
  // inside the same animated per-frame loop — until a pass finds nothing
  // left to fix. This cap just guards against a pathological graph where
  // overlaps can't fully resolve (e.g. more mutually-adjacent same-size
  // nodes than can physically ring around each other); a normal graph
  // converges in a handful of ticks, well under this.
  var SIM_OVERLAP_MAX_TICKS = 60;
  var simFrameHandle = null;
  var currentSim = null; // the whole-graph sim currently ticking, if any — see
                          // ensureSimRunning(), which drag reheats/reuses directly.
  var relayoutGen = 0; // bumped on every relayout() call; guards a superseded
                        // settle's completion callback from firing after a
                        // newer filter change has already started its own.

  function settleTick(sim) {
    // Force integration has done essentially all the work it can once alpha
    // has decayed this low — but a densely triangulated cluster can still
    // hold a couple of nodes slightly inside each other's collision radius,
    // since the collision FORCE has to share every iteration with spring/
    // repulsion forces pulling the other way and isn't guaranteed to fully
    // win. Rather than declaring the settle done and fixing that afterward
    // in one synchronous, un-animated jump (this file's earlier design —
    // see resolveOverlapsOnce()'s own comment), keep ticking through the
    // SAME animated per-frame loop, now applying direct overlap correction
    // instead of a force step, until a pass finds nothing left to resolve.
    // This is now a CATCH-UP for whatever's still left, not the first time
    // overlaps get resolved at all — resolveOverlapsOnce() also runs every
    // ordinary tick below, throughout the whole settle, not just here. An
    // earlier version only called it here, after alpha had already decayed
    // past SIM_ALPHA_MIN: exponential decay means visible motion tapers to
    // nothing well before alpha actually crosses that threshold, so the
    // settle LOOKED finished — the map sat still for a second or two — and
    // then this catch-up phase would suddenly start nudging apart whatever
    // residual overlap (usually in the densest, most contended part of the
    // graph — near the center) force integration hadn't fully resolved,
    // reading as an abrupt glitch appearing out of nowhere rather than the
    // tail of the same settle. Resolving overlaps continuously from early
    // on means there's rarely anything left for this phase to do by the
    // time it's reached, so it now finishes in 0-1 ticks in the ordinary
    // case instead of visibly running for up to SIM_OVERLAP_MAX_TICKS.
    if (sim.alpha < SIM_ALPHA_MIN) {
      var stillOverlapping = resolveOverlapsOnce(sim.nodes);
      sim.overlapTicks = (sim.overlapTicks || 0) + 1;
      sim.ticks++;
      if (!stillOverlapping || sim.overlapTicks > SIM_OVERLAP_MAX_TICKS || sim.ticks > SIM_SAFETY_TICKS) sim.done = true;
      return;
    }
    var cx = 0, cy = 0, i;
    for (i = 0; i < sim.nodes.length; i++) { cx += sim.nodes[i].x; cy += sim.nodes[i].y; }
    cx /= sim.nodes.length; cy /= sim.nodes.length;
    forceIterationWithCentering(sim.nodes, sim.edges, cx, cy, sim.alpha);
    // Same geometric correction the post-alpha catch-up phase above uses,
    // run every tick rather than saved up for the end — see this
    // function's own comment on why. A small, bounded push (half the
    // overlap distance) blends into whatever movement the force step just
    // produced instead of standing out as its own event.
    resolveOverlapsOnce(sim.nodes);
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
    if (sim.ticks > SIM_SAFETY_TICKS) sim.done = true;
  }

  function runContinuousSettle(sim, gen, onDone) {
    if (simFrameHandle) cancelAnimationFrame(simFrameHandle);
    currentSim = sim;
    // prefers-reduced-motion: same alpha-decay convergence, same final
    // quality — just run to completion synchronously in one pass instead of
    // animating it across frames.
    if (reduceMotion()) {
      while (!sim.done) settleTick(sim);
      recomputeCommunityHulls(sim.nodes);
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
      // Community hull geometry only needs to track positions loosely while
      // things are still actively moving — recomputed every Nth frame
      // rather than every frame (see MAP_VISUALS.communityFields.updateEveryFrames),
      // same "lower rate while active, final pass once settled" split the
      // spec itself calls for.
      communityTickCounter++;
      if (communityTickCounter % MAP_VISUALS.communityFields.updateEveryFrames === 0) {
        recomputeCommunityHulls(sim.nodes);
      }
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
    runContinuousSettle(sim, gen, function () { finishRelayout(gen, visibleNodes); });
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
  function finishRelayout(gen, visibleNodes) {
    if (gen !== relayoutGen) return; // superseded
    // No separate overlap-resolution pass here anymore — settleTick() now
    // keeps ticking (still animated) until overlaps are already resolved
    // before sim.done ever becomes true, so nothing here should move a node.

    buildSpatialIndex(visibleNodes);
    recomputeCommunityHulls(visibleNodes); // final, accurate cache now that the settle has genuinely converged
    invalidate();

    var anyVisible = visibleNodes.length > 0;
    if (emptyEl) emptyEl.hidden = anyVisible || nodes.length === 0;
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

    // A filter change that hides the current selection or hover clears it
    // right away, synchronously, rather than waiting for finishRelayout()
    // (which only runs once the settle animation converges — a real second
    // or more later, during which the selected node's card would otherwise
    // keep showing an entry no longer even on the map).
    if (selectedId && !idSet[selectedId]) { deselectNode(); setSelectURLParam(null, "replace"); }
    if (hoveredId && !idSet[hoveredId]) clearHovered();

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

    // Built once here, per relayout — shared by detectCommunities() below
    // AND by every selectNode()'s BFS hop-distance computation (see
    // graphAdjacency), rather than each rebuilding its own copy.
    graphAdjacency = buildAdjacency(visibleNodes, visibleEdges);
    var communities = detectCommunities(visibleNodes, visibleEdges, graphAdjacency);
    nodeCommunity = communities.label;
    communityMembers = communities.members;
    // A selection that survives this filter change (still in idSet) needs
    // its hop-distance ladder recomputed against the NEW reachable set — a
    // node's neighbors, and thus its degree of separation from the
    // selection, can genuinely change under a different filter.
    if (selectedId && idSet[selectedId]) { selectionDistance = computeSelectionDistances(selectedId); refreshSecondOrderImageSet(); }
    // Recomputed synchronously here (not deferred to finishRelayout(), which
    // only runs once the settle animation finishes, a real second or more
    // later) since graphAdjacency/visible are already fully up to date at
    // this point — a filter change that removes the current intermediary,
    // or the selected/hovered entry itself, should hide or update the
    // bridge panel immediately, not once the graph finishes resettling.
    updateBridge();
    // First-paint hulls, computed against the just-seeded (pre-settle)
    // positions so the field isn't simply absent for however long the
    // settle takes — recomputeCommunityHulls() runs again periodically as
    // positions move (see runContinuousSettle()) and once more, finally, in
    // finishRelayout().
    recomputeCommunityHulls(visibleNodes);

    function done() { finishRelayout(gen, visibleNodes); }
    if (visibleNodes.length >= 2) {
      runContinuousSettle({ nodes: visibleNodes, edges: visibleEdges, alpha: 1, ticks: 0, done: false }, gen, done);
    } else {
      done();
    }
  }

  // --- Community fields: a soft, low-opacity hull behind each sufficiently
  // large detected community — a restrained "territory" cue, never a hard
  // container, never a per-community color (see MAP_VISUALS.communityFields
  // and CLAUDE.md's own "never a knowledge graph... automatic clustering"
  // caution — this stays a purely visual read of graph structure, nothing
  // is inferred or added to the data model). Andrew's monotone-chain convex
  // hull — a concave hull/metaball would hug the actual point cloud more
  // tightly, but a convex hull is the "acceptable for the first experiment"
  // option the spec itself calls out, and it's a fraction of the code.
  function convexHull(points) {
    var pts = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    if (pts.length < 3) return pts;
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lower = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    var upper = [];
    for (i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }
  // "expand each point by padding" (spec §3) — done here as a single radial
  // expansion of the already-computed hull from its own centroid, rather
  // than padding every member point before hulling: visually equivalent for
  // a convex shape, far cheaper (a handful of hull vertices, not the whole
  // community), and keeps the padding uniform regardless of how many points
  // a community actually has.
  function expandHull(hull, padding) {
    if (hull.length < 3) return hull;
    var cx = 0, cy = 0;
    hull.forEach(function (p) { cx += p.x; cy += p.y; });
    cx /= hull.length; cy /= hull.length;
    return hull.map(function (p) {
      var dx = p.x - cx, dy = p.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: p.x + (dx / d) * padding, y: p.y + (dy / d) * padding };
    });
  }
  // Rebuilds the CACHED hull geometry (world-space) from current node
  // positions — cheap enough to call periodically during an active settle
  // (see runContinuousSettle()) but not worth calling every single tick, so
  // it's throttled there to every communityFields.updateEveryFrames frames.
  // Communities below the configured minNodes simply get no field — small
  // components and singletons are common in this graph and must stay
  // ordinary, ungrouped nodes (never hidden, never a placeholder).
  function recomputeCommunityHulls(nodeList) {
    var cfg = MAP_VISUALS.communityFields;
    if (!cfg.enabled) { communityHulls = []; return; }
    var byCommunity = {};
    nodeList.forEach(function (n) {
      var c = nodeCommunity[n.id];
      if (c === undefined) return;
      (byCommunity[c] || (byCommunity[c] = [])).push(n);
    });
    var hulls = [];
    Object.keys(byCommunity).forEach(function (c) {
      var members = byCommunity[c];
      if (members.length < cfg.minNodes) return;
      var hull = convexHull(members.map(function (n) { return { x: n.x, y: n.y }; }));
      if (hull.length < 3) return;
      // Tagged with its own community id — see drawCommunityFields()'s
      // `emphasizeCommunity` param and the fx-layer hover overlay in
      // drawInteraction(), both of which need to find "the one hull
      // matching the current selection/hover" without recomputing hulls.
      hulls.push({ points: expandHull(hull, cfg.padding), community: c });
    });
    communityHulls = hulls;
  }
  // Rounded-blob smoothing through hull vertices (quadratic curves via each
  // edge's own midpoint) — the standard cheap trick for turning a polygon
  // into a soft shape without a real spline library. Drawn in SCREEN space
  // (after world->local conversion) purely for simplicity; this is an
  // aesthetic smoothing pass, not something that needs to survive the
  // camera transform exactly. Shared by drawCommunityFields() and the
  // single-hull hover overlay below so the two never draw the shape
  // differently.
  function traceHullPath(ctx, hull, w, h) {
    var pts = hull.points.map(function (p) { return worldToLocal(p.x, p.y, w, h); });
    ctx.beginPath();
    var start = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
    ctx.moveTo(start.x, start.y);
    for (var i = 0; i < pts.length; i++) {
      var cur = pts[i], next = pts[(i + 1) % pts.length];
      ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
    }
    ctx.closePath();
  }
  function fillStrokeHull(ctx, hull, w, h, fillOpacity, strokeOpacity, tone) {
    traceHullPath(ctx, hull, w, h);
    ctx.globalAlpha = fillOpacity;
    ctx.fillStyle = tone;
    ctx.fill();
    if (strokeOpacity > 0) {
      ctx.globalAlpha = strokeOpacity;
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // Draws every hull at the plain base opacity, EXCEPT `emphasizeCommunity`
  // (when given — the current selection's own community, from drawBackground())
  // which draws at the stronger selected* opacities instead. This is the
  // background layer's own call; hover's separate, smaller boost is drawn
  // as an additional overlay on the fx layer (see drawInteraction()) rather
  // than folded in here, since hover must never invalidate/redraw this
  // (potentially large, whole-graph) background layer — see the module
  // comment on invalidate()/invalidateHover().
  function drawCommunityFields(ctx, w, h, emphasizeCommunity) {
    var cfg = MAP_VISUALS.communityFields;
    if (!cfg.enabled || !communityHulls.length) return;
    var tone = cssVar("--ink"); // neutral — never a bright per-community color, see module comment
    communityHulls.forEach(function (hull) {
      var emphasized = emphasizeCommunity !== undefined && hull.community === emphasizeCommunity;
      fillStrokeHull(ctx, hull, w, h,
        emphasized ? cfg.selectedFillOpacity : cfg.fillOpacity,
        emphasized ? cfg.selectedStrokeOpacity : cfg.strokeOpacity,
        tone);
    });
    ctx.globalAlpha = 1;
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

  // --- Cross-community edge geometry: every explicit edge stays visible
  // (see module comment / CLAUDE.md — no edge is ever hidden by this pass),
  // but an edge whose two endpoints fall in different detected communities
  // (see detectCommunities()) renders with a gentle, deterministic curve
  // instead of a straight line — the visual cue that this is a longer-range
  // relationship, not a purely local one. edgeGeometry() is the ONE place
  // that decides an edge's path (straight vs curved) and its label anchor;
  // both drawBackground()'s ordinary edges and drawInteraction()'s hovered-
  // edge emphasis call through it, so a curved edge can never straighten
  // out just because it's hovered or touches the selection (§4's own
  // "Do not temporarily straighten it").
  function isCrossCommunity(e) {
    var ca = nodeCommunity[e.source], cb = nodeCommunity[e.target];
    return ca !== undefined && cb !== undefined && ca !== cb;
  }
  // Sign/variance are cached per-edge at buildGraph() time (deterministic
  // from the edge's own stable id, never Math.random()); only the length
  // term below needs recomputing per call, since node positions move during
  // a settle. "increase modestly with edge length, subject to a clamp."
  function edgeCurveAmount(e) {
    var a = nodeById[e.source], b = nodeById[e.target];
    var cc = MAP_VISUALS.crossCommunityEdges;
    var worldDist = Math.hypot(a.x - b.x, a.y - b.y);
    var lengthFactor = Math.min(1, worldDist / (BASE_K * 6));
    var mag = cc.curvatureMin + (cc.curvatureMax - cc.curvatureMin) * (0.35 + 0.65 * e._curveVariance) * lengthFactor;
    return e._curveSign * Math.min(mag, cc.curvatureMax);
  }
  // Returns screen-space {pa, pb, control, mid} for one edge — control is
  // null for a straight (intra-community) edge. The control point is
  // computed in WORLD space (an offset perpendicular to the source->target
  // line) and only THEN transformed to screen space — a quadratic Bézier is
  // preserved under the affine map fitTransform() already uses, so this
  // stays exactly in sync with panning/zooming without any special-casing.
  // `mid` is the curve's true midpoint (the quadratic Bézier point at
  // t=0.5), used for relationship-label placement so a label never drifts
  // off a curved line the way a naive endpoint-average would.
  function edgeGeometry(e, w, h) {
    var a = nodeById[e.source], b = nodeById[e.target];
    var pa = worldToLocal(a.x, a.y, w, h), pb = worldToLocal(b.x, b.y, w, h);
    if (!isCrossCommunity(e)) {
      return { pa: pa, pb: pb, control: null, mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } };
    }
    var amt = edgeCurveAmount(e);
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    var control = worldToLocal(mx + (-dy / len) * amt, my + (dx / len) * amt, w, h);
    return {
      pa: pa, pb: pb, control: control,
      mid: { x: 0.25 * pa.x + 0.5 * control.x + 0.25 * pb.x, y: 0.25 * pa.y + 0.5 * control.y + 0.25 * pb.y }
    };
  }
  function traceEdgePath(ctx, geo) {
    ctx.moveTo(geo.pa.x, geo.pa.y);
    if (geo.control) ctx.quadraticCurveTo(geo.control.x, geo.control.y, geo.pb.x, geo.pb.y);
    else ctx.lineTo(geo.pb.x, geo.pb.y);
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

  // --- Second-order image budget (see MAP_VISUALS.selectionImages). The
  // selected node and its DIRECT (1st-order) neighbors always show their
  // image when they have one — only the 2nd hop is capped, since that's the
  // set that can blow up around a high-degree hub. imageBudgetState.limit
  // is the zoom-derived cap currently in effect; recomputeImageBudget()
  // applies the hysteresis gate (see its own comment) and returns whether
  // the effective limit actually changed, so callers only need to redo the
  // (cheap but not free) candidate sort when it did.
  var imageBudgetState = { limit: MAP_VISUALS.selectionImages.secondOrderLimit, lastCheckedExtent: null };
  function recomputeImageBudget() {
    var cfg = MAP_VISUALS.selectionImages;
    var tiers = cfg.zoomTiers || [];
    var extent = currentVB.w;
    if (imageBudgetState.lastCheckedExtent !== null &&
        Math.abs(extent - imageBudgetState.lastCheckedExtent) < cfg.hysteresis) {
      return false; // within the hysteresis band of the last check — no re-evaluation
    }
    imageBudgetState.lastCheckedExtent = extent;
    var natural = cfg.secondOrderLimit;
    for (var i = 0; i < tiers.length; i++) {
      if (extent >= tiers[i].minExtent) { natural = tiers[i].limit; break; }
    }
    if (natural === imageBudgetState.limit) return false;
    imageBudgetState.limit = natural;
    return true;
  }
  // The current 2nd-order image-active set, as a plain id -> true map —
  // recomputed by refreshSecondOrderImageSet() below whenever the selection,
  // the reachable set (a filter change), or the zoom-derived budget changes.
  // Deliberately NOT recomputed inside isImageActive() itself (called once
  // per node per frame) — sorting/capping the candidate list is cheap for a
  // single hub's neighborhood but there is no reason to repeat it per node.
  var activeSecondOrderImageIds = {};
  // Deterministic candidate ordering — see CLAUDE.md § Library "Map view"
  // Priority 4: visible degree (this node's degree within the CURRENTLY
  // VISIBLE/filtered graph — graphAdjacency is already scoped to exactly
  // that set, see buildAdjacency()) first, then total graph degree
  // (n.degree, structural connectivity across the whole fetched graph —
  // see buildGraph()), then stable library_id as the final tiebreak. No
  // cultural-importance or popularity signal of any kind.
  function secondOrderCandidateSort(a, b) {
    var va = (graphAdjacency[a.id] || []).length, vb = (graphAdjacency[b.id] || []).length;
    if (va !== vb) return vb - va;
    if (a.degree !== b.degree) return b.degree - a.degree;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  }
  // Budget pool now spans hop distances 2 AND 3 together (extended from
  // 2nd-order-only per direct request) — one shared budget, not a separate
  // cap per hop, so a 3rd-order neighbor competes for the same limited
  // slots as a 2nd-order one rather than getting its own additional
  // allowance. The Selection Hierarchy's opacity ladder (MAP_VISUALS.
  // selection.opacitySteps, still 4 steps for distances 1/2/3/4+) is
  // completely unaffected by this — image ACTIVATION and dimming are two
  // independent systems that happen to both read selectionDistance.
  function refreshSecondOrderImageSet() {
    activeSecondOrderImageIds = {};
    if (!selectedId) return;
    var candidates = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var dist = selectionDistance[n.id];
      if (n.hasImage && (dist === 2 || dist === 3)) candidates.push(n);
    }
    candidates.sort(secondOrderCandidateSort);
    var limit = imageBudgetState.limit;
    for (i = 0; i < candidates.length && i < limit; i++) activeSecondOrderImageIds[candidates[i].id] = true;
  }

  // Only the SELECTED node and its neighbors up to 3rd order (direct
  // neighbors, plus their own neighbors out to two more hops, the latter
  // subject to the shared budget above) ever show their image — see the
  // module comment on Image nodes.
  // Both drawBackground() and drawInteraction() call this so they can never
  // disagree about which nodes are currently image-active. selectionDistance
  // is the BFS hop count from selectedId, already computed for the opacity
  // ladder above.
  function isImageActive(n) {
    if (!n.hasImage) return false;
    if (n.id === selectedId) return true;
    if (selectedId) {
      var dist = selectionDistance[n.id];
      if (dist === 1) return true;
      if (dist === 2 || dist === 3) return !!activeSecondOrderImageIds[n.id];
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

  function drawShapeNode(ctx, n, p, style, scale, extraScale) {
    var size = (n.hub ? SHAPE_SIZE.hub : SHAPE_SIZE.leaf) * scale * (n.sizeScale || 1) * (extraScale || 1);
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
  function drawImageNode(ctx, n, p, style, scale, extraScale) {
    var s = (n.hub ? IMAGE_SIZE.hub : IMAGE_SIZE.leaf) * scale * (n.sizeScale || 1) * (extraScale || 1);
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

  function nodeVisualHalfSize(n, scale, showImage, extraScale) {
    var mult = (n.sizeScale || 1) * (extraScale || 1);
    return showImage ? (n.hub ? IMAGE_SIZE.hub : IMAGE_SIZE.leaf) * scale * mult : (n.hub ? SHAPE_SIZE.hub : SHAPE_SIZE.leaf) * scale * mult;
  }

  // --- Background layer: the full graph at rest, plus the Selection
  // Hierarchy's stepped-by-hop-distance opacity ladder (see module comment
  // on selectionDistance — driven ENTIRELY by selectedId, never by hover).
  // Redrawn whenever anything that could change WHAT's drawn or WHERE
  // happens: layout (relayout/reheat), a filter change, a resize, a
  // pan/zoom step, or a selection change (since that changes every node's
  // opacity tier, not just the selected node's own appearance) — see
  // invalidate() below. --------------------------------------------------
  function drawBackground() {
    var rect = bgCanvas.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    bgCtx.clearRect(0, 0, w, h);
    if (!nodes.length) return;
    var t = fitTransform(w, h);

    var hasSel = !!(selectedId && nodeById[selectedId] && visible[selectedId]);
    drawCommunityFields(bgCtx, w, h, hasSel ? nodeCommunity[selectedId] : undefined);

    var steps = MAP_VISUALS.selection.opacitySteps;
    // Distance-1 (direct neighbors) reads at step index 0, distance-2 at
    // index 1, and so on; anything past the array's length — or never
    // reached by the BFS at all (a different component, effectively
    // "infinitely" far) — clamps to the last (dimmest) entry.
    function stepFor(dist) {
      if (dist === undefined) return steps[steps.length - 1];
      return steps[Math.min(Math.max(dist, 1) - 1, steps.length - 1)];
    }
    function nodeAlpha(n) {
      if (!hasSel) return 1;
      if (n.id === selectedId) return 1;
      return stepFor(selectionDistance[n.id]);
    }

    // Edges first — drawn under nodes, matching the previous SVG paint
    // order (edges group before nodes group). Cross-community edges get a
    // deterministic curve (see edgeGeometry()) and a slightly reduced
    // opacity relative to intra-community edges — on top of, not instead
    // of, the selection-driven step. A non-active edge's own step is
    // whichever of its two endpoints is CLOSER to the selection — an edge
    // reaching out from a 1st-degree node is itself part of the 1st-degree
    // neighborhood, not the far end's dimmer tier.
    edges.forEach(function (e) {
      if (!visible[e.source] || !visible[e.target]) return;
      var geo = edgeGeometry(e, w, h);
      var active = hasSel && (e.source === selectedId || e.target === selectedId);
      var alpha = 1;
      if (hasSel && !active) {
        var dS = selectionDistance[e.source], dT = selectionDistance[e.target];
        var minD = dS === undefined ? dT : (dT === undefined ? dS : Math.min(dS, dT));
        alpha = stepFor(minD);
      }
      if (isCrossCommunity(e)) alpha *= MAP_VISUALS.crossCommunityEdges.opacityMultiplier;
      bgCtx.globalAlpha = alpha;
      bgCtx.beginPath();
      traceEdgePath(bgCtx, geo);
      setEdgeDash(bgCtx, e.category);
      bgCtx.strokeStyle = active ? cssVar("--signal") : cssVar("--gray-2");
      bgCtx.lineWidth = active ? 1.5 : 1;
      bgCtx.stroke();
    });
    bgCtx.globalAlpha = 1;
    bgCtx.setLineDash([]);

    nodes.forEach(function (n) {
      if (!visible[n.id]) return;
      var p = worldToLocal(n.x, n.y, w, h);
      var style = typeStyles[n.publicType] || FALLBACK_STYLE;
      var showImage = isImageActive(n);
      // Only the selected node itself gets the modest size bump — direct
      // neighbors and everyone else keep their plain degree-based size
      // ("Do not significantly resize the neighborhood" — §5).
      var extraScale = n.id === selectedId ? MAP_VISUALS.selection.selectedScale : 1;
      bgCtx.globalAlpha = nodeAlpha(n);
      if (showImage) drawImageNode(bgCtx, n, p, style, t.scale, extraScale);
      else drawShapeNode(bgCtx, n, p, style, t.scale, extraScale);
      if (n.id === selectedId) {
        // A double ring, not the single ring used elsewhere (hover's dashed
        // outline, a drag's own ring) — with 2nd-order image neighbors
        // active, the selected node can otherwise get lost among several
        // same-sized image squares. Two concentric solid strokes with a
        // visible gap between them read as a distinct "this one" marker at
        // a glance without a permanent label, a glow, or resizing the node
        // itself beyond the existing modest selectedScale bump.
        var half = nodeVisualHalfSize(n, t.scale, showImage, extraScale);
        bgCtx.globalAlpha = 1;
        bgCtx.setLineDash([]);
        bgCtx.strokeStyle = cssVar("--signal");
        bgCtx.lineWidth = 2;
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, half + 3, 0, Math.PI * 2);
        bgCtx.stroke();
        bgCtx.lineWidth = 1.5;
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, half + 7, 0, Math.PI * 2);
        bgCtx.stroke();
      }
    });
    bgCtx.globalAlpha = 1;
  }

  // --- Interaction layer: hover and/or an in-progress drag (see module
  // comment — neither touches the selection's tiers, so this never needs
  // the background layer's nodeAlpha() logic). A hovered node's touching
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

    // A small, additive boost for the HOVERED node's own community field —
    // drawn here, on the fx layer, as a second fill/stroke pass over the
    // one matching hull already drawn (at plain or selected-emphasis
    // opacity) on the background layer below. Never touches the background
    // layer itself — hover must stay fx-only (see module comment on
    // invalidate()/invalidateHover()) — so this can only ever ADD emphasis,
    // never replace or reduce whatever the selected community's own
    // stronger opacity already drew underneath it.
    var hoverCommunity = nodeCommunity[hoveredId];
    if (hoverCommunity !== undefined) {
      var hCfg = MAP_VISUALS.communityFields;
      var hoverHull = communityHulls.filter(function (hull) { return hull.community === hoverCommunity; })[0];
      if (hoverHull) fillStrokeHull(fxCtx, hoverHull, w, h, hCfg.hoveredFillOpacity, hCfg.hoveredStrokeOpacity, cssVar("--ink"));
    }

    edges.forEach(function (e) {
      if (e.source !== hoveredId && e.target !== hoveredId) return;
      if (!visible[e.source] || !visible[e.target]) return;
      // Goes through the same edgeGeometry() every other edge draw uses, so
      // a curved cross-community edge keeps its curve under hover emphasis
      // rather than snapping straight (§4: "Do not temporarily straighten
      // it") — only color/width/label change here, never the path shape.
      var geo = edgeGeometry(e, w, h);
      fxCtx.beginPath();
      fxCtx.setLineDash([]);
      traceEdgePath(fxCtx, geo);
      fxCtx.strokeStyle = cssVar("--signal");
      fxCtx.lineWidth = 2;
      fxCtx.stroke();
      if (e.label) {
        fxCtx.font = "8px " + cssVar("--font-mono");
        fxCtx.textAlign = "center";
        fxCtx.textBaseline = "middle";
        fxCtx.lineJoin = "round";
        fxCtx.lineWidth = 3;
        fxCtx.strokeStyle = cssVar("--paper");
        fxCtx.strokeText(e.label, geo.mid.x, geo.mid.y);
        fxCtx.fillStyle = cssVar("--ink");
        fxCtx.fillText(e.label, geo.mid.x, geo.mid.y);
      }
    });

    var p = worldToLocal(n.x, n.y, w, h);
    // The ring alone carries the hover size cue (MAP_VISUALS.selection.
    // hoveredScale) — the node's own drawn shape/image, already painted by
    // drawBackground(), is deliberately left untouched: redrawing it larger
    // here would mean hover has to invalidate the background layer too,
    // exactly the per-move background repaint this two-layer split exists
    // to avoid (see module comment on invalidate()/invalidateHover()).
    var half = nodeVisualHalfSize(n, t.scale, isImageActive(n), MAP_VISUALS.selection.hoveredScale);
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
    // A container resize can change the gap the bridge panel measures
    // between the two (fixed-corner) cards even though neither card's own
    // content changed — reposition it (a no-op if it's currently hidden).
    updateBridge();
  }

  // Plain BFS over graphAdjacency, restricted to the currently visible set —
  // gives every reachable node's hop count from the selection, which
  // drives the stepped opacity falloff in drawBackground() (§5's "2nd
  // degree connections are dimmer than 1st, 3rd dimmer still" — a flat
  // selected/neighbor/everyone-else split read as too subtle in practice,
  // per direct user feedback, so this replaced it). A node the BFS never
  // reaches (different component, or simply not in the currently visible
  // set) has no entry at all — drawBackground() treats that as the
  // dimmest floor tier, same as "too many hops out to bother counting."
  function computeSelectionDistances(fromId) {
    var dist = {};
    if (!fromId || !graphAdjacency[fromId]) return dist;
    dist[fromId] = 0;
    var queue = [fromId], qi = 0;
    while (qi < queue.length) {
      var id = queue[qi++];
      var d = dist[id];
      (graphAdjacency[id] || []).forEach(function (nb) {
        if (dist[nb] === undefined && visible[nb]) { dist[nb] = d + 1; queue.push(nb); }
      });
    }
    return dist;
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

  // --- Relationship bridge panel: a minimal edge label, not a third card —
  // appears in the horizontal gap between the two preview cards when a node
  // is SELECTED and a DIFFERENT node is HOVERED at the same time, showing
  // only the bare relationship, never a sentence explaining it (the cards
  // already identify the two entries by name). Purely derived, purely
  // additive: never navigates, selects, reheats the simulation, or moves
  // the camera (pointer-events: none — see CSS), and never resizes or moves
  // either card — layoutBridge() only ever uses the leftover space between
  // their own measured bounding boxes, and hides the whole panel rather
  // than placing it below the cards or over the graph when that gap is too
  // narrow. Two independent relationships, direct always taking priority
  // over second-order (see updateBridge()):
  //   - DIRECT: selected and hovered share one or more explicit edges
  //     (creators[].ref or related[].ref) — shown as exactly ONE compact
  //     relation label (the strongest by category, then vocabulary order —
  //     see directRelationships()), one WORD per line (never a mid-word
  //     break, never an ellipsis — see BRIDGE_SHORT_LABELS below).
  //   - SECOND-ORDER: no direct edge, but selected and hovered share one or
  //     more intermediary nodes (neighbors(selected) ∩ neighbors(hovered),
  //     restricted to the currently VISIBLE graph via graphAdjacency, which
  //     relayout() already rebuilds from only the filtered/visible set — a
  //     filtered-out intermediary is never used, since it simply isn't in
  //     that adjacency at all) — shown as "VIA" plus the single strongest
  //     intermediary's title (sharedIntermediaries()' own deterministic
  //     ordering below), one word per line, plus a bare "+N" line when more
  //     than one shared intermediary exists. No leg labels, no path — just
  //     which entry bridges them.
  //
  // The real available width here is small (a fixed-corner, fixed-width
  // preview card on each side of this render window typically leaves only
  // ~54-70px of gap between them on this site's actual capped content
  // width — see CLAUDE.md) — too narrow for most vocabulary words to fit
  // on one line, let alone a full sentence. Rather than truncate with an
  // ellipsis (illegible: "Tangerine Dream" -> "TA…"), this panel:
  //   1. Uses a CENTRALIZED, bridge-specific SHORT label map
  //      (BRIDGE_SHORT_LABELS) for direct relations — deliberately
  //      shortened vocabulary forms (e.g. "collaborator-of" -> "Collab"),
  //      never the mechanically truncated raw string.
  //   2. Renders each already-short word as its OWN line (one <p> per
  //      token) — multi-word labels ("Part Of") simply stack ("PART" /
  //      "OF"), never wrap mid-word, never need CSS ellipsis at all.
  //   3. MEASURES every candidate word against the real available width
  //      (measureToken(), using an offscreen clone of the actual line
  //      style — never a hardcoded font-metrics guess) before ever
  //      rendering it. A direct label whose word still doesn't fit is
  //      simply not shown (hideBridge()) rather than corrupted with an
  //      ellipsis. A second-order intermediary TITLE (an arbitrary entity
  //      name, not controlled vocabulary — the one case genuinely capable
  //      of containing an unbreakably long single word) falls back to a
  //      bare node COUNT ("VIA" / "3 NODES") instead, per the spec this
  //      implements.
  //   4. Always preserves the complete, untruncated relationship as the
  //      panel's `title` attribute and the body's `aria-label` (setFull())
  //      — the short/abbreviated form is a VISUAL space constraint only,
  //      never a loss of information for assistive tech or a native
  //      tooltip.
  // Performance: edgesByPair (built once in buildGraph(), see its own
  // comment above) makes a direct lookup an O(1)-average dict read, and a
  // second-order lookup an O(degree) adjacency-set intersection — never a
  // scan of the whole edge list, and never per pointer-move (setHovered()
  // already only fires on an actual hovered-node change, not continuous
  // movement).
  var BRIDGE_CFG = {
    enabled: true,
    maxIntermediaries: 1,
    // The smallest gap worth even attempting to render into — deliberately
    // low (not the ~70-110px a fixed-pixel target would need): since
    // content now wraps one word per line instead of needing to fit on a
    // single line, a much narrower box is still legible. This is a hard
    // floor below which there's no realistic room for even a single short
    // word, not a target width.
    minimumWidth: 28,
    // Breathing room subtracted from the raw measured gap before content
    // is ever considered — keeps the panel from ever touching either
    // card's own edge. Deliberately small: the flanking rules (see
    // layoutBridgeRules()) are what visually connect the panel to each
    // card, so it doesn't need much clearance of its own to read as a
    // separate element from them.
    gapMargin: 6,
    // Hard ceiling regardless of how much gap is actually available —
    // this is an edge label, not a growing panel.
    maximumWidth: 128
  };
  var bridgeEl = document.getElementById("library-map-bridge");
  var bridgeBodyEl = bridgeEl && bridgeEl.querySelector(".library-map-bridge-body");
  // Separate, plain elements — not flex-row ::before/::after fighting the
  // label for the same box width (see the module comment on this and the
  // HTML partial's own comment on why). Positioned entirely by
  // layoutBridgeRules() below, independent of the label's own sizing.
  var bridgeRuleLeft = document.getElementById("library-map-bridge-rule-left");
  var bridgeRuleRight = document.getElementById("library-map-bridge-rule-right");

  var CATEGORY_RANK = { structural: 0, historical: 1, contextual: 2 };
  function categoryRank(cat) { return CATEGORY_RANK[cat] !== undefined ? CATEGORY_RANK[cat] : CATEGORY_RANK.contextual; }

  // Mechanical display form — replicates library-related.html's own
  // `.relation | replaceRE "-" " " | title` convention exactly, so a
  // vocabulary word reads the same way here as it does on an entry's own
  // page. Works unmodified for creator roles too (single words). Used ONLY
  // for the panel's full/accessible text (setFull() below) now — the
  // VISIBLE direct-relation label always goes through BRIDGE_SHORT_LABELS
  // instead, since the mechanical form is routinely too wide for the real
  // available gap (see module comment above).
  function mechanicalLabel(raw) {
    if (!raw) return "";
    return raw.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function rawLabelFor(edge) {
    return edge.label || (edge.kind === "creator" ? "credited" : "related-work");
  }

  // Centralized, bridge-specific short-label vocabulary — covers every
  // creator role and relation type in data/library.yaml (plus the same two
  // no-label fallbacks displayLabelFor's raw form uses elsewhere:
  // "credited" for an unlabeled creator edge, "related-work" for an
  // unlabeled relation). Deliberately shortened, not mechanically
  // truncated — e.g. "collaborator-of" -> "Collab", "affiliated-with" ->
  // "Affiliated" (the trailing "with" dropped outright, not clipped mid-
  // word) — every value here is chosen to still read as a complete word or
  // short phrase on its own, never a fragment. A raw vocabulary value with
  // no entry here (future additions to data/library.yaml) falls back to
  // the full mechanicalLabel() form in shortLabelFor() below — the panel
  // simply hides itself if that turns out too wide for the real gap (see
  // renderBridge()) rather than ever showing a corrupted label.
  var BRIDGE_SHORT_LABELS = {
    // creator roles
    author: "Author", artist: "Artist", composer: "Composer",
    performer: "Perform", director: "Director", founder: "Founder",
    lecturer: "Lecturer", editor: "Editor", researcher: "Research",
    designer: "Designer", developer: "Dev", manufacturer: "Maker",
    organization: "Org", label: "Label", publisher: "Publish",
    credited: "Credited",
    // relation types
    "related-work": "Related", "version-of": "Version Of",
    "edition-of": "Edition Of", "release-of": "Release Of",
    "recording-of": "Record Of", "performance-of": "Perform Of",
    "discusses": "Discuss", "influenced-by": "Influenced By",
    "related-reading": "Reading", "documents": "Documents",
    "used-by": "Used By", "part-of": "Part Of",
    "successor-to": "Successor", "predecessor-to": "Predecessor",
    "implements": "Implements", "programmed-in": "Written In",
    "compatible-with": "Compatible", "made-with": "Made With",
    "based-at": "Based At", "commissioned-by": "Commission",
    "affiliated-with": "Affiliated", "created-at": "Created At",
    "collaborator-of": "Collab", "co-member-of": "Co-Member",
    // the inverse-resolved forms library-related.html can render on the
    // TARGET side of a relation (see relation_inverse in data/library.yaml)
    // — this file's direct-relation label is forward-only today (see
    // directRelationships()) so these are unreachable in practice, but
    // kept here so the map stays complete against the full vocabulary
    // rather than silently gapped.
    member: "Member", "has-version": "Has Version",
    "has-edition": "Has Edition", "released-as": "Released As",
    "recorded-as": "Recorded As", "performed-as": "Performed As",
    uses: "Uses", "compatible-with-inverse": "Compatible",
    "used-in": "Used In", hosts: "Hosts", commissioned: "Commissioned",
    "implemented-by": "Made By", "implementation-language-of": "Language Of",
    influenced: "Influenced", "documented-by": "Documented",
    "discussed-by": "Discussed", contains: "Contains"
  };
  function shortLabelFor(raw) {
    return BRIDGE_SHORT_LABELS[raw] || mechanicalLabel(raw);
  }

  // Every edge directly connecting aId/bId, deduplicated by RAW label (two
  // differently-stored edges that resolve to the same short form shouldn't
  // count twice), sorted deterministically (category strength, then
  // vocabulary order) — never an arbitrary/insertion-order pick. The panel
  // only ever shows direct[0] (see renderBridge() — "at most one direct
  // relationship" in this narrow treatment) — this function itself still
  // returns every match so updateBridge() can tell direct from
  // second-order, and so the choice of which one to show is deterministic
  // rather than "whichever fits."
  function directRelationships(aId, bId) {
    var list = edgesByPair[pairKey(aId, bId)] || [];
    var seen = {}, out = [];
    list.forEach(function (e) {
      var raw = rawLabelFor(e);
      if (seen[raw]) return;
      seen[raw] = true;
      out.push({ raw: raw, category: e.category });
    });
    out.sort(function (x, y) {
      var r = categoryRank(x.category) - categoryRank(y.category);
      if (r !== 0) return r;
      return x.raw < y.raw ? -1 : (x.raw > y.raw ? 1 : 0);
    });
    return out;
  }

  // graphAdjacency (buildAdjacency(), rebuilt every relayout from only the
  // currently VISIBLE nodes/edges) pushes one neighbor id per EDGE, so a
  // pair joined by more than one edge appears twice — deduped here before
  // using it as a candidate SET.
  function uniqueNeighbors(id) {
    var seen = {}, out = [];
    (graphAdjacency[id] || []).forEach(function (nb) { if (!seen[nb]) { seen[nb] = true; out.push(nb); } });
    return out;
  }
  // The strongest (lowest-rank) category among every edge on BOTH legs —
  // priority 1 of the four-tier ordering below.
  function intermediaryRank(cand) {
    var minRank = CATEGORY_RANK.contextual;
    cand.legA.concat(cand.legB).forEach(function (e) {
      var r = categoryRank(e.category);
      if (r < minRank) minRank = r;
    });
    return minRank;
  }
  // neighbors(aId) ∩ neighbors(bId), excluding aId/bId themselves — both
  // adjacency sets are already scoped to the visible graph (see above), so
  // a filtered-out intermediary is structurally absent, never a result that
  // needs excluding after the fact. Ordering: strongest category pair ->
  // highest visible degree -> highest total graph degree -> stable
  // library_id — no cultural-importance or popularity signal, matching the
  // same deterministic-ordering discipline the second-order IMAGE budget
  // (secondOrderCandidateSort() above) already uses for this graph.
  function sharedIntermediaries(aId, bId) {
    var bNeighbors = {};
    uniqueNeighbors(bId).forEach(function (id) { bNeighbors[id] = true; });
    var candidates = [];
    uniqueNeighbors(aId).forEach(function (id) {
      if (id === aId || id === bId || !bNeighbors[id]) return;
      var legA = edgesByPair[pairKey(aId, id)] || [];
      var legB = edgesByPair[pairKey(id, bId)] || [];
      if (!legA.length || !legB.length) return;
      candidates.push({ id: id, legA: legA, legB: legB });
    });
    candidates.sort(function (x, y) {
      var r = intermediaryRank(x) - intermediaryRank(y);
      if (r !== 0) return r;
      var vx = (graphAdjacency[x.id] || []).length, vy = (graphAdjacency[y.id] || []).length;
      if (vx !== vy) return vy - vx;
      var nx = nodeById[x.id], ny = nodeById[y.id];
      var dx = (nx && nx.degree) || 0, dy = (ny && ny.degree) || 0;
      if (dx !== dy) return dy - dx;
      return x.id < y.id ? -1 : (x.id > y.id ? 1 : 0);
    });
    return candidates;
  }
  function clearEl(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

  function hideBridge() {
    if (bridgeEl) bridgeEl.hidden = true;
    if (bridgeRuleLeft) bridgeRuleLeft.hidden = true;
    if (bridgeRuleRight) bridgeRuleRight.hidden = true;
  }

  // A single reusable offscreen clone of the real line style — the only
  // reliable way to know whether a given word actually fits at the real
  // rendered font/letter-spacing/uppercase-transform, without duplicating
  // (and risking drifting out of sync with) those CSS values as hardcoded
  // JS font-metrics constants. Created once, lazily, and reused for every
  // measurement — never rebuilt per call.
  var bridgeMeasureEl = null;
  function measureToken(text) {
    if (!bridgeMeasureEl) {
      bridgeMeasureEl = document.createElement("span");
      bridgeMeasureEl.className = "library-map-bridge-line";
      bridgeMeasureEl.style.position = "fixed";
      bridgeMeasureEl.style.visibility = "hidden";
      bridgeMeasureEl.style.left = "-9999px";
      bridgeMeasureEl.style.whiteSpace = "nowrap";
      document.body.appendChild(bridgeMeasureEl);
    }
    bridgeMeasureEl.textContent = text;
    return bridgeMeasureEl.offsetWidth;
  }
  // The label box's own horizontal padding — read once from the real CSS
  // (never hardcoded, same reasoning as measureToken() above) and added on
  // top of a word's own measured width: a word that just barely matches
  // maxWidth would otherwise still overflow the box once its padding is
  // added, since maxWidth is a budget for the whole box, not just its text.
  var bridgePaddingPx = null;
  function bridgeHorizontalPadding() {
    if (bridgePaddingPx == null && bridgeEl) {
      var cs = getComputedStyle(bridgeEl);
      bridgePaddingPx = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    return bridgePaddingPx || 0;
  }
  // A label only ever renders one WORD per line (see renderBridge()), so
  // "fits" means every individual word's own measured width, plus the
  // box's own padding, clears the real available width — never the
  // label's combined/unwrapped width, which is irrelevant once it's
  // already split across lines.
  function wordsFit(text, maxWidth) {
    var usable = maxWidth - bridgeHorizontalPadding();
    return text.split(" ").every(function (w) { return measureToken(w) <= usable; });
  }

  // Builds the panel's content via plain DOM calls (textContent, not
  // innerHTML) — matching this file's existing card-population convention
  // (populateCard() above) and avoiding any need for a separate HTML-escape
  // helper, since every string here already comes from our own index.json,
  // not user input. Returns false when nothing legible fits within
  // maxWidth — the caller hides the panel rather than show it corrupted.
  // A minimal edge label, not a third card: exactly one short direct
  // relation (one word per line), or "VIA" + one intermediary's title (one
  // word per line, plus a bare "+N" line when more shared intermediaries
  // exist) — never both, never a sentence, never the endpoint titles (the
  // cards already show those).
  function renderBridge(direct, intermediaries, maxWidth) {
    clearEl(bridgeBodyEl);
    function line(text, extraClass) {
      var p = document.createElement("p");
      p.className = "library-map-bridge-line" + (extraClass ? " " + extraClass : "");
      p.textContent = text;
      bridgeBodyEl.appendChild(p);
    }
    function setFull(text) {
      bridgeEl.title = text;
      bridgeBodyEl.setAttribute("aria-label", text);
    }
    if (direct.length) {
      var d = direct[0]; // "at most one direct relationship" — deterministic (category, then vocabulary order)
      var short = shortLabelFor(d.raw);
      if (!wordsFit(short, maxWidth)) return false; // no ellipsis fallback for direct — hide rather than corrupt
      short.split(" ").forEach(function (w) { line(w); });
      setFull(mechanicalLabel(d.raw));
      return true;
    }
    var top = intermediaries[0];
    var n = nodeById[top.id];
    var shownCount = Math.min(BRIDGE_CFG.maxIntermediaries, intermediaries.length);
    var extra = intermediaries.length - shownCount;
    line("Via", "library-map-bridge-via");
    if (wordsFit(n.title, maxWidth)) {
      n.title.split(" ").forEach(function (w) { line(w); });
      if (extra > 0) line("+" + extra, "library-map-bridge-more");
    } else {
      // The intermediary's own TITLE is an arbitrary entity name, not
      // controlled vocabulary — the one case genuinely capable of
      // containing a single word too long to ever fit. Fall back to a
      // bare count rather than an ellipsis; the real title is still fully
      // preserved in title/aria-label below.
      line(intermediaries.length + (intermediaries.length === 1 ? " Node" : " Nodes"));
    }
    setFull("Via " + n.title);
    return true;
  }

  // Placement: read the two cards' OWN current measured bounding boxes —
  // never the cards' widths, never node/camera coordinates — and use only
  // whatever screen space already exists between them. Neither card is
  // ever resized or moved. Content and placement are decided in one pass
  // against the REAL measured gap (never a fixed pixel target): compute
  // the gap -> hide outright if it's below BRIDGE_CFG.minimumWidth -> ask
  // renderBridge() to fit content within it (which may itself decide to
  // hide, if even the short/fallback form doesn't fit) -> let the box
  // shrink-to-fit its own content (capped at maxWidth, but never forced
  // wider than it needs to be — see the module/HTML-partial comments on
  // why a flex-grow-based box used to drift the text off-center) -> center
  // THAT actual measured box in the gap, vertically centered relative to
  // the two cards -> draw the two flanking rules independently, from
  // wherever the box actually ended up out to each card (layoutBridgeRules()).
  // Never below the cards, never over the graph. Pure DOM read/write — no
  // relation to currentVB, no repaint of either canvas layer, so pan/zoom
  // never needs to call this.
  function layoutBridge(direct, intermediaries) {
    if (!bridgeEl || !hoverCard || !selectedCard) return;
    var containerRect = container.getBoundingClientRect();
    var hoverRect = hoverCard.root.getBoundingClientRect();
    var selRect = selectedCard.root.getBoundingClientRect();
    var leftEdge = hoverRect.right - containerRect.left;
    var rightEdge = selRect.left - containerRect.left;
    var gap = rightEdge - leftEdge;
    if (gap < BRIDGE_CFG.minimumWidth) {
      hideBridge();
      return;
    }
    var maxWidth = Math.min(gap - BRIDGE_CFG.gapMargin, BRIDGE_CFG.maximumWidth);
    if (!renderBridge(direct, intermediaries, maxWidth)) {
      hideBridge();
      return;
    }
    // maxWidth here is only a CAP (via CSS max-width) — the box itself is
    // plain absolutely-positioned content (shrink-to-fit), so it never
    // renders wider than its own text actually needs, regardless of how
    // much of the gap it was allowed to use.
    bridgeEl.style.maxWidth = maxWidth + "px";
    bridgeEl.hidden = false;
    var boxRect = bridgeEl.getBoundingClientRect(); // natural size, not yet positioned
    var width = boxRect.width, height = boxRect.height;
    var centerY = (((hoverRect.top + hoverRect.bottom) / 2) +
      ((selRect.top + selRect.bottom) / 2)) / 2 - containerRect.top;
    var left = leftEdge + (gap - width) / 2;
    var top = centerY - height / 2;
    bridgeEl.style.left = left + "px";
    bridgeEl.style.top = top + "px";
    layoutBridgeRules(leftEdge, left, left + width, rightEdge, centerY);
  }

  // The two flanking rules, positioned independently of the label box's
  // own flex layout (see module/HTML-partial comments on why) — each
  // simply spans from wherever the (already-centered) label box ended up
  // out to its own card's edge. A rule shorter than MIN_RULE reads as
  // visual noise rather than a connector, so it's omitted rather than
  // shown as a barely-visible sliver — these are the spec's own "optional"
  // rules, never a required part of the layout.
  function layoutBridgeRules(gapLeft, boxLeft, boxRight, gapRight, centerY) {
    var MIN_RULE = 5;
    var leftLen = boxLeft - gapLeft;
    var rightLen = gapRight - boxRight;
    if (bridgeRuleLeft) {
      bridgeRuleLeft.hidden = leftLen < MIN_RULE;
      if (!bridgeRuleLeft.hidden) {
        bridgeRuleLeft.style.left = gapLeft + "px";
        bridgeRuleLeft.style.width = leftLen + "px";
        bridgeRuleLeft.style.top = centerY + "px";
      }
    }
    if (bridgeRuleRight) {
      bridgeRuleRight.hidden = rightLen < MIN_RULE;
      if (!bridgeRuleRight.hidden) {
        bridgeRuleRight.style.left = boxRight + "px";
        bridgeRuleRight.style.width = rightLen + "px";
        bridgeRuleRight.style.top = centerY + "px";
      }
    }
  }

  // The one entry point every hook below calls — recomputes from scratch
  // every time rather than incrementally patching, which is cheap at this
  // graph's scale (an O(1) direct lookup plus an O(degree) intersection,
  // never an O(edges) scan — see the module comment above) and means this
  // can never drift out of sync with a selection/hover/filter change that
  // updated selectedId/hoveredId/visible/graphAdjacency out from under it.
  function updateBridge() {
    if (!bridgeEl || !BRIDGE_CFG.enabled || !hoverCard || !selectedCard) return;
    if (!selectedId || !hoveredId || hoveredId === selectedId ||
        !nodeById[selectedId] || !nodeById[hoveredId] ||
        !visible[selectedId] || !visible[hoveredId]) {
      hideBridge();
      return;
    }
    var direct = directRelationships(selectedId, hoveredId);
    var intermediaries = sharedIntermediaries(selectedId, hoveredId);
    if (!direct.length && !intermediaries.length) {
      hideBridge();
      return;
    }
    layoutBridge(direct, intermediaries);
  }

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
    selectionDistance = computeSelectionDistances(id);
    recomputeImageBudget(); // pick up the zoom-appropriate budget even if this is the first selection since the last zoom
    refreshSecondOrderImageSet();
    invalidate();
    showCardFor(selectedCard, id);
    // The hover card only ever shows something OTHER than the selection —
    // now that this node IS the selection, its hover card (if it happened
    // to be the thing just hovered) would be redundant with the new
    // selected card.
    if (hoveredId === id) hideCardFor(hoverCard);
    updateBridge();
  }

  // A selection has no other way to clear once made (otherwise it would be
  // a one-way ratchet toward whatever's clicked last) — clicking away from
  // every node/card, or pressing Escape, drops it.
  function deselectNode() {
    if (!selectedId) return;
    selectedId = null;
    selectionDistance = {};
    activeSecondOrderImageIds = {};
    invalidate();
    hideCardFor(selectedCard);
    hideBridge();
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
    } else {
      showCardFor(hoverCard, id);
    }
    updateBridge();
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
  // pan immediately, same as before.
  //
  // Touch (multi-pointer): `touchPoints` tracks every currently-down
  // pointer by id (Pointer Events give each simultaneous touch its own
  // pointerId — mouse/pen gestures never have more than one). A single
  // shared `start`/`panning` pair (the pre-multitouch design) silently
  // assumed only one pointer could ever be down at once: a second finger's
  // own pointerdown overwrote `start` out from under the first finger's
  // still-active pan, and after that every pointermove — from EITHER
  // finger — kept re-deriving a pan delta against whatever `start` a
  // moment ago happened to be, which reads exactly as "the map jumps
  // around erratically" on a pinch. The moment a second pointer goes down,
  // any single-pointer pan/drag-candidate/drag in progress is aborted and
  // the gesture becomes a pinch instead (pinchState()/updatePinch() below,
  // the same zoom-to-anchor math the wheel handler uses, just anchored to
  // the pinch's own midpoint every tick rather than a static cursor point,
  // and scaled from an ABSOLUTE start-of-gesture reference — never
  // multiplied incrementally — so it can't drift). Lifting one finger
  // back down to one active pointer resumes an ordinary single-finger pan,
  // reseeded from wherever that finger currently is so it doesn't jump
  // either. A third finger is tracked (for correct up/down bookkeeping)
  // but never affects the pinch math, which always uses the first two. ---
  function initPointerHandling() {
    var panning = false, start = null, dragCandidate = null;
    var touchPoints = []; // [{id, x, y}, ...] — insertion order, oldest first
    var pinching = false, pinchStart = null, pinchStartVB = null;

    function pointIndex(id) {
      for (var i = 0; i < touchPoints.length; i++) if (touchPoints[i].id === id) return i;
      return -1;
    }
    function pinchState() {
      if (touchPoints.length < 2) return null;
      var a = touchPoints[0], b = touchPoints[1];
      var dx = b.x - a.x, dy = b.y - a.y;
      return { dist: Math.max(1, Math.sqrt(dx * dx + dy * dy)), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
    }
    function beginPinch() {
      panning = false;
      dragCandidate = null;
      if (draggedNode) endDrag();
      pinching = true;
      didPan = true;
      pinchStart = pinchState();
      pinchStartVB = { w: currentVB.w, h: currentVB.h };
    }
    // Same zoom-to-anchor trick the wheel handler uses (capture the world
    // point under the anchor, resize, shift so that point is still under
    // the anchor) but re-run every tick against the pinch's CURRENT
    // midpoint, so a pinch that also drifts sideways pans right along with
    // it. currentVB.w/h are set ABSOLUTELY from pinchStartVB * a ratio
    // computed against the gesture's starting distance, never multiplied
    // tick-over-tick, so repeated small floating-point steps can't
    // accumulate drift the way an incremental *= would.
    function updatePinch() {
      var cur = pinchState();
      if (!cur || !pinchStart) return;
      var before = screenToWorld(cur.midX, cur.midY);
      var ratio = pinchStart.dist / cur.dist;
      currentVB.w = Math.max(150, Math.min(W * 4, pinchStartVB.w * ratio));
      currentVB.h = Math.max(105, Math.min(H * 4, pinchStartVB.h * ratio));
      var after = screenToWorld(cur.midX, cur.midY);
      currentVB.x += before.x - after.x;
      currentVB.y += before.y - after.y;
      if (selectedId && recomputeImageBudget()) refreshSecondOrderImageSet();
      invalidate();
    }
    // Reseed an ordinary single-finger pan from wherever `p` (the one
    // pointer still down) currently is — used both by a fresh pointerdown
    // and by a pinch dropping back to one finger, so neither jumps.
    function resumePanFrom(p) {
      panning = true;
      start = { x: p.x, y: p.y, vx: currentVB.x, vy: currentVB.y };
    }

    fxCanvas.addEventListener("pointerdown", function (ev) {
      touchPoints.push({ id: ev.pointerId, x: ev.clientX, y: ev.clientY });
      // Capture is what lets a finger keep sending pointermove here even
      // once it's no longer physically over the canvas — without it, a
      // fast pinch or pan can outrun the element and silently stop
      // updating. Best-effort: a rare capture failure shouldn't take the
      // rest of this handler (still needed to start the pinch/pan) down
      // with it.
      try { fxCanvas.setPointerCapture(ev.pointerId); } catch (e) {}
      if (touchPoints.length >= 2) {
        beginPinch();
        return;
      }
      didPan = false;
      var world = screenToWorld(ev.clientX, ev.clientY);
      var hit = hitTestWorld(world.x, world.y, hitRadiusWorld());
      if (hit) {
        dragCandidate = hit;
        start = { x: ev.clientX, y: ev.clientY, vx: currentVB.x, vy: currentVB.y };
        panning = false;
      } else {
        dragCandidate = null;
        resumePanFrom({ x: ev.clientX, y: ev.clientY });
      }
    });
    fxCanvas.addEventListener("pointermove", function (ev) {
      var idx = pointIndex(ev.pointerId);
      if (idx !== -1) { touchPoints[idx].x = ev.clientX; touchPoints[idx].y = ev.clientY; }
      if (pinching) {
        if (touchPoints.length >= 2) updatePinch();
        return;
      }
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
      fxCanvas.addEventListener(evt, function (ev) {
        var idx = pointIndex(ev.pointerId);
        if (idx !== -1) touchPoints.splice(idx, 1);
        dragCandidate = null;
        if (draggedNode) endDrag();
        if (touchPoints.length >= 2) {
          // Still a pinch (a third finger was down, or another already
          // was) — re-anchor to the two that remain rather than end the
          // gesture, so releasing an extra finger doesn't jump either.
          beginPinch();
        } else if (touchPoints.length === 1) {
          pinching = false;
          resumePanFrom(touchPoints[0]);
        } else {
          pinching = false;
          panning = false;
        }
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
      if (panning || draggedNode || dragCandidate || pinching) return;
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
      // Zoom can change the 2nd-order image budget tier (see
      // MAP_VISUALS.selectionImages) — recomputeImageBudget() itself is the
      // hysteresis gate, so most wheel ticks are a cheap no-op here.
      if (selectedId && recomputeImageBudget()) refreshSecondOrderImageSet();
      invalidate();
    }, { passive: false });
    fxCanvas.addEventListener("click", function (ev) {
      if (didPan) { didPan = false; return; }
      if (didDrag) { didDrag = false; return; } // a completed drag isn't also a click-select
      var world = screenToWorld(ev.clientX, ev.clientY);
      var hit = hitTestWorld(world.x, world.y, hitRadiusWorld());
      if (hit) {
        var changed = hit.id !== selectedId;
        selectNode(hit.id);
        if (changed) setSelectURLParam(hit.id, "push");
      } else if (selectedId) {
        deselectNode();
        setSelectURLParam(null, "push");
      }
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
    if (selectedId) { deselectNode(); setSelectURLParam(null, "push"); }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && selectedId) { deselectNode(); setSelectURLParam(null, "push"); }
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
      relationCategory = data.relation_category || {};
      buildGraph(data.entries);
      var visibleIds = data.entries.filter(matchesEntry).map(function (e) { return e.library_id; });
      relayout(visibleIds);
      applyPendingSelection();
    })
    .catch(function () { /* Map view stays empty; Catalog/Images are unaffected */ });

  document.addEventListener("library:filter-change", function (ev) {
    sel.type = (ev.detail && ev.detail.type) || [];
    sel.subject = (ev.detail && ev.detail.subject) || [];
    if (nodes.length) applyFilter();
  });

  // Registered after library-filter.js's own popstate listener (script load
  // order — see module comment at the top of this file), so its own
  // fromURL()/apply(true) — and the synchronous library:filter-change
  // dispatch that follows — have already brought `visible` up to date for
  // the URL we just navigated to before this runs.
  window.addEventListener("popstate", restoreSelectionFromURL);
})();
