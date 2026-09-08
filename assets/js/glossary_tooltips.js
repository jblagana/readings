/* ==========================================================================
   glossary_tooltips.js — hover definitions for glossary terms.

   Data: the page head injects window.READINGS_GLOSSARY from
   _data/glossary.json, which is generated from 04_glossary.md by
   `python3 tools/build_glossary_terms.py` (run it after editing the
   glossary; `--report` previews every match first).

   What it does:
     - walks the text nodes of #main and wraps each glossary-term
       occurrence in <span class="gt-term" tabindex="0" data-gt="i">
       (code, pre and form controls are never touched);
     - shows the term's glossary definition (Formal + Plain) in one
       shared tooltip on hover or keyboard focus;
     - the tooltip is pure reference — it does not link anywhere.

   Matching: one boundary-guarded regex per curated pattern; on overlap
   the longest span wins (so "OPF" never fires inside "SCOPF" / "DC-OPF"
   and "bus" never inside "Ybus").
   ========================================================================== */
(function () {
  'use strict';

  var data = (typeof window !== 'undefined' && window.READINGS_GLOSSARY) || null;

  /* ------------------------------------------------------------------ *
   * Matching core — pure functions, unit-testable without a DOM.
   * ------------------------------------------------------------------ */

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* Boundary guards so a pattern only matches a whole term:
       left  — no letter/digit/underscore before it (a hyphen is allowed,
               so "5-bus" and "per-feeder" still expose their term);
       right — no letter/digit/underscore/hyphen after it, so "OPF" never
               fires inside "DC-OPF", "bus" inside "Ybus", "N-1" inside
               "N-10", "grid" inside "grid-tied". */
  var LEFT = '(?<![\\p{L}\\p{N}_])';
  var RIGHT = '(?![\\p{L}\\p{N}_\\-])';

  function buildMatchers(entries) {
    var out = [];
    (entries || []).forEach(function (entry, i) {
      entry.__i = i;
      (entry.matches || []).forEach(function (pat) {
        if (!pat) return;
        try {
          /* Uppercase patterns (acronyms) match case-sensitively,
             lowercase ones case-insensitively. */
          out.push({
            re: new RegExp(LEFT + escapeRe(pat) + RIGHT, /[A-Z]/.test(pat) ? 'gu' : 'giu'),
            entry: entry
          });
        } catch (e) { /* unparseable pattern: skip it */ }
      });
    });
    return out;
  }

  /* All non-overlapping matches in `text`: longer span wins on overlap,
     then the earlier one; result sorted by position. */
  function matchesIn(text, matchers) {
    var hits = [], i, m, r;
    for (i = 0; i < matchers.length; i++) {
      m = matchers[i];
      m.re.lastIndex = 0;
      while ((r = m.re.exec(text)) !== null) {
        hits.push({ start: r.index, end: r.index + r[0].length, entry: m.entry });
        if (r.index === m.re.lastIndex) m.re.lastIndex += 1;
      }
    }
    if (!hits.length) return [];
    hits.sort(function (a, b) {
      var la = a.end - a.start, lb = b.end - b.start;
      if (lb !== la) return lb - la;
      return a.start - b.start;
    });
    var chosen = [], lastEnd = -1;
    for (i = 0; i < hits.length; i++) {
      if (hits[i].start >= lastEnd) {
        chosen.push(hits[i]);
        lastEnd = hits[i].end;
      }
    }
    chosen.sort(function (a, b) { return a.start - b.start; });
    return chosen;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeRe: escapeRe,
      buildMatchers: buildMatchers,
      matchesIn: matchesIn
    };
  }
  if (!data || typeof document === 'undefined') return;

  var matchers = buildMatchers(data);
  if (!matchers.length) return;

  /* ------------------------------------------------------------------ *
   * DOM walk — wrap matched text.
   * ------------------------------------------------------------------ */

  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1,
    PRE: 1, CODE: 1, KBD: 1, SAMP: 1,
    TEXTAREA: 1, SELECT: 1, OPTION: 1, BUTTON: 1, INPUT: 1
  };

  function insideSkipped(el) {
    var p = el;
    while (p && p.nodeType === 1) {
      if (SKIP_TAGS[p.nodeName] ||
          (p.classList && (p.classList.contains('gt-term') || p.classList.contains('gt-tip')))) {
        return true;
      }
      p = p.parentNode;
    }
    return false;
  }

  function wrapNode(node) {
    var text = node.nodeValue;
    var hits = matchesIn(text, matchers);
    if (!hits.length) return 0;
    var frag = document.createDocumentFragment();
    var cursor = 0, i, h, span;
    for (i = 0; i < hits.length; i++) {
      h = hits[i];
      if (h.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, h.start)));
      }
      span = document.createElement('span');
      span.className = 'gt-term';
      span.textContent = text.slice(h.start, h.end);
      span.setAttribute('tabindex', '0');
      span.setAttribute('data-gt', String(h.entry.__i));
      frag.appendChild(span);
      cursor = h.end;
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    node.parentNode.replaceChild(frag, node);
    return hits.length;
  }

  function scan(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node, total = 0;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim() && !insideSkipped(node.parentNode)) {
        total += wrapNode(node);
      }
    }
    return total;
  }


  /* ------------------------------------------------------------------ *
   * The shared tooltip (one element, reused for every term).
   * ------------------------------------------------------------------ */

  var tip = null, tipTerm = null, rows = [];
  var activeEl = null, hideTimer = null;

  function ensureTip() {
    if (tip) return;
    tip = document.createElement('div');
    tip.className = 'gt-tip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');

    tipTerm = document.createElement('div');
    tipTerm.className = 'gt-tip-term';
    tip.appendChild(tipTerm);

    ['gt-tip-row', 'gt-tip-row gt-tip-plain'].forEach(function (cls) {
      var row = document.createElement('p');
      row.className = cls;
      var label = document.createElement('span');
      label.className = 'gt-tip-label';
      var body = document.createElement('span');
      body.className = 'gt-tip-text';
      row.appendChild(label);
      row.appendChild(body);
      tip.appendChild(row);
      rows.push({ row: row, label: label, body: body });
    });

    document.body.appendChild(tip);
  }

  function position(el) {
    if (!tip || !tip.offsetWidth) return;
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var below = false;
    var left = Math.max(10, Math.min(r.left + r.width / 2 - tw / 2, vw - tw - 10));
    var top = r.top - th - 10;
    if (top < 10) { top = r.bottom + 10; below = true; }
    if (top + th > vh - 10) top = Math.max(10, vh - th - 10);
    tip.classList.toggle('is-below', below);
    var ax = Math.max(14, Math.min(r.left + r.width / 2 - left, tw - 14));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.style.setProperty('--gt-ax', Math.round(ax) + 'px');
  }

  function showFor(el) {
    var entry = data[Number(el.getAttribute('data-gt'))] || null;
    if (!entry) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    ensureTip();
    tipTerm.textContent = entry.term;
    rows[0].label.textContent = 'Formal';
    rows[0].body.textContent = entry.formal || '';
    rows[0].row.style.display = entry.formal ? '' : 'none';
    rows[1].label.textContent = 'Plain';
    rows[1].body.textContent = entry.plain || '';
    rows[1].row.style.display = entry.plain ? '' : 'none';
    if (activeEl !== el) {
      activeEl = el;
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden', 'false');
    }
    position(el);
  }

  function hideNow() {
    if (tip) {
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden', 'true');
    }
    activeEl = null;
  }

  /* Small grace period so moving between adjacent terms (or off to
     nearby text) does not flicker the tooltip. */
  function hideSoon() {
    if (hideTimer) return;
    hideTimer = setTimeout(function () { hideTimer = null; hideNow(); }, 90);
  }

  function closestTerm(t) {
    while (t && t.nodeType === 1) {
      if (t.classList && t.classList.contains('gt-term')) return t;
      t = t.parentNode;
    }
    return null;
  }


  document.addEventListener('mouseover', function (ev) {
    var el = closestTerm(ev.target);
    if (el) showFor(el);
    else if (activeEl) hideSoon();
  });
  document.addEventListener('mouseout', function (ev) {
    if (activeEl && closestTerm(ev.target) === activeEl) hideSoon();
  });
  document.addEventListener('focusin', function (ev) {
    var el = closestTerm(ev.target);
    if (el) showFor(el);
  });
  document.addEventListener('focusout', function (ev) {
    if (activeEl && closestTerm(ev.target) === activeEl) hideSoon();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') hideNow();
  });
  window.addEventListener('scroll', function () {
    if (activeEl) position(activeEl);
  }, { passive: true });
  window.addEventListener('resize', function () {
    if (activeEl) position(activeEl);
  });

  /* ------------------------------------------------------------------ *
   * Init: wrap the current content, then keep wrapping content the site
   * adds later (quiz questions, paper-deck slides).
   * ------------------------------------------------------------------ */

  function init() {
    var root = document.getElementById('main');
    if (!root) return;
    scan(root);
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var a = added[j];
            if (a.nodeType === 1 && !SKIP_TAGS[a.nodeName]) scan(a);
          }
        }
      });
      mo.observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

