// clock-synth.js — SARC Eternal Clock: the shared Tone.js audio graph.
// Browser-only (Tone.js/AudioContext don't exist in Node) — not dual-module
// like clock-config.js/clock-state.js/clock-scores.js. Loaded page-scoped,
// alongside Tone.js itself, only on /clock/ (clock-audio.js) and
// /clock/compose/ (clock-compose.js) — exactly the two places that make
// sound. Exists so production playback and the composition editor can never
// develop a different sonic character: two sine oscillators, each through
// its own amplitude envelope, summed into one conservative gain + limiter.
// clock-audio.js used to build this graph inline; extracted here unchanged.
(function (root, factory) {
  "use strict";
  root.SARCClock = root.SARCClock || {};
  root.SARCClock.synth = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Builds one voice graph: oscA/oscB (sine, running continuously) -> their
  // own envA/envB -> summed into `gain` -> `limiter` -> destination.
  // `config` is SARCClock.config (REFERENCE_FREQUENCY/ENVELOPE/MASTER_GAIN_DB/
  // LIMITER_THRESHOLD_DB) — the same constants production and the editor both
  // read, so neither can drift its own copy of these numbers.
  function buildVoiceGraph(Tone, config) {
    var gain = new Tone.Gain(Tone.dbToGain(config.MASTER_GAIN_DB));
    var limiter = new Tone.Limiter(config.LIMITER_THRESHOLD_DB);
    gain.connect(limiter);
    limiter.toDestination();

    var envA = new Tone.AmplitudeEnvelope(config.ENVELOPE).connect(gain);
    var envB = new Tone.AmplitudeEnvelope(config.ENVELOPE).connect(gain);

    var oscA = new Tone.Oscillator(config.REFERENCE_FREQUENCY, "sine").connect(envA).start();
    var oscB = new Tone.Oscillator(config.REFERENCE_FREQUENCY, "sine").connect(envB).start();

    return { gain: gain, limiter: limiter, envA: envA, envB: envB, oscA: oscA, oscB: oscB };
  }

  function disposeVoiceGraph(graph) {
    if (!graph) return;
    graph.oscA.dispose();
    graph.oscB.dispose();
    graph.envA.dispose();
    graph.envB.dispose();
    graph.gain.dispose();
    graph.limiter.dispose();
  }

  // Triggers whichever of A/B a step's gate calls for (or both, for a dyad
  // audition). `noteDuration` matches config.ENVELOPE.decay in production;
  // the editor's own single-cell audition reuses this unchanged.
  function triggerStep(graph, time, freqA, freqB, gateA, gateB, noteDuration) {
    if (gateA) {
      graph.oscA.frequency.setValueAtTime(freqA, time);
      graph.envA.triggerAttackRelease(noteDuration, time);
    }
    if (gateB) {
      graph.oscB.frequency.setValueAtTime(freqB, time);
      graph.envB.triggerAttackRelease(noteDuration, time);
    }
  }

  // --- Loading Tone.js synchronously (iOS Safari) -----------------------------
  // iOS Safari only unlocks an AudioContext if it's resumed SYNCHRONOUSLY
  // within the same call stack as a user gesture (a click/tap handler). Both
  // clock-audio.js and clock-compose.js load Tone.js lazily, on first sound
  // activation — a normal `<script src>` + onload is asynchronous (a real
  // network fetch, at minimum a new task), so by the time it resolves and
  // Tone.start() would normally run, the gesture is gone and iOS silently
  // refuses to unlock.
  //
  // An earlier version tried creating a separate AudioContext synchronously
  // and later handing it to Tone via Tone.setContext(...) once Tone.js had
  // finished loading. That doesn't work with this Tone.js build: Tone.
  // Destination/Tone.Transport are created EAGERLY the moment the script
  // itself is parsed/executed (before any onload callback runs, so before
  // any code here ever gets a chance to intervene), permanently bound to
  // whichever context existed at that instant — Tone.setContext() only
  // affects *subsequently* created objects, so Destination/Transport stay on
  // Tone's own auto-created (and, on iOS, still-locked) context forever.
  // Symptom: everything LOOKS like it's playing (Transport "started", oscil-
  // lators running, no errors) because Tone.js never throws on a
  // cross-context connection or transport mismatch — it just silently
  // produces no sound, on every browser, not only iOS.
  //
  // The actual fix: make the Tone.js script itself available SYNCHRONOUSLY,
  // so its own module-evaluation (and therefore its own default
  // Destination/Transport/context creation) happens inside the gesture's own
  // call stack — no separate context needed, nothing to adopt afterward.
  // Blocking XHR is deprecated for ordinary use but is exactly the tool for
  // this: it's the one loading primitive that's genuinely synchronous.
  // Skips integrity verification (SRI needs a real <script> tag) — acceptable
  // here since this is same-origin, HTTPS, and already content-hashed in its
  // own fingerprinted URL, not a third-party/CDN load.
  var tonePromise = null;
  function loadToneSync(src) {
    if (window.Tone) return Promise.resolve(window.Tone);
    if (tonePromise) return tonePromise;
    tonePromise = new Promise(function (resolve, reject) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", src, false); // false = synchronous
        xhr.send(null);
        if (xhr.status !== 200 && xhr.status !== 0) {
          reject(new Error("Tone.js request failed: " + xhr.status));
          return;
        }
        (0, eval)(xhr.responseText); // global eval — Tone's UMD wrapper sets window.Tone
        resolve(window.Tone);
      } catch (err) {
        reject(err);
      }
    });
    return tonePromise;
  }

  return {
    buildVoiceGraph: buildVoiceGraph,
    disposeVoiceGraph: disposeVoiceGraph,
    triggerStep: triggerStep,
    loadToneSync: loadToneSync
  };
});
