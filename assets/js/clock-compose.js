// clock-compose.js — SARC Eternal Clock: /clock/compose/ composition editor.
// Development-only (the page itself is draft:true — see
// layouts/clock/compose.html). Browser-only, not dual-module. Depends on the
// already-global clock-config/clock-state/clock-svg/clock-theme/clock-runtime
// bundle (window.SARCClock) plus the page-scoped clock-scores.js/clock-synth.js
// (see that page's own "scripts" block) and the canonical score data embedded
// by clock-scores-data.html. See todo_clock.txt's "SCORE COMPOSITION TOOL"
// section for the full design.
(function () {
  "use strict";

  var page = document.getElementById("cc-page");
  if (!page) return;

  var NS = window.SARCClock;
  if (!NS || !NS.config || !NS.state || !NS.theme || !NS.scores || !NS.synth) return;

  var config = NS.config;
  var stateModule = NS.state;
  var themeModule = NS.theme;
  var scoresModule = NS.scores;
  var synth = NS.synth;

  var STEPS = config.STEPS_PER_BAR;

  // --- Embedded data -----------------------------------------------------------
  var scoresDataEl = document.getElementById("clock-scores-data");
  var colorplanDataEl = document.getElementById("clock-compose-colorplan-data");
  if (!scoresDataEl || !colorplanDataEl) return;

  var scoresDoc = JSON.parse(scoresDataEl.textContent); // { version, pitchClasses, octaveOffsets, scores }
  var colorplanColors = JSON.parse(colorplanDataEl.textContent); // full 55-color table, for display names

  var colorNameBySlug = {};
  colorplanColors.forEach(function (c) { colorNameBySlug[c.slug] = c.name; });

  // Production rotation order + hex — config.THEMES is the single source of
  // truth for order (see clock-config.js); this editor never re-derives it.
  var THEMES = config.THEMES; // [{token, hex}, ...] in production order

  var VOCAB = scoresModule.buildVocabulary(scoresDoc.pitchClasses, scoresDoc.octaveOffsets);
  var VOCAB_SET = {};
  VOCAB.forEach(function (e) { VOCAB_SET[e.ratio] = true; });

  // --- Working state -------------------------------------------------------------
  // savedScores: last-known-saved-to-repository state (starts as the embedded
  // corpus; updated locally after every successful bridge save — never
  // re-fetched, since this is a single-composer local tool).
  var savedScores = scoresDoc.scores;
  // workingScores: the in-memory editable copy. Only diverges from
  // savedScores[token] once a color has actually been touched.
  var workingScores = {};

  function cloneRecord(record) {
    return { authored: !!record.authored, a: record.a.slice(), b: record.b.slice() };
  }

  function workingCopy(token) {
    if (!workingScores[token]) workingScores[token] = cloneRecord(savedScores[token]);
    return workingScores[token];
  }

  function isUnsaved(token) {
    var working = workingScores[token];
    if (!working) return false;
    var saved = savedScores[token];
    return working.a.join(",") !== saved.a.join(",") || working.b.join(",") !== saved.b.join(",");
  }

  // --- Selection state -------------------------------------------------------------
  var selectedToken = THEMES[0].token;
  var selectedCell = { lane: "a", step: 0 };
  // The running sequence always sources audio from selectedToken directly —
  // a color change takes effect on the very next step, not at the next
  // 16-step boundary. (An earlier version phrase-aligned this via a
  // separate playingToken/pendingToken pair; removed because it made rapid
  // A/B color comparison feel laggy in practice.)

  // --- Playback state -------------------------------------------------------------
  var playMode = "both";
  var playSpeed = 1;
  var isPlaying = false;
  var audioGraph = null; // { Tone, voice, sequence }

  // --- DOM ----------------------------------------------------------------------
  var el = {
    live: page.querySelector(".cc-live"),
    selectedInfo: document.getElementById("cc-selected-info"),
    grid: document.getElementById("cc-grid"),
    palette: document.getElementById("cc-palette"),
    palettePosition: document.getElementById("cc-palette-position"),
    status: document.getElementById("cc-status"),
    unsavedIndicator: document.getElementById("cc-unsaved-indicator"),
    picker: document.getElementById("cc-picker"),
    pickerList: document.getElementById("cc-picker-list"),
    playBtn: page.querySelector("[data-cc-play]")
  };

  function setStatus(text, tone) {
    el.status.textContent = text || "";
    if (tone) el.status.setAttribute("data-tone", tone);
    else el.status.removeAttribute("data-tone");
  }

  // --- Theme / colour -------------------------------------------------------------
  function themeIndexForToken(token) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].token === token) return i;
    return 0;
  }

  function applyPageColor(token) {
    themeModule.applyTheme(page, themeIndexForToken(token));
  }

  // --- Rendering: selected-color readout -------------------------------------------
  function renderSelectedInfo() {
    var idx = themeIndexForToken(selectedToken);
    var name = colorNameBySlug[selectedToken] || selectedToken;
    var record = workingCopy(selectedToken);
    el.selectedInfo.innerHTML =
      "<dt>Color</dt><dd>" + name + "</dd>" +
      "<dt>Token</dt><dd>" + selectedToken + "</dd>" +
      "<dt>Position</dt><dd>" + (idx + 1) + " / " + THEMES.length + "</dd>" +
      "<dt>Status</dt><dd>" + (isUnsaved(selectedToken) ? "unsaved" : (record.authored ? "authored" : "placeholder")) + "</dd>";
  }

  // --- Rendering: 16 x 2 grid -------------------------------------------------------
  function buildGridOnce() {
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    for (var i = 0; i < STEPS; i++) {
      var th = document.createElement("th");
      th.textContent = String(i + 1).padStart(2, "0");
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    el.grid.appendChild(thead);

    var tbody = document.createElement("tbody");
    ["a", "b"].forEach(function (lane) {
      var row = document.createElement("tr");
      row.className = "cc-row cc-row--" + lane;
      var label = document.createElement("th");
      label.className = "cc-row-label";
      label.scope = "row";
      label.textContent = lane.toUpperCase();
      row.appendChild(label);
      for (var step = 0; step < STEPS; step++) {
        var td = document.createElement("td");
        td.className = "cc-cell";
        td.tabIndex = -1;
        td.setAttribute("data-lane", lane);
        td.setAttribute("data-step", String(step));
        td.addEventListener("click", function (ev) {
          var t = ev.currentTarget;
          selectCell(t.getAttribute("data-lane"), parseInt(t.getAttribute("data-step"), 10));
        });
        td.addEventListener("dblclick", function (ev) {
          openPickerFor(ev.currentTarget);
        });
        row.appendChild(td);
      }
      tbody.appendChild(row);
    });
    el.grid.appendChild(tbody);
  }

  function cellEl(lane, step) {
    return el.grid.querySelector('.cc-cell[data-lane="' + lane + '"][data-step="' + step + '"]');
  }

  function renderGrid() {
    var record = workingCopy(selectedToken);
    ["a", "b"].forEach(function (lane) {
      for (var step = 0; step < STEPS; step++) {
        var ratio = record[lane][step];
        var cell = cellEl(lane, step);
        var isSelected = selectedCell.lane === lane && selectedCell.step === step;
        cell.textContent = ratio;
        cell.classList.toggle("is-selected", isSelected);
        cell.classList.toggle("is-out-of-vocab", !VOCAB_SET[ratio]);
        // Roving tabindex — exactly one cell (the selected one) is reachable
        // by Tab from outside the grid; every other cell is -1. Arrow-key
        // navigation moves selection AND calls .focus() directly (works
        // regardless of tabindex), so this only matters for the very first
        // Tab into the widget.
        cell.tabIndex = isSelected ? 0 : -1;
      }
    });
  }

  // --- Rendering: palette overview --------------------------------------------------
  function renderPalette() {
    el.palette.innerHTML = "";
    THEMES.forEach(function (theme, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-swatch";
      btn.style.background = theme.hex;
      btn.setAttribute("role", "option");
      btn.setAttribute("data-token", theme.token);
      btn.title = (colorNameBySlug[theme.token] || theme.token) + " (" + (i + 1) + "/" + THEMES.length + ")";
      var status = isUnsaved(theme.token) ? "unsaved" : (workingCopy(theme.token).authored ? "authored" : "placeholder");
      btn.setAttribute("data-cc-status", status);
      btn.setAttribute("aria-selected", theme.token === selectedToken ? "true" : "false");
      btn.classList.toggle("is-selected", theme.token === selectedToken);
      btn.addEventListener("click", function () { selectColor(theme.token); });
      el.palette.appendChild(btn);
    });
    el.palettePosition.textContent = (themeIndexForToken(selectedToken) + 1) + " / " + THEMES.length;
  }

  function refreshPaletteStatuses() {
    var buttons = el.palette.querySelectorAll(".cc-swatch");
    buttons.forEach(function (btn) {
      var token = btn.getAttribute("data-token");
      var status = isUnsaved(token) ? "unsaved" : (workingCopy(token).authored ? "authored" : "placeholder");
      btn.setAttribute("data-cc-status", status);
      btn.classList.toggle("is-selected", token === selectedToken);
      btn.setAttribute("aria-selected", token === selectedToken ? "true" : "false");
    });
    el.palettePosition.textContent = (themeIndexForToken(selectedToken) + 1) + " / " + THEMES.length;
  }

  function updateUnsavedIndicator() {
    var any = Object.keys(workingScores).some(isUnsaved);
    el.unsavedIndicator.hidden = !isUnsaved(selectedToken);
    el.unsavedIndicator.textContent = isUnsaved(selectedToken) ? "unsaved" : "";
    page.classList.toggle("has-unsaved-anywhere", any);
  }

  function renderAll() {
    applyPageColor(selectedToken);
    renderSelectedInfo();
    renderGrid();
    refreshPaletteStatuses();
    updateUnsavedIndicator();
  }

  // --- Selection -------------------------------------------------------------------
  function selectColor(token) {
    if (token === selectedToken) return;
    // Switches both the visible grid/background AND, if a sequence is
    // running, the audio it's sourcing from — immediately, on the very next
    // step (see the sequence callback in startPlayback, which reads
    // selectedToken live every tick rather than a separate deferred target).
    selectedToken = token;
    selectedCell = { lane: "a", step: 0 };
    renderAll();
  }

  function selectCell(lane, step) {
    selectedCell = { lane: lane, step: step };
    renderGrid();
    var cell = cellEl(lane, step);
    if (cell) cell.focus();
  }

  function stepColor(delta) {
    var idx = themeIndexForToken(selectedToken);
    var next = ((idx + delta) % THEMES.length + THEMES.length) % THEMES.length;
    selectColor(THEMES[next].token);
  }

  // --- Editing -----------------------------------------------------------------------
  function setCellRatio(lane, step, ratio) {
    var record = workingCopy(selectedToken);
    record[lane][step] = ratio;
    renderGrid();
    refreshPaletteStatuses();
    updateUnsavedIndicator();
    renderSelectedInfo();
  }

  function vocabIndexOf(ratio) {
    for (var i = 0; i < VOCAB.length; i++) if (VOCAB[i].ratio === ratio) return i;
    return -1;
  }

  function cycleSelectedPitch(delta) {
    var record = workingCopy(selectedToken);
    var current = record[selectedCell.lane][selectedCell.step];
    var idx = vocabIndexOf(current);
    var nextIdx;
    if (idx === -1) {
      // Off-vocabulary (placeholder) value — land on the nearest vocabulary
      // entry in the requested direction rather than stepping from nowhere.
      var value = scoresModule.ratioValue(current);
      nextIdx = delta > 0 ? 0 : VOCAB.length - 1;
      for (var i = 0; i < VOCAB.length; i++) {
        if (delta > 0 && VOCAB[i].value > value) { nextIdx = i; break; }
        if (delta < 0 && VOCAB[i].value < value) nextIdx = i;
      }
    } else {
      nextIdx = ((idx + delta) % VOCAB.length + VOCAB.length) % VOCAB.length;
    }
    setCellRatio(selectedCell.lane, selectedCell.step, VOCAB[nextIdx].ratio);
    auditionCell(selectedCell.lane, selectedCell.step, false);
  }

  function moveStep(delta) {
    var next = ((selectedCell.step + delta) % STEPS + STEPS) % STEPS;
    selectCell(selectedCell.lane, next);
  }

  function toggleLane() {
    selectCell(selectedCell.lane === "a" ? "b" : "a", selectedCell.step);
  }

  // --- Pitch picker (popover, for mouse entry) ----------------------------------------
  var pickerOpenFor = null;

  function renderPickerList() {
    el.pickerList.innerHTML = "";
    var current = workingCopy(selectedToken)[pickerOpenFor.lane][pickerOpenFor.step];
    VOCAB.forEach(function (entry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-picker-option" + (entry.ratio === current ? " is-current" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", entry.ratio === current ? "true" : "false");
      btn.setAttribute("data-category", entry.category);
      btn.innerHTML =
        '<span class="cc-picker-ratio">' + entry.ratio + "</span>" +
        '<span class="cc-picker-category">' + entry.category + " · oct " + (entry.octave > 0 ? "+" + entry.octave : entry.octave) + "</span>";
      btn.addEventListener("click", function () {
        setCellRatio(pickerOpenFor.lane, pickerOpenFor.step, entry.ratio);
        auditionCell(pickerOpenFor.lane, pickerOpenFor.step, false);
        closePicker();
      });
      el.pickerList.appendChild(btn);
    });
  }

  function openPickerFor(cell) {
    var lane = cell.getAttribute("data-lane");
    var step = parseInt(cell.getAttribute("data-step"), 10);
    selectCell(lane, step);
    pickerOpenFor = { lane: lane, step: step };
    renderPickerList();
    var rect = cell.getBoundingClientRect();
    el.picker.style.left = Math.max(4, rect.left) + "px";
    el.picker.style.top = (rect.bottom + 4) + "px";
    el.picker.hidden = false;
    var current = el.pickerList.querySelector(".cc-picker-option");
    if (current) current.focus();
  }

  function closePicker() {
    el.picker.hidden = true;
    pickerOpenFor = null;
  }

  document.addEventListener("click", function (ev) {
    if (el.picker.hidden) return;
    if (el.picker.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest(".cc-cell")) return;
    closePicker();
  });
  document.addEventListener("keydown", function (ev) {
    if (!el.picker.hidden && ev.key === "Escape") { closePicker(); ev.stopPropagation(); }
  });

  // --- Audio: shared graph --------------------------------------------------------
  // Ensures Tone is loaded, the AudioContext is running (requires a user
  // gesture — every call path here is itself inside a click/keydown
  // handler), and one persistent voice graph exists — reused by the
  // transport loop AND single-cell/dyad audition, per "reuse the production
  // synth... should not otherwise have a different sonic character."
  function ensureAudio() {
    // synth.loadToneSync loads via blocking XHR + eval (not a <script> tag)
    // specifically so Tone.js's own module evaluation — and therefore its
    // own default Destination/Transport/context creation — happens inside
    // THIS synchronous call, still within whatever click/keydown gesture
    // called ensureAudio(). See clock-synth.js's own comment for why a
    // separately-created-then-adopted context doesn't work with this
    // Tone.js build (Destination/Transport silently stay bound to the wrong
    // context, producing no sound with no errors, on every browser).
    return synth.loadToneSync(page.getAttribute("data-tone-src")).then(function (Tone) {
      return Tone.start().then(function () {
        if (!audioGraph) {
          audioGraph = { Tone: Tone, voice: synth.buildVoiceGraph(Tone, config), sequence: null };
        }
        return audioGraph;
      });
    });
  }

  function auditionCell(lane, step, dyad) {
    ensureAudio().then(function (graph) {
      var record = workingCopy(selectedToken);
      var freqA = config.REFERENCE_FREQUENCY * scoresModule.ratioValue(record.a[step]);
      var freqB = config.REFERENCE_FREQUENCY * scoresModule.ratioValue(record.b[step]);
      var now = graph.Tone.now();
      var noteDuration = config.ENVELOPE.decay;
      if (dyad) {
        synth.triggerStep(graph.voice, now, freqA, freqB, true, true, noteDuration);
      } else if (lane === "a") {
        synth.triggerStep(graph.voice, now, freqA, freqB, true, false, noteDuration);
      } else {
        synth.triggerStep(graph.voice, now, freqA, freqB, false, true, noteDuration);
      }
    });
  }

  // --- Audio: transport loop -----------------------------------------------------
  function gatesForStep(step) {
    if (playMode === "both") return { a: true, b: true };
    if (playMode === "a") return { a: true, b: false };
    if (playMode === "b") return { a: false, b: true };
    // CLOCK — the real, live Gray-code gate for this cell index, sampled at
    // trigger time. Deliberately independent of the loop's own position: it
    // shows how the SELECTED score would sound gated by whatever the actual
    // Eternal Clock is doing right now, not a re-creation of the clock's own
    // bar timing (see todo_clock.txt).
    var cells = stateModule.cellsFromNow(Date.now(), config.SARC_EPOCH_MS);
    var cell = cells[step];
    return { a: !!cell.a, b: !!cell.b };
  }

  function startPlayback() {
    ensureAudio().then(function (graph) {
      var Tone = graph.Tone;
      Tone.Transport.bpm.value = config.BPM * playSpeed;
      var noteDuration = config.ENVELOPE.decay;

      graph.sequence = new Tone.Sequence(function (time, step) {
        // Reads selectedToken live, every step — a color change (or a pitch
        // edit) takes effect on the very next step, not at a phrase boundary.
        var record = workingCopy(selectedToken);
        var freqA = config.REFERENCE_FREQUENCY * scoresModule.ratioValue(record.a[step]);
        var freqB = config.REFERENCE_FREQUENCY * scoresModule.ratioValue(record.b[step]);
        var gates = gatesForStep(step);
        synth.triggerStep(graph.voice, time, freqA, freqB, gates.a, gates.b, noteDuration);
        Tone.Draw.schedule(function () {
          highlightStep(step, gates);
        }, time);
      }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "16n");

      graph.sequence.start(0);
      Tone.Transport.start();
      isPlaying = true;
      el.playBtn.setAttribute("data-playing", "true");
      el.playBtn.textContent = "Stop";
    });
  }

  var lastHighlighted = null;
  function highlightStep(step, gates) {
    if (lastHighlighted) {
      var prevA = cellEl("a", lastHighlighted);
      var prevB = cellEl("b", lastHighlighted);
      if (prevA) prevA.classList.remove("is-gate-active");
      if (prevB) prevB.classList.remove("is-gate-active");
    }
    var curA = cellEl("a", step);
    var curB = cellEl("b", step);
    if (gates.a && curA) curA.classList.add("is-gate-active");
    if (gates.b && curB) curB.classList.add("is-gate-active");
    lastHighlighted = step;
  }

  function stopPlayback() {
    var Tone = window.Tone;
    if (Tone) {
      Tone.Transport.stop();
      Tone.Transport.cancel();
    }
    if (audioGraph && audioGraph.sequence) {
      audioGraph.sequence.dispose();
      audioGraph.sequence = null;
    }
    isPlaying = false;
    el.playBtn.setAttribute("data-playing", "false");
    el.playBtn.textContent = "Play";
    if (lastHighlighted !== null) {
      var a = cellEl("a", lastHighlighted), b = cellEl("b", lastHighlighted);
      if (a) a.classList.remove("is-gate-active");
      if (b) b.classList.remove("is-gate-active");
      lastHighlighted = null;
    }
  }

  // --- Copy / paste ------------------------------------------------------------------
  var scoreClipboard = null; // { a: [16], b: [16] }
  var laneClipboard = null;  // [16]

  function copyScore() {
    var record = workingCopy(selectedToken);
    scoreClipboard = { a: record.a.slice(), b: record.b.slice() };
    setStatus("Copied score.");
  }
  function pasteScore() {
    if (!scoreClipboard) { setStatus("Nothing copied.", "error"); return; }
    var record = workingCopy(selectedToken);
    record.a = scoreClipboard.a.slice();
    record.b = scoreClipboard.b.slice();
    renderAll();
    setStatus("Pasted score (unsaved — press Save to keep it).");
  }
  function copyLane(lane) {
    laneClipboard = workingCopy(selectedToken)[lane].slice();
    setStatus("Copied lane " + lane.toUpperCase() + ".");
  }
  function pasteLane(lane) {
    if (!laneClipboard) { setStatus("Nothing copied.", "error"); return; }
    workingCopy(selectedToken)[lane] = laneClipboard.slice();
    renderAll();
    setStatus("Pasted into lane " + lane.toUpperCase() + " (unsaved — press Save to keep it).");
  }

  // --- Save / revert -----------------------------------------------------------------
  var BRIDGE_URL = page.getAttribute("data-cc-bridge");

  function save() {
    var token = selectedToken;
    var record = workingCopy(token);
    setStatus("Saving " + token + "…");
    fetch(BRIDGE_URL + "/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, a: record.a, b: record.b })
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (result) {
      if (!result.ok) {
        setStatus("Save failed: " + (result.body && result.body.errors ? result.body.errors.join("; ") : "unknown error"), "error");
        return;
      }
      // The bridge normalizes (reduces) ratios and sets authored:true — adopt
      // its returned record as the new saved AND working baseline.
      savedScores[token] = cloneRecord(result.body.record);
      workingScores[token] = cloneRecord(result.body.record);
      renderAll();
      setStatus("Saved " + token + ".");
    }).catch(function () {
      setStatus("Save failed: could not reach the save bridge — is `make clock-compose` running?", "error");
    });
  }

  function revert() {
    delete workingScores[selectedToken];
    renderAll();
    setStatus("Reverted " + selectedToken + " to the last saved state.");
  }

  // --- Keyboard navigation (grid) ------------------------------------------------------
  el.grid.addEventListener("keydown", function (ev) {
    if (!ev.target.classList || !ev.target.classList.contains("cc-cell")) return;
    switch (ev.key) {
      case "ArrowUp": ev.preventDefault(); cycleSelectedPitch(1); break;
      case "ArrowDown": ev.preventDefault(); cycleSelectedPitch(-1); break;
      case "ArrowLeft": ev.preventDefault(); moveStep(-1); break;
      case "ArrowRight": ev.preventDefault(); moveStep(1); break;
      case "Tab": ev.preventDefault(); toggleLane(); break;
      case "Enter": ev.preventDefault(); openPickerFor(ev.target); break;
      case " ":
        ev.preventDefault();
        auditionCell(selectedCell.lane, selectedCell.step, ev.shiftKey);
        break;
      default: break;
    }
  });

  // --- Global keyboard shortcuts --------------------------------------------------------
  document.addEventListener("keydown", function (ev) {
    var tag = (ev.target && ev.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      save();
      return;
    }
    if (ev.key === "[") { stepColor(-1); return; }
    if (ev.key === "]") { stepColor(1); return; }
  });

  // --- Wire up static controls -----------------------------------------------------------
  page.querySelectorAll("[data-cc-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      playMode = btn.getAttribute("data-cc-mode");
      page.querySelectorAll("[data-cc-mode]").forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
    });
  });
  page.querySelectorAll("[data-cc-speed]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      playSpeed = parseFloat(btn.getAttribute("data-cc-speed"));
      page.querySelectorAll("[data-cc-speed]").forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      if (isPlaying && window.Tone) window.Tone.Transport.bpm.value = config.BPM * playSpeed;
    });
  });
  el.playBtn.addEventListener("click", function () {
    if (isPlaying) stopPlayback(); else startPlayback();
  });
  page.querySelector("[data-cc-save]").addEventListener("click", save);
  page.querySelector("[data-cc-revert]").addEventListener("click", revert);
  page.querySelector("[data-cc-prev]").addEventListener("click", function () { stepColor(-1); });
  page.querySelector("[data-cc-next]").addEventListener("click", function () { stepColor(1); });
  page.querySelector('[data-cc-copy="score"]').addEventListener("click", copyScore);
  page.querySelector('[data-cc-paste="score"]').addEventListener("click", pasteScore);
  page.querySelector('[data-cc-copy="a"]').addEventListener("click", function () { copyLane("a"); });
  page.querySelector('[data-cc-paste="a"]').addEventListener("click", function () { pasteLane("a"); });
  page.querySelector('[data-cc-copy="b"]').addEventListener("click", function () { copyLane("b"); });
  page.querySelector('[data-cc-paste="b"]').addEventListener("click", function () { pasteLane("b"); });

  // Warn before an accidental tab close/reload discards unsaved edits —
  // "Navigating to another color with unsaved edits should not silently
  // discard them" extended to leaving the page entirely.
  window.addEventListener("beforeunload", function (ev) {
    var anyUnsaved = Object.keys(workingScores).some(isUnsaved);
    if (!anyUnsaved) return;
    ev.preventDefault();
    ev.returnValue = "";
  });

  // --- Init ---------------------------------------------------------------------------
  buildGridOnce();
  renderPalette();
  renderAll();
})();
