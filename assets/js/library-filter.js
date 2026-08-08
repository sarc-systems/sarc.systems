// Library catalog filter + Catalog/Images/Map view switch —
// progressive enhancement, no dependencies.
// Facets: type (multi, OR), subject (multi, OR). Facets combine with AND:
// (typeA OR typeB) AND (subjA OR subjB). (An Origin/SARC-work facet was
// removed for now — sarc_work is still a valid per-entry field and still in
// the JSON index, just not filterable here.)
// State lives in the URL query string (?type=a,b&subject=c&view=catalog) so
// views are shareable and survive back/forward. A fourth param, `select=
// <library.id>`, coexists in the same query string but is owned and written
// entirely by library-map.js (Map view's node selection) — this file never
// reads it into its own state, only preserves it unmodified whenever it
// rewrites the URL for a type/subject/view change (see toURL()) so a filter
// or view-switch click never silently drops the current selection from the
// address bar. Without this script the whole catalog is visible (the filter
// form and view switch are CSS-hidden on the no-JS flag), and there is no
// Images or Map view — Catalog is the complete no-JS fallback.
//
// One shared model, not two: View/Type/Subject define a single field, and
// the results below are filtered from that field. This script owns all of
// it — #library-list / #library-image-index (the results — server-rendered
// .library-record/.library-image-index__item elements; reused, not rebuilt,
// filtered by their data-* attributes).
(function () {
  "use strict";

  // A native <details> now, not literally a <form> (see library-filters.html)
  // — kept the name since it's still queried the same way throughout.
  var form = document.querySelector(".reference-filters");
  var list = document.getElementById("library-list");
  if (!form || !list) return;

  var imageIndex = document.getElementById("library-image-index");
  var mapView = document.getElementById("library-map");
  // The Map view's own instructions/empty-state text live as plain page
  // text OUTSIDE #library-map (see library-map-view.html and CLAUDE.md §
  // Library "Map view" — deliberately not sharing a bordered box with the
  // canvas). That also means they're outside what mapView.hidden alone
  // controls below, so setView() has to toggle them itself or they'd stay
  // visible under Catalog/Images too.
  var mapHint = document.querySelector(".library-map-hint");
  var mapEmpty = document.getElementById("library-map-empty");
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
  // The list heading must not claim "All entries" while a subset is shown.
  var allHead = document.getElementById("all-entries");

  var catalogEmpty = null; // created on demand once results can be empty
  var imagesEmpty = null;
  if (imageIndex) {
    imagesEmpty = document.createElement("p");
    imagesEmpty.className = "library-image-index-empty";
    imagesEmpty.hidden = true;
    imageIndex.insertAdjacentElement("afterend", imagesEmpty);
  }
  function ensureCatalogEmpty() {
    if (catalogEmpty || !list) return catalogEmpty;
    catalogEmpty = document.createElement("p");
    catalogEmpty.className = "library-empty";
    catalogEmpty.hidden = true;
    catalogEmpty.textContent = "No matching entries.";
    list.insertAdjacentElement("afterend", catalogEmpty);
    return catalogEmpty;
  }

  // --- Filters + view state -------------------------------------------------
  function chipsFor(facet) {
    return chips.filter(function (c) { return c.dataset.facet === facet; });
  }

  // Active state: multi sets for type + subject, plus the presentation view
  // ("catalog" | "images" | "map"). Map is the default — an absent or
  // invalid ?view= resolves to "map" (see fromURL/toURL below, which only
  // ever add view=catalog or view=images to the URL).
  var sel = { type: [], subject: [] };
  var view = "map";

  function setView(v) {
    view = (v === "catalog" || v === "images") ? v : "map";
    document.documentElement.dataset.libraryView = view;
    list.hidden = view !== "catalog";
    if (imageIndex) imageIndex.hidden = view !== "images";
    if (mapView) mapView.hidden = view !== "map";
    if (mapHint) mapHint.hidden = view !== "map";
    // Only ever forced hidden here, on the way OUT of Map view — while
    // actually in Map view, library-map.js's own finishRelayout() is what
    // decides whether there's genuinely nothing to show, and keeps deciding
    // that correctly across filter changes; setView() has no opinion on
    // that content, only on whether Map's own elements should be visible
    // at all under a different view.
    if (mapEmpty && view !== "map") mapEmpty.hidden = true;
    viewButtons.forEach(function (b) {
      var on = b.dataset.libraryView === view;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-active", on);
    });
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
    if (clearBtn) clearBtn.hidden = !sel.type.length && !sel.subject.length;
  }

  function matchesFields(type, subjects) {
    var typeOk = sel.type.length === 0 || sel.type.indexOf(type) !== -1;
    var subjOk = sel.subject.length === 0 || sel.subject.some(function (s) {
      return subjects.indexOf(s) !== -1;
    });
    return typeOk && subjOk;
  }
  function matchesDataset(ds) {
    return matchesFields(ds.type || "", (ds.subjects || "").split(/\s+/).filter(Boolean));
  }

  // `fromNav` is true only when called right after fromURL() (initial load or
  // popstate) — see the two call sites at the bottom of this file. Only then
  // do we set `open` explicitly (matching whether a filter is active), so a
  // shared filtered link (or Back/Forward into one) doesn't hide its own
  // explanation. This is deliberately unconditional (not "only force true"):
  // browsers restore a <details> element's open/closed state across a normal
  // reload/history navigation on their own (like scroll position or a form
  // field), independent of any server-rendered attribute — so an unfiltered
  // reload could otherwise show it open just because it was last left open.
  // Setting `open` here on every nav-triggered apply() overrides that. An
  // ordinary chip click never touches `open`, so it doesn't fight a visitor
  // who's already opened or closed the panel themselves mid-session.
  function apply(fromNav) {
    var anyFilter = sel.type.length > 0 || sel.subject.length > 0;
    if (allHead) allHead.textContent = anyFilter ? "Matching entries" : "All entries";
    if (fromNav && "open" in form) form.open = anyFilter;

    var shown = 0;
    records.forEach(function (rec) {
      var visible = matchesDataset(rec.dataset);
      rec.hidden = !visible;
      if (visible) shown++;
    });
    var emptyEl = ensureCatalogEmpty();
    if (emptyEl) emptyEl.hidden = shown !== 0 || view !== "catalog";

    var shownWithImages = 0;
    imageItems.forEach(function (item) {
      var visible = matchesDataset(item.dataset);
      item.hidden = !visible;
      if (visible) shownWithImages++;
    });
    if (imagesEmpty) {
      imagesEmpty.textContent = shown === 0 ? "No matching entries." : "No matching entries have images.";
      imagesEmpty.hidden = shownWithImages !== 0 || view !== "images";
    }

    if (countEl) {
      if (view === "images") {
        if (shownWithImages === 0) {
          countEl.textContent = shown === 0
            ? "0 matching entries"
            : "0 images among " + shown + (anyFilter ? " matching entries" : " entries");
        } else {
          countEl.textContent = shown + (anyFilter ? " matching entries" : " entries") +
            " · " + shownWithImages + " with images";
        }
      } else {
        // Catalog and Map share the same plain count — Map's node set is the
        // same matching set as Catalog, just diagrammed instead of listed.
        countEl.textContent = shown === records.length
          ? shown + (shown === 1 ? " entry" : " entries")
          : shown + " of " + records.length + (records.length === 1 ? " entry" : " entries");
      }
    }
    paint();
    // library-map.js listens for this to know which entries currently match —
    // it owns its own rendering entirely (see that file), so this is the only
    // coupling between the two: one event, not a shared internal API.
    document.dispatchEvent(new CustomEvent("library:filter-change", {
      detail: { view: view, type: sel.type.slice(), subject: sel.subject.slice() }
    }));
  }

  function toURL(push) {
    var params = new URLSearchParams();
    if (sel.type.length) params.set("type", sel.type.join(","));
    if (sel.subject.length) params.set("subject", sel.subject.join(","));
    if (view === "catalog" || view === "images") params.set("view", view);
    // `select` (the Map view's node selection) is owned entirely by
    // library-map.js — never read into `sel` here — but this rewrite must
    // still carry it forward, or toggling a filter chip / view button would
    // silently drop it from the address bar. Preserve whatever's currently
    // in the URL as-is; library-map.js is responsible for removing it (via
    // its own history.replaceState) once a filter change actually leaves
    // the selection invisible.
    var currentSelect = new URLSearchParams(location.search).get("select");
    if (currentSelect) params.set("select", currentSelect);
    var qs = params.toString();
    if (push) history.pushState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }
  function fromURL() {
    var params = new URLSearchParams(location.search);
    var valid = { type: {}, subject: {} };
    chips.forEach(function (c) { if (c.dataset.value) valid[c.dataset.facet][c.dataset.value] = 1; });
    sel.type = (params.get("type") || "").split(",").filter(function (v) { return valid.type[v]; });
    sel.subject = (params.get("subject") || "").split(",").filter(function (v) { return valid.subject[v]; });
    var v = params.get("view") || "";
    setView(v === "catalog" ? "catalog" : v === "images" ? "images" : "map");
  }

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      var facet = c.dataset.facet, v = c.dataset.value;
      if (v === "") {
        // "All" is already the active state whenever nothing in this facet
        // is selected — clicking it again must be a true no-op (no URL
        // rewrite, no filter-change event), or the Map view reacts to a
        // filter change that never actually happened.
        if (sel[facet].length === 0) return;
        sel[facet] = [];
      } else {
        var i = sel[facet].indexOf(v);
        if (i === -1) sel[facet].push(v); else sel[facet].splice(i, 1);
      }
      toURL(true);
      apply(false);
    });
  });

  viewButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.libraryView === view) return;
      setView(b.dataset.libraryView);
      toURL(true);
      apply(false);
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      sel = { type: [], subject: [] };
      toURL(true);
      apply(false);
    });
  }

  window.addEventListener("popstate", function () { fromURL(); apply(true); });

  fromURL();
  apply(true);
})();
