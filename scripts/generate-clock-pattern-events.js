#!/usr/bin/env node
// generate-clock-pattern-events.js — regenerates the PATTERN_EVENTS table
// embedded in assets/js/clock-config.js. Plain Node, no dependencies, same
// "committed generated output, regenerate deliberately" pattern as
// scripts/import-colorplan.mjs / scripts/generate-mark.py.
//
// WHY THIS EXISTS: the Eternal Clock's colour theme is driven by observing
// the visible rune pattern, not a fixed timer (see CLAUDE.md-adjacent design
// notes / conversation history). Checking all sixteen cells for a uniform
// pattern (all-A, all-B, all-REST, all-BOTH) is only reachable once per the
// full ~308-year 32-bit Gray-code cycle — the eight highest-order cells are
// effectively frozen for centuries at human timescales, so a full-grid check
// would almost never fire. Watching only the eight FASTEST-changing cells —
// PATTERN_WATCH_CELLS below, the top two rows (cells 0-7, row-major) — makes
// each of the four patterns recur on average every ~1.7 days (empirically
// verified by simulation), which is the "might not change for days, but if
// you're lucky you'll catch it live" cadence that was asked for.
//
// Because those eight cells' state depends only on the low 17 bits of the
// wrapped bar index (see clock-state.js grayStateForBar's cell bit mapping),
// the whole pattern of events repeats EXACTLY every 2^17 = 131072 bars
// (~3.43 days) forever — so instead of computing this at runtime, the full
// list of trigger offsets within one cycle is precomputed once, here, and
// embedded as a small static table. Regenerate with:
//   node scripts/generate-clock-pattern-events.js
// and paste the printed PATTERN_EVENTS array into clock-config.js if
// PATTERN_WATCH_CELLS or the mapping below ever changes.
"use strict";

var path = require("path");
var state = require(path.join(__dirname, "..", "assets", "js", "clock-state.js"));

// The eight fastest-changing cells — row-major cells 0-7, i.e. the top two
// rows of the 4x4 grid.
var PATTERN_WATCH_CELLS = [0, 1, 2, 3, 4, 5, 6, 7];

// LEFT = component B (falling, upper-left -> lower-right, "\" — leans left).
// RIGHT = component A (rising, lower-left -> upper-right, "/" — leans right).
// This mapping is a judgment call (the geometry doesn't force a left/right
// reading) — flip 'advance'/'retreat' below if it reads backwards once seen
// live, then regenerate.
function classify(cells, idxs) {
  var allA = true, allB = true, allRest = true, allBoth = true;
  for (var n = 0; n < idxs.length; n++) {
    var c = cells[idxs[n]];
    if (!(c.a === 1 && c.b === 0)) allA = false;
    if (!(c.a === 0 && c.b === 1)) allB = false;
    if (!(c.a === 0 && c.b === 0)) allRest = false;
    if (!(c.a === 1 && c.b === 1)) allBoth = false;
  }
  if (allRest) return "black";   // no strokes at all
  if (allBoth) return "white";   // every watched cell shows both strokes
  if (allB) return "advance";    // all LEFT strokes, no right -> next colour
  if (allA) return "retreat";    // all RIGHT strokes, no left -> prev colour
  return null;
}

var CYCLE_LEN = 1 << 17; // 131072 — see header comment for why

var events = [];
for (var n = 0; n < CYCLE_LEN; n++) {
  var gray = state.grayStateForBar(BigInt(n));
  var cells = state.cellsFromState(gray);
  var type = classify(cells, PATTERN_WATCH_CELLS);
  if (type) events.push({ offset: n, type: type });
}

var counts = {};
events.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });

console.log("CYCLE_LEN =", CYCLE_LEN, "(" + (CYCLE_LEN * 2.26 / 86400).toFixed(3) + " days)");
console.log("event counts per cycle:", JSON.stringify(counts));
console.log("");
console.log("var PATTERN_CYCLE_LEN = " + CYCLE_LEN + ";");
console.log("var PATTERN_EVENTS = " + JSON.stringify(events) + ";");
