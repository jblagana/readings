---
layout: default
title: Repository README
nav_exclude: true
---

# GPU-Accelerated Grid Optimization — Review & Learning Package

**Live site → [jblagana.github.io/readings](https://jblagana.github.io/readings/)**

A self-contained, cross-linked set of Markdown docs + a DOI-backed paper table
(41 papers) + three real, benchmarked CUDA kernels, aimed at an
electrical-engineering graduate working toward a PhD in GPU-accelerated grid
optimization and DERMS.

| Document | What it is |
| --- | --- |
| [00_README](00_README.md) | Map of the package and suggested reading paths |
| [01 — Fundamentals bridge](01_fundamentals_bridge.md) | Circuits → power flow → OPF → UC/market → DERMS → planning |
| [02 — GPU basics and kernels](02_gpu_basics_and_kernels.md) | GPU architecture + annotated CUDA kernels with A100 numbers |
| [03 — Grid optimization review](03_gpu_grid_optimization_review.md) | Literature review: GPU power flow, OPF/SCOPF, UC, DERMS, planning |
| [04 — Glossary](04_glossary.md) | ~70 terms, formal + plain-language definitions |
| [05 — Scopus search guide](05_scopus_search_guide.md) | Verifying venues, ready-to-paste queries, OpenAlex/Crossref |
| [06 — PhD roadmap](06_phd_roadmap.md) | Semester plan, five research directions, target venues |
| [papers_scopus_table.csv](papers_scopus_table.csv) | The auditable paper table (DOI, venue, speedup) |
| [cuda_kernels/](cuda_kernels/) | Three self-verifying CUDA kernels + build script |
| [Quiz](quiz.md) | Self-generated quiz from every document, with per-topic mastery tracking |

## How the site works

This repo **is** the website: Jekyll (minima theme) served by GitHub Pages
from the `main` branch. Edit any `.md` file, commit, push — the site rebuilds
in about a minute. The custom styling lives in `assets/css/site.css`.

The quiz page (`quiz.md`) embeds each document's rendered HTML as JSON, and
`assets/js/quiz.js` composes a fresh randomized quiz in the browser from it —
so editing a document automatically changes what the quiz can ask. Per-topic
mastery is kept in `localStorage`, and weak topics are sampled more often in
the next quiz.

### Glossary tooltips

Glossary terms in the posts light up on hover (or keyboard focus) with their
formal + plain definitions, without leaving the page. The tooltip data is
generated, not hand-maintained:

```bash
python3 tools/build_glossary_terms.py            # regenerate _data/glossary.json
python3 tools/build_glossary_terms.py --report   # preview every match first
node tools/check_glossary_tooltips.js            # sanity-check JSON + matcher
```

- `04_glossary.md` remains the single source of truth;
  `tools/build_glossary_terms.py` parses it and writes `_data/glossary.json`
  (terms + curated match patterns per term).
- `_includes/head.html` injects that JSON (`site.data.glossary | jsonify`) as
  `window.READINGS_GLOSSARY`;
  `assets/js/glossary_tooltips.js` wraps term occurrences in the page'
  content root (the `<main class="page-content">` area — the minima theme
  ships no `#main`) with a `.gt-term` span and shows a shared `.gt-tip`
  tooltip (styled in `assets/css/site.css`).
- Each wrapped term shows a small superscript ¹. The old literal
  `*(glossary)*` / `*(glossary: ...)*` source markers are stripped from the
  rendered page (including the per-section summary lines that consisted of
  nothing but a marker) — they stay in the `.md` files as authoring notes,
  and the quiz page's client-side-injected content is cleaned the same way.
- Matching is boundary-guarded and longest-match-wins, so "OPF" never fires
  inside "DC-OPF"/"SCOPF" and "bus" never inside "Ybus". Code blocks and form
  controls are never touched, and the glossary page itself disables tooltips
  via `no_tooltips: true` in its front matter.
- Equations (and powers of ten) are written in the `.md` sources as
  `$...$` / `$$...$$` LaTeX and rendered client-side by KaTeX (pinned CDN
  load in `_includes/head.html`). The same renderer runs over the tooltip
  bodies and over client-side-injected content; `pre`/`code` blocks and
  form controls are ignored by it. Note for authors: kramdown eats
  backslash-punctuation, so math here only uses commands where a letter
  follows the backslash (no `\,`, no `\[`/`\(` delimiters).

After editing the glossary (or its `MATCHES` curation in the build script),
re-run the build so the site picks up the new terms.
