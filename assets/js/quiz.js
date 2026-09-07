/* ==========================================================================
   quiz.js — self-generating, adaptive quiz for the readings site.

   The quiz page embeds each reading document's rendered HTML in a
   <script type="application/json" class="quiz-doc"> tag. On load, this
   engine parses that content (glossary term/definition pairs, sentences,
   numeric facts, section headings) and composes a fresh quiz in the
   browser:

     * every click of "Generate quiz" uses a new cryptographic seed, so
       the mix of questions, the sentences picked, and the distractors
       are different every time;
     * questions are drawn from the *current* site content, so editing
       any document automatically changes what the quiz can ask;
     * answers are tracked per topic in localStorage and weak topics get
       sampled more heavily in the next quiz (simple adaptive mastery).

   No dependencies. The pure core is exported for testing:
     module.exports = QuizCore   (Node)
     self.QuizCore                (browser, for debugging)
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---------------- RNG (seeded; crypto when available) ---------------- */

  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      try {
        crypto.getRandomValues(buf);
        return buf[0];
      } catch (e) { /* fall through to weaker seed */ }
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function pickN(arr, n, rng) {
    return shuffle(arr, rng).slice(0, n);
  }

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  /* ---------------- text utilities (no DOM required) ------------------- */

  var ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "\u2013", mdash: "\u2014", times: "\u00d7", middot: "\u00b7",
    rarr: "\u2192", larr: "\u2190", ldquo: "\u201c", rdquo: "\u201d",
    lsquo: "\u2018", rsquo: "\u2019", hellip: "\u2026", plus: "+",
    minus: "\u2212", le: "\u2264", ge: "\u2265", ne: "\u2260"
  };

  function decodeEntities(s) {
    return String(s)
      .replace(/&#(\d+);/g, function (_, n) {
        try { return String.fromCodePoint(+n); } catch (e) { return " "; }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, n) {
        try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return " "; }
      })
      .replace(/&([a-zA-Z]+);/g, function (m, name) {
        return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m;
      });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripTags(s) {
    return decodeEntities(String(s).replace(/<[^>]*>/g, " "));
  }

  function squash(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  /* Drop big non-text blocks: code, tables, figures, images. */
  function removeBlocks(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
      .replace(/<code[\s\S]*?<\/code>/gi, " ")
      .replace(/<table[\s\S]*?<\/table>/gi, " ")
      .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<img[^>]*>/gi, " ");
  }
  function extractHeadings(html) {
    var out = [];
    var re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    var m;
    while ((m = re.exec(html))) {
      var text = squash(stripTags(m[2]));
      if (text) out.push({ level: +m[1], text: text });
    }
    return out;
  }

  function extractParagraphs(html) {
    var out = [];
    var re = /<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    var m;
    while ((m = re.exec(html))) {
      var text = squash(stripTags(m[2]));
      if (text) out.push(text);
    }
    return out;
  }

  function splitSentences(text) {
    var parts = String(text).split(/(?<=[.!?…])\s+(?=[A-Z0-9"'“‘(\[])/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = squash(parts[i]);
      if (s) out.push(s);
    }
    return out;
  }

  function sentenceOk(s) {
    if (s.length < 35 || s.length > 340) return false;
    if (s.split(/\s+/).length < 6) return false;
    if (/^\(glossary:/i.test(s)) return false;        // "(glossary: …)" reference lines
    if (/^https?:/i.test(s)) return false;
    var codeChars = (s.match(/[{};<>\\|]/g) || []).length;
    if (codeChars > 2) return false;                  // code-ish
    if ((s.match(/[—–]/g) || []).length >= 3) return false;
    if (!/[A-Za-z]{3}/.test(s)) return false;
    return true;
  }

  function escapeReg(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normTerm(t) {
    return String(t).toLowerCase().replace(/[\u2019]/g, "'");
  }

  /* ---------------- glossary parsing ---------------- */

  /**
   * Entries look like (kramdown HTML):
   *   <p><strong>term</strong> — <em>Formal:</em> … <em>Plain:</em> …</p>
   * grouped under <h2>… category headings. Some entries have no Plain part.
   */
  function parseGlossary(html) {
    var entries = [];
    var currentCat = "";
    var re = /<(h2|p)[^>]*>([\s\S]*?)<\/\1>/gi;
    var m;
    while ((m = re.exec(html))) {
      if (m[1].toLowerCase() === "h2") {
        currentCat = squash(stripTags(m[2]));
        continue;
      }
      var inner = m[2];
      var termM = /^\s*<strong>([^<]+)<\/strong>\s*(?:—|–|-)\s*/i.exec(inner);
      if (!termM) continue;
      var body = inner.slice(termM[0].length);
      var fM = /<em>\s*Formal:?\s*<\/em>/i.exec(body);
      var pM = /<em>\s*Plain:?\s*<\/em>/i.exec(body);
      var formal = "";
      var plain = "";
      if (fM) {
        var formalEnd = pM && pM.index > fM.index ? pM.index : body.length;
        formal = squash(stripTags(body.slice(fM.index, formalEnd))).replace(/^Formal:\s*/i, "");
        if (pM && pM.index > fM.index) {
          plain = squash(stripTags(body.slice(pM.index))).replace(/^Plain:\s*/i, "");
        }
      }
      if (!formal && !plain) plain = squash(stripTags(body));
      if (!formal && !plain) continue;
      entries.push({
        term: squash(decodeEntities(termM[1])),
        formal: formal,
        plain: plain,
        cat: currentCat
      });
    }
    return entries;
  }

  /* Candidate surface forms of a glossary term for in-context matching. */
  function termCandidates(term) {
    var cands = [term];
    var parts = String(term).split(" / ");
    for (var i = 0; i < parts.length; i++) cands.push(parts[i]);
    cands.push(String(term).split(/[(:]/)[0]);
    cands.push(String(term).split(",")[0]);
    var compound = /[\s(]/.test(term);
    var out = [];
    var seen = {};
    for (i = 0; i < cands.length; i++) {
      var c = squash(cands[i]);
      if (c.length < 3 || c.length > 28) continue;
      if (!/^[A-Za-z]/.test(c)) continue;
      if (seen[normTerm(c)]) continue;
      // A plain short word (e.g. "daily") inside a compound term matches too
      // many sentences to make a good cloze. Keep acronyms (OPF, UC, PV).
      if (compound && !/[\s\-/]/.test(c) && c.length <= 6 &&
          c.toLowerCase() === c && !/^[A-Z]{2,}$/.test(c)) continue;
      seen[normTerm(c)] = true;
      out.push(c);
    }
    return out;
  }

  function sentenceHasTerm(text, cand) {
    if (cand.length < 3) return false;
    var re = new RegExp("(?<![A-Za-z0-9_])" + escapeReg(cand) + "(?![A-Za-z0-9_])", "i");
    return re.test(text);
  }
  /* ---------------- numeric facts ---------------- */

  var SUP = "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079";
  var UNITS = "%|\u00d7|TB/s|GB/s|MB/s|kB/s|\u00b5s|ms|kV|MV|GHz|MHz|Hz|SMs|SM|buses|bus|threads|warps|blocks|papers|kernels|terms|cases|iterations|digits|minutes|hours|days|weeks|nodes";

  /**
   * Find one good number in a sentence. Returns
   * { value, raw, unit, start, numEnd, end, hasComma, isInt } or null.
   * start..numEnd is the number token; numEnd..end is its unit (if any).
   */
  function findNumber(s) {
    var re = /(?<![A-Za-z0-9_.])(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)(?![A-Za-z0-9_.])/g;
    var m;
    while ((m = re.exec(s))) {
      var before = m.index > 0 ? s[m.index - 1] : " ";
      var afterPos = m.index + m[1].length;
      var after = s.slice(afterPos, afterPos + 1);
      if (SUP.indexOf(after) !== -1 || SUP.indexOf(before) !== -1) continue; // 10⁵ etc.
      var pre2 = s.slice(Math.max(0, m.index - 2), m.index);
      if (/[eE][+-]/.test(pre2)) continue;                                  // 1e-10
      var afterRest = s.slice(afterPos);
      if (/^[–-]\s*\d/.test(afterRest)) continue;                           // part of a range 4–8
      var value = parseFloat(m[1].replace(/,/g, ""));
      if (!isFinite(value)) continue;
      if (value >= 1900 && value <= 2100) continue;                         // years
      var rest = squash(afterRest);
      var unitM = new RegExp("^(?:" + UNITS + ")(?![A-Za-z])").exec(rest);
      var unit = unitM ? unitM[0] : "";
      var isInt = m[1].indexOf(".") === -1;
      if (!unit && isInt && value < 10) continue;  // bare tiny numbers: enumerations
      return {
        value: value,
        raw: m[1],
        unit: unit,
        start: m.index,
        numEnd: afterPos,
        end: afterPos + (unit ? unit.length : 0),
        hasComma: m[1].indexOf(",") !== -1,
        isInt: isInt
      };
    }
    return null;
  }

  function fmtNumber(value, like) {
    if (like.hasComma) return Math.round(value).toLocaleString("en-US");
    if (like.isInt) return String(Math.round(value));
    return String(Math.round(value * 100) / 100);
  }

  function numberDistractors(num, docNumbers, rng) {
    var v = num.value;
    var cand = [];
    function push(c) {
      if (typeof c !== "number" || !isFinite(c)) return;
      if (c <= 0 && v > 0) return;
      var s = fmtNumber(c, num);
      if (s === num.raw) return;
      if (cand.indexOf(s) !== -1) return;
      cand.push(s);
    }
    if (num.isInt) {
      push(v + 1); push(v - 1); push(v * 2); push(v / 2);
      push(v + 10); push(v - 10); push(v * 5); push(v + 5);
    } else {
      push(v + 0.5); push(v - 0.5); push(v * 2); push(v / 2);
      push(v + 1); push(v - 1);
    }
    // Fill with other numbers observed in the same doc (magnitude plausibility).
    for (var i = 0; i < docNumbers.length && cand.length < 6; i++) {
      var m = /^(\d[\d,]*(?:\.\d+)?)/.exec(docNumbers[i]);
      if (m) push(parseFloat(m[1].replace(/,/g, "")));
    }
    return pickN(cand, 3, rng);
  }

  /* ---------------- document model ---------------- */

  function buildDocModel(rawDocs) {
    var docs = [];
    var glossaryEntries = [];
    var glossaryDocId = null;
    var i, d, pi, s;

    for (i = 0; i < rawDocs.length; i++) {
      var raw = rawDocs[i];
      var html = String(raw.html || "");
      var clean = removeBlocks(html);
      var paragraphs = extractParagraphs(clean);
      var sentences = [];
      for (pi = 0; pi < paragraphs.length; pi++) {
        var parts = splitSentences(paragraphs[pi]);
        for (s = 0; s < parts.length; s++) {
          if (sentenceOk(parts[s])) sentences.push({ text: parts[s], docId: raw.id, para: pi });
        }
      }
      docs.push({
        id: raw.id,
        title: raw.title,
        url: raw.url,
        kind: raw.kind,
        headings: extractHeadings(html),
        paragraphs: paragraphs,
        sentences: sentences
      });
      var entries = parseGlossary(clean);
      if (entries.length > glossaryEntries.length) {
        glossaryEntries = entries;
        glossaryDocId = raw.id;
      }
    }

    // In-context occurrences of glossary terms (never inside the glossary itself).
    var termSentences = {};
    for (i = 0; i < glossaryEntries.length; i++) {
      var e = glossaryEntries[i];
      var found = [];
      var cands = termCandidates(e.term);
      var doc, si, sent, c;
      for (doc = 0; doc < docs.length && found.length < 4; doc++) {
        if (docs[doc].id === glossaryDocId) continue;
        for (si = 0; si < docs[doc].sentences.length && found.length < 4; si++) {
          sent = docs[doc].sentences[si];
          var matchedCand = null;
          for (c = 0; c < cands.length; c++) {
            if (sentenceHasTerm(sent.text, cands[c])) { matchedCand = cands[c]; break; }
          }
          if (matchedCand) found.push({ text: sent.text, docId: docs[doc].id, cand: matchedCand });
        }
      }
      termSentences[normTerm(e.term)] = found;
    }

    // Per-doc number list (for fact distractors).
    var docNumbers = {};
    for (d = 0; d < docs.length; d++) {
      var nums = [];
      for (i = 0; i < docs[d].sentences.length && nums.length < 40; i++) {
        var n = findNumber(docs[d].sentences[i].text);
        if (n && nums.indexOf(n.raw + n.unit) === -1) nums.push(n.raw + n.unit);
      }
      docNumbers[docs[d].id] = nums;
    }

    return {
      docs: docs,
      glossaryEntries: glossaryEntries,
      glossaryDocId: glossaryDocId,
      termSentences: termSentences,
      docNumbers: docNumbers
    };
  }
  /* ---------------- question builders ----------------
     Question shape:
     {
       id, type, topic, docId, terms: [..],
       prompt,            // plain text; [[blank]] marks the cloze
       options: [..],     // final (shuffled) order
       answerIndex,
       explain,           // plain text
       source: { title, url }
     }
  */

  function makeQuestion(q, rng) {
    var opts = shuffle(q.options, rng);
    var answerIndex = opts.indexOf(q.answer);
    if (answerIndex < 0) answerIndex = 0;
    var id = q.type + "::" + hashStr(q.topic + "|" + q.prompt);
    return {
      id: id,
      type: q.type,
      topic: q.topic,
      docId: q.docId,
      terms: q.terms || [],
      prompt: q.prompt,
      options: opts,
      answerIndex: answerIndex,
      explain: q.explain,
      source: q.source
    };
  }

  function buildPools(model, rng) {
    var pools = { def: [], termdef: [], context: [], fact: [], tf: [], nav: [] };
    var entries = model.glossaryEntries;
    var glossaryDoc = null;
    var d;
    for (d = 0; d < model.docs.length; d++) {
      if (model.docs[d].id === model.glossaryDocId) glossaryDoc = model.docs[d];
    }
    if (!glossaryDoc) return pools;

    var gSource = { title: glossaryDoc.title, url: glossaryDoc.url };

    function entryByTerm(t) {
      for (var j = 0; j < entries.length; j++) if (entries[j].term === t) return entries[j];
      return null;
    }

    function otherTerms(term, preferCat) {
      var out = [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].term !== term) out.push(entries[i].term);
      }
      var sameCat = [];
      var rest = [];
      out.forEach(function (t) {
        var en = entryByTerm(t);
        if (preferCat && en && en.cat === preferCat) sameCat.push(t);
        else rest.push(t);
      });
      return pickN(sameCat, Math.min(3, sameCat.length), rng)
        .concat(pickN(rest, 3, rng))
        .slice(0, 3);
    }

    /* 1) Definition → term */
    entries.forEach(function (e) {
      if (!e.formal || e.formal.length > 380) return;
      var options = [e.term].concat(otherTerms(e.term, e.cat));
      if (options.length < 4) return;
      pools.def.push(makeQuestion({
        type: "def",
        topic: "glossary::" + normTerm(e.term),
        docId: glossaryDoc.id,
        terms: [e.term],
        prompt: "Which glossary term is defined as follows?\n\n\u201c" + e.formal + "\u201d",
        options: options,
        answer: e.term,
        explain: e.term + " — " + e.formal + (e.plain ? " In plain language: " + e.plain : ""),
        source: gSource
      }, rng));
    });

    /* 2) Term → definition (short formals only) */
    var shortEntries = entries.filter(function (o) {
      return o.formal && o.formal.length >= 30 && o.formal.length <= 220;
    });
    shortEntries.forEach(function (e) {
      var others = pickN(shortEntries.filter(function (o) { return o.term !== e.term; }), 3, rng);
      if (others.length < 3) return;
      var options = [e.formal].concat(others.map(function (o) { return o.formal; }));
      pools.termdef.push(makeQuestion({
        type: "termdef",
        topic: "glossary::" + normTerm(e.term),
        docId: glossaryDoc.id,
        terms: [e.term],
        prompt: "Which of the following is the best formal definition of \u201c" + e.term + "\u201d?",
        options: options,
        answer: e.formal,
        explain: e.plain ? e.plain : e.formal,
        source: gSource
      }, rng));
    });

    /* 3) Term in context (cloze) */
    entries.forEach(function (e) {
      var key = normTerm(e.term);
      var hits = model.termSentences[key] || [];
      for (var i = 0; i < hits.length && i < 2; i++) {
        var hit = hits[i];
        var doc = docById(model, hit.docId);
        if (!doc) continue;
        var re = new RegExp(escapeReg(hit.cand), "i");
        var clozed = hit.text.replace(re, "[[blank]]");
        if (clozed.indexOf("[[blank]]") === -1) continue;
        var options = [e.term].concat(otherTerms(e.term, e.cat));
        if (options.length < 4) continue;
        pools.context.push(makeQuestion({
          type: "context",
          topic: "context::" + key + "@" + doc.id,
          docId: doc.id,
          terms: [e.term],
          prompt: "In the \u201c" + doc.kind + "\u201d reading, complete the sentence:\n\n" + clozed,
          options: options,
          answer: e.term,
          explain: "Full sentence (from " + doc.kind + "): \u201c" + hit.text + "\u201d" +
            (e.plain ? " Glossary — " + e.term + ": " + e.plain : ""),
          source: { title: doc.title, url: doc.url }
        }, rng));
      }
    });
    /* 4) Key number (cloze) and 5) true/false on the same fact */
    model.docs.forEach(function (doc) {
      var usedSent = {};
      doc.sentences.forEach(function (sent) {
        if (usedSent[sent.text]) return;
        var num = findNumber(sent.text);
        if (!num) return;
        var dists = numberDistractors(num, model.docNumbers[doc.id] || [], rng);
        if (dists.length < 3) return;
        usedSent[sent.text] = true;
        var token = num.raw + (num.unit ? " " + num.unit : "");
        var prompt = "According to this package, fill in the number:\n\n" +
          sent.text.slice(0, num.start) + "[[blank]]" + sent.text.slice(num.numEnd);
        if (prompt.indexOf("[[blank]]") === -1) return;
        var options = [token].concat(dists.map(function (x) { return x + (num.unit ? " " + num.unit : ""); }));
        var topic = "fact::" + doc.id + "::" + hashStr(sent.text);
        var source = { title: doc.title, url: doc.url };
        var explain = "Original sentence: \u201c" + sent.text + "\u201d";
        pools.fact.push(makeQuestion({
          type: "fact", topic: topic, docId: doc.id,
          terms: [], prompt: prompt, options: options, answer: token,
          explain: explain, source: source
        }, rng));

        var tfText = sent.text.slice(0, num.start) + dists[0] + sent.text.slice(num.numEnd);
        var tfMutated = rng() < 0.5;
        var tfPrompt = "True or false: " + (tfMutated ? tfText : sent.text);
        var tfAnswer = tfMutated ? "False" : "True";
        var tfExplain = (tfMutated ? "False — the corrected sentence reads: " : "True. ") +
          "\u201c" + sent.text + "\u201d (" + doc.kind + ").";
        pools.tf.push(makeQuestion({
          type: "tf", topic: "tf::" + topic, docId: doc.id,
          terms: [], prompt: tfPrompt,
          options: ["True", "False"], answer: tfAnswer,
          explain: tfExplain, source: source
        }, rng));
      });
    });

    /* Cap fact/tf pools per doc so the quiz stays varied across docs. */
    ["fact", "tf"].forEach(function (type) {
      var grouped = {};
      var kept = [];
      pools[type].forEach(function (q) {
        (grouped[q.docId] = grouped[q.docId] || []).push(q);
      });
      Object.keys(grouped).forEach(function (id) {
        kept = kept.concat(pickN(grouped[id], Math.min(6, grouped[id].length), rng));
      });
      pools[type] = kept;
    });

    /* 6) Document recall (which doc has this section) */
    model.docs.forEach(function (doc) {
      var heads = doc.headings.filter(function (hh) {
        return (hh.level === 2 || hh.level === 3) && hh.text.length >= 5 && hh.text.length <= 70;
      });
      pickN(heads, Math.min(3, heads.length), rng).forEach(function (hh) {
        var others = pickN(model.docs.filter(function (o) { return o.id !== doc.id; }), 3, rng);
        if (others.length < 3) return;
        var options = [doc.title].concat(others.map(function (o) { return o.title; }));
        pools.nav.push(makeQuestion({
          type: "nav",
          topic: "nav::" + doc.id + "::" + normTerm(hh.text),
          docId: doc.id,
          terms: [],
          prompt: "Which document of this package contains the section \u201c" + hh.text + "\u201d?",
          options: options,
          answer: doc.title,
          explain: "\u201c" + hh.text + "\u201d is a section of " + doc.title + ".",
          source: { title: doc.title, url: doc.url }
        }, rng));
      });
    });

    return pools;
  }

  function docById(model, id) {
    for (var i = 0; i < model.docs.length; i++) {
      if (model.docs[i].id === id) return model.docs[i];
    }
    return null;
  }
  /* ---------------- mastery (localStorage) ---------------- */

  var MASTERY_KEY = "gridquiz.mastery.v1";

  function loadMastery() {
    try {
      var ls = (typeof localStorage !== "undefined") ? localStorage : null;
      var raw = ls ? ls.getItem(MASTERY_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveMastery(m) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(MASTERY_KEY, JSON.stringify(m));
    } catch (e) { /* private mode: in-memory only */ }
  }

  function topicWeight(mastery, topic) {
    var rec = mastery[topic];
    if (!rec || !rec.seen) return 1;
    var acc = rec.correct / rec.seen;
    return 1 + 1.6 * (1 - acc);
  }

  function recordAnswer(mastery, q, correct) {
    mastery[q.topic] = mastery[q.topic] || { seen: 0, correct: 0 };
    mastery[q.topic].seen += 1;
    if (correct) mastery[q.topic].correct += 1;
    mastery[q.topic].ts = Date.now();
  }

  function masteryReport(model, mastery) {
    var byDoc = {};
    var total = { seen: 0, correct: 0 };
    model.docs.forEach(function (doc) {
      byDoc[doc.id] = { title: doc.title, kind: doc.kind, seen: 0, correct: 0 };
    });
    Object.keys(mastery).forEach(function (topic) {
      var docId = null;
      if (topic.indexOf("context::") === 0) {
        var at = topic.indexOf("@");
        if (at !== -1) docId = topic.slice(at + 1);
      } else if (topic.indexOf("glossary::") === 0) {
        docId = model.glossaryDocId;
      } else if (topic.indexOf("nav::") === 0 || topic.indexOf("fact::") === 0 || topic.indexOf("tf::") === 0) {
        docId = topic.split("::")[1];
      }
      var rec = mastery[topic];
      total.seen += rec.seen;
      total.correct += rec.correct;
      if (docId && byDoc[docId]) {
        byDoc[docId].seen += rec.seen;
        byDoc[docId].correct += rec.correct;
      }
    });
    return { byDoc: byDoc, total: total };
  }

  /* ---------------- quiz generation ---------------- */

  var TYPE_BASE = { context: 1.25, def: 1.2, fact: 1.0, tf: 0.85, termdef: 0.9, nav: 0.75 };

  function generateQuiz(model, pools, opts) {
    var count = opts.count;
    var focus = opts.focus || null;
    var rng = opts.rng || makeRng(randomSeed());
    var mastery = opts.mastery || {};
    var boostTopics = opts.boostTopics || [];

    var boostTerms = {};
    boostTopics.forEach(function (b) {
      if (b.indexOf("glossary::") === 0) boostTerms[b.slice("glossary::".length)] = true;
      else if (b.indexOf("context::") === 0) boostTerms[b.slice("context::".length).split("@")[0]] = true;
    });

    var all = [];
    Object.keys(pools).forEach(function (type) {
      pools[type].forEach(function (q) {
        if (focus && q.docId !== focus && q.type !== "def" && q.type !== "termdef") return;
        all.push(q);
      });
    });

    var typeCap = Math.max(2, Math.round(count * 0.4));
    var typeCount = {};
    var chosen = [];
    var pool = all.slice();
    var guard = 0;

    function isBoosted(q) {
      if (boostTopics.indexOf(q.topic) !== -1) return true;
      var terms = q.terms || [];
      for (var i = 0; i < terms.length; i++) {
        if (boostTerms[normTerm(terms[i])]) return true;
      }
      return false;
    }

    while (chosen.length < count && pool.length > 0 && guard++ < count * 80) {
      var weights = pool.map(function (q) {
        var w = (TYPE_BASE[q.type] || 1) * topicWeight(mastery, q.topic);
        if (isBoosted(q)) w *= 3;
        if ((typeCount[q.type] || 0) >= typeCap) w *= 0.12;
        return w;
      });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = rng() * total;
      var idx = pool.length - 1;
      for (var i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) { idx = i; break; }
      }
      var q = pool.splice(idx, 1)[0];
      chosen.push(q);
      typeCount[q.type] = (typeCount[q.type] || 0) + 1;
    }

    // Anchor the quiz on the glossary when possible.
    if (count >= 5 && !chosen.some(function (q) {
      return q.type === "def" || q.type === "termdef" || q.type === "context";
    })) {
      var anchor = pool.filter(function (q) {
        return q.type === "def" || q.type === "termdef" || q.type === "context";
      });
      if (anchor.length && chosen.length) {
        chosen[chosen.length - 1] = anchor[Math.floor(rng() * anchor.length)];
      }
    }

    return shuffle(chosen, rng).slice(0, count);
  }

  /* ---------------- public core ---------------- */

  var QuizCore = {
    MASTERY_KEY: MASTERY_KEY,
    TYPE_BASE: TYPE_BASE,
    makeRng: makeRng,
    randomSeed: randomSeed,
    shuffle: shuffle,
    hashStr: hashStr,
    decodeEntities: decodeEntities,
    escapeHtml: escapeHtml,
    stripTags: stripTags,
    squash: squash,
    removeBlocks: removeBlocks,
    extractHeadings: extractHeadings,
    extractParagraphs: extractParagraphs,
    splitSentences: splitSentences,
    sentenceOk: sentenceOk,
    parseGlossary: parseGlossary,
    termCandidates: termCandidates,
    sentenceHasTerm: sentenceHasTerm,
    findNumber: findNumber,
    numberDistractors: numberDistractors,
    buildDocModel: buildDocModel,
    buildPools: buildPools,
    generateQuiz: generateQuiz,
    loadMastery: loadMastery,
    saveMastery: saveMastery,
    recordAnswer: recordAnswer,
    masteryReport: masteryReport,
    topicWeight: topicWeight
  };

  if (typeof module !== "undefined" && module.exports) module.exports = QuizCore;
  root.QuizCore = QuizCore;
  /* ====================================================================
     Browser UI
     ==================================================================== */

  function bootUI() {
    var app = document.getElementById("quiz-app");
    if (!app) return;

    var rawDocs = [];
    var scriptEls = document.querySelectorAll("script.quiz-doc");
    for (var i = 0; i < scriptEls.length; i++) {
      var el = scriptEls[i];
      try {
        rawDocs.push({
          id: el.getAttribute("data-id") || String(i),
          title: el.getAttribute("data-title") || "Document",
          url: el.getAttribute("data-url") || "#",
          kind: el.getAttribute("data-kind") || "Reading",
          html: JSON.parse(el.textContent)
        });
      } catch (e) { /* skip unparseable doc */ }
    }

    if (!rawDocs.length) {
      app.innerHTML = '<p class="qz-error">The quiz could not find any reading content to draw from.</p>';
      return;
    }

    var model = buildDocModel(rawDocs);
    if (!model.glossaryEntries.length) {
      app.innerHTML = '<p class="qz-error">The quiz engine loaded the documents but could not find the glossary. Check <code>04_glossary.md</code>.</p>';
      return;
    }

    var TYPE_LABEL = {
      def: "Definition",
      termdef: "Match the definition",
      context: "Term in context",
      fact: "Key number",
      tf: "True / false",
      nav: "Where to find it"
    };

    var state = {
      quiz: null,
      index: 0,
      answered: false,
      score: 0,
      missedTopics: [],
      length: 10,
      focus: ""
    };
    try {
      var saved = JSON.parse(localStorage.getItem("gridquiz.prefs.v1") || "null");
      if (saved) {
        if ([5, 10, 15, 20].indexOf(saved.length) !== -1) state.length = saved.length;
        if (saved.focus) state.focus = saved.focus;
      }
    } catch (e) { /* ignore */ }
    function savePrefs() {
      try {
        localStorage.setItem("gridquiz.prefs.v1", JSON.stringify({ length: state.length, focus: state.focus }));
      } catch (e) { /* ignore */ }
    }

    var h = function (tag, cls, html) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    };

    function startNewQuiz() {
      var rng = makeRng(randomSeed());
      var mastery = loadMastery();
      state.quiz = generateQuiz(model, buildPools(model, rng), {
        count: state.length,
        focus: state.focus || null,
        rng: rng,
        mastery: mastery,
        boostTopics: state.missedTopics
      });
      state.index = 0;
      state.answered = false;
      state.score = 0;
      state.missedTopics = [];
      renderQuestion();
    }

    function renderSetup() {
      app.innerHTML = "";
      app.appendChild(h("h2", "qz-h", "Quiz yourself"));
      var intro = h("p", "qz-intro");
      intro.innerHTML =
        "Every quiz is <strong>generated in your browser from the documents of this site</strong> — " +
        "definitions from the glossary, sentences and key numbers from the readings, and section look-ups. " +
        "A new mix is produced every time, and the topics you miss get asked about more often in the " +
        "next quiz, until you have them solid.";
      app.appendChild(intro);

      var card = h("div", "qz-card");

      var lenRow = h("div", "qz-row");
      lenRow.appendChild(h("span", "qz-label", "Length"));
      var lenWrap = h("div", "qz-seg");
      [5, 10, 15, 20].forEach(function (n) {
        var b = h("button", "qz-seg-btn" + (state.length === n ? " is-active" : ""), String(n));
        b.type = "button";
        b.addEventListener("click", function () {
          state.length = n;
          savePrefs();
          renderSetup();
        });
        lenWrap.appendChild(b);
      });
      lenRow.appendChild(lenWrap);
      card.appendChild(lenRow);

      var focusRow = h("div", "qz-row");
      focusRow.appendChild(h("span", "qz-label", "Focus"));
      var sel = h("select", "qz-select");
      var optAll = h("option", "", "Whole package");
      optAll.value = "";
      sel.appendChild(optAll);
      model.docs.forEach(function (doc) {
        var o = h("option", "", doc.kind);
        o.value = doc.id;
        sel.appendChild(o);
      });
      sel.value = state.focus || "";
      sel.addEventListener("change", function () {
        state.focus = sel.value;
        savePrefs();
      });
      focusRow.appendChild(sel);
      card.appendChild(focusRow);

      var goBtn = h("button", "qz-btn qz-btn-primary", "Generate quiz \u2192");
      goBtn.type = "button";
      goBtn.addEventListener("click", startNewQuiz);
      card.appendChild(goBtn);
      app.appendChild(card);

      renderMasteryPanel(app);
    }
    function renderMasteryPanel(parent) {
      var mastery = loadMastery();
      var report = masteryReport(model, mastery);
      var hasData = Object.keys(mastery).some(function (t) { return mastery[t].seen > 0; });
      if (!hasData) {
        var note = h("p", "qz-note");
        note.innerHTML = "No quiz history yet — your progress per document is saved in this browser after your first quiz.";
        parent.appendChild(note);
        return;
      }
      var panel = h("div", "qz-card qz-mastery");
      panel.appendChild(h("h3", "qz-mastery-h", "Your mastery so far"));
      var rows = h("div", "qz-mastery-rows");
      model.docs.forEach(function (doc) {
        var rec = report.byDoc[doc.id];
        if (!rec || !rec.seen) return;
        var acc = Math.round(100 * rec.correct / rec.seen);
        var row = h("div", "qz-mrow");
        row.appendChild(h("span", "qz-mrow-label", doc.kind));
        var bar = h("div", "qz-mbar");
        var fill = h("div", "qz-mbar-fill" + (acc >= 80 ? " good" : acc >= 50 ? " mid" : " low"));
        fill.style.width = acc + "%";
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(h("span", "qz-mrow-val", acc + "% (" + rec.correct + "/" + rec.seen + ")"));
        rows.appendChild(row);
      });
      panel.appendChild(rows);
      var total = report.total;
      if (total.seen) {
        var tAcc = Math.round(100 * total.correct / total.seen);
        panel.appendChild(h("p", "qz-note", "Overall: " + tAcc + "% over " + total.seen + " answered questions."));
      }
      var reset = h("button", "qz-link", "Reset progress");
      reset.type = "button";
      reset.addEventListener("click", function () {
        try { localStorage.removeItem(MASTERY_KEY); } catch (e) { /* ignore */ }
        renderSetup();
      });
      panel.appendChild(reset);
      parent.appendChild(panel);
    }

    function renderQuestion() {
      var q = state.quiz[state.index];
      state.answered = false;
      app.innerHTML = "";

      var top = h("div", "qz-top");
      var back = h("button", "qz-link", "\u2190 Quit quiz");
      back.type = "button";
      back.addEventListener("click", renderSetup);
      top.appendChild(back);
      top.appendChild(h("span", "qz-prog",
        "Question " + (state.index + 1) + " of " + state.quiz.length + " \u00b7 " + state.score + " correct so far"));
      app.appendChild(top);

      var bar = h("div", "qz-pbar");
      var fill = h("div", "qz-pbar-fill");
      fill.style.width = (100 * state.index / state.quiz.length) + "%";
      bar.appendChild(fill);
      app.appendChild(bar);

      var doc = docById(model, q.docId) || model.docs[0];
      var card = h("div", "qz-card qz-qcard");
      var badges = h("div", "qz-badges");
      badges.appendChild(h("span", "qz-badge qz-badge-type", TYPE_LABEL[q.type] || q.type));
      badges.appendChild(h("span", "qz-badge", doc.kind));
      card.appendChild(badges);

      var prompt = h("div", "qz-prompt");
      prompt.innerHTML = escapeHtml(q.prompt)
        .replace(/\[\[blank\]\]/g, '<mark class="qz-blank">&nbsp;________&nbsp;</mark>')
        .replace(/\n\n/g, "<br><br>");
      card.appendChild(prompt);

      var opts = h("div", "qz-opts");
      q.options.forEach(function (opt, oi) {
        var b = h("button", "qz-opt");
        b.type = "button";
        b.appendChild(h("span", "qz-opt-key", "ABCD"[oi] || String(oi + 1)));
        b.appendChild(h("span", "qz-opt-text", escapeHtml(opt)));
        b.addEventListener("click", function () { answer(oi); });
        opts.appendChild(b);
      });
      card.appendChild(opts);

      var feedback = h("div", "qz-feedback");
      card.appendChild(feedback);

      var nav = h("div", "qz-nav");
      var next = h("button", "qz-btn qz-btn-primary",
        state.index === state.quiz.length - 1 ? "See results \u2192" : "Next question \u2192");
      next.type = "button";
      next.style.visibility = "hidden";
      next.addEventListener("click", function () {
        if (!state.answered) return;
        state.index++;
        if (state.index >= state.quiz.length) renderResults();
        else renderQuestion();
      });
      nav.appendChild(next);
      card.appendChild(nav);
      app.appendChild(card);
      function answer(oi) {
        if (state.answered) return;
        state.answered = true;
        var correct = oi === q.answerIndex;
        if (correct) state.score++;
        else state.missedTopics.push(q.topic);
        q.userCorrect = correct;

        var mastery = loadMastery();
        recordAnswer(mastery, q, correct);
        saveMastery(mastery);

        var btns = opts.querySelectorAll(".qz-opt");
        for (var bi = 0; bi < btns.length; bi++) {
          btns[bi].disabled = true;
          if (bi === q.answerIndex) btns[bi].classList.add("qz-opt-correct");
          else if (bi === oi) btns[bi].classList.add("qz-opt-wrong");
        }

        feedback.className = "qz-feedback show " + (correct ? "is-correct" : "is-wrong");
        feedback.innerHTML = "";
        feedback.appendChild(h("div", "qz-verdict", correct ? "\u2713 Correct." : "\u2717 Not quite."));
        feedback.appendChild(h("div", "qz-explain", escapeHtml(q.explain)));
        var link = h("div", "qz-source");
        link.innerHTML = 'Source: <a href="' + escapeHtml(q.source.url) + '">' + escapeHtml(q.source.title) + "</a>";
        feedback.appendChild(link);
        next.style.visibility = "visible";
      }

      // Keyboard: 1-9 answers, Enter/Space advances, Esc quits.
      function onKey(ev) {
        if (ev.key >= "1" && ev.key <= String(q.options.length)) {
          answer(+ev.key - 1);
        } else if ((ev.key === "Enter" || ev.key === " ") && state.answered) {
          ev.preventDefault();
          next.click();
        } else if (ev.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          renderSetup();
        }
      }
      document.removeEventListener("keydown", onKey);
      document.addEventListener("keydown", onKey);
    }
    function renderResults() {
      app.innerHTML = "";
      var total = state.quiz.length;
      var pct = total ? Math.round(100 * state.score / total) : 0;

      var card = h("div", "qz-card qz-results");
      var score = h("div", "qz-score " + (pct >= 80 ? "good" : pct >= 50 ? "mid" : "low"));
      score.appendChild(h("span", "qz-score-num", String(pct) + "%"));
      score.appendChild(h("span", "qz-score-sub", state.score + " of " + total + " correct"));
      card.appendChild(score);

      var byType = {};
      state.quiz.forEach(function (q) {
        byType[q.type] = byType[q.type] || { seen: 0, correct: 0 };
        byType[q.type].seen++;
        if (q.userCorrect) byType[q.type].correct++;
      });
      var chips = h("div", "qz-chips");
      Object.keys(byType).forEach(function (t) {
        chips.appendChild(h("span", "qz-chip",
          (TYPE_LABEL[t] || t) + ": " + byType[t].correct + "/" + byType[t].seen));
      });
      card.appendChild(chips);

      var msg = h("p", "qz-note");
      if (pct >= 80) {
        msg.innerHTML = "Strong. The next quiz will lean on the topics you still got wrong — that is how mastery compounds.";
      } else if (pct >= 50) {
        msg.innerHTML = "Good start. Your weak topics are now weighted higher in the next quiz.";
      } else {
        msg.innerHTML = "No problem — this quiz is a diagnostic. The next one will focus more on the topics you missed.";
      }
      card.appendChild(msg);

      var btns = h("div", "qz-result-btns");
      var again = h("button", "qz-btn qz-btn-primary", "New quiz (fresh mix)");
      again.type = "button";
      again.addEventListener("click", function () {
        state.missedTopics = [];
        startNewQuiz();
      });
      btns.appendChild(again);
      if (state.missedTopics.length) {
        var missed = h("button", "qz-btn", "Retry what I missed (" + state.missedTopics.length + ")");
        missed.type = "button";
        missed.addEventListener("click", startNewQuiz); // boostTopics = missedTopics
        btns.appendChild(missed);
      }
      var setup = h("button", "qz-btn", "\u2190 Back to setup");
      setup.type = "button";
      setup.addEventListener("click", renderSetup);
      btns.appendChild(setup);
      card.appendChild(btns);
      app.appendChild(card);

      renderMasteryPanel(app);
    }

    renderSetup();
  }

  if (typeof document !== "undefined" && typeof document.getElementById === "function") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootUI);
    } else {
      bootUI();
    }
  }
})(typeof self !== "undefined" ? self : this);
