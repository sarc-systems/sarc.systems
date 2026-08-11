// clock-theme.js — SARC Eternal Clock: Colorplan theme application.
// Pure DOM styling only — resolves a theme index to its token pair and writes
// two CSS custom properties onto a target element. clock.css reads
// --clock-theme-bg/--clock-theme-fg and applies them to every part of the
// /clock/ page's own chrome (compact swatch, site header, site footer, and
// the large-clock plate) so the whole page reads as one solid colour at a
// time, not a themed plate sitting inside neutral chrome. Scoped to /clock/
// only via body.clock in clock.css — ordinary pages' header/footer stay
// neutral paper.
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./clock-config.js"));
  } else {
    root.SARCClock = root.SARCClock || {};
    root.SARCClock.theme = factory(root.SARCClock.config);
  }
})(typeof self !== "undefined" ? self : this, function (config) {
  "use strict";

  function themeAt(index) {
    return config.THEMES[((index % config.THEMES.length) + config.THEMES.length) % config.THEMES.length];
  }

  // Applies theme `index` to `el` as CSS custom properties. Every selected
  // Colorplan token is used with its own paired foreground, per CLAUDE.md.
  // Also exposes --clock-accent-ink — the second-ink colour for the print/
  // overprint rune treatment (see clock.css .clock-svg--accent) — as the
  // NEXT theme in rotation, so the accent reads as "where the colour is
  // heading" rather than an arbitrary unrelated hue.
  function applyTheme(el, index) {
    if (!el) return;
    var theme = themeAt(index);
    var accent = themeAt(index + 1);
    el.style.setProperty("--clock-theme-bg", "var(--colorplan-" + theme.token + ")");
    el.style.setProperty("--clock-theme-fg", "var(--colorplan-" + theme.token + "-fg)");
    el.style.setProperty("--clock-accent-ink", "var(--colorplan-" + accent.token + ")");
    el.setAttribute("data-clock-theme", theme.token);
    return theme;
  }

  return {
    themeAt: themeAt,
    applyTheme: applyTheme
  };
});
