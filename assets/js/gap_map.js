/* ==========================================================================
   gap_map.js — clickable gap map for 03 (synthesis, gap analysis).

   Four static cards (one per ranked gap); clicking one fills the detail
   panel with why it ranks there, the evidence rows, and where it goes
   in 06. The prose list above the widget remains the source of record —
   this is the interactive companion. Guards on #gm-root.
   ========================================================================== */
(function (root) {
  "use strict";

  var GAPS = {
    "1": {
      why: "Highest novelty-per-effort ratio. The problem is already defined (D01, D07), the latency adversary is measured (D03–D05), the OPF building blocks exist (B05, B08), and the batch pattern is proven in this package (02). The missing artifact is a system: batched real-time OPF under a communication budget.",
      evidence: "CSV rows D01–D07 (03, Subtopic D)",
      goes: "06, direction D1 — the Year-2 mainline"
    },
    "2": {
      why: "Genuinely empty: no GPU-specific TEP solver paper surfaced in the collected metadata. Higher risk — you are defining the problem as you solve it — but it is the only gap where “first paper” is available at the journal level rather than the conference level.",
      evidence: "CSV rows E01–E03 (context only; 03, Subtopic E)",
      goes: "06, direction D2 — the Year-2/3 mainline"
    },
    "3": {
      why: "Three papers in and none reports end-to-end market-clearing wall times — only relaxation-step speedups. A second or third paper with honest end-to-end numbers would stand out immediately, and the UC machinery is already mature on CPU.",
      evidence: "CSV rows C01–C03 (03, Subtopic C)",
      goes: "06, direction D3 — side track (or mainline if the DERMS gate fails)"
    },
    "4": {
      why: "Single-card results saturating ~40 GB define the exact open question: when does SCOPF with N-1 at 10k+ buses need two cards, and how — NCCL plus which partition? No paper answers this as of the metadata collected here.",
      evidence: "CSV rows B07–B10 (03, Subtopic B)",
      goes: "06, direction D4 — side track, feeds the S7 capstone"
    }
  };

  function detail(gapId) {
    var g = GAPS[String(gapId)];
    if (!g) return null;
    return {
      why: g.why,
      meta: "Evidence: <b>" + g.evidence + "</b> · Where it goes: <b>" + g.goes + "</b>"
    };
  }

  function init() {
    var rootEl = document.getElementById("gm-root");
    if (!rootEl) return;
    var cards = rootEl.querySelectorAll(".gm-card");
    var panel = rootEl.querySelector("#gm-detail-why");
    var meta = rootEl.querySelector("#gm-detail-meta");
    if (!cards.length || !panel || !meta) return;

    function select(gapId) {
      var d = detail(gapId);
      if (!d) return;
      panel.textContent = d.why;
      meta.innerHTML = d.meta;
      for (var i = 0; i < cards.length; i++) {
        var on = cards[i].getAttribute("data-gap") === String(gapId);
        cards[i].classList.toggle("active", on);
        cards[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("click", function () { select(card.getAttribute("data-gap")); });
      })(cards[i]);
    }
    var first = rootEl.querySelector(".gm-card.active") || cards[0];
    select(first.getAttribute("data-gap"));
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  var api = { gaps: GAPS, detail: detail };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GapMap = api;
})(typeof self !== "undefined" ? self : this);
