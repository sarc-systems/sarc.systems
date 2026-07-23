// Click-to-load YouTube facade. No YouTube code runs until the user clicks.
// With JS disabled the facade is just a link to youtube.com (graceful fallback).
(function () {
  "use strict";
  function activate(facade) {
    var id = facade.getAttribute("data-yt-id");
    var title = facade.getAttribute("data-yt-title") || "YouTube video";
    if (!id) return;
    var iframe = document.createElement("iframe");
    iframe.setAttribute("title", title);
    iframe.setAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/" +
        encodeURIComponent(id) +
        "?autoplay=1&rel=0"
    );
    iframe.setAttribute("allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "lazy");
    iframe.className = "yt-frame";
    facade.replaceChildren(iframe);
    facade.classList.add("is-loaded");
  }

  document.querySelectorAll(".yt-facade").forEach(function (facade) {
    var link = facade.querySelector(".yt-link");
    if (!link) return;
    link.addEventListener("click", function (ev) {
      ev.preventDefault();
      activate(facade);
    });
  });
})();
