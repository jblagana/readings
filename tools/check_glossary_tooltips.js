#!/usr/bin/env node
/* ==========================================================================
   check_glossary_tooltips.js — Node checks for the glossary tooltip system.

   Run:  node tools/check_glossary_tooltips.js

   Verifies, without Jekyll or a browser:
     1. _data/glossary.json is well-formed (every entry has a term, a
        non-empty Formal or Plain, and at least one match pattern);
     2. the matcher core exported by assets/js/glossary_tooltips.js
        behaves as specified (boundary guards, case rules, longest-match
        overlap resolution) against the real data.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { buildMatchers, matchesIn } = require(path.join(ROOT, 'assets', 'js', 'glossary_tooltips.js'));

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

/* ------------------------------------------------------------------ */
console.log(failures === 0
  ? '\nALL CHECKS PASSED'
  : '\n' + failures + ' CHECK(S) FAILED');
process.exitCode = failures === 0 ? 0 : 1;
