// Library catalog filter — progressive enhancement, no dependencies.
// Facets: type (multi, OR), subject (multi, OR), sarc/origin (single). Facets
// combine with AND: (typeA OR typeB) AND (subjA OR subjB) AND origin.
// State lives in the URL query string (?type=a,b&subject=c&sarc=true) so views
// are shareable and survive back/forward. Without this script the whole catalog
// is visible (the filter form is CSS-hidden on the no-JS flag).
(function () {
  "use strict";

  var form = document.querySelector(".reference-filters");
  var list = document.getElementById("library-list");
  if (!form || !list) return;

  var records = Array.prototype.slice.call(list.querySelectorAll(".library-record"));
  var chips = Array.prototype.slice.call(form.querySelectorAll(".rf-chip"));
  var clearBtn = form.querySelector(".rf-clear");
  var countEl = form.querySelector(".rf-count");
  // The "From the Library" random pick is independent of filters, so hide it
  // while any filter is active (it returns when filters are cleared) — otherwise
  // an unrelated featured entry above a filtered list reads as a broken filter.
  var randomSection = document.getElementById("library-random");

  // Active state: multi sets for type + subject, single value for sarc.
  var sel = { type: [], subject: [], sarc: "" };

  function chipsFor(facet) {
    return chips.filter(function (c) { return c.dataset.facet === facet; });
  }

  function paint() {
    ["type", "subject"].forEach(function (facet) {
      chipsFor(facet).forEach(function (c) {
        var v = c.dataset.value;
        var on = v === "" ? sel[facet].length === 0 : sel[facet].indexOf(v) !== -1;
        c.setAttribute("aria-pressed", on ? "true" : "false");
        c.classList.toggle("is-active", on);
      });
    });
    chipsFor("sarc").forEach(function (c) {
      var on = c.dataset.value === sel.sarc;
      c.setAttribute("aria-pressed", on ? "true" : "false");
      c.classList.toggle("is-active", on);
    });
    if (clearBtn) clearBtn.hidden = !sel.type.length && !sel.subject.length && sel.sarc === "";
  }

  function apply() {
    var anyFilter = sel.type.length > 0 || sel.subject.length > 0 || sel.sarc !== "";
    if (randomSection) randomSection.hidden = anyFilter;
    var shown = 0;
    records.forEach(function (rec) {
      var recType = rec.dataset.type || "";
      var recSubs = (rec.dataset.subjects || "").split(/\s+/).filter(Boolean);
      var recSarc = rec.dataset.sarc || "false";
      var typeOk = sel.type.length === 0 || sel.type.indexOf(recType) !== -1;
      var subjOk = sel.subject.length === 0 || sel.subject.some(function (s) {
        return recSubs.indexOf(s) !== -1;
      });
      var sarcOk = sel.sarc === "" || recSarc === sel.sarc;
      var visible = typeOk && subjOk && sarcOk;
      rec.hidden = !visible;
      if (visible) shown++;
    });
    if (countEl) {
      countEl.textContent = shown === records.length
        ? shown + (shown === 1 ? " entry" : " entries")
        : shown + " of " + records.length + (records.length === 1 ? " entry" : " entries");
    }
    paint();
  }

  function toURL(push) {
    var params = new URLSearchParams();
    if (sel.type.length) params.set("type", sel.type.join(","));
    if (sel.subject.length) params.set("subject", sel.subject.join(","));
    if (sel.sarc) params.set("sarc", sel.sarc);
    var qs = params.toString();
    if (push) history.pushState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }
  function fromURL() {
    var params = new URLSearchParams(location.search);
    var valid = { type: {}, subject: {}, sarc: {} };
    chips.forEach(function (c) { if (c.dataset.value) valid[c.dataset.facet][c.dataset.value] = 1; });
    sel.type = (params.get("type") || "").split(",").filter(function (v) { return valid.type[v]; });
    sel.subject = (params.get("subject") || "").split(",").filter(function (v) { return valid.subject[v]; });
    var s = params.get("sarc") || "";
    sel.sarc = valid.sarc[s] ? s : "";
  }

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      var facet = c.dataset.facet, v = c.dataset.value;
      if (facet === "sarc") {
        sel.sarc = sel.sarc === v ? "" : v;
      } else if (v === "") {
        sel[facet] = [];
      } else {
        var i = sel[facet].indexOf(v);
        if (i === -1) sel[facet].push(v); else sel[facet].splice(i, 1);
      }
      toURL(true);
      apply();
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      sel = { type: [], subject: [], sarc: "" };
      toURL(true);
      apply();
    });
  }

  window.addEventListener("popstate", function () { fromURL(); apply(); });

  fromURL();
  apply();
})();
