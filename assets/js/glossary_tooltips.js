/* ==========================================================================
   glossary_tooltips.js — hover definitions for glossary terms.

   Data: the page head injects window.READINGS_GLOSSARY from
   _data/glossary.json, which is generated from 04_glossary.md by
   `python3 tools/build_glossary_terms.py` (run it after editing the
   glossary; `--report` previews every match first).

   What it does:
     - strips the authoring markers *(glossary)* / *(glossary: ...)*
       from the rendered page — the inline tooltips replace them;
     - walks the text nodes of the page's content root and wraps each
       glossary-term occurrence in <span class="gt-term" tabindex="0"
       data-gt="i">, carrying a small superscript ¹ (code, pre and form
       controls are never touched). The root is resolved defensively —
       #main, #main-content, <main class="page-content">, any <main>,
       then <body> — because the minima theme ships an id-less <main>.
        Text nodes are snapshotted before wrapping: replacing the node a
        TreeWalker just returned detaches the walker and would stop the
        scan after the very first match on the page;
     - shows the term's glossary definition (Formal + Plain) in one
       shared tooltip on hover or keyboard focus;
     - re-renders $...$ math inside the tooltip and inside
       client-side-injected content via KaTeX auto-render (loaded in
       _includes/head.html); a no-op when KaTeX is not available;
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

  /* All non-overlapping matches in `text`: at equal start the longer
     span wins; the greedy left-to-right pass only rejects spans that
     truly overlap a kept one, so a shorter match before/after a longer
     one is preserved; result sorted by position. */
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
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });
    var chosen = [], lastEnd = -1;
    for (i = 0; i < hits.length; i++) {
      if (hits[i].start >= lastEnd) {
        chosen.push(hits[i]);
        lastEnd = hits[i].end;
      }
    }
    return chosen;
  }

  /* The source marks terms with *(glossary)* or *(glossary: detail)*.
     The inline tooltips supersede those annotations, so strip them from
     the rendered page (a paragraph that held only the marker — the
     per-section "glossary: ..." summaries — goes away with it). */
  function isGlossaryMarker(text) {
    return /^\(glossary(\s*:[\s\S]*)?\)$/.test((text || '').trim());
  }

  function stripGlossaryMarkers(root) {
    var els = root.querySelectorAll('em, i');
    var n, el, parent, prev, dropped = 0;
    for (n = 0; n < els.length; n++) {
      el = els[n];
      if (!isGlossaryMarker(el.textContent)) continue;
      parent = el.parentNode;
      prev = el.previousSibling;
      if (prev && prev.nodeType === 3 && !prev.nodeValue.trim()) {
        parent.removeChild(prev);
      }
      parent.removeChild(el);
      dropped++;
      if (parent.nodeName === 'P' && !parent.textContent.trim()) {
        parent.parentNode.removeChild(parent);
      }
    }
    return dropped;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeRe: escapeRe,
      buildMatchers: buildMatchers,
      matchesIn: matchesIn,
      isGlossaryMarker: isGlossaryMarker,
      stripGlossaryMarkers: stripGlossaryMarkers,
      pickRoot: pickRoot
    };
  }
  if (typeof document === 'undefined') return;
  if (!data) {
    console.warn('[glossary_tooltips] window.READINGS_GLOSSARY is missing — no tooltips (markers left in place)');
    return;
  }

  var matchers = buildMatchers(data);
  if (!matchers.length) {
    console.warn('[glossary_tooltips] glossary data has no usable match patterns — no tooltips');
    return;
  }

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
    /* Snapshot the text nodes BEFORE wrapping. wrapNode() replaces the
       very node the TreeWalker just returned; that detaches the
       walker's current node, and every following nextNode() then
       returns null — the scan would stop after the FIRST match on the
       page (the "markers stripped, but no term ever gets its ¹ /
       tooltip" bug). Iterating a plain list is immune to that. */
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], node, total = 0;
    while ((node = walker.nextNode())) nodes.push(node);
    for (var i = 0; i < nodes.length; i++) {
      node = nodes[i];
      if (node.parentNode && node.nodeValue && node.nodeValue.trim() &&
          !insideSkipped(node.parentNode)) {
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
    /* Definitions may carry $...$ math (KaTeX auto-render, see head.html).
       The bodies were just reset through textContent, so (re)render them
       now; no-op when KaTeX is not available. */
    if (typeof window.renderReadingsMath === 'function') {
      window.renderReadingsMath(tip);
    }
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

  /* Where the page content lives. The minima theme renders it in
     <main class="page-content"> with NO id, so getElementById('main')
     is null on every page of this site — trying #main alone made init()
     bail out silently (no marker stripping, no wrapping, no tooltips).
     Return the first candidate that is an actual element. */
  function pickRoot(candidates) {
    for (var i = 0; i < (candidates || []).length; i++) {
      if (candidates[i] && candidates[i].nodeType === 1) return candidates[i];
    }
    return null;
  }

  function contentRoot() {
    return pickRoot([
      document.getElementById('main'),
      document.getElementById('main-content'),
      document.querySelector('main.page-content'),
      document.querySelector('main'),
      document.body
    ]);
  }

  function init() {
    var root = contentRoot();
    if (!root) {
      console.warn('[glossary_tooltips] no content root found — nothing to wrap');
      return;
    }
    stripGlossaryMarkers(root);
    var total = scan(root);
    var label = root.tagName ? root.tagName.toLowerCase() : 'root';
    if (root.id) label += '#' + root.id;
    else if (typeof root.className === 'string' && root.className.trim()) {
      label += '.' + root.className.trim().split(/\s+/)[0];
    }
    console.info('[glossary_tooltips] wrapped ' + total +
      ' glossary term occurrence(s) under <' + label + '>');
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var a = added[j];
            if (a.nodeType === 1 && !SKIP_TAGS[a.nodeName]) {
              stripGlossaryMarkers(a);
              scan(a);
              if (typeof window.renderReadingsMath === 'function') {
                window.renderReadingsMath(a);
              }
            }
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

