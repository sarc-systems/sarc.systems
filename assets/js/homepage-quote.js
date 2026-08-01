// Homepage editorial quote — session-stable pick from the enabled set in
// data/homepage_quotes.yaml, read from the JSON embedded by
// homepage-quote.html (no fetch: the data is already on the page). This file
// is inlined into the page (not loaded via <script src defer>) specifically
// so it runs synchronously as the parser reaches it, immediately after the
// server-rendered fallback quote — see homepage-quote.html for why that
// avoids a visible flash from one quote to another.
//
// Mirrors homepage-quote-attribution.html's link_target rule exactly (full |
// author | work | none) so the client-picked quote renders identically to
// the SSR fallback; the two are kept in sync by hand, since the client
// can't call a Hugo partial at runtime.
(function () {
  "use strict";

  var block = document.getElementById("home-quote");
  var dataEl = document.getElementById("homepage-quotes-data");
  if (!block || !dataEl) return;

  var quotes;
  try { quotes = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!quotes || !quotes.length) return;

  var SESSION_KEY = "sarc-homepage-quote";
  var LAST_KEY = "sarc-homepage-quote-last";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function attributionHTML(q) {
    var authorHTML = esc(q.author);
    var workCite = q.work ? "<cite>" + esc(q.work) + "</cite>" : "";
    var out;
    if (q.link_target === "full") {
      out = '— <a href="' + esc(q.library_url) + '">' + authorHTML +
        (q.work ? ", <cite>" + esc(q.work) + "</cite>" : "") + "</a>";
    } else if (q.link_target === "author") {
      out = '— <a href="' + esc(q.library_url) + '">' + authorHTML + "</a>" +
        (q.work ? ", " + workCite : "");
    } else if (q.link_target === "work") {
      out = "— " + authorHTML +
        (q.work ? ', <cite><a href="' + esc(q.library_url) + '">' + esc(q.work) + "</a></cite>" : "");
    } else {
      out = "— " + authorHTML + (q.work ? ", " + workCite : "");
    }
    if (q.source_url) {
      out += ' · <a href="' + esc(q.source_url) + '" target="_blank" rel="noopener">Source <span aria-hidden="true">↗</span></a>';
    }
    return out;
  }

  function render(q) {
    block.dataset.quoteId = q.id;
    block.querySelector(".home-quote__text").textContent = "“" + q.text + "”";
    block.querySelector(".home-quote__attribution").innerHTML = attributionHTML(q);
  }

  function pick(excludeId) {
    var pool = quotes;
    if (excludeId && pool.length > 1) {
      var filtered = pool.filter(function (q) { return q.id !== excludeId; });
      if (filtered.length) pool = filtered;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  var storedId = null;
  try { storedId = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
  var current = storedId ? quotes.filter(function (q) { return q.id === storedId; })[0] : null;

  if (!current) {
    // Avoid repeating the previous session's pick when practical — a light
    // localStorage memory, not a real history; sessionStorage alone still
    // governs "stable within this session."
    var lastId = null;
    try { lastId = localStorage.getItem(LAST_KEY); } catch (e) {}
    current = pick(lastId);
    try { sessionStorage.setItem(SESSION_KEY, current.id); } catch (e) {}
    try { localStorage.setItem(LAST_KEY, current.id); } catch (e) {}
  }

  render(current);
})();
