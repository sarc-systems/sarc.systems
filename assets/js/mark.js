// Live landing mark — animates ONLY Row 2 letters. Rows 3 and 4 are SVG <use>
// mirrors and follow automatically. Slow, irregular, frequently returns to the
// fully readable state. Respects prefers-reduced-motion (stays canonical).
(function () {
  "use strict";

  var root = document.querySelector("[data-mark]");
  if (!root) return;
  var activeRow = root.querySelector("[data-mark-active]");
  if (!activeRow) return;

  var letters = Array.prototype.slice.call(activeRow.querySelectorAll(".mk-letter"));

  // Permitted transforms for Row 2 letters only, about each letter's own centre
  // (CSS transform-box: fill-box). canonical / H-reflect / V-reflect / 180°.
  var STATES = ["", "scaleX(-1)", "scaleY(-1)", "rotate(180deg)"];

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var paused = false;
  var timer = null;

  function glyph(l) { return l.querySelector(".mk-glyph"); }
  function setState(l, css) { glyph(l).style.transform = css; }
  function restoreAll() { letters.forEach(function (l) { setState(l, ""); }); }

  // Pick any state other than the current one — including canonical (""), so a
  // letter can return to readable on its own. No global reset.
  function nextState(current) {
    var opts = STATES.filter(function (s) { return s !== current; });
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function mutateOne() {
    var l = letters[Math.floor(Math.random() * letters.length)];
    setState(l, nextState(glyph(l).style.transform || ""));
  }

  function step() {
    mutateOne();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (paused || reduce.matches) return;
    timer = setTimeout(step, 3500 + Math.random() * 5500); // slow, irregular
  }

  // Interaction
  letters.forEach(function (l) {
    l.style.cursor = "pointer";
    l.addEventListener("click", function (ev) {
      ev.stopPropagation();
      setState(l, nextState(glyph(l).style.transform || ""));
    });
  });
  activeRow.addEventListener("click", function () { mutateOne(); });
  root.addEventListener("pointerenter", function () { paused = true; clearTimeout(timer); });
  root.addEventListener("pointerleave", function () { paused = false; schedule(); });

  function onReduceChange() {
    if (reduce.matches) { clearTimeout(timer); restoreAll(); } else { schedule(); }
  }
  if (reduce.addEventListener) reduce.addEventListener("change", onReduceChange);

  if (!reduce.matches) schedule();
})();
