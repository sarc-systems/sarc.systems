#!/usr/bin/env node
// test-clock.js — plain-Node unit tests for the SARC Eternal Clock's pure
// state logic (assets/js/clock-state.js + clock-config.js). No test runner,
// no npm dependency — same "pure/offline, no dependencies" spirit as
// scripts/import-colorplan.mjs. Run with `node scripts/test-clock.js` or
// `make test-clock`.
"use strict";

var assert = require("assert");
var path = require("path");

var config = require(path.join(__dirname, "..", "assets", "js", "clock-config.js"));
var state = require(path.join(__dirname, "..", "assets", "js", "clock-state.js"));

var passed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name: name, error: err });
  }
}

function hammingDistance32(a, b) {
  var x = a ^ b;
  var count = 0n;
  while (x > 0n) {
    count += x & 1n;
    x >>= 1n;
  }
  return count;
}

// --- 1. Identical timestamps produce identical states ----------------------
test("1. identical timestamps produce identical states", function () {
  var now = Date.now();
  var s1 = state.cellsFromNow(now, config.SARC_EPOCH_MS);
  var s2 = state.cellsFromNow(now, config.SARC_EPOCH_MS);
  assert.deepStrictEqual(s1, s2);
});

// --- 2 & 3. Gray-code Hamming distance + single A/B component change -------
function assertAdjacentBarsDifferByOne(barIndex) {
  var g1 = state.grayStateForBar(barIndex);
  var g2 = state.grayStateForBar(barIndex + 1n);
  assert.strictEqual(hammingDistance32(g1, g2), 1n,
    "bars " + barIndex + " -> " + (barIndex + 1n) + " should differ by exactly one bit");

  var cells1 = state.cellsFromState(g1);
  var cells2 = state.cellsFromState(g2);
  var diff = state.diffCells(cells1, cells2);
  assert.notStrictEqual(diff, null, "expected exactly one changed component");
  var changedCount = 0;
  for (var i = 0; i < 16; i++) {
    if (cells1[i].a !== cells2[i].a) changedCount++;
    if (cells1[i].b !== cells2[i].b) changedCount++;
  }
  assert.strictEqual(changedCount, 1, "exactly one A-or-B component should change");
}

test("2+3. Gray-code Hamming distance 1 + single A/B change — cycle beginning", function () {
  assertAdjacentBarsDifferByOne(0n);
  assertAdjacentBarsDifferByOne(1n);
});

test("2+3. — arbitrary middle values", function () {
  assertAdjacentBarsDifferByOne(123456789n);
  assertAdjacentBarsDifferByOne(999999n);
});

test("2+3. — signed 32-bit boundary (bit 31)", function () {
  assertAdjacentBarsDifferByOne(0x7fffffffn); // last value before bit 31 flips
  assertAdjacentBarsDifferByOne(0x80000000n);
});

test("2+3. — final value before 32-bit wrap, and wrap to first state", function () {
  assertAdjacentBarsDifferByOne(0xfffffffen);
  assertAdjacentBarsDifferByOne(0xffffffffn); // wraps to 0 at bar 2^32
  var gLast = state.grayStateForBar(0xffffffffn);
  var gWrap = state.grayStateForBar(0x100000000n);
  assert.strictEqual(hammingDistance32(gLast, gWrap), 1n);
});

// --- 4. Sixteen two-bit cells reconstruct the original 32-bit state --------
test("4. cells round-trip the full 32-bit state", function () {
  [0n, 1n, 0x12345678n, 0xffffffffn, 0xaaaaaaaan, 0x55555555n].forEach(function (s) {
    var cells = state.cellsFromState(s);
    assert.strictEqual(cells.length, 16);
    assert.strictEqual(state.stateFromCells(cells), s);
  });
});

// --- 5. 11/10/00/01 -> BOTH/A/REST/B ----------------------------------------
test("5. gate truth table", function () {
  assert.strictEqual(state.labelForBits(1, 1), "BOTH");
  assert.strictEqual(state.labelForBits(1, 0), "A");
  assert.strictEqual(state.labelForBits(0, 0), "REST");
  assert.strictEqual(state.labelForBits(0, 1), "B");
});

// --- 6. Row-major cell/step ordering is stable ------------------------------
test("6. row-major cell ordering is stable across calls", function () {
  var cellsA = state.cellsFromState(0x12345678n);
  var cellsB = state.cellsFromState(0x12345678n);
  for (var i = 0; i < 16; i++) {
    assert.strictEqual(cellsA[i].index, i);
    assert.strictEqual(cellsA[i].a, cellsB[i].a);
    assert.strictEqual(cellsA[i].b, cellsB[i].b);
  }
});

// --- 7. Bar and step timing calculations ------------------------------------
test("7. timing constants", function () {
  assert.strictEqual(config.CLOCK_MS, 2260);
  assert.ok(Math.abs(config.STEP_SECONDS - 0.14125) < 1e-12);
  assert.ok(Math.abs(config.BPM - 106.19469026548673) < 1e-9);
  assert.ok(Math.abs(config.REFERENCE_FREQUENCY - 226.54867256637168) < 1e-9);
  assert.strictEqual(config.REFERENCE_FREQUENCY, 512 / config.CLOCK_SECONDS);
});

test("7b. barIndexFromNow is a step function of elapsed CLOCK_MS", function () {
  var epoch = 1000000;
  assert.strictEqual(state.barIndexFromNow(epoch, epoch), 0n);
  assert.strictEqual(state.barIndexFromNow(epoch + 2259, epoch), 0n);
  assert.strictEqual(state.barIndexFromNow(epoch + 2260, epoch), 1n);
  assert.strictEqual(state.barIndexFromNow(epoch + 4519, epoch), 1n);
  assert.strictEqual(state.barIndexFromNow(epoch + 4520, epoch), 2n);
});

// --- 8. Next-boundary calculation before/on/after a boundary ----------------
test("8. next-boundary calculation", function () {
  var epoch = 1000000;
  // just after a boundary
  assert.strictEqual(state.msToNextBoundary(epoch + 1, epoch), config.CLOCK_MS - 1);
  // just before the next boundary
  assert.strictEqual(state.msToNextBoundary(epoch + config.CLOCK_MS - 1, epoch), 1);
  // exactly on a boundary — wait is a full bar, never zero (max initial wait = CLOCK_MS)
  assert.strictEqual(state.msToNextBoundary(epoch, epoch), config.CLOCK_MS);
  assert.strictEqual(state.msToNextBoundary(epoch + config.CLOCK_MS, epoch), config.CLOCK_MS);
  // always within (0, CLOCK_MS]
  for (var offset = 0; offset < config.CLOCK_MS; offset += 137) {
    var wait = state.msToNextBoundary(epoch + offset, epoch);
    assert.ok(wait > 0 && wait <= config.CLOCK_MS, "wait " + wait + " out of range at offset " + offset);
  }
});

// --- 9. Theme selection is deterministic (pattern-driven, not a timer) -----
test("9. themeIndexForBar is deterministic", function () {
  var a = state.themeIndexForBar(500n);
  var b = state.themeIndexForBar(500n);
  assert.strictEqual(a, b);
  assert.ok(a >= 0 && a < config.THEMES.length);
});

test("9b. bar 0 is always black (a fresh cycle always opens on a 'black' event)", function () {
  assert.strictEqual(state.themeIndexForBar(0n), config.PATTERN_BLACK_INDEX);
});

test("9c. theme index only changes exactly at a PATTERN_EVENTS offset, nowhere else", function () {
  var events = config.PATTERN_EVENTS;
  var eventOffsets = {};
  events.forEach(function (e) { eventOffsets[e.offset] = true; });
  var prev = state.themeIndexForBar(0n);
  for (var n = 1; n < config.PATTERN_CYCLE_LEN; n++) {
    var cur = state.themeIndexForBar(BigInt(n));
    if (cur !== prev) {
      assert.ok(eventOffsets[n], "theme changed at bar " + n + " but no PATTERN_EVENTS entry exists there");
    }
    prev = cur;
  }
});

test("9d. every advance/retreat/black/white event produces the expected transition", function () {
  var events = config.PATTERN_EVENTS;
  events.forEach(function (e) {
    var before = state.themeIndexForBar(BigInt(e.offset - 1 < 0 ? config.PATTERN_CYCLE_LEN - 1 : e.offset - 1));
    var at = state.themeIndexForBar(BigInt(e.offset));
    var count = config.THEMES.length;
    if (e.type === "black") {
      assert.strictEqual(at, config.PATTERN_BLACK_INDEX);
    } else if (e.type === "white") {
      assert.strictEqual(at, config.PATTERN_WHITE_INDEX);
    } else if (e.type === "advance") {
      assert.strictEqual(at, ((before + 1) % count + count) % count);
    } else if (e.type === "retreat") {
      assert.strictEqual(at, ((before - 1) % count + count) % count);
    }
  });
});

test("9e. the pattern repeats identically every PATTERN_CYCLE_LEN bars", function () {
  var cycleLen = BigInt(config.PATTERN_CYCLE_LEN);
  [0n, 1n, 26214n, 87381n, 131071n].forEach(function (offset) {
    var here = state.themeIndexForBar(offset);
    var nextCycle = state.themeIndexForBar(offset + cycleLen);
    var farCycle = state.themeIndexForBar(offset + cycleLen * 1000n);
    assert.strictEqual(nextCycle, here);
    assert.strictEqual(farCycle, here);
  });
});

// --- 10 & 11. Every theme has 16 positive finite ratios per lane -----------
test("10+11. every score has sixteen positive finite ratios per lane", function () {
  config.THEMES.forEach(function (theme) {
    var score = config.SCORES[theme.token];
    assert.ok(score, "missing score for theme " + theme.token);
    ["a", "b"].forEach(function (lane) {
      assert.strictEqual(score[lane].length, 16, theme.token + "." + lane + " must have 16 entries");
      score[lane].forEach(function (ratio) {
        assert.ok(Number.isFinite(ratio) && ratio > 0, theme.token + "." + lane + " ratio must be positive finite, got " + ratio);
      });
    });
  });
});

// --- 12. Every configured Colorplan token exists ----------------------------
test("12. every theme token resolves in the Colorplan data source", function () {
  var fs = require("fs");
  var colorplan = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "colorplan.json"), "utf8"));
  var slugs = {};
  colorplan.colors.forEach(function (c) { slugs[c.slug] = true; });
  config.THEMES.forEach(function (theme) {
    assert.ok(slugs[theme.token], "theme token \"" + theme.token + "\" not found in data/colorplan.json");
  });
  assert.ok(slugs[config.PATTERN_BLACK_TOKEN], "PATTERN_BLACK_TOKEN not found in data/colorplan.json");
  assert.ok(slugs[config.PATTERN_WHITE_TOKEN], "PATTERN_WHITE_TOKEN not found in data/colorplan.json");
});

test("12b. PATTERN_BLACK_INDEX/PATTERN_WHITE_INDEX resolve within THEMES", function () {
  assert.ok(config.PATTERN_BLACK_INDEX >= 0, "PATTERN_BLACK_TOKEN not found in THEMES");
  assert.ok(config.PATTERN_WHITE_INDEX >= 0, "PATTERN_WHITE_TOKEN not found in THEMES");
  assert.strictEqual(config.THEMES[config.PATTERN_BLACK_INDEX].token, config.PATTERN_BLACK_TOKEN);
  assert.strictEqual(config.THEMES[config.PATTERN_WHITE_INDEX].token, config.PATTERN_WHITE_TOKEN);
});

test("12c. every embedded THEME_HEXES value matches data/colorplan.json (catches transcription slips)", function () {
  var fs = require("fs");
  var colorplan = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "colorplan.json"), "utf8"));
  var hexBySlug = {};
  colorplan.colors.forEach(function (c) { hexBySlug[c.slug] = c.hex; });
  config.THEMES.forEach(function (theme) {
    assert.strictEqual(theme.hex, hexBySlug[theme.token],
      "theme \"" + theme.token + "\" hex " + theme.hex + " does not match data/colorplan.json's " + hexBySlug[theme.token]);
  });
});

// --- 13. Compact and large renderers produce the same base state -----------
test("13. compact and large renderers derive identical cells for one timestamp", function () {
  var now = Date.now();
  var cellsForCompact = state.cellsFromNow(now, config.SARC_EPOCH_MS);
  var cellsForLarge = state.cellsFromNow(now, config.SARC_EPOCH_MS);
  assert.deepStrictEqual(cellsForCompact, cellsForLarge);
});

// --- 14. Only the changed rune component receives a bar transition --------
test("14. diffCells identifies exactly the one changed component", function () {
  var prev = state.cellsFromState(0n);
  var next = state.cellsFromState(1n); // gray(1) = 1 ^ 0 = 1 -> cell0.a flips
  var diff = state.diffCells(prev, next);
  assert.deepStrictEqual(diff, { cellIndex: 0, component: "a" });

  var same = state.cellsFromState(0n);
  assert.strictEqual(state.diffCells(prev, same), null);
});

// --- 15. Audio emphasis targets the correct A/B component per gate state ---
test("15. gatesForCell matches the gate truth table for every combination", function () {
  [
    { a: 1, b: 1, label: "BOTH" },
    { a: 1, b: 0, label: "A" },
    { a: 0, b: 1, label: "B" },
    { a: 0, b: 0, label: "REST" }
  ].forEach(function (c) {
    var gates = state.gatesForCell(c);
    assert.strictEqual(gates.a, !!c.a);
    assert.strictEqual(gates.b, !!c.b);
    assert.strictEqual(state.labelForBits(c.a, c.b), c.label);
  });
});

// --- report ------------------------------------------------------------------
if (failures.length) {
  failures.forEach(function (f) {
    console.error("FAIL: " + f.name);
    console.error("      " + f.error.message);
  });
  console.error(passed + " passed, " + failures.length + " failed");
  process.exit(1);
} else {
  console.log("OK: " + passed + " clock state tests passed");
}
