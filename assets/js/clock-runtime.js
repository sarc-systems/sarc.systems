// clock-runtime.js — SARC Eternal Clock: wall-clock boundary scheduler.
// Wall-clock time (Date.now()) is the sole source of truth — every tick
// recomputes barIndex/state from scratch against the fixed epoch, so there is
// no incremented counter anywhere to drift, desynchronize, or need to replay
// after a suspended tab/device wake. A `setTimeout` is only ever used to wake
// up close to the next boundary; the state itself never depends on the timer
// having fired on time.
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./clock-config.js"), require("./clock-state.js"));
  } else {
    root.SARCClock = root.SARCClock || {};
    root.SARCClock.runtime = factory(root.SARCClock.config, root.SARCClock.state);
  }
})(typeof self !== "undefined" ? self : this, function (config, state) {
  "use strict";

  function createRuntime(opts) {
    opts = opts || {};
    var epochMs = opts.epochMs == null ? config.SARC_EPOCH_MS : opts.epochMs;
    var subscribers = [];
    var timer = null;
    var snapshot = null;

    function computeSnapshot(nowMs) {
      var barIndex = state.barIndexFromNow(nowMs, epochMs);
      var grayState = state.grayStateForBar(barIndex);
      var cells = state.cellsFromState(grayState);
      var themeIndex = state.themeIndexForBar(barIndex, grayState);
      return {
        nowMs: nowMs,
        barIndex: barIndex,
        grayState: grayState,
        cells: cells,
        themeIndex: themeIndex,
        boundaryMs: state.currentBoundaryMs(nowMs, epochMs)
      };
    }

    function publish() {
      subscribers.forEach(function (fn) { fn(snapshot); });
    }

    function tick() {
      snapshot = computeSnapshot(Date.now());
      publish();
      scheduleNext();
    }

    function scheduleNext() {
      if (timer) clearTimeout(timer);
      var wait = state.msToNextBoundary(Date.now(), epochMs);
      timer = setTimeout(tick, wait);
    }

    // Explicit entry point for suspension/discontinuity recovery
    // (visibilitychange, audio-context resume, device wake, detected drift):
    // recompute from current wall time and realign at the next boundary.
    // Deliberately never replays missed bars — it just jumps to "now".
    function realign() {
      tick();
    }

    function start() {
      if (!timer && !snapshot) tick();
      return snapshot;
    }

    function stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function subscribe(fn) {
      subscribers.push(fn);
      if (snapshot) fn(snapshot);
      return function unsubscribe() {
        var i = subscribers.indexOf(fn);
        if (i !== -1) subscribers.splice(i, 1);
      };
    }

    function getSnapshot() { return snapshot; }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") realign();
      });
    }

    return {
      start: start,
      stop: stop,
      subscribe: subscribe,
      realign: realign,
      getSnapshot: getSnapshot
    };
  }

  // One shared runtime per page — this is what lets the compact header clock
  // and (on /clock/) the large clock and the audio scheduler all be driven by
  // a single boundary scheduler instead of independent drifting timers.
  var shared = null;
  function getSharedRuntime(opts) {
    if (!shared) shared = createRuntime(opts);
    return shared;
  }

  return {
    createRuntime: createRuntime,
    getSharedRuntime: getSharedRuntime
  };
});
