// clock-tile-layout.js — SARC Eternal Clock: /clock/-only tile layout.
// Computes --clock-tile-size (px) AND .clock-large-wrap's own explicit
// height from its measured clientWidth — not a vw/vh guess, not CSS-only
// auto-fit/1fr sizing. Two CSS-only approaches were tried and both had a
// real bug: a fixed tile size that doesn't evenly divide the container's
// width leaves visible dead margin either side; letting height follow a
// 1fr-stretched width via aspect-ratio sizes tiles from width alone, which
// on a wide-but-short viewport produced tiles far taller than the available
// height, clipping more than half of every tile off.
//
// Height is deliberately set to exactly `columns * size` — a SQUARE tiled
// field, as many rows as there are columns — rather than clipped to
// whatever space happens to be left in the viewport. On most screens that
// makes the field taller than one viewport, so the page scrolls normally
// and the header ends up above the fold the same way it would on any tall
// page, instead of the tiled area being squeezed down to fit alongside a
// fixed header/footer.
(function () {
  "use strict";

  var wrap = document.querySelector(".clock-large-wrap");
  if (!wrap) return;

  var MIN_TILE = 200;    // px — never uselessly small
  var MAX_TILE = 560;    // px — never balloon into one giant tile
  var TARGET_TILE = 380; // px — desired size before fitting to the actual width
  var MAX_COLUMNS = 10;  // bounds total DOM tile need (columns^2) on extreme displays

  function computeLayout() {
    var width = wrap.clientWidth;
    if (!width) return;

    var columns = Math.max(1, Math.round(width / TARGET_TILE));
    if (width / columns > MAX_TILE) columns = Math.ceil(width / MAX_TILE);
    if (width / columns < MIN_TILE) columns = Math.floor(width / MIN_TILE);
    columns = Math.max(1, Math.min(columns, MAX_COLUMNS));

    // Fills the row edge-to-edge exactly at this column count — no dead
    // margin the way an unadjusted fixed size would leave.
    var size = width / columns;

    // Every tile is scaled up 10% in CSS (.clock-rune-stack transform) so
    // its own overscan bleeds into its NEIGHBOUR and closes the seam
    // between tiles — see clock.css. That only reads as seamless where a
    // neighbour actually exists to blend into. At the wrap's own bottom
    // edge there is no further row to blend into, just the clipped START
    // of the next (invisible) row's content, whose own upward bleed can
    // peek a hair above an exactly-N-tiles-tall boundary as stray fragments
    // (visible in mobile viewport testing). Trimming the wrap a little
    // shorter than the exact N-tile height guarantees that bleed — half
    // the 10% scale's overscan, so ~5%, plus a small margin — stays
    // safely clipped.
    var height = columns * size - size * 0.06;

    wrap.style.setProperty("--clock-tile-size", size + "px");
    wrap.style.height = height + "px";
  }

  computeLayout();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(computeLayout, 150);
  });
})();
