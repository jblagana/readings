---
layout: default
title: Package README
nav_exclude: true
data_quiz: "Package map"
---

# GPU-Accelerated Grid Optimization — Review & Learning Package

**Who this is for:** an electrical-engineering graduate (or strong undergrad) who
knows circuits and the basics of power systems, wants to work on **GPU-accelerated
optimization for DERMS and large-scale energy-system planning**, and aims at a
PhD in this space.

**What this package is:** a self-contained, cross-linked set of Markdown docs +
a DOI-backed paper table + three **real, compiled, benchmarked CUDA kernels**
that you can run on this machine (8× A100-40GB, CUDA 12.8).

Every term is explained twice — once formally, once in plain language — in
`04_glossary.md`. Every paper in `papers_scopus_table.csv` carries a DOI and an
honest note about whether its venue is expected to be Scopus-indexed.

## Files

| File | What it gives you |
|---|---|
| `00_README.md` | This file: map + reading paths. |
| `01_fundamentals_bridge.md` | Circuits → power flow → OPF → UC/market → DERMS → planning → optimization toolbox. The prerequisite layer. |
| `02_gpu_basics_and_kernels.md` | How a GPU actually works (warp, memory wall, roofline), why grid problems fit it, and annotated walkthroughs of the 3 kernels with measured A100 numbers. |
| `03_gpu_grid_optimization_review.md` | The literature review proper: GPU power flow, GPU OPF/SCOPF, GPU unit commitment/market, GPU+DERMS, GPU+planning, plus a synthesis of what works and where the gaps are. |
| `04_glossary.md` | ~70 terms, each with a formal definition and a plain-language version. |
| `05_scopus_search_guide.md` | How to verify Scopus indexing, target journals, ready-to-paste Scopus queries, and free APIs (OpenAlex/Crossref) to reproduce this table. |
| `06_phd_roadmap.md` | Semester-by-semester plan, tooling ladder, 5 concrete PhD research directions tied to the gaps found in 03, venues and survival tactics. |
| `papers_scopus_table.csv` | The deduplicated paper table (DOI, venue, year, contribution, speedup where reported). |
| `cuda_kernels/` | `01_dot_product.cu`, `02_spmv.cu`, `03_pf_gauss_seidel.cu`, `build_and_run.sh`, `run_kernels.ipynb`. |

## Reading paths

1. **Fast lane (~3 h):** `03` highlights → skim `04` while reading → `05`.
2. **Deep track (2–3 weeks):** `00 → 01 → 02 (run the kernels) → 03 → 04 → 05 → 06`.
3. **PhD-prep track:** `01` twice, run and *modify* the kernels in `cuda_kernels/`,
   then `03` + `06` to pick a direction.

## Provenance & honesty notes

- **Literature data** was collected on **2026-09-04** via the Crossref and
  OpenAlex APIs (DOI-backed). We do **not** have Scopus access from this
  machine, so the table uses a `scopus_likely` flag ("yes" / "verify" /
  "no") and `05_scopus_search_guide.md` tells you how to confirm each venue
  in 5 minutes.
- **Benchmark numbers** in `02` and `cuda_kernels/` were measured on this box
  (NVIDIA A100-SXM4-40GB) on the date above. Re-run `cuda_kernels/build_and_run.sh`
  to reproduce; times will vary with GPU load.
- Nothing here is placeholder text: if a fact could not be verified, it says so
  explicitly instead of pretending.

*Generated 2026-09-04. See `06_phd_roadmap.md` for where to go after this.*
