---
layout: default
title: "06 — PhD Roadmap"
nav_order: 6
data_quiz: "PhD roadmap"
---

# 06 — PhD Roadmap: GPU-Accelerated Grid Optimization

This roadmap converts the gap map in `03` into a degree. Assumptions:
3–4 years, your machine (8× A100-40GB, CUDA 12.8) is the primary compute,
and you start from the state of this package (working self-verifying
kernels, DOI-backed review). If your program has a different calendar,
shift the semesters — keep the *dependencies* intact.

**The thesis in one sentence (draft, to be refined in semester 2):**
*"GPU-batched convex inner solvers for distribution and transmission
optimization: real-time DERMS dispatch and scenario-heavy planning, with
communication- and memory-aware system designs."*

Everything below either serves that sentence or is explicitly a hedge
(option B/C) against it stalling.

---

## 1. Semester-by-semester plan

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_semester_gantt.svg' | relative_url }}" alt="An eight-semester Gantt chart: navy mainline bars D1 (S2–S4) and D2 (S4–S6), amber side bars D3 and D4 (S5–S7), a dashed D5 hedge bar (S4–S6), and four amber diamond gates at the ends of S1, S2, S3 and S5" width="760">
  <figcaption>The whole plan at a glance: D1 (DERMS) then D2 (TEP) are the mainline; D3/D4 run in parallel as side tracks in Year 3; D5 is a dashed hedge that only starts if the mainline stalls. The diamonds are the gates below — miss one and the plan has a written fallback.</figcaption>
</figure>

### Year 1 — foundations + first honest result
**Semester 1 (Aug–Dec):**
- Courses: optimization (interior-point methods, duality), power-system
  analysis (power flow, OPF), parallel computing or HPC systems.
- Build the *tooling ladder* (below) to rung 3 (cuSPARSE + your own
  kernels). Deliverable: extend `02_spmv.cu` to a **3D batched kernel**
  (M independent systems, one launch) with the `03`-style
  CPU-reference + physics-residual harness. *This is a paper-shaped
  result, not an exercise.*
- Read: Subtopics A + B of `03` deeply (full text, not metadata); fill the
  `reported_speedup` column of `papers_scopus_table.csv` for rows A01–B10
  with verified figures.

**Semester 2 (Jan–May):**
- Complete the batched kernel + a **roofline analysis** of it (where does
  it sit on the A100 roofline at batch sizes 1…4096?).
- First paper (workshop/conference tier): *"Batched sparse convex solves
  for distribution-system dispatch on GPU"* — target a mid-tier venue
  (ISGT/PSCC or a systems workshop). The goal of paper 1 is **calibration**:
  learning the review process, not a home-run.
- Begin direction D (GPU + DERMS, see §3) as the mainline.

### Year 2 — mainline: GPU + DERMS (Subtopic D)
**Semester 3:**
- System build: GPU-batched real-time OPF/LPF across N feeders under a
  communication budget. Baselines: (a) per-feeder CPU solver, (b) the
  primal-dual schemes of D04/D05 *with their measured communication
  overhead*. The claim to beat is D04's latency, not just "faster than
  sequential".
- Method: condensed-Newton or ADMM inner (B03/B06 pattern) + 3D batch
  (your Semester-1 kernel) + overlap of compute and the (simulated or
  real) communication round-trip (CUDA streams).
- Mid-year checkpoint: if the communication floor is *not* the binding
  constraint (i.e., even a CPU solver beats the DERMS real-time budget),
  the contribution shifts to **throughput** (more scenarios/feeders in the
  same budget) — still publishable, different title.

**Semester 4:**
- Journal paper 2 (mainline): *IEEE TSG / TPWRS* tier — "A GPU-batched
  real-time OPF framework for DERMS".
- Start direction E (TEP) as the second mainline: literature + formulation
  only (E01–E03 + B papers), no code yet.

### Year 3 — TEP + multi-GPU (Subtopics E, B)
**Semester 5:**
- TEP prototype: bi-level structure (CPU outer branch-and-bound /
  heuristic over investment candidates; GPU-batched inner OPF over
  scenarios × candidates, 3D grid). Reuse: batched kernel (Y1), condensed
  Newton (Y2), harness (Y1).
- Multi-GPU experiment (B-gap #4 from `03`): when does a 10k-bus N-1 SCOPF
  batch exceed 40 GB, and what does NCCL + bus/scenario partitioning buy?
  This is a *characterization* paper even if the algorithm stays simple.
**Semester 6:**
- Journal paper 3: TEP inner-layer acceleration (IJEPES/TPWRS tier) or the
  multi-GPU characterization (TSTE/HPEC tier), whichever data are
  stronger.
- Begin writing the thesis spine (chapter drafts as papers land — never
  "write the thesis in the last year").

### Year 4 — consolidation
**Semester 7:** thesis writing; open-source the codebase (it will cite
itself in the defense); a systems paper (multi-GPU + batch + DERMS as one
coherent system) as thesis capstone if the pieces align.
**Semester 8:** defense; job-market version of the work (1 page per
direction); maintenance of the reproducibility artifacts (Dockerfile,
`build_and_run.sh`, fixed seeds).

**Milestones that gate progress (be honest about these):**
| Gate | When | If it fails |
|---|---|---|
| Batched kernel $\ge 10\times$ over sequential at batch $\ge 256$ | end of Sem 1 | revisit memory layout (SoA vs AoS) before continuing |
| Paper 1 submitted | end of Sem 2 | cut scope to a workshop-length result; submit anyway |
| DERMS system beats a communication-aware baseline | end of Sem 3 | switch mainline to direction C (UC) — same kernels, different outer loop |
| TEP inner layer runs end-to-end | end of Sem 5 | shrink to a 300-bus TEP instance; the *method* transfer is the contribution, scale is the story |

---

## 2. Tooling ladder (climb deliberately; do not skip rungs)

| Rung | Tool | Why this rung | When you're ready for the next |
|---|---|---|---|
| 1 | **Python + NumPy/SciPy** (your `03` CPU GS reference lives here conceptually) | Prototypes, correctness references, data plumbing | You can reproduce a paper's algorithm in 200 lines |
| 2 | **CUDA C/C++** (rungs you are on: kernels 01–03) | Full control of the two regimes that decide this field: bandwidth and launch overhead | You can read your `nsys`/`nvprof` timeline and say which kernel stalls where |
| 3 | **cuSPARSE / cuSOLVER / cuBLAS** | Stop re-inventing SpMV, LU, and symmetric positive-definite solves; learn their limits (where they *don't* fit is your kernel's opportunity) | You can name a workload where the library loses to your hand-written kernel and measure why |
| 4 | **PyTorch (as an autograd + GPU backend)** | Rapid exploration of condensed-Newton/ADMM formulations; automatic differentiation of power-flow residuals; the 2024–2026 OPF-on-GPU line (B06 "SIMD abstraction") is adjacent to this | You can justify *leaving* PyTorch for CUDA (or not) with a measured number |
| 5 | **Multi-GPU: NCCL + CUDA streams + unified memory decisions** | The Y3 experiments (multi-GPU SCOPF/TEP) | — |

Rules: (i) rung N+1 never replaces rung N — your CUDA reference stays the
ground truth for every PyTorch prototype; (ii) every rung change gets a
one-page writeup in a `notes/` folder (these become thesis chapters);
(iii) keep the build one command (`build_and_run.sh`) until multi-GPU
needs break it.

## 3. Research directions (tied to the `03` gap map)

**D1 (mainline) — GPU-batched real-time OPF for DERMS.**
Gap: Subtopic D. Artifacts: 3D batched kernel (Y1) + condensed-Newton/ADMM
inner (Y2) + communication-overlap system (Y2). Baseline adversary: D04/D05
latency measurements. Risk: low (building blocks exist everywhere).
**D2 (mainline) — GPU inner layer for TEP/bi-level planning.**
Gap: Subtopic E (empty). Artifacts: batched OPF under a CPU bi-level outer
loop; scenario-warehouse memory design. Risk: medium (you define the
problem). Hedge: if TEP data is unavailable, re-scope to "GPU-batched
stochastic OPF under investment uncertainty" — same kernels, cleaner
problem.
**D3 (side) — end-to-end GPU UC.**
Gap: Subtopic C (3 papers). Artifacts: relaxation/LP layer on GPU with
measured *market-clearing wall time* (the number nobody reports). Risk:
low–medium; strong fallback to a characterization paper.
**D4 (side) — multi-GPU characterization of SCOPF at 10k+ buses.**
Gap: `03` gap #4. Artifacts: capacity/communication map: batch size vs
buses vs card count, with the crossover points. Risk: low; high
citatability (reference-paper style).
**D5 (exploratory hedge) — learned preconditioners / physics-informed
initialization for GPU power-flow.**
Gap: adjacent to Subtopic A (nobody in the CSV does ML + GPU PF). Only
start if D1–D4 stall in semester 3–4; it is a *hedge*, not a plan — it
needs ML infrastructure you would otherwise not build.

## 4. Target venues (by direction, best-fit first)

| Direction | Conferences | Journals |
|---|---|---|
| D1 (DERMS) | ISGT, PESGM, PSCC, IPDPS (systems angle) | IEEE TSG, IEEE TPWRS, IET GTD |
| D2 (TEP) | PSCC, PESGM | IEEE TPWRS, IJEPES, IEEE TSTE |
| D3 (UC) | TPEC, PESGM, NAPS (first shot) | IEEE TPWRS, IEEE Trans. Power Systems (market), Opt. & Eng. |
| D4 (multi-GPU) | HPEC, HICSS, SC (workshops) | IEEE TSTE, IJEPES, Concurrency & Computation |
| D5 (ML+PF) | NeurIPS/ICLR applied tracks (risky), PESGM | IEEE TSG, Applied Energy |

Strategy: **conference in year 1–2, journal in year 2–3, systems
capstone in year 4.** The IEEE power-systems journals (TPWRS/TSG) are the
defining venues for this field — a single TPWRS paper changes how
committees read the rest of the file.

## 5. Execution advice (the part that actually determines the degree)

1. **The weekly unit is a result, not an hour.** Every week ends with one
   of: a new measurement, a new paragraph, a new code artifact with a test.
   "Worked on the kernel" is not a unit.
2. **Correctness before speed, always.** Your `03` debugging saga
   (conjugate bug, PV-bus Q formula, 1/8 reduction) is the field's
   microcosm: GPU power-systems code that "converges" to the wrong answer
   looks better than a bug. Keep the physics-residual check
   (Tellegen balance) in *every* benchmark script.
3. **Report total wall time, with the transfer overhead included.** This
   is `05` §5 item 4 as a personal rule. The community's trust in GPU
   power-systems papers is exactly as thin as its audit trail.
4. **One mainline, two sides, one hedge.** D1+D2 are the thesis; D3/D4 are
   the publication floor; D5 is the last resort. Any week, you can name
   which of the four is being advanced — if you can't, you are doing D5
   work by another name.
5. **Keep the package reproducible forever.** `build_and_run.sh`, pinned
   seeds, a Dockerfile by semester 3, and the CSV with verified speedups
   are the artifacts that survive you; they are also your defense-day
   demo.
6. **Write the negative results.** A "GPU does not help below X buses /
   below Y nnz" finding with a clean regime boundary (your
   `02` §6 exercise 3) is a citable sentence — the 5-bus launch-overhead
   measurement in `03` is one.

---

*End of roadmap. Companion files: `00_README.md` (map), `01` (bridge),
`02` (kernels + results), `03` (review), `04` (glossary), `05` (Scopus +
claim auditing), `papers_scopus_table.csv` (the auditable table),
`cuda_kernels/` (the code that makes every claim above checkable).*