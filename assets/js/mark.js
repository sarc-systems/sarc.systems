// Live landing mark — all sixteen letters (four rows) animate independently:
// one letter, chosen at random from any row, turns 90° on a fixed cadence, with
// no coupling between rows. Respects prefers-reduced-motion (stays canonical).
(function () {
  "use strict";

  var INTERVAL = 2260; // ms between changes — one letter turns every 2.26s

  var root = document.querySelector("[data-mark]");
  if (!root) return;

  // Every letter in the mark is an independent, individually mutable unit.
  var letters = Array.prototype.slice.call(root.querySelectorAll(".mk-letter"));
  if (!letters.length) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var paused = false;
  var timer = null;

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

  function start() {
    stop();
    if (paused || reduce.matches) return;
    timer = setInterval(mutateOne, INTERVAL);
  }
  function stop() { clearInterval(timer); timer = null; }

  // Interaction: click a letter -> transform it; click elsewhere on the mark ->
  // mutate one at random.
  letters.forEach(function (l) {
    l.style.cursor = "pointer";
    l.addEventListener("click", function (ev) {
      ev.stopPropagation();
      mutate(l);
    });
  });
  root.addEventListener("click", function () { mutateOne(); });
  root.addEventListener("pointerenter", function () { paused = true; stop(); });
  root.addEventListener("pointerleave", function () { paused = false; start(); });

  function onReduceChange() {
    if (reduce.matches) { stop(); restoreAll(); } else { start(); }
  }
  if (reduce.addEventListener) reduce.addEventListener("change", onReduceChange);

  if (!reduce.matches) start();
})();
