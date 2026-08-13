#!/usr/bin/env node
// materialize-clock-scores.js — one-time migration: converts the Eternal
// Clock's original RGB-derived placeholder pitch generator (formerly embedded
// in assets/js/clock-config.js as SCORES/RATIO_PALETTE/placeholderLane/
// placeholderScoreParams) into explicit exact-ratio-string data, written to
// data/clock_scores.json — see todo_clock.txt's "SCORE COMPOSITION TOOL"
// section for the full design.
//
// This script is meant to be run exactly ONCE (the commit that introduced
// data/clock_scores.json). It is kept in the repo as a record of how the
// placeholder generation worked and to let anyone re-derive/audit that
// mapping later; running it again would simply overwrite every score
// currently marked authored:false with the same deterministic values (any
// authored:true score is left untouched — see preserveAuthored below).
"use strict";

var fs = require("fs");
var path = require("path");

var config = require(path.join(__dirname, "..", "assets", "js", "clock-config.js"));
var scores = require(path.join(__dirname, "..", "assets", "js", "clock-scores.js"));

var OUT_PATH = path.join(__dirname, "..", "data", "clock_scores.json");
var STEPS_PER_BAR = config.STEPS_PER_BAR;

// --- Reproduce the retired placeholder generator, exactly, as ratio strings ---
// (formerly assets/js/clock-config.js's RATIO_PALETTE/placeholderLane/
// placeholderScoreParams — mirrored here as exact fraction strings instead of
// floats so materialization never round-trips through binary floating point).
var RATIO_PALETTE_STRINGS = [
  "1/1", "9/8", "5/4", "4/3", "3/2", "5/3", "15/8", "2/1",
  "9/4", "5/2", "8/3", "3/1", "15/4", "4/1", "9/2", "5/1"
];

function hexToRgb(hex) {
  var n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function placeholderScoreParams(hex) {
  var rgb = hexToRgb(hex);
  return [
    (rgb.r % 8) * 2 + 1,
    rgb.g % RATIO_PALETTE_STRINGS.length,
    (rgb.b % 8) * 2 + 1,
    (rgb.r + rgb.g + rgb.b) % RATIO_PALETTE_STRINGS.length
  ];
}

function placeholderLane(strideSteps, offsetSteps) {
  var lane = [];
  for (var i = 0; i < STEPS_PER_BAR; i++) {
    var idx = ((i * strideSteps + offsetSteps) % RATIO_PALETTE_STRINGS.length + RATIO_PALETTE_STRINGS.length) % RATIO_PALETTE_STRINGS.length;
    lane.push(RATIO_PALETTE_STRINGS[idx]);
  }
  return lane;
}

// --- Vocabulary (the composer's actual working palette going forward) -------
// Kept in sync with data/clock_scores.json's own pitchClasses/octaveOffsets
// by hand — re-running this script re-asserts these values unconditionally
// (see `out.pitchClasses = PITCH_CLASSES` below), so a stale copy here would
// silently clobber a deliberate vocabulary edit made directly to the JSON.
var PITCH_CLASSES = {
  core: ["1/1", "9/8", "4/3", "3/2"],
  color: ["16/15", "6/5", "8/5", "5/3", "7/4"]
};
var OCTAVE_OFFSETS = [-1, 0, 1];

// --- Build ---------------------------------------------------------------------
var existing = null;
if (fs.existsSync(OUT_PATH)) {
  existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
}

var mismatches = [];
var out = {
  version: 1,
  pitchClasses: PITCH_CLASSES,
  octaveOffsets: OCTAVE_OFFSETS,
  scores: {}
};

var authoredCount = 0;
var placeholderCount = 0;

config.THEMES.forEach(function (theme) {
  var token = theme.token;

  // Never clobber a score a composer has already authored and saved — this
  // script is a one-time bootstrap, not a generator that runs on every build.
  var existingRecord = existing && existing.scores && existing.scores[token];
  if (existingRecord && existingRecord.authored === true) {
    out.scores[token] = existingRecord;
    authoredCount++;
    return;
  }

  var params = placeholderScoreParams(theme.hex);
  var a = placeholderLane(params[0], params[1]);
  var b = placeholderLane(params[2], params[3]);

  // Verify against the (still importable, pre-removal) numeric generator —
  // this is the "evaluate the current generated sequence... verify
  // before/after scores are numerically identical" step from the migration
  // brief. config.SCORES still exists at the moment this script is run
  // (before the production-audio refactor removes it).
  if (config.SCORES && config.SCORES[token]) {
    ["a", "b"].forEach(function (lane) {
      var generated = lane === "a" ? a : b;
      var previous = config.SCORES[token][lane];
      generated.forEach(function (ratioStr, i) {
        var value = scores.ratioValue(ratioStr);
        var prevValue = previous[i];
        if (Math.abs(value - prevValue) > 1e-9) {
          mismatches.push(token + "." + lane + "[" + i + "]: " + value + " != " + prevValue);
        }
      });
    });
  }

  out.scores[token] = { authored: false, a: a, b: b };
  placeholderCount++;
});

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");

// --- Report --------------------------------------------------------------------
var themeCount = config.THEMES.length;
var totalPositions = themeCount * STEPS_PER_BAR * 2;
var vocab = scores.buildVocabulary(PITCH_CLASSES, OCTAVE_OFFSETS);

console.log("ColorPlan themes found:     " + themeCount);
console.log("Scores materialized:        " + Object.keys(out.scores).length);
console.log("A values per score:         " + STEPS_PER_BAR);
console.log("B values per score:         " + STEPS_PER_BAR);
console.log("Total pitch positions:      " + totalPositions);
console.log("Placeholder scores:         " + placeholderCount);
console.log("Authored scores:            " + authoredCount);
console.log("Allowed interval classes:   core=" + PITCH_CLASSES.core.join(",") + " color=" + PITCH_CLASSES.color.join(","));
console.log("Allowed octave offsets:     " + OCTAVE_OFFSETS.join(", ") + "  (" + vocab.length + " total vocabulary ratios)");
console.log("Production score source:    data/clock_scores.json");
console.log("Editor route:               /clock/compose/ (draft, make clock-compose)");
console.log("Save command:               make clock-compose");

if (mismatches.length) {
  console.error("\nWARNING: " + mismatches.length + " placeholder value(s) did not numerically match the retired generator:");
  mismatches.slice(0, 20).forEach(function (m) { console.error("  " + m); });
  process.exitCode = 1;
} else if (config.SCORES) {
  console.log("\nOK: every materialized placeholder value matches the retired RGB-derived generator exactly.");
}
