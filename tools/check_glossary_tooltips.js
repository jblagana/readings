#!/usr/bin/env node
/* ==========================================================================
   check_glossary_tooltips.js — Node checks for the glossary tooltip system.

   Run:  node tools/check_glossary_tooltips.js

   Verifies, without Jekyll or a browser:
     1. _data/glossary.json is well-formed (every entry has a term, a
        non-empty Formal or Plain, and at least one match pattern);
     2. the matcher core exported by assets/js/glossary_tooltips.js
        behaves as specified (boundary guards, case rules, longest-match
        overlap resolution) against the real data;
      3. every bold term followed by a *(glossary)* marker in the
         content pages has a matching glossary pattern (no "marker
         stripped but no tooltip" gaps);
      4. when jsdom is installed, the shipped script wraps multiple
         terms in one DOM scan pass (regression guard for the
         TreeWalker bug).
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { buildMatchers, matchesIn, isGlossaryMarker, pickRoot } = require(path.join(ROOT, 'assets', 'js', 'glossary_tooltips.js'));

let failures = 0;

function ok(cond, label) {
  if (cond) {
    console.log('  ok    ' + label);
  } else {
    failures++;
    console.log('  FAIL  ' + label);
  }
}

/* ------------------------------------------------------------------ *
 * 1. Data integrity.
 * ------------------------------------------------------------------ */
console.log('glossary.json:');

const raw = fs.readFileSync(path.join(ROOT, '_data', 'glossary.json'), 'utf8');
const data = JSON.parse(raw);

ok(Array.isArray(data) && data.length > 0, 'parses as a non-empty array (' + data.length + ' terms)');

const seen = {};
let bad = 0;
for (const e of data) {
  if (!e || !e.term || !Array.isArray(e.matches) || !e.matches.length ||
      !(e.formal || e.plain) ||
      e.matches.some(m => typeof m !== 'string' || !m)) bad++;
  if (seen[e.term]) bad++;
  seen[e.term] = 1;
}
ok(bad === 0, 'every entry has term, matches[], and Formal or Plain; no duplicate terms');

/* Every pattern must compile with the same flags the browser uses and
   actually match its own pattern (i.e. the boundary guards never kill a
   bare occurrence). */
let reBad = [];
for (const e of data) {
  for (const p of e.matches) {
    const flags = /[A-Z]/.test(p) ? 'u' : 'iu';
    let re;
    try { re = new RegExp('(?<![\\p{L}\\p{N}_])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_\\-])', flags); }
    catch (err) { reBad.push(p + ': ' + err.message); continue; }
    if (!re.test(' ' + p + ' ')) reBad.push(p + ': guards kill bare occurrence');
  }
}
ok(reBad.length === 0, 'all ' + data.reduce((n, e) => n + e.matches.length, 0) + ' patterns compile and match themselves' +
   (reBad.length ? '\n      ' + reBad.join('\n      ') : ''));

/* ------------------------------------------------------------------ *
 * 2. Matcher semantics against the real data.
 * ------------------------------------------------------------------ */
console.log('matcher:');

const matchers = buildMatchers(data);
const spans = (text) => matchesIn(text, matchers).map(h => text.slice(h.start, h.end));

ok(spans('The OPF is the backbone of grid operations.').includes('OPF'),
   'OPF matches standalone');
ok(!spans('SCOPF formulations scale up.').includes('OPF'),
   'OPF does NOT match inside SCOPF');
ok(spans('SCOPF formulations scale up.').includes('SCOPF'),
   'SCOPF matches as the longer term');
const dc = spans('DC-OPF and the AC OPF.');
ok(dc.includes('DC-OPF') && dc.includes('AC OPF') && !dc.includes('OPF'),
   'DC-OPF and AC OPF match whole; OPF is not double-wrapped inside them');
ok(!spans('the Ybus matrix').includes('bus'),
   'bus does NOT match inside Ybus');
ok(spans('a 5-bus test system').includes('bus'),
   'bus matches in "5-bus"');
ok(!spans('N-10 contingencies').includes('N-1'),
   'N-1 does NOT match inside N-10');
ok(spans('N-1 security is the baseline.').includes('N-1'),
   'N-1 matches standalone');
ok(!spans('opf is also used').includes('OPF'),
   'OPF is case-sensitive (lowercase "opf" ignored)');
ok(spans('The OPTIMAL POWER FLOW problem is hard.').includes('OPTIMAL POWER FLOW'),
   'lowercase patterns match case-insensitively');
ok(spans("Amdahl's law says so.").includes("Amdahl's law"),
   "Amdahl's law matches as the longest span");
ok(spans('nothing to see here.').length === 0,
   'no false matches on plain prose');
ok(spans('the bus, the bus, and the bus.').length === 3,
   'repeats all match');
ok(spans('OPF; OPF. (OPF) \u2014 OPF:').length === 4,
   'punctuation boundaries all match');
ok(matchesIn('OPF first, then SCUC, then WLS', matchers).length === 3,
   'non-overlapping matches of different lengths all survive (left-to-right)');

/* ------------------------------------------------------------------ */
console.log('source markers:');

ok(isGlossaryMarker('(glossary)'), 'bare "(glossary)" recognized');
ok(isGlossaryMarker('  (glossary)  '), 'surrounding whitespace ignored');
ok(isGlossaryMarker('(glossary: Alternating Direction Method of Multipliers)'),
   'marker with detail recognized');
ok(isGlossaryMarker('(glossary:\n  roofline model)'), 'line-wrapped marker recognized');
ok(isGlossaryMarker('(glossary: LP, QP, NLP, MILP, MINLP, LMP)'), 'term-list marker recognized');
ok(!isGlossaryMarker('glossary'), 'bare word is not a marker');
ok(!isGlossaryMarker('(see glossary)'), 'ordinary parenthetical is not a marker');
ok(!isGlossaryMarker('(Glossary)'), 'uppercase G is not a marker');
ok(!isGlossaryMarker('*(glossary)*'), 'markdown asterisks are not a rendered marker');
ok(!isGlossaryMarker('(glossary: unterminated'), 'unterminated detail is not a marker');
ok(!isGlossaryMarker(''), 'empty text is not a marker');

/* ------------------------------------------------------------------ */
console.log('content root:');

const elA = { nodeType: 1 };
const elB = { nodeType: 1 };
ok(pickRoot([null, null]) === null, 'no candidates -> null');
ok(pickRoot([]) === null, 'empty candidate list -> null');
ok(pickRoot([null, elA, elB]) === elA, 'first present candidate wins (priority order)');
ok(pickRoot([elB]) === elB, 'single candidate is returned');
ok(pickRoot([{ nodeType: 3 }, elB]) === elB, 'non-element candidates are skipped');

/* Regression guard: the minima theme renders content in
   <main class="page-content"> with NO id — the resolver must reach
   past #main or init() bails out silently and markers stay visible. */
const jsSrc = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'glossary_tooltips.js'), 'utf8');
ok(/getElementById\('main-content'\)/.test(jsSrc) &&
   /querySelector\('main\.page-content'\)/.test(jsSrc) &&
   /document\.body/.test(jsSrc),
   'content root resolves beyond #main (minima ships an id-less <main>)');

/* ------------------------------------------------------------------ */
console.log('marked term coverage:');

/* Every bold term the authors marked with *(glossary)* / *(glossary: …)*
   must have a glossary pattern that matches it — otherwise the marker is
   stripped at runtime but the term never gets its ¹ / tooltip (the exact
   "markers gone, no tooltips" failure mode). */
const COVERAGE_PAGES = [
  '00_README.md',
  '01_fundamentals_bridge.md',
  '02_gpu_basics_and_kernels.md',
  '03_gpu_grid_optimization_review.md',
  '05_scopus_search_guide.md',
  '06_phd_roadmap.md',
  'index.md',
  'papers.md',
  'quiz.md',
  'README.md'
];

function stripCode(text) {
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`\n]*`/g, '');
  return text;
}

let covChecked = 0;
let covBad = [];
for (const name of COVERAGE_PAGES) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  const text = stripCode(fs.readFileSync(file, 'utf8'));
  const re = /\*\*([^*\n]+?)\*\*\s*\*\(glossary[^)]*\)\*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const term = m[1].trim();
    if (!term) continue;
    covChecked++;
    if (!matchesIn(' ' + term + ' ', matchers).length) {
      covBad.push(name + ': "' + term + '"');
    }
  }
}
ok(covChecked > 0, 'found ' + covChecked + ' bold term(s) followed by a *(glossary)* marker');
ok(covBad.length === 0,
   'every marked term has a matching glossary pattern' +
   (covBad.length ? '\n      missing: ' + covBad.join('\n      ') : ''));

/* ------------------------------------------------------------------ */
console.log('dom scan:');

/* scan() itself needs a DOM. When jsdom is available (npm i jsdom), run
   the shipped script against a synthetic page and assert that EVERY term
   in one paragraph is wrapped — not only the first. This is the
   regression guard for the TreeWalker bug: wrapNode() used to replace the
   text node the walker had just returned, detaching the walker and
   silently stopping the scan after the first match on the page. */
let jsdomMod = null;
try { jsdomMod = require('jsdom'); } catch (e) { /* optional dependency */ }

function finish() {
  console.log(failures === 0
    ? '\nALL CHECKS PASSED'
    : '\n' + failures + ' CHECK(S) FAILED');
  process.exitCode = failures === 0 ? 0 : 1;
}

if (!jsdomMod) {
  console.log('  skip  jsdom not installed (npm i jsdom) — DOM scan test not run');
  finish();
} else {
  const { JSDOM } = jsdomMod;
  const domHtml =
    '<!doctype html><html><body><main class="page-content">' +
    '<p>OPF first, then SCUC, then WLS, then MILP, then ADMM again: ADMM ' +
    '<em>(glossary)</em> plus a detailed one <em>(glossary: extra)</em>.</p>' +
    '<p><code>OPF in code stays</code> ' +
    '<form><input placeholder="OPF form"></form></p>' +
    '</main></body></html>';
  const dom = new JSDOM(domHtml, { url: 'http://localhost/', runScripts: 'outside-only' });
  let domErr = null;
  try {
    dom.window.eval('window.READINGS_GLOSSARY = ' + JSON.stringify(data));
    dom.window.eval(jsSrc);
  } catch (e) {
    domErr = e;
  }
  setTimeout(function () {
    if (domErr) {
      ok(false, 'shipped script runs in jsdom: ' + (domErr && domErr.message));
    } else {
      const doc = dom.window.document;
      const terms = Array.prototype.map.call(
        doc.querySelectorAll('.gt-term'), function (t) { return t.textContent; });
      ok(terms.length >= 6,
         'scan() wraps multiple terms in one pass (got: ' + terms.join(', ') + ')');
      ok(terms.indexOf('OPF') !== -1 && terms.indexOf('MILP') !== -1 &&
         terms.lastIndexOf('ADMM') > terms.indexOf('ADMM'),
         'occurrences after the first are wrapped too (TreeWalker detach regression)');
      ok(doc.querySelector('code .gt-term') === null, 'code is never wrapped');
      ok(doc.body.textContent.indexOf('(glossary') === -1,
         'all (glossary) markers removed from visible text');
    }
    finish();
  }, 150);
}
