// clock-init.js — SARC Eternal Clock: DOM bootstrap, loaded on every page.
// Finds every [data-clock] element (the compact header clock everywhere, plus
// the large clock-page element when present), builds a renderer for each, and
// subscribes all of them to one shared runtime. This is what naturally
// satisfies "one boundary scheduler drives both the compact and large clocks
// on /clock/" — the header partial renders on every page including /clock/,
// so both elements simply exist there together and both get discovered here.
(function () {
  "use strict";

  var NS = window.SARCClock;
  if (!NS || !NS.config || !NS.state || !NS.svg || !NS.theme || !NS.runtime) return;

  function boot() {
    var nodes = document.querySelectorAll("[data-clock]");
    if (!nodes.length) return;

    var runtime = NS.runtime.getSharedRuntime();
    var instances = [];

    // A variant can appear more than once now (the tiled /clock/ field is
    // many repeated [data-clock="large"] elements, all showing the same
    // live state) — only the FIRST element of a given variant gets the
    // accessible role/label; the rest are aria-hidden decorative repeats,
    // not a screen reader hearing "SARC clock" sixty times over.
    var seenVariant = {};

    nodes.forEach(function (el) {
      var variant = el.getAttribute("data-clock") || "compact";
      var isFirstOfVariant = !seenVariant[variant];
      seenVariant[variant] = true;
      var instance = NS.svg.create(el, {
        runeConfig: NS.config.RUNE,
        variant: variant,
        ariaHidden: variant === "compact" || !isFirstOfVariant,
        grain: el.getAttribute("data-clock-grain") !== "false",
        label: el.getAttribute("data-clock-label") || "SARC clock — current state"
      });
      instances.push(instance);
    });

    runtime.subscribe(function (snapshot) {
      if (!snapshot) return;
      instances.forEach(function (instance) { instance.setState(snapshot.cells); });
      NS.theme.applyTheme(document.body, snapshot.themeIndex);
    });

    runtime.start();

    // Exposed so the /clock/-only audio module (clock-audio.js) reads bar
    // timing from the SAME scheduler rather than instantiating its own, and
    // can find the large clock instance to drive audio-trigger emphasis on.
    NS.activeRuntime = runtime;
    NS.activeInstances = instances;
    NS.activeInstancesByVariant = {};
    nodes.forEach(function (el, i) {
      var variant = el.getAttribute("data-clock") || "compact";
      (NS.activeInstancesByVariant[variant] = NS.activeInstancesByVariant[variant] || []).push(instances[i]);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
