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

  // --- Shared AudioContext unlock (iOS Safari) --------------------------------
  // iOS Safari only unlocks an AudioContext if it's created/resumed
  // SYNCHRONOUSLY within the same call stack as a user gesture (a click/tap
  // handler). Both clock-audio.js and clock-compose.js lazily fetch Tone.js
  // itself over the network on first activation — that fetch is async, so by
  // the time Tone.js has loaded and would normally call Tone.start()
  // (== context.resume()), the gesture is gone and iOS silently refuses to
  // unlock. Desktop browsers don't enforce this as strictly, which is why it
  // worked everywhere else. Fix: call this as the very first synchronous
  // statement inside the click/tap handler, BEFORE starting Tone's async
  // load — it creates (once) and resumes a raw AudioContext immediately,
  // still inside the gesture. Once Tone.js has finished loading, hand it
  // this same already-unlocked context via Tone.setContext(...) before
  // building anything — Tone.start() then just confirms an already-running
  // context instead of trying (too late) to unlock one itself.
  var sharedAudioContext = null;
  function unlockAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioContext) sharedAudioContext = new Ctx();
    if (sharedAudioContext.state !== "running") sharedAudioContext.resume();
    return sharedAudioContext;
  }

  return {
    buildVoiceGraph: buildVoiceGraph,
    disposeVoiceGraph: disposeVoiceGraph,
    triggerStep: triggerStep,
    unlockAudioContext: unlockAudioContext
  };
});
