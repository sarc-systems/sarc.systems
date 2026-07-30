// Library catalog filter + Catalog/Images view switch + chance selection —
// progressive enhancement, no dependencies.
// Facets: type (multi, OR), subject (multi, OR). Facets combine with AND:
// (typeA OR typeB) AND (subjA OR subjB). (An Origin/SARC-work facet was
// removed for now — sarc_work is still a valid per-entry field and still in
// the JSON index, just not filterable here.)
// State lives in the URL query string (?type=a,b&subject=c&view=images) so
// views are shareable and survive back/forward. Without this script the
// whole catalog is visible (the filter form and view switch are CSS-hidden on
// the no-JS flag), there is no Images view, and the "From the Library" panel
// stands as its deterministic server-rendered fallback (unfiltered).
//
// One shared model, not two: View/Type/Subject/Origin define a single field,
// and both the "From the Library" chance panel and the complete results below
// it are sampled/filtered from that same field — never independently. This
// script owns all of it:
//   - #library-list / #library-image-index (the results — server-rendered
//     .library-record/.library-image-index__item elements; reused, not
//     rebuilt, filtered by their data-* attributes)
//   - #library-random (the chance panel — rebuilt from /library/index.json,
//     since a result record's DOM doesn't carry everything a featured card
//     needs; see cardHTML() below, kept in sync with library-featured.html)
// Filtering the results is synchronous (the DOM is already there). The chance
// panel depends on an async JSON fetch, so until that resolves, its
// server-rendered fallback (first `featured: true` entry, or first in catalog
// order — see library-random.html) stands regardless of active filters; once
// loaded, it's revalidated against the current field on every change from
// then on, same as everything else.
// The chance panel has no presentation of its own in Map view — it isn't a
// display of the matching set the way Catalog/Images are — so it inherits
// whichever of Catalog/Images was last actually active (see chanceView()):
// image-bearing-only pool and image-only card in Map right after Images,
// full pool and full card in Map right after Catalog.
(function () {
  "use strict";

  // A native <details> now, not literally a <form> (see library-filters.html)
  // — kept the name since it's still queried the same way throughout.
  var form = document.querySelector(".reference-filters");
  var list = document.getElementById("library-list");
  if (!form || !list) return;

  var imageIndex = document.getElementById("library-image-index");
  var mapView = document.getElementById("library-map");
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

  // --- Chance panel (the "From the Library" section) ----------------------
  var randomSection = document.getElementById("library-random");
  var randomSlot = randomSection ? randomSection.querySelector("[data-random-slot]") : null;
  var anotherBtn = randomSection ? randomSection.querySelector(".library-random-another") : null;
  var announceEl = randomSection ? randomSection.querySelector("[data-chance-announce]") : null;
  var STORE_KEY = "sarc-library-random";
  var allEntries = null; // null until /library/index.json resolves
  var currentId = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cardHTML(e, imagesView) {
    var img = e.primary_image;
    var thumb = img ? (
      '<a class="library-featured-thumb" href="' + esc(e.url) + '" aria-label="View ' + esc(e.title) + '"' +
      (imagesView ? "" : ' tabindex="-1" aria-hidden="true"') +
      '><img src="' + esc(img.url) +
      '" style="object-position: ' + esc(img.pos || "center") + '" alt="' + esc(img.alt) +
      '" loading="lazy" decoding="async"></a>'
    ) : "";
    var kick = [];
    if (e.creator_names) kick.push(esc(e.creator_names));
    if (e.type_label) kick.push(esc(e.type_label));
    if (e.year) kick.push(esc(e.year));
    var subs = (e.subject_labels || []).map(esc).join(' <span class="dot" aria-hidden="true">·</span> ');
    return '<article class="library-featured' + (imagesView ? " library-featured--image-only" : "") + '" data-library-id="' + esc(e.library_id) + '">' +
      thumb +
      '<div class="library-featured-body"' + (imagesView ? " hidden" : "") + '>' +
      '<p class="library-featured-kicker">' + kick.join(' <span class="dot" aria-hidden="true">·</span> ') + '</p>' +
      '<p class="library-featured-title"><a href="' + esc(e.url) + '">' + esc(e.title) + '</a></p>' +
      (e.summary ? '<p class="library-featured-annotation">' + esc(e.summary) + '</p>' : '') +
      (subs ? '<p class="library-featured-subjects">' + subs + '</p>' : '') +
      '</div></article>';
  }

  function announce(e) {
    if (!announceEl) return;
    announceEl.textContent = "Selected: " + e.title + (e.creator_names ? " by " + e.creator_names : "");
  }

  function pickFrom(pool, excludeId) {
    if (pool.length === 1) return pool[0];
    var e;
    do { e = pool[Math.floor(Math.random() * pool.length)]; }
    while (excludeId && e.library_id === excludeId);
    return e;
  }

  // Map view has no presentation of its own for the chance panel to mirror,
  // so it inherits whichever of Catalog/Images the visitor was last actually
  // looking at (lastRealView) rather than defaulting to either one.
  function chanceView() { return view === "map" ? lastRealView : view; }

  // The chance pool is the exact same field as the results: matches() below
  // applied to the JSON entries, further narrowed to entries with a primary
  // image while Images (view or last-real-view) is active (Catalog may
  // sample image-less entries).
  function eligiblePool() {
    if (!allEntries) return null;
    var pool = allEntries.filter(matchesEntry);
    if (chanceView() === "images") pool = pool.filter(function (e) { return !!e.primary_image; });
    return pool;
  }

  // Renders the chance panel against `pool`. `forceNew` is true only for an
  // explicit "Select again" click — it always picks a different entry.
  // Otherwise (every filter/view change) the current pick is kept as long as
  // it's still in the pool, so entries don't shuffle just because a filter
  // changed elsewhere; only view-mode presentation (text hidden/shown) is
  // re-rendered when the entry itself stays the same.
  function renderPool(pool, forceNew) {
    if (!randomSlot) return;
    if (pool.length === 0) {
      currentId = null;
      try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
      var matchingAtAll = allEntries.filter(matchesEntry).length > 0;
      var msg = (chanceView() === "images" && matchingAtAll) ? "No matching entries have images." : "No matching entries.";
      randomSlot.innerHTML = '<p class="library-empty">' + esc(msg) + '</p>';
      if (randomSection) randomSection.classList.remove("library-random--image-only");
      if (anotherBtn) anotherBtn.hidden = true;
      return;
    }
    var current = null;
    if (!forceNew && currentId) {
      current = pool.filter(function (e) { return e.library_id === currentId; })[0] || null;
    }
    if (!current) {
      current = pickFrom(pool, forceNew ? currentId : null);
      var changed = current.library_id !== currentId;
      currentId = current.library_id;
      try { sessionStorage.setItem(STORE_KEY, currentId); } catch (e) {}
      if (changed) announce(current);
    }
    var imagesView = chanceView() === "images";
    randomSlot.innerHTML = cardHTML(current, imagesView);
    // The "big, centered image" panel sizing (library.css) keys off this
    // class, not the page's own data-library-view — Map inheriting Images'
    // presentation (see chanceView() above) needs the same sizing Images
    // itself gets, not the plain has-text-alongside layout.
    if (randomSection) randomSection.classList.toggle("library-random--image-only", imagesView);
    if (anotherBtn) anotherBtn.hidden = pool.length <= 1;
  }

  function revalidateChance() {
    var pool = eligiblePool();
    if (pool === null) return; // index.json hasn't resolved yet — keep the SSR fallback
    renderPool(pool, false);
  }
  function selectAgain() {
    var pool = eligiblePool();
    if (pool === null) return;
    renderPool(pool, true);
  }
  if (anotherBtn) anotherBtn.addEventListener("click", selectAgain);

  fetch(new URL("index.json", location.href).href, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.entries) return;
      allEntries = data.entries;
      try { currentId = sessionStorage.getItem(STORE_KEY); } catch (e) { currentId = null; }
      revalidateChance();
    })
    .catch(function () { /* keep the server fallback */ });

  // --- Filters + view state -------------------------------------------------
  function chipsFor(facet) {
    return chips.filter(function (c) { return c.dataset.facet === facet; });
  }

  // Active state: multi sets for type + subject, plus the presentation view
  // ("catalog" | "images" | "map"). Images is the default — an absent or
  // invalid ?view= resolves to "images" (see fromURL/toURL below, which only
  // ever add view=catalog or view=map to the URL).
  var sel = { type: [], subject: [] };
  var view = "images";
  // The chance panel has no defined behavior of its own in Map view (unlike
  // Catalog/Images, it isn't itself a display of the matching set) — so it
  // keeps behaving like whichever of Catalog/Images was last actually
  // active, rather than silently defaulting to one. Only ever updated to
  // "catalog" or "images", never "map" — see chanceView() below.
  var lastRealView = "images";

  function setView(v) {
    view = (v === "catalog" || v === "map") ? v : "images";
    if (view !== "map") lastRealView = view;
    document.documentElement.dataset.libraryView = view;
    list.hidden = view !== "catalog";
    if (imageIndex) imageIndex.hidden = view !== "images";
    if (mapView) mapView.hidden = view !== "map";
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
  function matchesEntry(e) {
    return matchesFields(e.public_type, e.subjects || []);
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
    revalidateChance();
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
    if (view === "catalog" || view === "map") params.set("view", view);
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
    setView(v === "catalog" ? "catalog" : v === "map" ? "map" : "images");
  }

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      var facet = c.dataset.facet, v = c.dataset.value;
      if (v === "") {
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
