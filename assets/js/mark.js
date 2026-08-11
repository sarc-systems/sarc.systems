// Live landing mark — all sixteen letters (four rows) animate independently:
// one letter, chosen at random from any row, turns 90° on a fixed cadence, with
// no coupling between rows. Respects prefers-reduced-motion (stays canonical).
//
// The autonomous cadence is driven by the SARC Eternal Clock's own shared
// boundary scheduler (assets/js/clock-runtime.js, loaded globally before this
// file — see baseof.html) rather than an independent setInterval: the mark
// mutates exactly when the clock's own 2.26s wall-clock-aligned bar boundary
// fires, so the homepage mark and the clock (compact header + /clock/) are
// always in the same phase, with the same self-correcting, non-drifting
// timing — never two unrelated 2260ms timers that happen to share a period.
// Manual interaction (click) stays immediate and independent of the clock.
(function () {
  "use strict";

  var root = document.querySelector("[data-mark]");
  if (!root) return;

  // Every letter in the mark is an independent, individually mutable unit.
  var letters = Array.prototype.slice.call(root.querySelectorAll(".mk-letter"));
  if (!letters.length) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var paused = false;

  function glyph(l) { return l.querySelector(".mk-glyph"); }
  function currentState(l) { return glyph(l).style.transform || ""; }
  function setState(l, s) { glyph(l).style.transform = s; }
  function restoreAll() { letters.forEach(function (l) { setState(l, ""); }); }

  // Every step is a 90° turn about the letter's own centre (transform-box:
  // fill-box). A readable letter rotates ±90° (direction chosen at random); a
  // rotated letter turns back to readable — so it always returns on its own and
  // never makes a 180° jump.
  function nextState(current) {
    if (current) return "";
    return Math.random() < 0.5 ? "rotate(90deg)" : "rotate(-90deg)";
  }

  function mutate(l) { setState(l, nextState(currentState(l))); }
  function mutateOne() { mutate(letters[Math.floor(Math.random() * letters.length)]); }

  // Interaction: click a letter -> transform it; click elsewhere on the mark ->
  // mutate one at random. Always immediate, regardless of the clock.
  letters.forEach(function (l) {
    l.style.cursor = "pointer";
    l.addEventListener("click", function (ev) {
      ev.stopPropagation();
      mutate(l);
    });
  });
  root.addEventListener("click", function () { mutateOne(); });
  root.addEventListener("pointerenter", function () { paused = true; });
  root.addEventListener("pointerleave", function () { paused = false; });

  function onReduceChange() {
    if (reduce.matches) restoreAll();
  }
  if (reduce.addEventListener) reduce.addEventListener("change", onReduceChange);

  // Subscribe to the same shared boundary scheduler the clock itself uses
  // (see clock-runtime.js) so every autonomous mutation lands exactly on a
  // real clock boundary. The scheduler replays the current snapshot to a new
  // subscriber immediately on subscribe — that first call is the state that
  // was already true when the page loaded, not a new boundary, so it's
  // skipped; only a snapshot with a genuinely new barIndex triggers a mutation.
  var NS = window.SARCClock;
  var runtime = NS && NS.runtime && NS.runtime.getSharedRuntime();
  if (runtime) {
    var lastBarIndex = null;
    runtime.subscribe(function (snapshot) {
      if (!snapshot) return;
      var isFirst = lastBarIndex === null;
      lastBarIndex = snapshot.barIndex;
      if (isFirst || paused || reduce.matches) return;
      mutateOne();
    });
  }
})();
