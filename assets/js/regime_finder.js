/* ==========================================================================
   regime_finder.js — "which regime is this?" widget for 03 (synthesis).

   Two numbers in (buses per problem, independent cases), one regime
   out, using the thresholds from the regime table on the same page:
     cases >= 500            -> memory-capacity (the batch is the speedup)
     cases <  500 & buses >= 1000 -> bandwidth-bound (SpMV-shaped solve)
     buses <  1000           -> launch-overhead (GPU adds nothing)

   Guards on #rf-root so it no-ops where the widget is absent. Pure
   core exported for testing: module.exports = RegimeFinder (Node) or
   self.RegimeFinder (browser).
   ========================================================================== */
(function (root) {
  "use strict";

  var REGIMES = {
    launch: {
      chip: "1 · Launch-overhead",
      text: "Regime 1 — launch-overhead. Below ~1k buses the GPU does nothing useful: sync and transfer dominate, not compute (your 5-bus kernel measured 0.17–0.4 ms per sweep, mostly memcpy). Solve these on the CPU — or grow the problem until regime 2, or grow the batch until regime 3."
    },
    bandwidth: {
      chip: "2 · Bandwidth-bound",
      text: "Regime 2 — bandwidth-bound. A SpMV-shaped inner solve at ~10⁴–10⁶ rows: the GPU tracks the HBM ceiling (~1.3–1.5 TB/s versus ~20 GB/s single-core) while the CPU keeps scaling with row count. This is where kernels 01 and 02 earn their 30–190× — on the inner solve, not on the wall clock."
    },
    capacity: {
      chip: "3 · Memory-capacity",
      text: "Regime 3 — memory-capacity. Thousands of independent instances: the batch is the speedup. One 40–80 GB card holds the N-1 cases, scenarios, or feeders a CPU would stream (A09, B07). Sanity-check the fit: roughly rows × batch × ~30 B per non-zero has to sit under HBM."
    }
  };

  function classify(buses, cases) {
    // both null -> null; first matching threshold wins
    if (cases !== null && cases >= 500) return "capacity";
    if (buses !== null && buses >= 1000) return "bandwidth";
    if (buses !== null) return "launch";
    if (cases !== null) return null; // small case count alone is not enough to decide
    return null;
  }

  function init() {
    var rootEl = document.getElementById("rf-root");
    if (!rootEl) return;
    var busesIn = rootEl.querySelector("#rf-buses");
    var casesIn = rootEl.querySelector("#rf-cases");
    var chips = rootEl.querySelectorAll(".rf-chip");
    var verdict = rootEl.querySelector("#rf-verdict");
    if (!busesIn || !casesIn || !verdict || !chips.length) return;

    function parseNum(el) {
      var v = parseFloat(el.value);
      if (isNaN(v) || v <= 0) return null;
      return Math.round(v);
    }

    function render() {
      var buses = parseNum(busesIn);
      var cases = parseNum(casesIn);
      var reg = classify(buses, cases);
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle("active", chips[i].getAttribute("data-regime") === reg);
      }
      if (reg) {
        verdict.textContent = REGIMES[reg].text;
      } else if (buses === null && cases === null) {
        verdict.textContent = "Enter at least one number — the first threshold that fits (cases ≥ 500 → capacity; buses ≥ 1k → bandwidth; below ~1k buses → launch) decides your regime.";
      } else {
        verdict.textContent = "Give the bus count too: with fewer than ~500 independent cases, the regime depends on the per-problem size (below ~1k buses → launch-overhead; ~10k+ buses → bandwidth-bound).";
      }
    }

    busesIn.addEventListener("input", render);
    casesIn.addEventListener("input", render);
    render();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  var api = { classify: classify, regimes: REGIMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RegimeFinder = api;
})(typeof self !== "undefined" ? self : this);
