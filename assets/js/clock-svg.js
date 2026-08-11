// clock-svg.js — SARC Eternal Clock: shared diagonal half-sine SVG renderer.
// One geometry generator used by both the compact header clock and the large
// /clock/-page clock — differences between them are size/stroke/spacing only
// (handled in CSS via a variant class), never a different glyph.
//
// Bar-boundary transitions are deliberately NOT special-cased here: every
// component is a plain element whose visibility is a CSS class
// (`.is-on`) with a CSS opacity transition (see clock.css), exactly like the
// existing mark.css pattern for .mk-glyph. Setting the same class twice never
// fires a transition, so calling setState() with sixteen mostly-unchanged
// cells naturally animates only the one component whose state actually
// flipped, with no diffing required at this layer. prefers-reduced-motion is
// likewise handled entirely in CSS (transition: none), not here.
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SARCClock = root.SARCClock || {};
    root.SARCClock.svg = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var CELL = 100;   // grid unit; four cells per side
  var COLS = 4;
  var PAD = 20;      // viewBox overscan so outer strokes never clip
  var GRID = CELL * COLS;

  // Component endpoints in cell-local (0,0)=upper-left .. (1,1)=lower-right
  // unit coordinates, per todo_clock.txt:
  //   A (rising):  lower-left  -> upper-right
  //   B (falling): upper-left  -> lower-right
  var ENDPOINTS = {
    a: { x0: 0, y0: 1, x1: 1, y1: 0 },
    b: { x0: 0, y0: 0, x1: 1, y1: 1 }
  };

  function rotate90(dx, dy) { return { x: -dy, y: dx }; }
  function normalize(v) {
    var len = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
    return { x: v.x / len, y: v.y / len };
  }

  // path(t) = diagonal(t) + normal * amplitude * sin(pi*t), sampled as a
  // polyline — an exact discretization of the parametric construction in
  // todo_clock.txt, not a hand-drawn curve. `sign` folds in the component's
  // configured handedness so A and B bow to complementary sides.
  function buildHalfSinePath(x0, y0, x1, y1, amplitude, sign, samples) {
    var dx = x1 - x0, dy = y1 - y0;
    var normal = normalize(rotate90(dx, dy));
    var nx = normal.x * amplitude * sign;
    var ny = normal.y * amplitude * sign;
    var pts = [];
    for (var i = 0; i <= samples; i++) {
      var t = i / samples;
      var wave = Math.sin(Math.PI * t);
      var x = x0 + dx * t + nx * wave;
      var y = y0 + dy * t + ny * wave;
      pts.push(x.toFixed(2) + "," + y.toFixed(2));
    }
    return "M" + pts.join("L");
  }

  function cellOrigin(index) {
    var row = Math.floor(index / COLS);
    var col = index % COLS;
    return { x: col * CELL, y: row * CELL };
  }

  function componentPathD(cellIndex, component, runeConfig) {
    var origin = cellOrigin(cellIndex);
    var ep = ENDPOINTS[component];
    var x0 = origin.x + ep.x0 * CELL;
    var y0 = origin.y + ep.y0 * CELL;
    var x1 = origin.x + ep.x1 * CELL;
    var y1 = origin.y + ep.y1 * CELL;
    var amplitude = runeConfig.amplitude * CELL;
    var sign = runeConfig.handedness[component] || 1;
    return buildHalfSinePath(x0, y0, x1, y1, amplitude, sign, runeConfig.samples || 40);
  }

  var VIEWBOX = (-PAD) + " " + (-PAD) + " " + (GRID + 2 * PAD) + " " + (GRID + 2 * PAD);

  // Builds the sixteen-cell grid of A/B paths into an existing (empty) <svg>.
  // Shared by every rendered layer (ink, accent) so all layers share exactly
  // the same geometry — the print-overprint treatment is a second colored,
  // offset copy of the SAME paths, never a different glyph.
  function buildCellsInto(svg, runeConfig) {
    var cells = [];
    for (var i = 0; i < 16; i++) {
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "clock-cell");
      g.setAttribute("data-cell-index", String(i));

      var aPath = document.createElementNS(SVG_NS, "path");
      aPath.setAttribute("class", "clock-component clock-component--a");
      aPath.setAttribute("d", componentPathD(i, "a", runeConfig));

      var bPath = document.createElementNS(SVG_NS, "path");
      bPath.setAttribute("class", "clock-component clock-component--b");
      bPath.setAttribute("d", componentPathD(i, "b", runeConfig));

      g.appendChild(aPath);
      g.appendChild(bPath);
      svg.appendChild(g);
      cells.push({ index: i, a: aPath, b: bPath });
    }
    return cells;
  }

  function createLayerSvg(variant, modifier) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", VIEWBOX);
    svg.setAttribute("class", "clock-svg clock-svg--" + variant + (modifier ? " clock-svg--" + modifier : ""));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    return svg;
  }

  // A very faint, static paper-grain texture — feTurbulence collapsed to a
  // black/alpha-only noise field (no colour, see clock.css .clock-svg--grain
  // for the low opacity + multiply blend that keeps it barely perceptible).
  // Large-clock only: at header-icon scale this kind of fine noise reads as
  // mud rather than grain, so it's intentionally the one part of this pass
  // that does NOT need to survive shrinking — see the calling code below.
  var grainFilterSeq = 0;
  function createGrainLayer(variant) {
    grainFilterSeq += 1;
    var filterId = "clock-grain-" + grainFilterSeq;
    var svg = createLayerSvg(variant, "grain");

    var defs = document.createElementNS(SVG_NS, "defs");
    var filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");

    var turbulence = document.createElementNS(SVG_NS, "feTurbulence");
    turbulence.setAttribute("type", "fractalNoise");
    turbulence.setAttribute("baseFrequency", "0.85");
    turbulence.setAttribute("numOctaves", "2");
    turbulence.setAttribute("stitchTiles", "stitch");
    turbulence.setAttribute("result", "noise");

    var colorMatrix = document.createElementNS(SVG_NS, "feColorMatrix");
    colorMatrix.setAttribute("in", "noise");
    colorMatrix.setAttribute("type", "matrix");
    // Collapse the turbulence RGB into pure black, alpha-modulated-by-noise —
    // grain, not colour.
    colorMatrix.setAttribute("values",
      "0 0 0 0 0  " +
      "0 0 0 0 0  " +
      "0 0 0 0 0  " +
      "0.33 0.33 0.33 0 0"
    );

    filter.appendChild(turbulence);
    filter.appendChild(colorMatrix);
    defs.appendChild(filter);
    svg.appendChild(defs);

    var rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(-PAD));
    rect.setAttribute("y", String(-PAD));
    rect.setAttribute("width", String(GRID + 2 * PAD));
    rect.setAttribute("height", String(GRID + 2 * PAD));
    rect.setAttribute("filter", "url(#" + filterId + ")");
    svg.appendChild(rect);

    return svg;
  }

  // Builds one clock instance inside `container` (an existing empty element).
  // opts: { runeConfig, variant: "compact"|"large", label, grain }
  //
  // Renders a restrained two-ink "overprint" stack rather than a single
  // layer: a colour-accent copy of the same sixteen cells sits underneath,
  // offset a couple of physical pixels and softly blurred (clock.css
  // .clock-svg--accent), with the primary ink copy on top blending against
  // it via `multiply` (clock.css .clock-svg--ink) — a slight colour fringe
  // shows only where the two don't overlap, reading as print misregistration
  // rather than a second, competing glyph. Both layers use the exact same
  // buildCellsInto() geometry and the exact same setState()/setEmphasis()
  // calls, so they can never visually drift apart into two different states.
  function create(container, opts) {
    opts = opts || {};
    var runeConfig = opts.runeConfig;
    var variant = opts.variant || "compact";
    var wantGrain = opts.grain !== false && variant === "large";

    var stack = document.createElement("div");
    stack.className = "clock-rune-stack";

    var accentSvg = createLayerSvg(variant, "accent");
    var accentCells = buildCellsInto(accentSvg, runeConfig);
    stack.appendChild(accentSvg);

    var inkSvg = createLayerSvg(variant, "ink");
    var inkCells = buildCellsInto(inkSvg, runeConfig);
    // The accessible name/role belongs on the ink layer alone — the accent
    // and grain layers are purely decorative duplicates of the same content.
    if (opts.ariaHidden) {
      inkSvg.setAttribute("aria-hidden", "true");
    } else {
      inkSvg.removeAttribute("aria-hidden");
      inkSvg.removeAttribute("focusable");
      inkSvg.setAttribute("role", "img");
      inkSvg.setAttribute("aria-label", opts.label || "SARC clock");
    }
    stack.appendChild(inkSvg);

    if (wantGrain) {
      stack.appendChild(createGrainLayer(variant));
    }

    container.appendChild(stack);

    function forEachLayer(cellIndex, component, fn) {
      var ink = inkCells[cellIndex];
      var accent = accentCells[cellIndex];
      if (ink) fn(component === "a" ? ink.a : ink.b);
      if (accent) fn(component === "a" ? accent.a : accent.b);
    }

    // Applies a full sixteen-cell state array (see clock-state.js
    // cellsFromState) by toggling each component's `.is-on` class on BOTH
    // the ink and accent layers in lockstep. Idempotent per component, so
    // unrelated cells never re-trigger a transition.
    function setState(stateCells) {
      for (var i = 0; i < stateCells.length; i++) {
        var next = stateCells[i];
        if (!next) continue;
        forEachLayer(i, "a", function (el) { el.classList.toggle("is-on", !!next.a); });
        forEachLayer(i, "b", function (el) { el.classList.toggle("is-on", !!next.b); });
      }
    }

    // Transient audio-trigger emphasis — additive, never alters is-on state.
    function setEmphasis(cellIndex, component, on) {
      forEachLayer(cellIndex, component, function (el) { el.classList.toggle("is-emphasized", !!on); });
    }

    function destroy() {
      if (stack.parentNode) stack.parentNode.removeChild(stack);
    }

    return {
      stack: stack,
      setState: setState,
      setEmphasis: setEmphasis,
      destroy: destroy
    };
  }

  return {
    buildHalfSinePath: buildHalfSinePath,
    componentPathD: componentPathD,
    cellOrigin: cellOrigin,
    create: create,
    CELL: CELL,
    PAD: PAD,
    GRID: GRID
  };
});
