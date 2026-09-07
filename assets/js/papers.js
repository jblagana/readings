/* ==========================================================================
   papers.js — one-at-a-time navigation for the paper deck (papers.md).

   The slides are rendered server-side (Liquid): a title slide, one subtopic
   divider, and one slide per paper, plus an overview grid. This engine only
   drives navigation:

     * exactly one slide visible at a time (prev / next / arrow keys / space);
     * a progress bar + a "k / 41" counter;
     * deep links (#A09) that work on load and on manual hash changes;
     * an overview grid to jump between papers (toggle with the O key or the
       "Overview" button);
     * keyboard: ArrowLeft/Right/Up/Down, Space, Enter, PageUp/Down,
       Home/End, O (overview), Esc (close overview).

   Key handling is deliberately conservative: Space/Enter are ignored while a
   link or button is focused, so "Read the paper" links keep working.

   No dependencies. The pure core is exported for testing:
     module.exports = PaperDeck   (Node)
     self.PaperDeck                (browser)
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---------------- pure core (no DOM; exported for tests) ------------- */

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function nextIndex(cur, dir, n) {
    return clamp(cur + dir, 0, Math.max(0, n - 1));
  }

  function progressPct(index, count) {
    if (count <= 1) return 100;
    return Math.round((index / (count - 1)) * 1000) / 10;
  }

  /* ---------------- DOM wiring ------------------------------------------ */

  function init() {
    var deck = document.getElementById("pd-deck");
    if (!deck) return;

    var stage = deck.querySelector(".pd-stage");
    var overview = document.getElementById("pd-overview");
    var slides = Array.prototype.slice.call(deck.querySelectorAll(".pd-slide"));
    var fill = document.getElementById("pd-fill");
    var counter = document.getElementById("pd-counter");
    var prevBtn = document.getElementById("pd-prev");
    var nextBtn = document.getElementById("pd-next");
    var ovBtn = document.getElementById("pd-ov");
    var ovBtn2 = document.getElementById("pd-ov2");
    var startBtn = document.getElementById("pd-start");
    var homeBtn = document.getElementById("pd-home");

    if (!slides.length) return;

    var total = slides.length;
    var idx = 0;
    var ovOpen = false;

    function setCounter(sl) {
      if (!counter) return;
      var role = sl.getAttribute("data-role");
      if (role === "paper") {
        counter.textContent = (sl.getAttribute("data-num") || "1") + " / " + (sl.getAttribute("data-total") || total);
      } else if (role === "title") {
        counter.textContent = "Start";
      } else {
        counter.textContent = sl.getAttribute("data-label") || "";
      }
    }

    function show(i, push) {
      idx = clamp(i, 0, total - 1);
      for (var k = 0; k < slides.length; k++) {
        var on = k === idx;
        slides[k].classList.toggle("is-active", on);
        slides[k].setAttribute("aria-hidden", on ? "false" : "true");
      }
      if (fill) fill.style.width = progressPct(idx, total) + "%";
      setCounter(slides[idx]);
      if (prevBtn) prevBtn.disabled = idx === 0;
      if (nextBtn) nextBtn.disabled = idx === total - 1;
      var id = slides[idx].id;
      if (id && window.history && history.replaceState) {
        try {
          if (push) history.pushState(null, "", "#" + id);
          else history.replaceState(null, "", "#" + id);
        } catch (e) { /* ignore (e.g. file:// sandbox) */ }
      }
    }

    function next() { if (!ovOpen) show(nextIndex(idx, 1, total)); }
    function prev() { if (!ovOpen) show(nextIndex(idx, -1, total)); }
    function openOverview() {
      ovOpen = true;
      deck.classList.add("pd-ov-open");
      if (ovBtn) ovBtn.textContent = "\u2190 Deck";
      if (counter) counter.textContent = "Overview";
    }
    function closeOverview() {
      ovOpen = false;
      deck.classList.remove("pd-ov-open");
      if (ovBtn) ovBtn.textContent = "Overview";
      setCounter(slides[idx]);
    }
    function toggleOverview() { if (ovOpen) closeOverview(); else openOverview(); }

    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextBtn) nextBtn.addEventListener("click", next);
    if (homeBtn) homeBtn.addEventListener("click", function () { closeOverview(); show(0); });
    if (startBtn) startBtn.addEventListener("click", function () { show(1); });
    if (ovBtn) ovBtn.addEventListener("click", toggleOverview);
    if (ovBtn2) ovBtn2.addEventListener("click", toggleOverview);

    // Jump-to-paper from the overview grid.
    if (overview) {
      overview.addEventListener("click", function (e) {
        var a = (e.target && e.target.closest) ? e.target.closest("a.pd-ocard") : null;
        if (!a) return;
        e.preventDefault();
        var id = (a.getAttribute("href") || "").replace("#", "");
        var t = id ? document.getElementById(id) : null;
        if (t && stage && stage.contains(t)) {
          var k = slides.indexOf(t);
          if (k >= 0) { closeOverview(); show(k, true); }
        }
      });
    }

    function isInteractive(t) {
      if (!t) return false;
      var tag = t.tagName || "";
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        tag === "BUTTON" || tag === "A" || t.isContentEditable;
    }

    function onKey(e) {
      if (e.defaultPrevented) return;
      if (ovOpen) {
        if (e.key === "Escape") { e.preventDefault(); closeOverview(); }
        return;
      }
      var interactive = isInteractive(e.target);
      // Let focused links/buttons keep their native Space/Enter behavior.
      if ((e.key === " " || e.key === "Enter") && interactive) return;
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": case "PageDown": case " ":
          e.preventDefault(); next(); break;
        case "Enter":
          e.preventDefault(); next(); break;
        case "ArrowLeft": case "ArrowUp": case "PageUp":
          e.preventDefault(); prev(); break;
        case "Home": if (!interactive) { e.preventDefault(); show(0); } break;
        case "End": if (!interactive) { e.preventDefault(); show(total - 1); } break;
        case "o": case "O": openOverview(); break;
        default: break;
      }
    }
    document.addEventListener("keydown", onKey);

    function fromHash() {
      var id = (location.hash || "").replace("#", "");
      if (!id) return false;
      var t = document.getElementById(id);
      if (t && stage && stage.contains(t)) {
        var k = slides.indexOf(t);
        if (k >= 0) { show(k); return true; }
      }
      return false;
    }

    if (!fromHash()) show(0);
    window.addEventListener("hashchange", fromHash);
  }

  // Expose the pure core for Node tests / debugging.
  root.PaperDeck = { clamp: clamp, nextIndex: nextIndex, progressPct: progressPct };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PaperDeck;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof self !== "undefined" ? self : this);