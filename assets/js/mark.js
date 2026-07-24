// Live landing mark — Rows 2 and 3 are independently animated: one letter at a
// time (from either row) mutates to a permitted transform, with no coupling
// between the two rows. Row 1 is stable; Row 4 is a static <use> mirror of
// Row 1. Slow, irregular. Respects prefers-reduced-motion (stays canonical).
(function () {
  "use strict";

  var root = document.querySelector("[data-mark]");
  if (!root) return;
  var activeRow = root.querySelector("[data-mark-active]");
  var mirrorRow = root.querySelector("[data-mark-mirror]");
  if (!activeRow || !mirrorRow) return;

  // Every letter in Rows 2 and 3 is an independent, individually mutable unit.
  var letters = Array.prototype.slice.call(
    root.querySelectorAll("[data-mark-active] .mk-letter, [data-mark-mirror] .mk-letter")
  );
  if (!letters.length) return;

  // Permitted transforms about each letter's own centre (transform-box: fill-box):
  // canonical / horizontal reflection / vertical reflection / 180° rotation.
  var STATES = ["", "scaleX(-1)", "scaleY(-1)", "rotate(180deg)"];

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var paused = false;
  var timer = null;

  function glyph(l) { return l.querySelector(".mk-glyph"); }
  function currentState(l) { return glyph(l).style.transform || ""; }
  function setState(l, s) { glyph(l).style.transform = s; }
  function restoreAll() { letters.forEach(function (l) { setState(l, ""); }); }

  // Pick any state other than the current one — including canonical (""), so a
  // letter can return to readable on its own. No global reset.
  function nextState(current) {
    var opts = STATES.filter(function (s) { return s !== current; });
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function mutate(l) { setState(l, nextState(currentState(l))); }
  function mutateOne() { mutate(letters[Math.floor(Math.random() * letters.length)]); }

  function step() {
    mutateOne();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (paused || reduce.matches) return;
    timer = setTimeout(step, 3500 + Math.random() * 5500); // slow, irregular
  }

  // Interaction: click a letter -> transform it; click a row -> mutate one.
  letters.forEach(function (l) {
    l.style.cursor = "pointer";
    l.addEventListener("click", function (ev) {
      ev.stopPropagation();
      mutate(l);
    });
  });
  activeRow.addEventListener("click", function () { mutateOne(); });
  mirrorRow.addEventListener("click", function () { mutateOne(); });
  root.addEventListener("pointerenter", function () { paused = true; clearTimeout(timer); });
  root.addEventListener("pointerleave", function () { paused = false; schedule(); });

  function onReduceChange() {
    if (reduce.matches) { clearTimeout(timer); restoreAll(); } else { schedule(); }
  }
  if (reduce.addEventListener) reduce.addEventListener("change", onReduceChange);

  if (!reduce.matches) schedule();
})();
