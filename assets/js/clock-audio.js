// clock-audio.js — SARC Eternal Clock: /clock/-only Tone.js audio.
// Loaded only on the clock page; Tone.js itself (vendored, pinned — see
// assets/js/vendor/) is fetched lazily on first sound activation, never on
// page load. Sound state is never persisted (no cookies/localStorage) — it
// always begins muted on a fresh load of /clock/.
(function () {
  "use strict";

  var control = document.querySelector("[data-clock-sound]");
  if (!control) return;

  var NS = window.SARCClock;
  if (!NS || !NS.config || !NS.state || !NS.scores || !NS.synth) return;

  var config = NS.config;
  var state = NS.state;
  var scoresModule = NS.scores;
  var synth = NS.synth;

  // Canonical score corpus — embedded inline by clock-scores-data.html,
  // parsed once. See data/clock_scores.json / assets/js/clock-scores.js.
  var scoresDataEl = document.getElementById("clock-scores-data");
  var scoresData = scoresDataEl ? JSON.parse(scoresDataEl.textContent) : null;
  if (!scoresData || !scoresData.scores) return;

  var STATE_OFF = "off", STATE_ARMED = "armed", STATE_ON = "on";
  // Screen-reader-only — the button shows no words, an icon only (see
  // layouts/partials/icon.html's volume-off/-armed/-on, mirrored below since
  // JS can't call a Hugo partial at runtime). Icon shape (crossed/bare/waves)
  // carries the state visually so it's never colour-alone.
  var LABELS = { off: "Sound off", armed: "Sound armed", on: "Sound on" };
  var ICONS = {
    off: '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
    armed: '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>',
    on: '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
  };

  var soundState = STATE_OFF;
  var graph = null; // { oscA, oscB, envA, envB, gain, limiter, sequence }
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setControlState(next) {
    soundState = next;
    control.innerHTML = ICONS[next] + '<span class="visually-hidden">' + LABELS[next] + '</span>';
    control.setAttribute("data-state", next);
    control.setAttribute("aria-pressed", next === STATE_OFF ? "false" : "true");
  }
  setControlState(STATE_OFF);

  // The /clock/ page tiles many identical large instances (all showing the
  // same live state) rather than one — every one of them should pulse
  // together on emphasis, so this returns the whole set, not just the
  // first.
  function activeLargeInstances() {
    var byVariant = NS.activeInstancesByVariant;
    return (byVariant && byVariant.large) || [];
  }

  // Reads current gate + pitch for step `i` directly from the pure state
  // functions at call time (not from the visual runtime's last-published
  // snapshot), so audio scheduling can never race the visual boundary timer —
  // both simply compute the same thing from the same wall clock independently.
  function readStepAt(i, nowMs) {
    var epochMs = config.SARC_EPOCH_MS;
    var barIndex = state.barIndexFromNow(nowMs, epochMs);
    var grayState = state.grayStateForBar(barIndex);
    var cells = state.cellsFromState(grayState);
    var themeIndex = state.themeIndexForBar(barIndex, grayState);
    var theme = config.THEMES[themeIndex];
    var score = scoresData.scores[theme.token];
    var cell = cells[i];
    return {
      cellIndex: i,
      a: !!cell.a,
      b: !!cell.b,
      freqA: config.REFERENCE_FREQUENCY * scoresModule.ratioValue(score.a[i]),
      freqB: config.REFERENCE_FREQUENCY * scoresModule.ratioValue(score.b[i])
    };
  }

  function buildGraph(Tone) {
    var voice = synth.buildVoiceGraph(Tone, config);
    var noteDuration = config.ENVELOPE.decay;

    var sequence = new Tone.Sequence(function (time, i) {
      var step = readStepAt(i, Date.now());
      synth.triggerStep(voice, time, step.freqA, step.freqB, step.a, step.b, noteDuration);

      if (!reduceMotion.matches && (step.a || step.b)) {
        Tone.Draw.schedule(function () {
          var largeInstances = activeLargeInstances();
          if (!largeInstances.length) return;
          largeInstances.forEach(function (large) {
            if (step.a) large.setEmphasis(step.cellIndex, "a", true);
            if (step.b) large.setEmphasis(step.cellIndex, "b", true);
          });
          setTimeout(function () {
            largeInstances.forEach(function (large) {
              if (step.a) large.setEmphasis(step.cellIndex, "a", false);
              if (step.b) large.setEmphasis(step.cellIndex, "b", false);
            });
          }, config.EMPHASIS_MS);
        }, time);
      }
    }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "16n");

    voice.sequence = sequence;
    return voice;
  }

  function disposeGraph() {
    if (!graph) return;
    graph.sequence.dispose();
    synth.disposeVoiceGraph(graph);
    graph = null;
  }

  function stop() {
    var Tone = window.Tone;
    if (Tone) {
      Tone.Transport.stop();
      Tone.Transport.cancel();
    }
    disposeGraph();
    setControlState(STATE_OFF);
  }

  function start() {
    setControlState(STATE_ARMED);
    // Synchronous load (blocking XHR + eval, not a <script> tag) — see
    // clock-synth.js's loadToneSync for why: iOS Safari only unlocks an
    // AudioContext when it's resumed within the same synchronous call stack
    // as this click, and Tone.js's own Destination/Transport get bound to
    // whatever context exists the instant its script is evaluated.
    synth.loadToneSync(control.getAttribute("data-tone-src")).then(function (Tone) {
      if (soundState !== STATE_ARMED) return; // stopped again before Tone finished loading
      return Tone.start().then(function () {
        if (soundState !== STATE_ARMED) return;
        Tone.Transport.bpm.value = config.BPM;
        graph = buildGraph(Tone);

        var nowMs = Date.now();
        var waitMs = state.msToNextBoundary(nowMs, config.SARC_EPOCH_MS); // <= CLOCK_MS
        var startAt = Tone.now() + waitMs / 1000;
        // Transport.start's `time` is the real AudioContext time playback
        // begins; Sequence.start's `time` is Transport-relative — "0" means
        // "right when the transport itself starts" (see Tone.js Part/Sequence
        // docs). Together these align the very first sixteen-step scan to
        // the next absolute wall-clock boundary, never mid-bar.
        graph.sequence.start(0);
        Tone.Transport.start(startAt);

        setControlState(STATE_ON);
      });
    }).catch(function (err) {
      // Loading/starting failed (e.g. blocked audio context) — fail closed,
      // but still surface it: a silent catch here previously made real bugs
      // indistinguishable from an ordinary blocked-autoplay rejection.
      console.error("[clock-audio] sound activation failed:", err);
      disposeGraph();
      setControlState(STATE_OFF);
    });
  }

  control.addEventListener("click", function () {
    if (soundState === STATE_OFF) {
      start();
    } else {
      stop();
    }
  });

  // Leaving the page (navigation, tab close) is allowed to simply drop audio —
  // no special teardown needed beyond the browser tearing down the page's own
  // AudioContext. No persistence of sound state across reload/navigation.
})();
