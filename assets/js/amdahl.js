/* ==========================================================================
   amdahl.js — Amdahl's-law slider for 02 §1.

   One range input drives: a serial/parallel split bar, the numeric
   ceiling 1/f, and a one-line reading. The 20% example from the prose
   is the default state. No dependencies; guards on #am-root so it
   no-ops on every page that does not embed the widget. The pure core
   is exported for testing:
     module.exports = Amdahl     (Node)
     self.Amdahl                  (browser)
   ========================================================================== */
(function (root) {
  "use strict";

  function ceiling(serialPct) {
    var f = Math.max(0.01, Math.min(1, serialPct / 100));
    return 1 / f;
  }

  function readout(serialPct) {
    var c = ceiling(serialPct);
    if (c >= 100) {
      return "Essentially all parallel — speedup is limited by the machine, not by Amdahl.";
    }
    if (c >= 10) {
      return "Headroom: " + c.toFixed(1) + "× is the ceiling. Accelerate the linear algebra and say f explicitly in the paper.";
    }
    if (c >= 3) {
      return "The ceiling is " + c.toFixed(1) + "× — the literature's honest middle. Factorize on CPU, sweep on GPU; parallelize the scenarios for the rest.";
    }
    return "The ceiling is " + c.toFixed(1) + "× — below ~3× a GPU rewrite is not worth it. The GPU belongs in the layer up (scenarios).";
  }

  function init() {
    var rootEl = document.getElementById("am-root");
    if (!rootEl) return;
    var slider = rootEl.querySelector(".am-slider");
    var serialBar = rootEl.querySelector(".am-serial");
    var serialPct = rootEl.querySelector(".am-serial-pct");
    var ceilingVal = rootEl.querySelector(".am-value");
    var text = rootEl.querySelector(".am-text");
    if (!slider || !serialBar || !serialPct || !ceilingVal || !text) return;

    function render() {
      var f = Number(slider.value);
      serialBar.style.width = f + "%";
      serialPct.textContent = f + "%";
      ceilingVal.textContent = ceiling(f).toFixed(1) + "×";
      text.textContent = readout(f);
    }
    slider.addEventListener("input", render);
    render();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  var api = { ceiling: ceiling, readout: readout };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Amdahl = api;
})(typeof self !== "undefined" ? self : this);
