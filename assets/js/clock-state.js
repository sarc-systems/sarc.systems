// clock-state.js — SARC Eternal Clock: pure state functions.
// No DOM, no timers, no randomness. Every function here is a pure function of
// its inputs so the exact same code path is exercised by the browser and by
// scripts/test-clock.mjs. Uses BigInt throughout for the 32-bit Gray state —
// ordinary JS bitwise operators sign-convert to 32-bit signed and would
// corrupt bit 31.
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./clock-config.js"));
  } else {
    root.SARCClock = root.SARCClock || {};
    root.SARCClock.state = factory(root.SARCClock.config);
  }
})(typeof self !== "undefined" ? self : this, function (config) {
  "use strict";

  var MASK_32 = 0xffffffffn;
  var CYCLE_32 = 1n << 32n; // 2^32 bars (~308 years) — one full Gray-code cycle

  // barIndex = number of whole CLOCK_MS bars elapsed since SARC_EPOCH_MS.
  function barIndexFromNow(nowMs, epochMs) {
    epochMs = epochMs == null ? config.SARC_EPOCH_MS : epochMs;
    var elapsed = Math.floor(nowMs - epochMs);
    var bars = Math.floor(elapsed / config.CLOCK_MS);
    return BigInt(bars);
  }

  // Binary-reflected Gray code: gray = n ^ (n >> 1). barIndex is wrapped mod
  // 2^32 *before* encoding, not just masked after: XOR-ing an ever-growing,
  // never-wrapped barIndex and then truncating to 32 bits breaks the
  // single-bit-transition property exactly once every 2^32 bars (~308
  // years) — the one bit that actually changes at that boundary is bit 32,
  // outside the mask, so two adjacent bars would truncate to the identical
  // 32-bit value. Wrapping first restarts a clean, valid 32-bit Gray cycle
  // every 2^32 bars instead.
  function grayStateForBar(barIndex) {
    var wrapped = ((barIndex % CYCLE_32) + CYCLE_32) % CYCLE_32;
    var gray = wrapped ^ (wrapped >> 1n);
    return gray & MASK_32;
  }

  function grayStateFromNow(nowMs, epochMs) {
    return grayStateForBar(barIndexFromNow(nowMs, epochMs));
  }

  // Exact 2x2 gate truth table from todo_clock.txt: 11=BOTH 10=A 00=REST 01=B.
  function labelForBits(aBit, bBit) {
    if (aBit && bBit) return "BOTH";
    if (aBit) return "A";
    if (bBit) return "B";
    return "REST";
  }

  // Splits the 32-bit state into sixteen two-bit cells, row-major,
  // cell 0 = upper-left / musical step 1 ... cell 15 = lower-right / step 16.
  // Fixed, documented bit order: cell i reads bits (2i, 2i+1) of the 32-bit
  // value (cell 0 = the two least-significant bits, cell 15 = the two most
  // significant). Arbitrary but stable — any fixed bijection would satisfy
  // "sixteen two-bit cells reconstruct the original state"; this is the one
  // this implementation commits to.
  function cellsFromState(state) {
    var cells = [];
    for (var i = 0; i < config.STEPS_PER_BAR; i++) {
      var shift = BigInt(2 * i);
      var a = Number((state >> shift) & 1n);
      var b = Number((state >> (shift + 1n)) & 1n);
      cells.push({ index: i, a: a, b: b, label: labelForBits(a, b) });
    }
    return cells;
  }

  // Inverse of cellsFromState — reconstructs the 32-bit state from sixteen
  // {a,b} cells in the same fixed order. Used by tests to round-trip.
  function stateFromCells(cells) {
    var state = 0n;
    for (var i = 0; i < cells.length; i++) {
      var shift = BigInt(2 * i);
      if (cells[i].a) state |= (1n << shift);
      if (cells[i].b) state |= (1n << (shift + 1n));
    }
    return state & MASK_32;
  }

  function cellsFromNow(nowMs, epochMs) {
    return cellsFromState(grayStateFromNow(nowMs, epochMs));
  }

  // Absolute ms timestamp of the *current* bar's own boundary (<=nowMs).
  function currentBoundaryMs(nowMs, epochMs) {
    epochMs = epochMs == null ? config.SARC_EPOCH_MS : epochMs;
    var barIndex = barIndexFromNow(nowMs, epochMs);
    return epochMs + Number(barIndex) * config.CLOCK_MS;
  }

  // Absolute ms timestamp of the *next* bar boundary strictly after nowMs,
  // except when nowMs falls exactly on a boundary, in which case the "next"
  // boundary is one full bar ahead (the wait is never zero, never more than
  // one full CLOCK_MS — matches "maximum initial wait: 2.26 seconds").
  function nextBoundaryTimestamp(nowMs, epochMs) {
    return currentBoundaryMs(nowMs, epochMs) + config.CLOCK_MS;
  }

  function msToNextBoundary(nowMs, epochMs) {
    return nextBoundaryTimestamp(nowMs, epochMs) - nowMs;
  }

  // Theme selection is driven by OBSERVING the visible pattern, not a timer —
  // see clock-config.js's PATTERN_* constants and generate-clock-pattern-events.js
  // for the full derivation, including why drift (advance/retreat) and reset
  // (black/white) deliberately watch different-sized cell sets so a reset is
  // meaningfully rarer than an ordinary drift step. `clockState` is accepted
  // (matching the original documented signature) but unused — the trigger
  // events already fully encode the pattern condition, precomputed offline.
  //
  // config.PATTERN_EVENTS is the fixed, exactly-repeating sequence of events
  // within one PATTERN_CYCLE_LEN-bar cycle (offset 0 is always a "black"
  // jump — trivially true since wrapping the bar index to a cycle boundary
  // zeroes every bit the watched cells depend on, forcing them all to REST).
  // Advance/retreat events accumulate as drift; a black/white event resets
  // the baseline outright. Because every cycle nets exactly zero drift
  // (config.PATTERN_EVENTS always contains equal advance/retreat counts) and
  // always contains a "black" event at offset 0, the current theme index
  // only ever depends on events within the CURRENT cycle up to the current
  // offset — no multi-cycle history walk is needed.
  function themeIndexForBar(barIndex) {
    var cycleLen = BigInt(config.PATTERN_CYCLE_LEN);
    var wrapped = ((barIndex % cycleLen) + cycleLen) % cycleLen; // guard: barIndex can be negative before the epoch
    var offset = Number(wrapped);
    var events = config.PATTERN_EVENTS;

    var anchorOffset = 0;
    var anchorType = "black";
    var drift = 0;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.offset > offset) break;
      if (e.type === "black" || e.type === "white") {
        anchorOffset = e.offset;
        anchorType = e.type;
        drift = 0; // reset — only events strictly after the new anchor count
      } else if (e.offset > anchorOffset) {
        if (e.type === "advance") drift += 1;
        else if (e.type === "retreat") drift -= 1;
      }
    }

    var baseIndex = anchorType === "black" ? config.PATTERN_BLACK_INDEX : config.PATTERN_WHITE_INDEX;
    var themeCount = config.THEMES.length;
    var idx = (baseIndex + drift) % themeCount;
    if (idx < 0) idx += themeCount;
    return idx;
  }

  function themeForBar(barIndex, clockState) {
    return config.THEMES[themeIndexForBar(barIndex, clockState)];
  }

  // Finds the single {cellIndex, component} that differs between two
  // same-length cell arrays (row-major, matching cellsFromState's order).
  // Returns null if identical. Used to animate only the changed rune and to
  // assert the one-component-per-boundary invariant in tests.
  function diffCells(prevCells, nextCells) {
    for (var i = 0; i < nextCells.length; i++) {
      var prev = prevCells[i];
      var next = nextCells[i];
      if (!prev) continue;
      if (prev.a !== next.a) return { cellIndex: i, component: "a" };
      if (prev.b !== next.b) return { cellIndex: i, component: "b" };
    }
    return null;
  }

  // Which envelopes a cell's gate should trigger this step — identical to the
  // cell's own {a,b} flags by construction (see the truth table above), kept
  // as a named function for clarity at audio call sites and in tests.
  function gatesForCell(cell) {
    return { a: !!cell.a, b: !!cell.b };
  }

  return {
    barIndexFromNow: barIndexFromNow,
    grayStateForBar: grayStateForBar,
    grayStateFromNow: grayStateFromNow,
    labelForBits: labelForBits,
    cellsFromState: cellsFromState,
    stateFromCells: stateFromCells,
    cellsFromNow: cellsFromNow,
    currentBoundaryMs: currentBoundaryMs,
    nextBoundaryTimestamp: nextBoundaryTimestamp,
    msToNextBoundary: msToNextBoundary,
    themeIndexForBar: themeIndexForBar,
    themeForBar: themeForBar,
    diffCells: diffCells,
    gatesForCell: gatesForCell
  };
});
