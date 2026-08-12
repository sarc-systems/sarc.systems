// clock-config.js — SARC Eternal Clock: centralized constants.
// Pure data only. No DOM, no timers. Loadable both as a browser global
// (window.SARCClock.config, via the concatenated clock bundle) and as a
// plain CommonJS module (scripts/test-clock.mjs), same pattern used
// throughout this file's siblings (clock-state.js, clock-svg.js, ...).
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SARCClock = root.SARCClock || {};
    root.SARCClock.config = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // --- Timing (exact values from todo_clock.txt — do not round internally) ---
  var CLOCK_SECONDS = 2.26;
  var CLOCK_MS = 2260;
  var STEPS_PER_BAR = 16;
  var STEP_SECONDS = CLOCK_SECONDS / STEPS_PER_BAR; // 0.14125
  var STEP_MS = CLOCK_MS / STEPS_PER_BAR; // 141.25
  var BPM = 240 / CLOCK_SECONDS; // 106.19469026548673
  var REFERENCE_FREQUENCY = 512 / CLOCK_SECONDS; // 226.54867256637168 Hz — nine octaves above 1/2.26 Hz

  // --- Epoch -------------------------------------------------------------
  // Fixed UTC epoch. Deliberately isolated on its own line so it stays easy
  // to replace before release; changing it re-bases every future bar index
  // but never changes the clock's behavior.
  var SARC_EPOCH_MS = Date.parse("2024-01-01T00:00:00.000Z");

  // --- Rune geometry -------------------------------------------------------
  // amplitude: fraction of one cell's side length (half-sine peak deflection).
  // handedness: +1/-1 multiplier on each component's normal direction so A and
  // B bow to complementary sides — a BOTH cell reads as one interlocking rune
  // rather than two curves bowing the same way. Kept configurable per the brief.
  var RUNE = {
    amplitude: 0.16,
    handedness: { a: 1, b: -1 },
    // Sample density for the half-sine polyline. Built once per cell size
    // (on init/resize), never per frame — see clock-svg.js.
    samples: 40
  };

  // --- Bar-boundary transition ---------------------------------------------
  var TRANSITION_MS = 220; // 150-300ms recommended range

  // --- Theme-change rule -------------------------------------------------------
  // Colour is driven by OBSERVING the visible rune pattern, not a timer, and
  // two DIFFERENT watched-cell sets deliberately give drift and reset two
  // different frequencies (a reset must be rarer than an ordinary drift step
  // — many drifts should happen between resets, not one-for-one):
  //   - DRIFT: the eight fastest-changing cells (top two rows, cells 0-7)
  //       all LEFT strokes  (component B, falling "\"), no right -> next colour
  //       all RIGHT strokes (component A, rising "/"),  no left  -> prev colour
  //   - RESET: a strict superset, the top two rows plus the three fastest
  //     cells of the third row (cells 0-10)
  //       no strokes at all (every watched cell REST)            -> jump to black
  //       every watched cell shows BOTH strokes                  -> jump to white
  // ("Left"/"right" is a naming judgment call, not a geometric necessity —
  // swap PATTERN_LEFT_IS_B below if it reads backwards once seen live.)
  //
  // Checking all sixteen cells for either pattern would only ever fire once
  // per the full ~308-year 32-bit Gray-code cycle (the eight highest cells
  // are frozen for centuries at any human timescale). Eight cells gives each
  // drift pattern an empirically verified average recurrence of ~1.71 days:
  // rare enough that it "might not change for days," frequent enough that
  // "if you're lucky" you catch one live. Eleven cells (a superset, so every
  // reset bar is also a valid drift-cell state, just one the drift
  // classifier's stricter all-A/all-B test never matches) makes a reset
  // meaningfully rarer — ~109.7 days for a specific colour (black or white)
  // to recur, ~54.9 days on average until the NEXT reset of either colour —
  // dozens of drift steps between resets, while staying on a
  // human-observable timescale rather than centuries. Each extra reset cell
  // QUADRUPLES the reset period, not doubles it (PATTERN_CYCLE_LEN =
  // 2^(2*N_RESET + 1) — one more cell is two more Gray-code bits): ten cells
  // gave ~27.4/~13.7 days, eleven gives ~109.7/~54.9, twelve would give
  // ~438.9/~219.4. Because the reset cells' own repeating period is a whole
  // multiple of the drift cells' period, one combined cycle (driven by the
  // larger reset set) covers both: the whole sequence of trigger events
  // repeats exactly every 2^23 = 8388608 bars (~219.42 days) forever, so
  // instead of scanning for matches at runtime, the full per-cycle event
  // list is precomputed once and embedded below. Regenerate with
  // `node scripts/generate-clock-pattern-events.js` if either watch-cell set
  // or the left/right mapping above ever changes.
  var PATTERN_LEFT_IS_B = true;
  var PATTERN_CYCLE_LEN = 8388608;
  var PATTERN_EVENTS = [{"offset":0,"type":"black"},{"offset":26214,"type":"retreat"},{"offset":52428,"type":"advance"},{"offset":78643,"type":"advance"},{"offset":104857,"type":"retreat"},{"offset":157286,"type":"retreat"},{"offset":183500,"type":"advance"},{"offset":209715,"type":"advance"},{"offset":235929,"type":"retreat"},{"offset":288358,"type":"retreat"},{"offset":314572,"type":"advance"},{"offset":340787,"type":"advance"},{"offset":367001,"type":"retreat"},{"offset":419430,"type":"retreat"},{"offset":445644,"type":"advance"},{"offset":471859,"type":"advance"},{"offset":498073,"type":"retreat"},{"offset":550502,"type":"retreat"},{"offset":576716,"type":"advance"},{"offset":602931,"type":"advance"},{"offset":629145,"type":"retreat"},{"offset":681574,"type":"retreat"},{"offset":707788,"type":"advance"},{"offset":734003,"type":"advance"},{"offset":760217,"type":"retreat"},{"offset":812646,"type":"retreat"},{"offset":838860,"type":"advance"},{"offset":865075,"type":"advance"},{"offset":891289,"type":"retreat"},{"offset":943718,"type":"retreat"},{"offset":969932,"type":"advance"},{"offset":996147,"type":"advance"},{"offset":1022361,"type":"retreat"},{"offset":1074790,"type":"retreat"},{"offset":1101004,"type":"advance"},{"offset":1127219,"type":"advance"},{"offset":1153433,"type":"retreat"},{"offset":1205862,"type":"retreat"},{"offset":1232076,"type":"advance"},{"offset":1258291,"type":"advance"},{"offset":1284505,"type":"retreat"},{"offset":1336934,"type":"retreat"},{"offset":1363148,"type":"advance"},{"offset":1389363,"type":"advance"},{"offset":1415577,"type":"retreat"},{"offset":1468006,"type":"retreat"},{"offset":1494220,"type":"advance"},{"offset":1520435,"type":"advance"},{"offset":1546649,"type":"retreat"},{"offset":1599078,"type":"retreat"},{"offset":1625292,"type":"advance"},{"offset":1651507,"type":"advance"},{"offset":1677721,"type":"retreat"},{"offset":1730150,"type":"retreat"},{"offset":1756364,"type":"advance"},{"offset":1782579,"type":"advance"},{"offset":1808793,"type":"retreat"},{"offset":1861222,"type":"retreat"},{"offset":1887436,"type":"advance"},{"offset":1913651,"type":"advance"},{"offset":1939865,"type":"retreat"},{"offset":1992294,"type":"retreat"},{"offset":2018508,"type":"advance"},{"offset":2044723,"type":"advance"},{"offset":2070937,"type":"retreat"},{"offset":2123366,"type":"retreat"},{"offset":2149580,"type":"advance"},{"offset":2175795,"type":"advance"},{"offset":2202009,"type":"retreat"},{"offset":2254438,"type":"retreat"},{"offset":2280652,"type":"advance"},{"offset":2306867,"type":"advance"},{"offset":2333081,"type":"retreat"},{"offset":2385510,"type":"retreat"},{"offset":2411724,"type":"advance"},{"offset":2437939,"type":"advance"},{"offset":2464153,"type":"retreat"},{"offset":2516582,"type":"retreat"},{"offset":2542796,"type":"advance"},{"offset":2569011,"type":"advance"},{"offset":2595225,"type":"retreat"},{"offset":2647654,"type":"retreat"},{"offset":2673868,"type":"advance"},{"offset":2700083,"type":"advance"},{"offset":2726297,"type":"retreat"},{"offset":2778726,"type":"retreat"},{"offset":2796202,"type":"white"},{"offset":2804940,"type":"advance"},{"offset":2831155,"type":"advance"},{"offset":2857369,"type":"retreat"},{"offset":2909798,"type":"retreat"},{"offset":2936012,"type":"advance"},{"offset":2962227,"type":"advance"},{"offset":2988441,"type":"retreat"},{"offset":3040870,"type":"retreat"},{"offset":3067084,"type":"advance"},{"offset":3093299,"type":"advance"},{"offset":3119513,"type":"retreat"},{"offset":3171942,"type":"retreat"},{"offset":3198156,"type":"advance"},{"offset":3224371,"type":"advance"},{"offset":3250585,"type":"retreat"},{"offset":3303014,"type":"retreat"},{"offset":3329228,"type":"advance"},{"offset":3355443,"type":"advance"},{"offset":3381657,"type":"retreat"},{"offset":3434086,"type":"retreat"},{"offset":3460300,"type":"advance"},{"offset":3486515,"type":"advance"},{"offset":3512729,"type":"retreat"},{"offset":3565158,"type":"retreat"},{"offset":3591372,"type":"advance"},{"offset":3617587,"type":"advance"},{"offset":3643801,"type":"retreat"},{"offset":3696230,"type":"retreat"},{"offset":3722444,"type":"advance"},{"offset":3748659,"type":"advance"},{"offset":3774873,"type":"retreat"},{"offset":3827302,"type":"retreat"},{"offset":3853516,"type":"advance"},{"offset":3879731,"type":"advance"},{"offset":3905945,"type":"retreat"},{"offset":3958374,"type":"retreat"},{"offset":3984588,"type":"advance"},{"offset":4010803,"type":"advance"},{"offset":4037017,"type":"retreat"},{"offset":4089446,"type":"retreat"},{"offset":4115660,"type":"advance"},{"offset":4141875,"type":"advance"},{"offset":4168089,"type":"retreat"},{"offset":4220518,"type":"retreat"},{"offset":4246732,"type":"advance"},{"offset":4272947,"type":"advance"},{"offset":4299161,"type":"retreat"},{"offset":4351590,"type":"retreat"},{"offset":4377804,"type":"advance"},{"offset":4404019,"type":"advance"},{"offset":4430233,"type":"retreat"},{"offset":4482662,"type":"retreat"},{"offset":4508876,"type":"advance"},{"offset":4535091,"type":"advance"},{"offset":4561305,"type":"retreat"},{"offset":4613734,"type":"retreat"},{"offset":4639948,"type":"advance"},{"offset":4666163,"type":"advance"},{"offset":4692377,"type":"retreat"},{"offset":4744806,"type":"retreat"},{"offset":4771020,"type":"advance"},{"offset":4797235,"type":"advance"},{"offset":4823449,"type":"retreat"},{"offset":4875878,"type":"retreat"},{"offset":4902092,"type":"advance"},{"offset":4928307,"type":"advance"},{"offset":4954521,"type":"retreat"},{"offset":5006950,"type":"retreat"},{"offset":5033164,"type":"advance"},{"offset":5059379,"type":"advance"},{"offset":5085593,"type":"retreat"},{"offset":5138022,"type":"retreat"},{"offset":5164236,"type":"advance"},{"offset":5190451,"type":"advance"},{"offset":5216665,"type":"retreat"},{"offset":5269094,"type":"retreat"},{"offset":5295308,"type":"advance"},{"offset":5321523,"type":"advance"},{"offset":5347737,"type":"retreat"},{"offset":5400166,"type":"retreat"},{"offset":5426380,"type":"advance"},{"offset":5452595,"type":"advance"},{"offset":5478809,"type":"retreat"},{"offset":5531238,"type":"retreat"},{"offset":5557452,"type":"advance"},{"offset":5583667,"type":"advance"},{"offset":5592405,"type":"white"},{"offset":5609881,"type":"retreat"},{"offset":5662310,"type":"retreat"},{"offset":5688524,"type":"advance"},{"offset":5714739,"type":"advance"},{"offset":5740953,"type":"retreat"},{"offset":5793382,"type":"retreat"},{"offset":5819596,"type":"advance"},{"offset":5845811,"type":"advance"},{"offset":5872025,"type":"retreat"},{"offset":5924454,"type":"retreat"},{"offset":5950668,"type":"advance"},{"offset":5976883,"type":"advance"},{"offset":6003097,"type":"retreat"},{"offset":6055526,"type":"retreat"},{"offset":6081740,"type":"advance"},{"offset":6107955,"type":"advance"},{"offset":6134169,"type":"retreat"},{"offset":6186598,"type":"retreat"},{"offset":6212812,"type":"advance"},{"offset":6239027,"type":"advance"},{"offset":6265241,"type":"retreat"},{"offset":6317670,"type":"retreat"},{"offset":6343884,"type":"advance"},{"offset":6370099,"type":"advance"},{"offset":6396313,"type":"retreat"},{"offset":6448742,"type":"retreat"},{"offset":6474956,"type":"advance"},{"offset":6501171,"type":"advance"},{"offset":6527385,"type":"retreat"},{"offset":6579814,"type":"retreat"},{"offset":6606028,"type":"advance"},{"offset":6632243,"type":"advance"},{"offset":6658457,"type":"retreat"},{"offset":6710886,"type":"retreat"},{"offset":6737100,"type":"advance"},{"offset":6763315,"type":"advance"},{"offset":6789529,"type":"retreat"},{"offset":6841958,"type":"retreat"},{"offset":6868172,"type":"advance"},{"offset":6894387,"type":"advance"},{"offset":6920601,"type":"retreat"},{"offset":6973030,"type":"retreat"},{"offset":6999244,"type":"advance"},{"offset":7025459,"type":"advance"},{"offset":7051673,"type":"retreat"},{"offset":7104102,"type":"retreat"},{"offset":7130316,"type":"advance"},{"offset":7156531,"type":"advance"},{"offset":7182745,"type":"retreat"},{"offset":7235174,"type":"retreat"},{"offset":7261388,"type":"advance"},{"offset":7287603,"type":"advance"},{"offset":7313817,"type":"retreat"},{"offset":7366246,"type":"retreat"},{"offset":7392460,"type":"advance"},{"offset":7418675,"type":"advance"},{"offset":7444889,"type":"retreat"},{"offset":7497318,"type":"retreat"},{"offset":7523532,"type":"advance"},{"offset":7549747,"type":"advance"},{"offset":7575961,"type":"retreat"},{"offset":7628390,"type":"retreat"},{"offset":7654604,"type":"advance"},{"offset":7680819,"type":"advance"},{"offset":7707033,"type":"retreat"},{"offset":7759462,"type":"retreat"},{"offset":7785676,"type":"advance"},{"offset":7811891,"type":"advance"},{"offset":7838105,"type":"retreat"},{"offset":7890534,"type":"retreat"},{"offset":7916748,"type":"advance"},{"offset":7942963,"type":"advance"},{"offset":7969177,"type":"retreat"},{"offset":8021606,"type":"retreat"},{"offset":8047820,"type":"advance"},{"offset":8074035,"type":"advance"},{"offset":8100249,"type":"retreat"},{"offset":8152678,"type":"retreat"},{"offset":8178892,"type":"advance"},{"offset":8205107,"type":"advance"},{"offset":8231321,"type":"retreat"},{"offset":8283750,"type":"retreat"},{"offset":8309964,"type":"advance"},{"offset":8336179,"type":"advance"},{"offset":8362393,"type":"retreat"},{"offset":8388607,"type":"black"}];
  // Exact Colorplan matches for the two jump targets (see data/colorplan.json).
  var PATTERN_BLACK_TOKEN = "ebony";       // #000000 — literally pure black
  var PATTERN_WHITE_TOKEN = "bright-white"; // #FCFCFB — closest to pure white

  // Trying the full 55-colour Colorplan range for now (data/colorplan.json),
  // not a curated subset — every slug, in the source table's own order.
  // Colour always resolves through var(--colorplan-<slug>) / -fg at render
  // time, never a raw hex, per CLAUDE.md — `hex` below is NOT used for
  // rendering, only as deterministic input to the placeholder pitch scores
  // below (see SCORES). (Regenerate slugs+hexes together with:
  // `node -e "const c=require('./data/colorplan.json').colors; console.log(JSON.stringify(c.map(x=>x.slug))); console.log(JSON.stringify(c.map(x=>x.hex)))"`
  // if data/colorplan.json is ever re-imported with a different colour set —
  // paste the two arrays into THEME_TOKENS/THEME_HEXES below, same order.)
  var THEME_TOKENS = [
    "pristine-white", "ice-white", "natural", "vellum-white", "white-frost",
    "bright-white", "china-white", "cool-grey", "pale-grey", "mist",
    "real-grey", "smoke", "dark-grey", "slate", "amethyst",
    "ebony", "sorbet-yellow", "factory-yellow", "citrine", "chartreuse",
    "mandarin", "stone", "harvest", "nubuck-brown", "rust",
    "bitter-chocolate", "bagdad-brown", "candy-pink", "fuchsia-pink", "hot-pink",
    "vermillion", "bright-red", "scarlet", "claret", "cool-blue",
    "azure-blue", "turquoise", "adriatic", "tabriz-blue", "new-blue",
    "sapphire", "cobalt", "imperial-blue", "royal-blue", "lavender",
    "purple", "pistachio", "powder-green", "park-green", "marrs-green",
    "mid-green", "lockwood-green", "emerald", "forest", "racing-green"
  ];
  var THEME_HEXES = [
    "#FAFAF6", "#F5F5F5", "#F5F1E2", "#F3E0D1", "#F2F4F8",
    "#FCFCFB", "#F5E4BB", "#EDE8ED", "#CCCAC1", "#F5EDDC",
    "#C0C3B9", "#817D7E", "#6A6766", "#454B4F", "#4F4355",
    "#000000", "#F4EAA5", "#FCDC13", "#FAB53A", "#BDB141",
    "#F37736", "#E8D5AD", "#B29471", "#816D5B", "#C96846",
    "#554942", "#5B4B42", "#F8C2C7", "#CC548C", "#E34C73",
    "#B4464D", "#D02D30", "#9E444D", "#603F45", "#DCE5E8",
    "#ABC5DE", "#47E4D9", "#377AAA", "#0088B5", "#88A1BA",
    "#40567D", "#45576D", "#404755", "#484882", "#BEAFD9",
    "#6C4E9A", "#E0EACD", "#E2EDDB", "#ACE2BB", "#008882",
    "#78826A", "#2C6E49", "#43887B", "#375E4C", "#404E4E"
  ];
  var THEMES = THEME_TOKENS.map(function (token, i) {
    return { token: token, hex: THEME_HEXES[i] };
  });

  var PATTERN_BLACK_INDEX = THEMES.findIndex(function (t) { return t.token === PATTERN_BLACK_TOKEN; });
  var PATTERN_WHITE_INDEX = THEMES.findIndex(function (t) { return t.token === PATTERN_WHITE_TOKEN; });

  // --- Pitch scores ----------------------------------------------------------
  // PLACEHOLDER — clearly marked. One authored just-intonation-ish ratio
  // palette (relative to REFERENCE_FREQUENCY), sampled into two 16-step lanes
  // per theme. Lane parameters are derived from each theme's own RGB (its
  // actual Colorplan hex, above) rather than an arbitrary index or a
  // hand-written table — so a theme's sound is tied to its own colour, not
  // to its incidental position in the list. Still fully deterministic, still
  // gives every theme a distinct pair of lanes. Replacing this with a
  // genuinely composed score later only means replacing SCORES below —
  // clock/visual/audio scheduling never changes.
  var RATIO_PALETTE = [
    1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2,
    9 / 4, 5 / 2, 8 / 3, 3, 15 / 4, 4, 9 / 2, 5
  ];

  function placeholderLane(strideSteps, offsetSteps) {
    var lane = [];
    for (var i = 0; i < STEPS_PER_BAR; i++) {
      var idx = ((i * strideSteps + offsetSteps) % RATIO_PALETTE.length + RATIO_PALETTE.length) % RATIO_PALETTE.length;
      lane.push(RATIO_PALETTE[idx]);
    }
    return lane;
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }

  // Derives [strideA, offsetA, strideB, offsetB] from a theme's own colour.
  // Strides are forced odd (1,3,...,15) — coprime with RATIO_PALETTE's
  // length (16), so each lane walks the full sixteen-entry palette instead
  // of falling into a short repeating loop.
  function placeholderScoreParams(hex) {
    var rgb = hexToRgb(hex);
    return [
      (rgb.r % 8) * 2 + 1,
      rgb.g % RATIO_PALETTE.length,
      (rgb.b % 8) * 2 + 1,
      (rgb.r + rgb.g + rgb.b) % RATIO_PALETTE.length
    ];
  }

  var SCORES = {}; // keyed by theme token
  THEMES.forEach(function (theme) {
    var p = placeholderScoreParams(theme.hex);
    SCORES[theme.token] = {
      placeholder: true,
      a: placeholderLane(p[0], p[1]),
      b: placeholderLane(p[2], p[3])
    };
  });

  // --- Envelope settings (per todo_clock.txt "Initial envelope range") -----
  var ENVELOPE = {
    attack: 0.006,   // 6ms
    decay: 0.1,      // 100ms
    sustain: 0,
    release: 0.03    // short, click-free; completes within one 141.25ms step
  };

  // --- Gain / emphasis -------------------------------------------------------
  var MASTER_GAIN_DB = -14; // conservative — BOTH sums two oscillators
  var LIMITER_THRESHOLD_DB = -3;

  var EMPHASIS_MS = 90; // 70-120ms recommended range

  return {
    CLOCK_SECONDS: CLOCK_SECONDS,
    CLOCK_MS: CLOCK_MS,
    STEPS_PER_BAR: STEPS_PER_BAR,
    STEP_SECONDS: STEP_SECONDS,
    STEP_MS: STEP_MS,
    BPM: BPM,
    REFERENCE_FREQUENCY: REFERENCE_FREQUENCY,
    SARC_EPOCH_MS: SARC_EPOCH_MS,
    RUNE: RUNE,
    TRANSITION_MS: TRANSITION_MS,
    PATTERN_LEFT_IS_B: PATTERN_LEFT_IS_B,
    PATTERN_CYCLE_LEN: PATTERN_CYCLE_LEN,
    PATTERN_EVENTS: PATTERN_EVENTS,
    PATTERN_BLACK_TOKEN: PATTERN_BLACK_TOKEN,
    PATTERN_WHITE_TOKEN: PATTERN_WHITE_TOKEN,
    PATTERN_BLACK_INDEX: PATTERN_BLACK_INDEX,
    PATTERN_WHITE_INDEX: PATTERN_WHITE_INDEX,
    THEMES: THEMES,
    SCORES: SCORES,
    ENVELOPE: ENVELOPE,
    MASTER_GAIN_DB: MASTER_GAIN_DB,
    LIMITER_THRESHOLD_DB: LIMITER_THRESHOLD_DB,
    EMPHASIS_MS: EMPHASIS_MS
  };
});
