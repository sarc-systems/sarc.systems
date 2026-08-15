#!/usr/bin/env node
// generate-clock-pattern-events.js — regenerates the PATTERN_EVENTS table
// embedded in assets/js/clock-config.js. Plain Node, no dependencies, same
// "committed generated output, regenerate deliberately" pattern as
// scripts/import-colorplan.mjs / scripts/generate-mark.py.
//
// WHY THIS EXISTS: the Eternal Clock's colour theme is driven by observing
// the visible rune pattern, not a fixed timer. Two DIFFERENT watched-cell
// sets drive two deliberately different-frequency behaviors:
//
//   - DRIFT (advance/retreat, one step to the next/previous theme) watches
//     PATTERN_WATCH_CELLS_DRIFT — the top two rows, cells 0-7 (8 cells) —
//     giving each drift direction an empirically verified average
//     recurrence of ~1.7 days: rare enough that it "might not change for
//     days," frequent enough that "if you're lucky" you catch one live.
//   - CYCLE (advance a persistent rotation anchor one step through the full
//     palette, discarding accumulated local drift) watches
//     PATTERN_WATCH_CELLS_CYCLE — the top two rows plus the three fastest
//     cells of the third row, cells 0-10 (11 cells), a strict superset of
//     the drift cells — deliberately rarer than drift, so many drift steps
//     normally happen between cycle-advances rather than them firing at the
//     same cadence as drift.
//
// (An earlier version treated the two CYCLE trigger conditions —
// all-REST/all-BOTH across the watched cells — as jumps to two FIXED
// targets, "black" and "white". That's gone: colour is meant to visit the
// whole palette over time, not alternate between two poles, so both
// conditions now do the same thing — advance a rotation anchor by one step
// through THEMES, wrapping — rather than being distinguished at all. See
// clock-state.js's themeIndexForBar for how the anchor accumulates across
// however many full PATTERN_CYCLE_LEN-bar cycles have elapsed, not just
// within the current one.)
//
// Checking all sixteen cells for either pattern would only ever fire once
// per the full ~308-year 32-bit Gray-code cycle (the eight highest cells
// are frozen for centuries at any human timescale). A cell is 2 bits of
// Gray-code state, but each Gray-code output bit i depends on input bits i
// AND i+1 (g = n ^ (n>>1)), so N watched cells (2N output bits) actually
// depend on 2N+1 input bits — the watched pattern's true period is
// 2^(2N+1) bars, not 2^(2N). Each additional cycle-watch cell therefore
// QUADRUPLES the cycle-advance period, not doubles it: ten cells give
// ~27.4 days between cycle-advances on average, eleven gives ~54.9,
// twelve would give ~219.4. Because the cycle cells are a strict superset
// of the drift cells, and the cycle cells' own repeating period is a whole
// multiple of the drift cells' period, one combined table (driven by the
// larger cycle-cell set) covers both. Regenerate with:
//   node scripts/generate-clock-pattern-events.js
// and paste the printed PATTERN_EVENTS array into clock-config.js if either
// watch-cell set or the left/right mapping below ever changes.
"use strict";

var path = require("path");
var state = require(path.join(__dirname, "..", "assets", "js", "clock-state.js"));

// Drift (advance/retreat): the eight fastest-changing cells — row-major
// cells 0-7, the top two rows of the 4x4 grid.
var PATTERN_WATCH_CELLS_DRIFT = [0, 1, 2, 3, 4, 5, 6, 7];

// Cycle (advance the rotation anchor): a strict superset of the drift cells
// — the top two rows plus the three fastest cells of the third row, cells
// 0-10.
var PATTERN_WATCH_CELLS_CYCLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// LEFT = component B (falling, upper-left -> lower-right, "\" — leans left).
// RIGHT = component A (rising, lower-left -> upper-right, "/" — leans right).
// This mapping is a judgment call (the geometry doesn't force a left/right
// reading) — flip 'advance'/'retreat' below if it reads backwards once seen
// live, then regenerate.
function classifyDrift(cells, idxs) {
  var allA = true, allB = true;
  for (var n = 0; n < idxs.length; n++) {
    var c = cells[idxs[n]];
    if (!(c.a === 1 && c.b === 0)) allA = false;
    if (!(c.a === 0 && c.b === 1)) allB = false;
  }
  if (allB) return "advance"; // all LEFT strokes, no right -> next colour
  if (allA) return "retreat"; // all RIGHT strokes, no left -> prev colour
  return null;
}

// Either all-REST or all-BOTH across the watched cycle cells — deliberately
// NOT distinguished from each other (no more "jump to black" vs "jump to
// white"): both simply advance the rotation anchor one step.
function isCycleTrigger(cells, idxs) {
  var allRest = true, allBoth = true;
  for (var n = 0; n < idxs.length; n++) {
    var c = cells[idxs[n]];
    if (!(c.a === 0 && c.b === 0)) allRest = false;
    if (!(c.a === 1 && c.b === 1)) allBoth = false;
  }
  return allRest || allBoth;
}

var N_CYCLE = PATTERN_WATCH_CELLS_CYCLE.length;
var CYCLE_LEN = 1 << (2 * N_CYCLE + 1); // see header comment

var events = [];
for (var n = 0; n < CYCLE_LEN; n++) {
  var gray = state.grayStateForBar(BigInt(n));
  var cells = state.cellsFromState(gray);
  // Cycle and drift can never both fire on the same bar: the cycle cells
  // are a superset of the drift cells, so all-REST/all-BOTH across the
  // cycle set forces the drift subset into the same state, which fails the
  // drift classifier's stricter allA/allB test by construction. Order is
  // for clarity only, not correctness.
  var type = isCycleTrigger(cells, PATTERN_WATCH_CELLS_CYCLE) ? "cycle" : classifyDrift(cells, PATTERN_WATCH_CELLS_DRIFT);
  if (type) events.push({ offset: n, type: type });
}

var counts = {};
events.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });

var days = CYCLE_LEN * 2.26 / 86400;
console.log("CYCLE_LEN =", CYCLE_LEN, "(" + days.toFixed(3) + " days)");
console.log("event counts per cycle:", JSON.stringify(counts));
["advance", "retreat", "cycle"].forEach(function (t) {
  var c = counts[t] || 0;
  if (c) console.log("  " + t + ": every ~" + (days / c).toFixed(2) + " days on average");
});
var themeCount = 55; // informational only — full THEMES list lives in clock-config.js
var cycleCount = counts.cycle || 0;
if (cycleCount) {
  var lapsPerYear = 365.25 / (days / cycleCount) / themeCount;
  console.log("  full palette lap: ~" + (themeCount * (days / cycleCount) / 365.25).toFixed(2) + " years (" + lapsPerYear.toFixed(3) + " laps/year)");
}
console.log("");
console.log("var PATTERN_CYCLE_LEN = " + CYCLE_LEN + ";");
console.log("var PATTERN_EVENTS = " + JSON.stringify(events) + ";");
