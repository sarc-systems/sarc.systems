// clock-scores.js — SARC Eternal Clock: just-intonation ratio math + canonical
// score resolution/validation. Pure functions only (no DOM, no AudioContext,
// no filesystem) — the same code path runs in the browser (production /clock/
// audio, the /clock/compose/ editor), in the local save-bridge server
// (scripts/clock-compose-server.js), and in plain-Node tests/validators, same
// dual-module pattern as clock-config.js/clock-state.js.
//
// Data model: a pitch is stored as an exact reduced-fraction string ("3/2"),
// never a float. This file owns all the arithmetic on that representation —
// data/clock_scores.json owns the actual authored/placeholder values and the
// pitchClasses/octaveOffsets vocabulary definition; nothing here hard-codes
// the interval list itself, so widening the vocabulary later is a data change
// only.
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SARCClock = root.SARCClock || {};
    root.SARCClock.scores = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RATIO_RE = /^([1-9][0-9]*)\/([1-9][0-9]*)$/;

  // --- Exact rational arithmetic ---------------------------------------------

  // Parses "p/q" (positive integers only — this vocabulary never needs signed
  // or zero ratios). Returns {num, den} or null if the string isn't of that
  // exact shape (no whitespace, no leading zeros, no decimals).
  function parseRatio(str) {
    if (typeof str !== "string") return null;
    var m = RATIO_RE.exec(str);
    if (!m) return null;
    return { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  // Reduces a {num, den} pair to lowest terms. Both inputs must be positive
  // integers (see parseRatio) — this is not a general rational-arithmetic
  // module, just enough for this vocabulary.
  function reduce(num, den) {
    var g = gcd(num, den);
    return { num: num / g, den: den / g };
  }

  function toRatioString(num, den) {
    var r = reduce(num, den);
    return r.num + "/" + r.den;
  }

  // Numeric frequency-multiplier value of a ratio string. NaN if malformed.
  function ratioValue(str) {
    var r = parseRatio(str);
    if (!r) return NaN;
    return r.num / r.den;
  }

  // True only if `str` is syntactically valid AND already in lowest terms —
  // the canonical storage form required throughout data/clock_scores.json.
  function isCanonicalRatio(str) {
    var r = parseRatio(str);
    if (!r) return false;
    var reduced = reduce(r.num, r.den);
    return reduced.num === r.num && reduced.den === r.den;
  }

  // Applies integer octave displacement (may be negative) to a base ratio
  // string, returning a new canonical ratio string. "3/2" at -1 -> "3/4";
  // at +1 -> "3/1". Octave folding is multiplicative (x2^offset), never a
  // separate harmonic class — see CLAUDE.md-adjacent spec in todo_clock.txt.
  function applyOctave(baseRatioStr, octaveOffset) {
    var r = parseRatio(baseRatioStr);
    if (!r) return null;
    var num = r.num, den = r.den;
    if (octaveOffset > 0) num = num * Math.pow(2, octaveOffset);
    else if (octaveOffset < 0) den = den * Math.pow(2, -octaveOffset);
    return toRatioString(num, den);
  }

  // --- Vocabulary --------------------------------------------------------------

  // Flattens {core:[...], color:[...]} pitch classes x octaveOffsets into the
  // full list of permitted canonical ratio strings, each tagged with its
  // origin (base ratio, category, octave) for editor display, sorted
  // ascending by frequency value. Duplicate canonical ratios across different
  // (base, octave) pairs collapse to one vocabulary entry, keeping the first
  // (lowest |octave|, then core-before-color, then declaration order) —
  // pathological but not disallowed if an editor ever adds overlapping
  // classes.
  function buildVocabulary(pitchClasses, octaveOffsets) {
    pitchClasses = pitchClasses || {};
    octaveOffsets = octaveOffsets || [0];
    var core = pitchClasses.core || [];
    var color = pitchClasses.color || [];
    var seen = {};
    var entries = [];

    function addAll(list, category) {
      list.forEach(function (base) {
        octaveOffsets.forEach(function (octave) {
          var ratio = applyOctave(base, octave);
          if (!ratio) return;
          if (seen[ratio]) return;
          seen[ratio] = true;
          entries.push({
            ratio: ratio,
            value: ratioValue(ratio),
            base: base,
            category: category,
            octave: octave
          });
        });
      });
    }

    addAll(core, "core");
    addAll(color, "color");
    entries.sort(function (a, b) { return a.value - b.value; });
    return entries;
  }

  function vocabularySet(pitchClasses, octaveOffsets) {
    var set = {};
    buildVocabulary(pitchClasses, octaveOffsets).forEach(function (e) { set[e.ratio] = true; });
    return set;
  }

  // --- Score resolution (canonical ratio strings -> playable frequencies) ----

  // `lane` is an array of 16 canonical ratio strings (score.a or score.b).
  // Returns an array of 16 finite positive Hz values. Assumes validated input
  // (see validateCorpus below) — production/editor code should never call
  // this on unvalidated data.
  function resolveLane(lane, referenceFrequency) {
    return lane.map(function (ratioStr) {
      return referenceFrequency * ratioValue(ratioStr);
    });
  }

  function resolveScore(record, referenceFrequency) {
    return {
      authored: !!record.authored,
      a: resolveLane(record.a, referenceFrequency),
      b: resolveLane(record.b, referenceFrequency)
    };
  }

  // --- Corpus validation -------------------------------------------------------
  // Shared by: scripts/validate-clock-scores.js (wired into `make check`),
  // scripts/clock-compose-server.js (per-save validation before writing), and
  // the /clock/compose/ editor (pre-save client-side check, same rules).
  //
  // `enforceVocabulary` controls whether every ratio must be a member of the
  // configured pitch-class/octave vocabulary. Authored scores always enforce
  // it (the vocabulary is the composer's actual working palette). Unauthored
  // placeholder scores (materialized once from the pre-composer RGB-derived
  // generator — see scripts/materialize-clock-scores.js) are exempt from
  // *this one* check only: they predate the vocabulary and exist purely so
  // every theme has a non-degenerate placeholder sound until a human replaces
  // it, not to demonstrate conformance with a constraint invented after they
  // were generated. Every other structural check (color set, lane length,
  // canonical form, finite/positive frequency, authored-is-boolean) applies
  // to placeholder and authored scores alike.
  function validateScoreRecord(token, record, vocabSet, opts) {
    opts = opts || {};
    var errors = [];
    if (!record || typeof record !== "object") {
      return ["score \"" + token + "\" is missing or not an object"];
    }
    if (typeof record.authored !== "boolean") {
      errors.push("score \"" + token + "\".authored must be a boolean");
    }
    var enforceVocab = opts.alwaysEnforceVocabulary || record.authored === true;

    ["a", "b"].forEach(function (lane) {
      var values = record[lane];
      if (!Array.isArray(values) || values.length !== 16) {
        errors.push("score \"" + token + "\"." + lane + " must be an array of exactly 16 ratio strings");
        return;
      }
      values.forEach(function (str, i) {
        var r = parseRatio(str);
        if (!r) {
          errors.push("score \"" + token + "\"." + lane + "[" + i + "] \"" + str + "\" is not a valid \"p/q\" ratio string");
          return;
        }
        if (!isCanonicalRatio(str)) {
          errors.push("score \"" + token + "\"." + lane + "[" + i + "] \"" + str + "\" is not reduced to lowest terms");
        }
        var value = r.num / r.den;
        if (!isFinite(value) || value <= 0) {
          errors.push("score \"" + token + "\"." + lane + "[" + i + "] resolves to a non-finite/non-positive frequency multiplier");
        }
        if (enforceVocab && vocabSet && !vocabSet[str] && isCanonicalRatio(str)) {
          errors.push("score \"" + token + "\"." + lane + "[" + i + "] \"" + str + "\" is not in the configured pitch-class/octave vocabulary");
        }
      });
    });

    return errors;
  }

  // `raw` is the full parsed data/clock_scores.json object. `themeTokens` is
  // the production clock's own ordered THEMES list (config.THEMES.map(t =>
  // t.token)) — the corpus's color-key set must equal this exactly, in
  // either direction (checks 1+2 from todo_clock.txt's composer spec).
  function validateCorpus(raw, themeTokens, opts) {
    opts = opts || {};
    var errors = [];
    if (!raw || typeof raw !== "object" || !raw.scores || typeof raw.scores !== "object") {
      return { errors: ["data/clock_scores.json is missing a top-level \"scores\" object"], warnings: [] };
    }

    var vocabSet = vocabularySet(raw.pitchClasses, raw.octaveOffsets);
    var themeSet = {};
    themeTokens.forEach(function (t) { themeSet[t] = true; });

    var scoreKeys = Object.keys(raw.scores);
    var scoreKeySet = {};
    scoreKeys.forEach(function (k) { scoreKeySet[k] = true; });

    themeTokens.forEach(function (token) {
      if (!scoreKeySet[token]) errors.push("theme \"" + token + "\" has no score in data/clock_scores.json");
    });
    scoreKeys.forEach(function (token) {
      if (!themeSet[token]) errors.push("data/clock_scores.json has an unknown score color \"" + token + "\" (not a current production theme)");
    });

    scoreKeys.forEach(function (token) {
      var recordErrors = validateScoreRecord(token, raw.scores[token], vocabSet, opts);
      errors = errors.concat(recordErrors);
    });

    return { errors: errors, warnings: [] };
  }

  return {
    parseRatio: parseRatio,
    gcd: gcd,
    reduce: reduce,
    toRatioString: toRatioString,
    ratioValue: ratioValue,
    isCanonicalRatio: isCanonicalRatio,
    applyOctave: applyOctave,
    buildVocabulary: buildVocabulary,
    vocabularySet: vocabularySet,
    resolveLane: resolveLane,
    resolveScore: resolveScore,
    validateScoreRecord: validateScoreRecord,
    validateCorpus: validateCorpus
  };
});
