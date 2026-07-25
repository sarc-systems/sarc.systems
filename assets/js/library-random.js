// "From the Library" — a session-stable random featured entry, no dependencies.
// Reads /library/index.json, picks one entry, keeps it for the browser session
// (sessionStorage), and rebuilds a featured card matching library-featured.html.
// "Another entry" picks a different one. Independent of the catalog filters.
// Without JS the server-rendered deterministic fallback remains visible.
(function () {
  "use strict";

  var section = document.getElementById("library-random");
  if (!section) return;
  var slot = section.querySelector("[data-random-slot]");
  var anotherBtn = section.querySelector(".library-random-another");
  if (!slot) return;

  var KEY = "sarc-library-random";
  var entries = [];
  var current = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cardHTML(e) {
    var img = e.primary_image;
    var thumb = img ? '<a class="library-featured-thumb" href="' + esc(e.url) +
      '" tabindex="-1" aria-hidden="true"><img src="' + esc(img.url) +
      '" style="object-position: ' + esc(img.pos || "center") + '" alt="' + esc(img.alt) +
      '" loading="lazy" decoding="async"></a>' : "";
    var kick = [];
    if (e.creator_names) kick.push(esc(e.creator_names));
    if (e.type_label) kick.push(esc(e.type_label));
    if (e.year) kick.push(esc(e.year));
    var subs = (e.subject_labels || []).map(esc).join(' <span class="dot" aria-hidden="true">·</span> ');
    return '<article class="library-featured" data-library-id="' + esc(e.library_id) + '">' +
      thumb +
      '<div class="library-featured-body">' +
      '<p class="library-featured-kicker">' + kick.join(' <span class="dot" aria-hidden="true">·</span> ') + '</p>' +
      '<p class="library-featured-title"><a href="' + esc(e.url) + '">' + esc(e.title) + '</a></p>' +
      (e.summary ? '<p class="library-featured-annotation">' + esc(e.summary) + '</p>' : '') +
      (subs ? '<p class="library-featured-subjects">' + subs + '</p>' : '') +
      '</div></article>';
  }

  function render(e) {
    current = e;
    slot.innerHTML = cardHTML(e);
  }

  function pick(exclude) {
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0];
    var e;
    do { e = entries[Math.floor(Math.random() * entries.length)]; }
    while (exclude && e.library_id === exclude);
    return e;
  }

  fetch(new URL("index.json", location.href).href, { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.entries || !data.entries.length) return;
      entries = data.entries;

      var storedId = null;
      try { storedId = sessionStorage.getItem(KEY); } catch (e) {}
      var start = null;
      if (storedId) { start = entries.filter(function (e) { return e.library_id === storedId; })[0]; }
      if (!start) {
        start = pick(null);
        try { sessionStorage.setItem(KEY, start.library_id); } catch (e) {}
      }
      render(start);

      if (anotherBtn) {
        anotherBtn.hidden = false;
        anotherBtn.addEventListener("click", function () {
          var next = pick(current ? current.library_id : null);
          if (!next) return;
          try { sessionStorage.setItem(KEY, next.library_id); } catch (e) {}
          render(next);
        });
      }
    })
    .catch(function () { /* keep the server fallback */ });
})();
