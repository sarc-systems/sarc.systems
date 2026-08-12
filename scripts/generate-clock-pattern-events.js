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
//     giving each of the two drift patterns (all-A / all-B) an empirically
//     verified average recurrence of ~1.7 days: rare enough that it "might
//     not change for days," frequent enough that "if you're lucky" you
//     catch one live.
//   - RESET (a hard jump to black or white, discarding accumulated drift)
//     watches PATTERN_WATCH_CELLS_RESET — the top two rows PLUS the three
//     fastest cells of the third row, cells 0-10 (11 cells), a strict
//     superset of the drift cells — deliberately rarer than drift, so many
//     drift steps normally happen between resets rather than resets firing
//     at the same cadence as drift (an earlier version of this table
//     watched the same 8 cells for both, which was wrong: it made a full
//     reset just as likely as an ordinary drift step).
//
// Checking all sixteen cells for either pattern would only ever fire once
// per the full ~308-year 32-bit Gray-code cycle (the eight highest-order
// cells are effectively frozen for centuries at human timescales) — see
// clock-state.js's own comment. Each additional reset cell QUADRUPLES the
// reset period, not doubles it (two more Gray-code bits per cell,
// PATTERN_CYCLE_LEN = 2^(2*N_RESET + 1)): 10 cells gave ~27.4 days for a
// specific colour to recur (~13.7 days for either), 11 gives ~109.7 days
// (~54.9 days for either) — a genuinely rare event, dozens of drift steps
// apart, while staying on a human-observable timescale rather than
// centuries (12 cells would already be ~439/~219 days).
//
// Because the reset cells are a strict superset of the drift cells, and the
// reset cells' own repeating period is a whole multiple of the drift cells'
// period, ONE combined cycle length (driven by the larger, reset, cell set)
// covers both: PATTERN_CYCLE_LEN = 2^(2*N_RESET + 1) bars. Regenerate with:
//   node scripts/generate-clock-pattern-events.js
// and paste the printed PATTERN_EVENTS array into clock-config.js if either
// watch-cell set or the left/right mapping below ever changes.
"use strict";

var path = require("path");
var state = require(path.join(__dirname, "..", "assets", "js", "clock-state.js"));

// Drift (advance/retreat): the eight fastest-changing cells — row-major
// cells 0-7, the top two rows of the 4x4 grid.
var PATTERN_WATCH_CELLS_DRIFT = [0, 1, 2, 3, 4, 5, 6, 7];

// Reset (black/white): a strict superset of the drift cells — the top two
// rows plus the three fastest cells of the third row, cells 0-10. Each added
// cell here is 2 more bits of Gray-code state, so it QUADRUPLES the reset
// period, not doubles it (PATTERN_CYCLE_LEN = 2^(2*N_RESET + 1)) — 11 cells
// puts a specific color's recurrence at ~110 days (any reset, black or
// white, at ~55 days), vs. 10 cells' ~27/~14 or 12 cells' ~439/~219.
var PATTERN_WATCH_CELLS_RESET = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

function classifyReset(cells, idxs) {
  var allRest = true, allBoth = true;
  for (var n = 0; n < idxs.length; n++) {
    var c = cells[idxs[n]];
    if (!(c.a === 0 && c.b === 0)) allRest = false;
    if (!(c.a === 1 && c.b === 1)) allBoth = false;
  }
  if (allRest) return "black"; // no strokes at all
  if (allBoth) return "white"; // every watched cell shows both strokes
  return null;
}

var N_RESET = PATTERN_WATCH_CELLS_RESET.length;
var CYCLE_LEN = 1 << (2 * N_RESET + 1); // see header comment

var events = [];
for (var n = 0; n < CYCLE_LEN; n++) {
  var gray = state.grayStateForBar(BigInt(n));
  var cells = state.cellsFromState(gray);
  // Reset and drift can never both fire on the same bar: the reset cells are
  // a superset of the drift cells, so all-REST/all-BOTH across the reset set
  // forces the drift subset into the same state, which fails the drift
  // classifier's stricter allA/allB test by construction. Order is for
  // clarity only, not correctness.
  var resetType = classifyReset(cells, PATTERN_WATCH_CELLS_RESET);
  var type = resetType || classifyDrift(cells, PATTERN_WATCH_CELLS_DRIFT);
  if (type) events.push({ offset: n, type: type });
}

var counts = {};
events.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });

var days = CYCLE_LEN * 2.26 / 86400;
console.log("CYCLE_LEN =", CYCLE_LEN, "(" + days.toFixed(3) + " days)");
console.log("event counts per cycle:", JSON.stringify(counts));
["advance", "retreat", "black", "white"].forEach(function (t) {
  var c = counts[t] || 0;
  if (c) console.log("  " + t + ": every ~" + (days / c).toFixed(2) + " days on average");
});
console.log("");
console.log("var PATTERN_CYCLE_LEN = " + CYCLE_LEN + ";");
console.log("var PATTERN_EVENTS = " + JSON.stringify(events) + ";");
