/* Darjina site: mobile menu, language preference, gentle reveal. No dependencies. */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");

  // Mobile menu
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  if (header && toggle) {
    var setOpen = function (open) {
      header.setAttribute("data-open", open ? "true" : "false");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      var label = open ? toggle.getAttribute("data-label-close") : toggle.getAttribute("data-label-open");
      if (label) toggle.setAttribute("aria-label", label);
    };
    toggle.addEventListener("click", function () {
      setOpen(header.getAttribute("data-open") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.getAttribute("data-open") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia("(min-width: 900px)").addEventListener("change", function (m) {
      if (m.matches) setOpen(false);
    });
  }

  // Language switch: remember the visitor's explicit choice (per browser only).
  var langLink = document.querySelector("[data-lang-switch]");
  if (langLink) {
    langLink.addEventListener("click", function () {
      try { localStorage.setItem("darjina-lang", langLink.getAttribute("hreflang")); } catch (e) { /* storage blocked */ }
    });
  }

  // Reveal on scroll (skipped when reduced motion is requested; CSS also guards it)
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var items = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window && items.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }
})();
