#!/usr/bin/env node
// validate-clock-scores.js — standalone corpus validator for
// data/clock_scores.json, wired into `make check` (via `make
// clock-scores-validate`). Validates the FULL 55-color corpus in one pass:
//
//   1. every production clock theme has exactly one score;
//   2. no unknown score color exists;
//   3. every score has exactly 16 A values;
//   4. every score has exactly 16 B values;
//   5. every value parses as an exact rational number;
//   6. every ratio is reduced to canonical form;
//   7. every AUTHORED ratio is available from the configured pitch-class +
//      octave vocabulary (placeholder/unauthored scores are exempt from
//      this one check only — see the long comment on validateScoreRecord in
//      assets/js/clock-scores.js for why);
//   8. all resulting frequencies are finite and positive;
//   9. `authored` is boolean;
//  10. production can resolve every score without fallback failure (i.e.
//      resolveScore() never throws/produces NaN for any theme).
//
// Read-only, no network calls. Exits nonzero on any failure.
"use strict";

var fs = require("fs");
var path = require("path");

var config = require(path.join(__dirname, "..", "assets", "js", "clock-config.js"));
var scoresModule = require(path.join(__dirname, "..", "assets", "js", "clock-scores.js"));

var DATA_PATH = path.join(__dirname, "..", "data", "clock_scores.json");

var raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
var themeTokens = config.THEMES.map(function (t) { return t.token; });

var result = scoresModule.validateCorpus(raw, themeTokens); // checks 1-9 (authored-only vocabulary enforcement)

// Check 10 — production can resolve every score without fallback failure.
themeTokens.forEach(function (token) {
  var record = raw.scores[token];
  if (!record) return; // already reported as an error above
  try {
    var resolved = scoresModule.resolveScore(record, config.REFERENCE_FREQUENCY);
    ["a", "b"].forEach(function (lane) {
      resolved[lane].forEach(function (freq) {
        if (!isFinite(freq) || freq <= 0) {
          result.errors.push("theme \"" + token + "\" lane \"" + lane + "\" resolves to a non-finite/non-positive frequency");
        }
      });
    });
  } catch (err) {
    result.errors.push("theme \"" + token + "\" failed to resolve: " + err.message);
  }
});

var authoredCount = 0, placeholderCount = 0;
themeTokens.forEach(function (token) {
  var record = raw.scores[token];
  if (record && record.authored) authoredCount++;
  else if (record) placeholderCount++;
});

console.log("Themes checked:       " + themeTokens.length);
console.log("Scores in corpus:     " + Object.keys(raw.scores).length);
console.log("Authored:             " + authoredCount);
console.log("Placeholder:          " + placeholderCount);
console.log("Vocabulary size:      " + scoresModule.buildVocabulary(raw.pitchClasses, raw.octaveOffsets).length);

if (result.errors.length) {
  console.error("\nFAIL: " + result.errors.length + " error(s):");
  result.errors.forEach(function (e) { console.error("  - " + e); });
  process.exit(1);
}

console.log("\nOK: data/clock_scores.json is valid.");
