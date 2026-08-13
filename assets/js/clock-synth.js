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

  return {
    buildVoiceGraph: buildVoiceGraph,
    disposeVoiceGraph: disposeVoiceGraph,
    triggerStep: triggerStep
  };
});
