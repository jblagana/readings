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

## How the site works

This repo **is** the website: Jekyll (minima theme) served by GitHub Pages
from the `main` branch. Edit any `.md` file, commit, push — the site rebuilds
in about a minute. The custom styling lives in `assets/css/site.css`.
