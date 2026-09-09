/* ==========================================================================
   claim_grader.js — speedup-claim grader for 05 §5.

   Seven checklist items (the prose list above the widget), each with a
   Yes / Not stated / Red flag toggle. Items 1–3 and 7 are load-bearing:
     any red flag            -> "Discount"
     critical item ungraded
                             -> "Verify before citing"
     only secondary gaps     -> "Reasonable"
     all seven "Yes"         -> "Citable"
   Live score bar + verdict panel; reset button. Guards on #cg-root.
   ========================================================================== */
(function (root) {
  "use strict";

  var ITEMS = 7;
  var CRITICAL = { 1: true, 2: true, 3: true, 7: true };
  var STATES = ["pass", "na", "fail"];

  function verdict(states) {
    var fails = [], naCrit = [], naAny = 0;
    for (var k = 1; k <= ITEMS; k++) {
      var s = states[k];
      if (s === "fail") fails.push(k);
      if (s === "na") { naAny++; if (CRITICAL[k]) naCrit.push(k); }
    }
    if (fails.length) {
      return {
        cls: "fail",
        title: "Discount",
        text: "At least one red flag. Treat the speedup as marketing until a “GPU result == CPU result” number appears — item 7 is what makes a speedup meaningful, and item 1 decides what it is a speedup of."
      };
    }
    if (naCrit.length) {
      return {
        cls: "warn",
        title: "Verify before citing",
        text: "Load-bearing item(s) not confirmed: " + naCrit.join(", ") + ". Plausible, but unaudited — fill the gap in the CSV's reported_speedup column before this number reaches a thesis."
      };
    }
    if (naAny) {
      return {
        cls: "ok",
        title: "Reasonable",
        text: "Everything stated checks out; the missing items are secondary. Quote it, and note in the thesis what the paper did not report."
      };
    }
    return {
      cls: "good",
      title: "Citable",
      text: "All seven items pass — the paper audits its own claim. Rare. Use it as the template for your own benchmarking."
    };
  }

  function init() {
    var rootEl = document.getElementById("cg-root");
    if (!rootEl) return;
    var segs = rootEl.querySelectorAll(".cg-seg");
    var verdictBox = rootEl.querySelector("#cg-verdict");
    var verdictTitle = rootEl.querySelector(".cg-verdict-title");
    var verdictText = rootEl.querySelector(".cg-verdict-text");
    var scoreCells = rootEl.querySelectorAll(".cg-score-cell");
    var resetBtn = rootEl.querySelector("#cg-reset");
    if (!segs.length || !verdictBox || !verdictTitle || !verdictText || !scoreCells.length) return;

    var states = {};
    for (var i = 0; i < segs.length; i++) states[i + 1] = null;

    function render() {
      for (var k = 1; k <= ITEMS; k++) {
        var cell = scoreCells[k - 1];
        cell.className = "cg-score-cell is-" + (states[k] || "none");
      }
      var v = verdict(states);
      verdictBox.className = "cg-verdict is-" + v.cls;
      verdictTitle.textContent = v.title;
      verdictText.textContent = v.text;
    }

    for (var i = 0; i < segs.length; i++) {
      (function (seg, id) {
        var buttons = seg.querySelectorAll("button");
        for (var b = 0; b < buttons.length; b++) {
          buttons[b].addEventListener("click", function () {
            var st = buttons[b].getAttribute("data-state");
            states[id] = (states[id] === st) ? null : st; // click again to clear
            for (var j = 0; j < buttons.length; j++) {
              buttons[j].setAttribute("aria-pressed",
                (states[id] === buttons[j].getAttribute("data-state")) ? "true" : "false");
            }
            render();
          });
        }
      })(segs[i], i + 1);
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        for (var k = 1; k <= ITEMS; k++) states[k] = null;
        var buttons = rootEl.querySelectorAll(".cg-seg button");
        for (var b = 0; b < buttons.length; b++) buttons[b].setAttribute("aria-pressed", "false");
        render();
      });
    }
    render();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  var api = { verdict: verdict, critical: CRITICAL, states: STATES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ClaimGrader = api;
})(typeof self !== "undefined" ? self : this);
