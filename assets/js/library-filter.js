// Library catalog filter + Catalog/Images view switch — progressive
// enhancement, no dependencies.
// Facets: type (multi, OR), subject (multi, OR), sarc/origin (single). Facets
// combine with AND: (typeA OR typeB) AND (subjA OR subjB) AND origin.
// State lives in the URL query string (?type=a,b&subject=c&sarc=true&view=images)
// so views are shareable and survive back/forward. Without this script the
// whole catalog is visible (the filter form and view switch are CSS-hidden on
// the no-JS flag) and there is no Images view at all.
//
// The Images view is not a separate page or gallery — it's the same filtered
// entry collection with two server-rendered presentations (#library-list,
// the ruled Catalog records; #library-image-index, a thumbnail-only grid —
// see library-image-index.html, which reuses the exact same processed image
// as the Catalog thumbnail via library-thumbnail.html). This script only
// toggles which one is hidden and applies one filter pass to both, so they
// can never show different entries. It dispatches a `library:view-change`
// event on `document` on every view change so library-random.js can keep the
// "From the Library" panel's text visibility in sync.
(function () {
  "use strict";

  var form = document.querySelector(".reference-filters");
  var list = document.getElementById("library-list");
  if (!form || !list) return;

  var imageIndex = document.getElementById("library-image-index");
  var viewSwitch = document.querySelector("[data-view-switch]");
  var viewButtons = viewSwitch ? Array.prototype.slice.call(viewSwitch.querySelectorAll("[data-library-view]")) : [];

  var records = Array.prototype.slice.call(list.querySelectorAll(".library-record"));
  var imageItems = imageIndex ? Array.prototype.slice.call(imageIndex.querySelectorAll(".library-image-index__item")) : [];

  // Randomize the catalog order per visit so no single entry always leads the
  // list. Fisher-Yates, applied once at init by re-appending in shuffled order;
  // filtering below only toggles `hidden`, so it preserves this order. Without
  // JS the server-rendered (deterministic) order stands. The Images grid is
  // reordered to match by library-id, so the two views never disagree on order.
  var order = records.map(function (r) { return r.dataset.libraryId; });
  (function shuffle() {
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
  })();
  function reorder(container, items) {
    if (!container || !items.length) return items;
    var byId = {};
    items.forEach(function (el) { byId[el.dataset.libraryId] = el; });
    var sorted = order.map(function (id) { return byId[id]; }).filter(Boolean);
    var frag = document.createDocumentFragment();
    sorted.forEach(function (el) { frag.appendChild(el); });
    container.appendChild(frag);
    return sorted;
  }
  records = reorder(list, records);
  imageItems = reorder(imageIndex, imageItems);

  var chips = Array.prototype.slice.call(form.querySelectorAll(".rf-chip"));
  var clearBtn = form.querySelector(".rf-clear");
  var countEl = form.querySelector(".rf-count");
  // The "From the Library" random pick is independent of filters, so hide it
  // while any filter is active (it returns when filters are cleared) — otherwise
  // an unrelated featured entry above a filtered list reads as a broken filter.
  var randomSection = document.getElementById("library-random");
  // The list heading must not claim "All entries" while a subset is shown.
  var allHead = document.getElementById("all-entries");

  var imagesEmpty = null;
  if (imageIndex) {
    imagesEmpty = document.createElement("p");
    imagesEmpty.className = "library-image-index-empty";
    imagesEmpty.hidden = true;
    imagesEmpty.textContent = "No matching entries have images.";
    imageIndex.insertAdjacentElement("afterend", imagesEmpty);
  }

  // Active state: multi sets for type + subject, single value for sarc, plus
  // the presentation view ("catalog" | "images").
  var sel = { type: [], subject: [], sarc: "" };
  var view = "catalog";

  function chipsFor(facet) {
    return chips.filter(function (c) { return c.dataset.facet === facet; });
  }

  function setView(v) {
    view = v === "images" ? "images" : "catalog";
    document.documentElement.dataset.libraryView = view;
    list.hidden = view === "images";
    if (imageIndex) imageIndex.hidden = view !== "images";
    viewButtons.forEach(function (b) {
      var on = b.dataset.libraryView === view;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-active", on);
    });
    // Harmless if library-random.js's listener isn't attached yet (its first
    // render reads the attribute set above directly); on later view changes
    // (button click, popstate) the listener is live and syncs the panel.
    document.dispatchEvent(new CustomEvent("library:view-change", { detail: { view: view } }));
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

  function matches(ds) {
    var recType = ds.type || "";
    var recSubs = (ds.subjects || "").split(/\s+/).filter(Boolean);
    var recSarc = ds.sarc || "false";
    var typeOk = sel.type.length === 0 || sel.type.indexOf(recType) !== -1;
    var subjOk = sel.subject.length === 0 || sel.subject.some(function (s) {
      return recSubs.indexOf(s) !== -1;
    });
    var sarcOk = sel.sarc === "" || recSarc === sel.sarc;
    return typeOk && subjOk && sarcOk;
  }

  function apply() {
    var anyFilter = sel.type.length > 0 || sel.subject.length > 0 || sel.sarc !== "";
    if (randomSection) randomSection.hidden = anyFilter;
    if (allHead) allHead.textContent = anyFilter ? "Matching entries" : "All entries";

    var shown = 0;
    records.forEach(function (rec) {
      var visible = matches(rec.dataset);
      rec.hidden = !visible;
      if (visible) shown++;
    });

    var shownWithImages = 0;
    imageItems.forEach(function (item) {
      var visible = matches(item.dataset);
      item.hidden = !visible;
      if (visible) shownWithImages++;
    });

    if (countEl) {
      if (view === "images") {
        if (shownWithImages === 0) {
          countEl.textContent = "0 images among " + shown + (anyFilter ? " matching entries" : " entries");
        } else {
          countEl.textContent = shown + (anyFilter ? " matching entries" : " entries") +
            " · " + shownWithImages + " with images";
        }
        if (imagesEmpty) imagesEmpty.hidden = shownWithImages !== 0;
      } else {
        countEl.textContent = shown === records.length
          ? shown + (shown === 1 ? " entry" : " entries")
          : shown + " of " + records.length + (records.length === 1 ? " entry" : " entries");
        if (imagesEmpty) imagesEmpty.hidden = true;
      }
    }
    paint();
  }

  function toURL(push) {
    var params = new URLSearchParams();
    if (sel.type.length) params.set("type", sel.type.join(","));
    if (sel.subject.length) params.set("subject", sel.subject.join(","));
    if (sel.sarc) params.set("sarc", sel.sarc);
    if (view === "images") params.set("view", "images");
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
    var v = params.get("view") || "";
    setView(v === "images" ? "images" : "catalog");
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

  viewButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.libraryView === view) return;
      setView(b.dataset.libraryView);
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
