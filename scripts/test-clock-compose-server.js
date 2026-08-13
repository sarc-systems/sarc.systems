#!/usr/bin/env node
// test-clock-compose-server.js — tests for the /clock/compose/ local save
// bridge (scripts/clock-compose-server.js). Same plain-Node/no-runner style
// as scripts/test-clock.js. Run with `node scripts/test-clock-compose-server.js`
// or `make clock-compose-test`.
//
// Two layers: (1) applyScoreUpdate — the pure validate/normalize/apply
// function — tested directly, no server/disk involved; (2) a handful of real
// HTTP round-trips against an ephemeral-port server pointed at a throwaway
// temp copy of the corpus, to cover the parts applyScoreUpdate can't (CORS,
// malformed JSON at the transport level, body size, atomic write to disk).
"use strict";

var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");

var bridge = require(path.join(__dirname, "clock-compose-server.js"));
var applyScoreUpdate = bridge.applyScoreUpdate;
var config = require(path.join(__dirname, "..", "assets", "js", "clock-config.js"));

var passed = 0;
var failures = [];
var pendingAsync = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name: name, error: err });
  }
}
// Queues an async test rather than awaiting inline — every call site below is
// a bare top-level statement (no `await`), so this just registers a promise;
// main() awaits them all together at the end before reporting.
function asyncTest(name, fn) {
  pendingAsync.push(
    Promise.resolve().then(fn).then(
      function () { passed++; },
      function (err) { failures.push({ name: name, error: err }); }
    )
  );
}

// --- Fixtures ----------------------------------------------------------------------
var TOKENS = ["fixture-a", "fixture-b", "fixture-c"];
function validLane16() {
  // 16 entries alternating two in-vocabulary core ratios.
  var lane = [];
  for (var i = 0; i < 16; i++) lane.push(i % 2 === 0 ? "3/2" : "4/3");
  return lane;
}
function fixtureCorpus() {
  var scores = {};
  TOKENS.forEach(function (t) {
    scores[t] = { authored: false, a: validLane16(), b: validLane16() };
  });
  return {
    version: 1,
    pitchClasses: { core: ["1/1", "9/8", "4/3", "3/2"], color: ["6/5", "5/4", "8/5", "5/3", "7/4"] },
    octaveOffsets: [-1, 0, 1],
    scores: scores
  };
}

// --- Pure applyScoreUpdate tests -----------------------------------------------------

test("valid one-color save", function () {
  var raw = fixtureCorpus();
  var payload = { token: "fixture-b", a: validLane16(), b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.record.authored, true);
  assert.strictEqual(result.record.a.length, 16);
  assert.strictEqual(result.record.b.length, 16);
  assert.strictEqual(result.doc.scores["fixture-b"], result.record);
});

test("unknown color rejection", function () {
  var raw = fixtureCorpus();
  var payload = { token: "not-a-real-color", a: validLane16(), b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) { return /not a known production clock theme/.test(e); }));
});

test("wrong lane length rejection (too short)", function () {
  var raw = fixtureCorpus();
  var payload = { token: "fixture-a", a: ["3/2", "4/3"], b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) { return /"a" must be an array of exactly 16/.test(e); }));
});

test("wrong lane length rejection (too long)", function () {
  var raw = fixtureCorpus();
  var lane17 = validLane16().concat(["3/2"]);
  var payload = { token: "fixture-a", a: lane17, b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, false);
});

test("malformed ratio rejection", function () {
  var raw = fixtureCorpus();
  var a = validLane16();
  a[3] = "not-a-ratio";
  var payload = { token: "fixture-a", a: a, b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) { return e.indexOf("a[3]") === 0 && /not a valid/.test(e); }));
});

test("malformed ratio rejection — decimal, negative, zero-denominator forms", function () {
  var raw = fixtureCorpus();
  ["1.5", "-3/2", "3/0", "3/-2", "", "3 / 2", "03/2"].forEach(function (bad) {
    var a = validLane16();
    a[0] = bad;
    var result = applyScoreUpdate(raw, { token: "fixture-a", a: a, b: validLane16() }, TOKENS);
    assert.strictEqual(result.ok, false, "expected \"" + bad + "\" to be rejected");
  });
});

test("out-of-vocabulary ratio rejection", function () {
  var raw = fixtureCorpus();
  var a = validLane16();
  a[5] = "17/13"; // syntactically valid, canonical, but nowhere near the vocabulary
  var payload = { token: "fixture-a", a: a, b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(function (e) { return /not in the configured pitch-class\/octave vocabulary/.test(e); }));
});

test("non-reduced ratio is normalized (reduced), not rejected", function () {
  var raw = fixtureCorpus();
  var a = validLane16();
  a[0] = "6/4"; // == 3/2, not in lowest terms
  var payload = { token: "fixture-a", a: a, b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.record.a[0], "3/2");
});

test("editing one color leaves every other score unchanged", function () {
  var raw = fixtureCorpus();
  var beforeA = raw.scores["fixture-a"];
  var beforeC = raw.scores["fixture-c"];
  var payload = { token: "fixture-b", a: validLane16(), b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.doc.scores["fixture-a"], beforeA, "fixture-a record should be the SAME reference, untouched");
  assert.strictEqual(result.doc.scores["fixture-c"], beforeC, "fixture-c record should be the SAME reference, untouched");
  // Original input object is never mutated.
  assert.notStrictEqual(raw.scores["fixture-b"], result.doc.scores["fixture-b"]);
});

test("key order is preserved (stable diffs)", function () {
  var raw = fixtureCorpus();
  var payload = { token: "fixture-b", a: validLane16(), b: validLane16() };
  var result = applyScoreUpdate(raw, payload, TOKENS);
  assert.deepStrictEqual(Object.keys(result.doc.scores), TOKENS);
});

test("missing token / non-string token rejected", function () {
  var raw = fixtureCorpus();
  [undefined, null, 42, "", {}].forEach(function (bad) {
    var result = applyScoreUpdate(raw, { token: bad, a: validLane16(), b: validLane16() }, TOKENS);
    assert.strictEqual(result.ok, false, "expected token " + JSON.stringify(bad) + " to be rejected");
  });
});

test("path-like token values are rejected exactly like any other unknown color (no path is ever touched)", function () {
  var raw = fixtureCorpus();
  ["../../etc/passwd", "/etc/passwd", "..\\..\\windows\\system32", "fixture-a/../fixture-b"].forEach(function (bad) {
    var result = applyScoreUpdate(raw, { token: bad, a: validLane16(), b: validLane16() }, TOKENS);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(function (e) { return /not a known production clock theme/.test(e); }));
  });
});

// --- Atomic write ------------------------------------------------------------------
test("writeCorpusAtomic writes valid JSON and leaves no temp file behind", function () {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clock-scores-test-"));
  var target = path.join(tmpDir, "clock_scores.json");
  var doc = fixtureCorpus();
  bridge.writeCorpusAtomic(doc, target);
  assert.ok(fs.existsSync(target));
  var written = JSON.parse(fs.readFileSync(target, "utf8"));
  assert.deepStrictEqual(written, doc);
  var leftovers = fs.readdirSync(tmpDir).filter(function (f) { return f !== "clock_scores.json"; });
  assert.deepStrictEqual(leftovers, [], "no .tmp-* file should remain after a successful write");
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- HTTP integration (ephemeral port, throwaway temp corpus file) -----------------
// The running server's THEME_TOKENS is fixed to the REAL production theme
// list (assets/js/clock-config.js) — unlike applyScoreUpdate above, it can't
// be swapped per-call — so the HTTP-level fixture corpus must use real
// tokens, not the pure-function tests' synthetic fixture-a/b/c.
var REAL_TOKENS = config.THEMES.map(function (t) { return t.token; });
function fixtureCorpusReal() {
  var scores = {};
  REAL_TOKENS.forEach(function (t) { scores[t] = { authored: false, a: validLane16(), b: validLane16() }; });
  return {
    version: 1,
    pitchClasses: { core: ["1/1", "9/8", "4/3", "3/2"], color: ["6/5", "5/4", "8/5", "5/3", "7/4"] },
    octaveOffsets: [-1, 0, 1],
    scores: scores
  };
}

function withTestServer(fn) {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clock-compose-http-test-"));
  var dataPath = path.join(tmpDir, "clock_scores.json");
  fs.writeFileSync(dataPath, JSON.stringify(fixtureCorpusReal(), null, 2) + "\n");

  var http = require("http");
  var server = http.createServer(bridge.createRequestListener(dataPath));
  return new Promise(function (resolve, reject) {
    server.listen(0, "127.0.0.1", function () {
      var port = server.address().port;
      var baseUrl = "http://127.0.0.1:" + port;
      Promise.resolve(fn({ baseUrl: baseUrl, dataPath: dataPath }))
        .then(function (v) {
          server.close();
          fs.rmSync(tmpDir, { recursive: true, force: true });
          resolve(v);
        })
        .catch(function (err) {
          server.close();
          fs.rmSync(tmpDir, { recursive: true, force: true });
          reject(err);
        });
    });
  });
}

var ALLOWED_ORIGIN = "http://localhost:1313";

asyncTest("HTTP: valid save round-trips and persists to disk", function () {
  return withTestServer(async function (ctx) {
    var res = await fetch(ctx.baseUrl + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ token: REAL_TOKENS[0], a: validLane16(), b: validLane16() })
    });
    assert.strictEqual(res.status, 200);
    var body = await res.json();
    assert.strictEqual(body.ok, true);
    var onDisk = JSON.parse(fs.readFileSync(ctx.dataPath, "utf8"));
    assert.strictEqual(onDisk.scores[REAL_TOKENS[0]].authored, true);
  });
});

asyncTest("HTTP: malformed JSON body is rejected with 400", function () {
  return withTestServer(async function (ctx) {
    var res = await fetch(ctx.baseUrl + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: "{ this is not json"
    });
    assert.strictEqual(res.status, 400);
    var body = await res.json();
    assert.strictEqual(body.ok, false);
  });
});

asyncTest("HTTP: disallowed origin is rejected with 403 and no write occurs", function () {
  return withTestServer(async function (ctx) {
    var before = fs.readFileSync(ctx.dataPath, "utf8");
    var res = await fetch(ctx.baseUrl + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ token: REAL_TOKENS[0], a: validLane16(), b: validLane16() })
    });
    assert.strictEqual(res.status, 403);
    var after = fs.readFileSync(ctx.dataPath, "utf8");
    assert.strictEqual(before, after, "file must be untouched when origin is rejected");
  });
});

asyncTest("HTTP: missing origin is rejected with 403", function () {
  return withTestServer(async function (ctx) {
    var res = await fetch(ctx.baseUrl + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: REAL_TOKENS[0], a: validLane16(), b: validLane16() })
    });
    assert.strictEqual(res.status, 403);
  });
});

asyncTest("HTTP: oversized body is rejected", function () {
  return withTestServer(async function (ctx) {
    var huge = JSON.stringify({ token: REAL_TOKENS[0], a: validLane16(), b: validLane16(), padding: "x".repeat(200 * 1024) });
    var res = await fetch(ctx.baseUrl + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: huge
    });
    assert.strictEqual(res.status, 413);
  });
});

asyncTest("HTTP: unknown route returns 404", function () {
  return withTestServer(async function (ctx) {
    var res = await fetch(ctx.baseUrl + "/api/nope", { headers: { Origin: ALLOWED_ORIGIN } });
    assert.strictEqual(res.status, 404);
  });
});

asyncTest("HTTP: editing one color via a real request leaves the others byte-identical", function () {
  return withTestServer(async function (ctx) {
    var beforeDoc = JSON.parse(fs.readFileSync(ctx.dataPath, "utf8"));
    var res = await fetch(ctx.baseUrl + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ token: REAL_TOKENS[2], a: validLane16(), b: validLane16() })
    });
    assert.strictEqual(res.status, 200);
    var afterDoc = JSON.parse(fs.readFileSync(ctx.dataPath, "utf8"));
    assert.deepStrictEqual(afterDoc.scores[REAL_TOKENS[0]], beforeDoc.scores[REAL_TOKENS[0]]);
    assert.deepStrictEqual(afterDoc.scores[REAL_TOKENS[1]], beforeDoc.scores[REAL_TOKENS[1]]);
    assert.notDeepStrictEqual(afterDoc.scores[REAL_TOKENS[2]], beforeDoc.scores[REAL_TOKENS[2]]);
  });
});

// --- run ---------------------------------------------------------------------------
(async function main() {
  await Promise.all(pendingAsync);

  if (failures.length) {
    failures.forEach(function (f) {
      console.error("FAIL: " + f.name);
      console.error("      " + (f.error && f.error.stack ? f.error.stack : f.error));
    });
    console.error(passed + " passed, " + failures.length + " failed");
    process.exit(1);
  } else {
    console.log("OK: " + passed + " clock-compose-server tests passed");
  }
})();
