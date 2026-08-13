#!/usr/bin/env node
// clock-compose-server.js — SARC Eternal Clock: local save bridge for
// /clock/compose/. A small, loopback-only Node HTTP server whose only job is
// validating and writing one color's score into data/clock_scores.json.
// Never deployed, never started by any production path — only by
// `make clock-compose` (see Makefile). Built-in modules only (http, fs,
// path, crypto) — no npm dependency, matching scripts/import-colorplan.mjs's
// "pure/offline" precedent.
//
// Design: validate/normalize/apply logic (applyScoreUpdate) is a PURE
// function of (current corpus, payload, known theme tokens) — no fs, no
// network — so it's directly unit-testable (see
// scripts/test-clock-compose-server.js) without spinning up a real server or
// touching disk. startServer() is the thin HTTP/fs layer around it.
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var config = require(path.join(__dirname, "..", "assets", "js", "clock-config.js"));
var scoresModule = require(path.join(__dirname, "..", "assets", "js", "clock-scores.js"));

var DATA_PATH = path.join(__dirname, "..", "data", "clock_scores.json");
var HOST = "127.0.0.1";
var PORT = 8471;
var MAX_BODY_BYTES = 64 * 1024;
var ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

var THEME_TOKENS = config.THEMES.map(function (t) { return t.token; });

// --- Pure validation/normalization/apply --------------------------------------

// `raw` = full parsed data/clock_scores.json. `payload` = { token, a, b }
// from the editor (a/b are arrays of 16 possibly-non-canonical ratio
// strings). Returns { ok: true, doc, record } or { ok: false, errors }.
// Never mutates `raw` — callers that want the write-to-disk side effect use
// the returned `doc`.
function applyScoreUpdate(raw, payload, themeTokens) {
  var errors = [];

  if (!raw || typeof raw !== "object" || !raw.scores || typeof raw.scores !== "object") {
    return { ok: false, errors: ["corpus is missing a top-level \"scores\" object"] };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }

  var token = payload.token;
  if (typeof token !== "string" || !token) {
    errors.push("\"token\" is required and must be a string");
  } else if (themeTokens.indexOf(token) === -1) {
    errors.push("\"" + token + "\" is not a known production clock theme");
  }

  ["a", "b"].forEach(function (lane) {
    if (!Array.isArray(payload[lane]) || payload[lane].length !== 16) {
      errors.push("\"" + lane + "\" must be an array of exactly 16 ratio strings");
    }
  });

  if (errors.length) return { ok: false, errors: errors };

  var vocabSet = scoresModule.vocabularySet(raw.pitchClasses, raw.octaveOffsets);
  var normalized = { a: [], b: [] };

  ["a", "b"].forEach(function (lane) {
    payload[lane].forEach(function (str, i) {
      var r = scoresModule.parseRatio(str);
      if (!r) {
        errors.push(lane + "[" + i + "] \"" + str + "\" is not a valid \"p/q\" ratio string");
        return;
      }
      // Normalize (reduce) rather than reject non-canonical input — see
      // clock-compose.js's "Save behavior" design note: the composer's UI
      // only ever offers already-canonical vocabulary entries, but the
      // bridge normalizes defensively rather than trusting the client.
      var canonical = scoresModule.toRatioString(r.num, r.den);
      if (!vocabSet[canonical]) {
        errors.push(lane + "[" + i + "] \"" + canonical + "\" is not in the configured pitch-class/octave vocabulary");
        return;
      }
      normalized[lane].push(canonical);
    });
  });

  if (errors.length) return { ok: false, errors: errors };

  var record = { authored: true, a: normalized.a, b: normalized.b };

  // Shallow-clone top-level + .scores so key insertion order (and therefore
  // JSON.stringify's own key order — stable, readable diffs) is preserved:
  // mutating a plain-object clone's EXISTING key in place never reorders it;
  // only a brand-new key would be appended at the end, which can't happen
  // here since `token` was already validated as an existing production
  // theme, i.e. an existing key in raw.scores.
  var nextScores = {};
  Object.keys(raw.scores).forEach(function (k) { nextScores[k] = raw.scores[k]; });
  nextScores[token] = record;

  var doc = {
    version: raw.version,
    pitchClasses: raw.pitchClasses,
    octaveOffsets: raw.octaveOffsets,
    scores: nextScores
  };

  return { ok: true, doc: doc, record: record };
}

// --- Atomic write ----------------------------------------------------------------
function writeCorpusAtomic(doc, targetPath) {
  targetPath = targetPath || DATA_PATH;
  var tmpPath = targetPath + ".tmp-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
  fs.writeFileSync(tmpPath, JSON.stringify(doc, null, 2) + "\n");
  fs.renameSync(tmpPath, targetPath);
}

// --- HTTP layer --------------------------------------------------------------------
function readBody(req, cb) {
  var chunks = [];
  var total = 0;
  var tooBig = false;
  req.on("data", function (chunk) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      // Deliberately do NOT req.destroy() here — that can tear down the
      // underlying socket before a 413 response ever gets written, which
      // surfaces to the client as a raw connection error instead of a clean
      // HTTP response. Just stop retaining chunks (bounding memory) and keep
      // draining to 'end' so the response can still be sent normally.
      tooBig = true;
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", function () {
    if (tooBig) return cb(new Error("request body too large"));
    cb(null, Buffer.concat(chunks).toString("utf8"));
  });
  req.on("error", cb);
}

function withCors(req, res) {
  var origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return true;
  }
  return false;
}

function sendJSON(res, status, body) {
  var text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function handleSaveScore(req, res, dataPath) {
  readBody(req, function (err, text) {
    if (err) return sendJSON(res, 413, { ok: false, errors: [err.message] });

    var payload;
    try {
      payload = JSON.parse(text);
    } catch (parseErr) {
      return sendJSON(res, 400, { ok: false, errors: ["malformed JSON: " + parseErr.message] });
    }

    var raw;
    try {
      raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch (readErr) {
      return sendJSON(res, 500, { ok: false, errors: ["could not read " + dataPath + ": " + readErr.message] });
    }

    var result = applyScoreUpdate(raw, payload, THEME_TOKENS);
    if (!result.ok) return sendJSON(res, 422, { ok: false, errors: result.errors });

    try {
      writeCorpusAtomic(result.doc, dataPath);
    } catch (writeErr) {
      return sendJSON(res, 500, { ok: false, errors: ["could not write " + dataPath + ": " + writeErr.message] });
    }

    console.log("[clock-compose-server] saved " + payload.token);
    sendJSON(res, 200, { ok: true, record: result.record });
  });
}

// Factory so tests can point the whole HTTP layer at a throwaway temp file
// instead of the real data/clock_scores.json — see
// scripts/test-clock-compose-server.js. `dataPath` defaults to the real
// canonical file for normal (non-test) use.
function createRequestListener(dataPath) {
  dataPath = dataPath || DATA_PATH;
  return function requestListener(req, res) {
    var corsOk = withCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(corsOk ? 204 : 403);
      res.end();
      return;
    }

    if (req.url === "/api/save-score" && req.method === "POST") {
      if (!corsOk) return sendJSON(res, 403, { ok: false, errors: ["origin not allowed"] });
      return handleSaveScore(req, res, dataPath);
    }

    sendJSON(res, 404, { ok: false, errors: ["not found"] });
  };
}

function startServer() {
  var server = http.createServer(createRequestListener(DATA_PATH));
  server.listen(PORT, HOST, function () {
    console.log("[clock-compose-server] listening on http://" + HOST + ":" + PORT + " (loopback only)");
    console.log("[clock-compose-server] writing to " + DATA_PATH);
  });
  return server;
}

module.exports = {
  applyScoreUpdate: applyScoreUpdate,
  writeCorpusAtomic: writeCorpusAtomic,
  createRequestListener: createRequestListener,
  startServer: startServer,
  DATA_PATH: DATA_PATH,
  THEME_TOKENS: THEME_TOKENS,
  ALLOWED_ORIGIN_RE: ALLOWED_ORIGIN_RE
};

if (require.main === module) {
  startServer();
}
