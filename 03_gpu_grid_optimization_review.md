---
layout: default
title: "03 — GPU-Accelerated Grid Optimization Review"
nav_order: 3
---

# 03 — GPU-Accelerated Grid Optimization: A Review

**Scope.** This review covers where GPU computing has been applied to
electric-grid problems — power flow, optimal power flow (OPF/SCOPF), unit
commitment (UC), DERMS, and long-term planning — and, equally important,
where it has *not* been applied. It is written to be read **after**
`01` (the physics→compute bridge) and `02` (the kernels you just ran), and
it is the "second register" of the Scopus search described in `05`.

**Method, stated honestly (read this before trusting any number below).**
Every paper cited is in `papers_scopus_table.csv` with a **DOI**, resolved
through Crossref/OpenAlex (this machine has no direct Scopus access; `05`
§2 explains how to verify Scopus indexing in ~15 seconds per row). The
review is therefore **metadata-grade**: titles, venues, years, and
positions in the field are solid; specific speedup figures from paper
bodies are marked *typical/verify* where they appear, because they were not
extracted from full text. Treat every quantitative claim in this file with
the checklist in `05` §5. Legend for the CSV: `n/c` = not captured
(metadata only); `scopus_likely: verify` = plausible but not yet confirmed.

**The one-paragraph version.** Power flow on GPUs is a mature, crowded
subtopic (2012–present, steady stream). GPU OPF/SCOPF is the fast-moving
frontier (2023–2026, IPM + sparse direct solvers + condensed Newton on one
card). GPU unit commitment has only just started (2023–2026, 3–4 works).
GPU + DERMS is real but thin — the DERMS literature exists and is active,
but almost none of it is GPU. GPU + transmission/energy-system planning is
the genuine gap: no GPU-specific TEP solver paper surfaced in our queries.
That gap map *is* the thesis opportunity — see `06_phd_roadmap.md`.

---

## Subtopic A — GPU power flow (mature)

**State of play: solved, and re-solved.** Fourteen works in the CSV (A01–A16)
span 2012–2024. The field has been through its full arc:

1. **2012–2014, the existence phase.** First GPU power flows and the first
   honest benchmarks (A01, RTCSA 2012; A02, ISGT-Europe 2012 — distribution,
   radial, three-phase). The multifrontal (direct) factorization attempt
   (A03) set up the central architectural question of the subtopic:
   *iterative on GPU (SpMV-friendly) vs direct on GPU (irregular,
   fill-in, hard)*. The iterative side won by default — see kernel `02`
   in this package, which is exactly the workload these papers are about.
2. **2014–2017, the preconditioner phase.** CG with Chebyshev and two-step
   preconditioning (A04, A05), fast-decoupled PF with inexact Newton
   (A06, TPWRS — the flagship journal entry), OpenCL-based Monte-Carlo
   probabilistic PF (A07 — note: not everything is CUDA), and direct-solver
   performance analysis (A08). The batched-LU paper (A09, TPWRS 2017) is the
   ancestor of the *concurrency* idea that now dominates OPF: one GPU,
   thousands of independent solves (contingencies, scenarios).
3. **2018–present, consolidation.** Hybrid CPU-GPU batched power flows
   (A10), fully parallel Newton (A11, TSG 2019), the review that maps the
   subtopic (A12, *Energies* 2020), and a steady stream of conference-level
   refinements (A13–A16, 2021–2024) — sparse modified Newton (A13),
   CPU+GPU implementation analysis (A14), polar-form PF (A15, A16).

**What is established (safe to state in a thesis):**
- GPU power-flow speedups are real and repeatable for the *inner linear
  solve*; the honest numbers come from bandwidth, not FLOPs (your kernel
  `02` measures exactly this regime: ~1.3–1.5 TB/s effective on A100).
- The convergence-side methods (Jacobi, CG, FDLF, inexact Newton) matter as
  much as the hardware; most papers' contribution is the *combination*.
- Beyond ~tens of thousands of buses, the GPU wins on the linear algebra;
  below ~1,000 buses it is launch/sync overhead (your kernel `03` shows the
  5-bus launch-overhead regime directly: 0.17–0.4 ms per sweep, mostly
  memcpy+sync, not compute).

**Caveats a reviewer will press on:** most A-papers benchmark on IEEE
standard test cases and report per-iteration time; the *total* wall time
including factorization/preconditioner setup and data transfer is the
number that decides deployment (`05` §5, items 2–4). The 2024 entries
(A15, A16) are conference-level with limited reproducibility details —
grade them accordingly.

---

## Subtopic B — GPU OPF / SCOPF (the active frontier, 2023–2026)

**State of play: accelerating fast, and it is where the serious compute
papers now live.** Ten works (B01–B10), and the center of gravity has moved
from "can you?" (2014, B01) to "which formulation survives on one card"
(2023–2026).

**The three techniques that define the current generation:**

1. **GPU-resident sparse *direct* solvers for the IPM linear systems.**
   The interior-point method solves a sequence of sparse symmetric linear
   systems; doing the factorization on the GPU (B04, IJEPES 2023) removes
   the single biggest serial bottleneck of CPU OPF. This is the direct
   successor of the A03/A09 line from the power-flow subtopic — the field
   learned from power flow and applied the same lesson one level up the
   stack.
2. **Condensed-Newton / NLP-on-GPU formulations.** AC-OPF as a condensed
   Newton problem whose per-iteration kernels are SpMV-shaped and
   embarrassingly parallel (B03 2021/2022, B06 2024 — "SIMD abstraction of
   nonlinear programs"). B06 is the best single entry for understanding
   *how* to map an NLP onto GPU memory: it treats the NLP structure as data.
   This is the same "make the kernel shape match the hardware" principle
   you used in `02_spmv.cu`.
3. **Scenario/contingency concurrency (the N-1 problem).** Multi-period
   AC-OPF on high-memory cards (B07, 2024) and distributed (ADMM-style)
   algorithms batched on the GPU (B05 2023, B08 2025 — both distribution
   systems). The GPU's 40–80 GB of HBM lets one card hold *thousands* of
   scenario instances of a medium-sized grid — memory capacity, not FLOPs,
   is the reason GPUs entered OPF at all.

**SCOPF specifically (2024–2026):** B09 (Springer *Optimization and
Engineering*, 2026) and B10 (EPSR 2026, augmented Lagrangian on GPU) mark
the security-constrained version becoming a first-class GPU target. The
pattern: convex relaxation or Lagrangian formulation on the CPU side,
massively parallel inner solves on the GPU side.

**What is established:** GPU OPF is now credible at the *research* level;
reported speedups in this subtopic are larger than in A because the baseline
is a serial IPM (typical claims: order 10–100× on the interior loop —
*verify per paper*; the checklist in `05` §5 applies with special force to
B-papers, which are newer and often less reproducible).

**Caveats:** (i) B03/B05 are preprint-first (arXiv) — check the peer-reviewed
versions before citing numbers; (ii) B07–B10 are 2024–2026: too new to have
independent replications; (iii) almost all B-work is *AC-OPF on transmission
scale or distribution LPF*; SCOPF at transmission scale with N-1 and 10k+
buses on a *single* card is exactly where the results get thin — and where
multi-GPU / CPU+GPU hybrid questions (which our 8×A100 box exists to answer)
are open.

---

## Subtopic C — GPU unit commitment & market clearing (emerging, 2023–2026)

**State of play: three works, one clear direction, no consensus yet.**
C01–C03 is the whole GPU-UC literature our queries surfaced:

- **C01 (2023, arXiv):** UC *coupled* with AC-OPF on GPU — the interesting
  formulation question (how does the MILP outer loop coexist with a GPU
  inner solver?).
- **C02 (2025, NAPS):** scalable UC via "relaxation, tightening, and
  GPU-based solvers" — i.e., the GPU accelerates the *relaxation/LP* steps
  of a branch-and-bound / Benders-type scheme, not the integer decisions.
- **C03 (2026, TPEC):** a GPU-accelerated optimization solver for UC on
  large grids — the solver-layer framing.

**Read the pattern the same way as B:** the GPU takes on the
*convex/continuous* interior (LP relaxations, OPF feasibility checks,
Benders subproblems — all SpMV/geometry-free shapes, cf. kernel `02`),
while the combinatorial core (commitment decisions, branching) stays where
branch-and-bound can run. Nobody has claimed a full GPU branch-and-bound;
the honest framing in the literature is *hybrid*.

**Why this is a PhD-scale niche and not a weekend project:**
1. UC scale (thousands of units × hours × scenarios) makes the LP layer
   genuinely GPU-shaped — the problem is large enough to escape the
   launch-overhead regime your `03` kernel showed.
2. The market-clearing time limit (seconds) makes the hybrid CPU-GPU
   partition a *real* design variable: what goes on the card, what stays on
   the CPU, and how do you hide the H2D latency? That is a systems
   contribution, not just a kernel contribution.
3. Almost no one is doing it: three works in three years, two of them
   2025/2026. First-mover window is open.

**Caveats:** C01 is preprint-only; C02/C03 are conference level with (per
metadata) limited detail. Speedup claims here will be on the *relaxation
step* — demand the end-to-end UC wall time (`05` §5, item 2).

---

## Subtopic D — GPU + DERMS (real but thin — the niche with the least GPU ink)

**State of play: DERMS is a mature *applications* area with an almost
absent *compute* literature.** Seven works (D01–D07) describe the DERMS
problem space well — and note what is *not* in the list: no GPU-parallel
DERMS optimization paper surfaced.

**The DERMS side (what the problem demands):**
- **D01 (WIREs 2022, anchor survey):** defines DERMS and its "how to move
  forward" agenda — real-time optimization across many DERs, sub-second to
  seconds time scales, distribution-system scale. This is the document to
  quote when framing why the problem matters.
- **D02 (ISGT 2021):** a working DERMS for feeder voltage management —
  the kind of concrete, utility-shaped objective (voltage, losses, DER
  output) a GPU solver must target.
- **D03 (IET 2020):** the protocol/communication layer — DERMS performance
  is bounded by messaging, not math, in most field deployments.
- **D04/D05 (PESGM 2023 / ISGT 2023):** primal-dual (ADMM-family) DERMS and
  the *cost of communication* between the central optimizer and DER
  agents. These two are the most GPU-relevant DERMS papers in the field:
  they quantify exactly the round-trip overhead that a GPU-batched solver
  would have to beat.
- **D06 (OSTI 2024):** real-time OPF-based DERMS — evidence that
  OPF-at-real-time-speeds is a live deployment goal.
- **D07 (IEEE guide, 2021):** the functional specification — your
  requirements checklist (which services, which time scales, which
  reliability levels).

**Why "real but thin" is a precise description:**
1. DERMS instances are *small per-feeder* (tens–hundreds of buses) — each
   one individually sits in the launch-overhead regime your `03` kernel
   demonstrated. A naive "put OPF on a GPU" answer does not help.
2. *But* DERMS is intrinsically a **batch problem**: N feeders × M time
   steps × K scenarios, all independent — exactly the 3D-grid batched SpMV
   pattern from exercise 1 in `02` §6, and exactly what B05/B08 (GPU
   distributed LPF for distribution systems) are approaching from the OPF
   side. The missing paper is the one that *unifies* them: **a GPU-batched
   real-time OPF/DERMS optimizer that treats communication as the
   bottleneck and the GPU as the batch engine.**
3. The communication literature (D03–D05) gives you the adversary: you must
   show the GPU path beats the communication floor, not just the CPU
   baseline.

**Thesis framing:** Subtopic D is where your package's three kernels map
one-to-one onto a publishable system: `02` = the batched OPF/SPF inner
kernel; `03` = the correctness harness (physics-checked, CPU-referenced);
D04/D05 = the latency budget you must beat.

---

## Subtopic E — GPU + transmission expansion planning / energy-system
planning (the genuine gap)

**State of play: nothing GPU-specific exists.** Our Subtopic-E queries
returned TEP context literature (E01–E03) and *no* GPU TEP solver paper.
This is the gap the whole package is built around, and it is worth
understanding *why* it exists before you exploit it:

1. **TEP is bi-level by nature** (investment decisions on top of operation
   — which is itself OPF/UC, subtopics B and C). Until 2023–2026, the inner
   optimization was CPU-bound and un-parallelized, so there was no GPU hook
   to build on. *The GPU-OPF generation (B) is now creating that hook.*
2. **TEP is scenario-heavy** (load/generation/investment combinations —
   hundreds to thousands of operation cases per investment candidate). That
   is the same "concurrency" shape as N-1 (A09, B07): GPU memory as the
   scenario warehouse. The method transfer is ready; nobody has made it.
3. **Scale is new.** Historically TEP was solved on tens–hundreds of buses;
   modern studies (transit-scale, multi-year, stochastic) are 10k+ buses —
   the regime where your `02` kernel says the GPU wins the inner solve.

**What a first contribution would look like (this is your opening move, not
a promise):** a GPU-batched inner OPF layer under a CPU bi-level outer
loop for TEP, with the inner batch shaped like `02_spmv.cu` (3D grid:
bus × scenario × candidate) and the correctness harness shaped like
`03_pf_gauss_seidel.cu` (CPU reference + physics residual). The E-rows of
the CSV exist so your related-work section can say precisely: *TEP methods
are mature (E01–E03); their GPU acceleration is not yet published.*

---

## Synthesis — where GPUs actually help, and the gap map

**The three regimes (from your own measurements, `02` §5.4, generalized):**

| Regime | When it applies | What the GPU does | Evidence |
|---|---|---|---|
| **Launch-overhead** | < ~1k buses, small nnz | Nothing — sync + memcpy dominate (0.17–0.4 ms/iteration on 5 buses) | kernel `03`, 5-bus |
| **Bandwidth-bound** | ~10k–1M+ rows, SpMV-shaped inner solves | ~1.3–1.5 TB/s effective vs ~20 GB/s CPU single-core; 30–190× | kernels `01`, `02` |
| **Memory-capacity** | thousands of independent instances (N-1, scenarios, feeders) that fit in 40–80 GB HBM | One card holds the whole batch; CPU would stream it | A09, B07, D-batch argument |

**The gap map (what to attack, in order of first-mover value):**

1. **GPU + DERMS (Subtopic D).** The problem is defined (D01, D07), the
   latency adversary is measured (D03–D05), the OPF building blocks exist
   (B05, B08), the batch pattern is proven in this package (`02`). The
   missing artifact is a *system*: batched real-time OPF under a
   communication budget. Highest novelty-per-effort ratio.
2. **GPU + TEP/planning (Subtopic E).** Genuinely empty. Higher risk (you
   are defining the problem as you solve it) but it is the only subtopic
   where "first paper" is available at the *journal* level rather than
   "one more conference paper" level.
3. **GPU UC at scale (Subtopic C).** Three papers in; a second/third paper
   with end-to-end market-clearing wall times (not relaxation-step
   speedups) would stand out immediately.
4. **Multi-GPU SCOPF (Subtopic B).** 8×A100 boxes are common now; single-card
   results saturating ~40 GB define the exact question: when does SCOPF
   with N-1 at 10k+ buses need *two* cards, and how (NCCL + what
   partition)? No paper answers this as of the metadata we collected.

**Cross-links.**
- The kernels behind every regime claim: `cuda_kernels/` (+
  `run_kernels.ipynb`).
- The physics behind "why these problems are SpMV-shaped": `01` §4–6.
- The vocabulary (SpMV, Jacobi vs GS, condensed Newton, ADMM/primal-dual,
  bi-level): `04`.
- How to verify every row of `papers_scopus_table.csv` on Scopus, and how
  to audit any speedup claim: `05` §2 and §5.
- Turning the gap map into a degree: `06_phd_roadmap.md`.

**Methodology footnote (for your thesis version of this review).**
This file is deliberately metadata-grade. Before citing any specific
speedup in a thesis chapter: (1) open the paper via its DOI, (2) record the
baseline, problem size, and *total* wall time per the `05` §5 checklist,
(3) update the `reported_speedup` column of the CSV (currently `n/c`) with
the verified figure and the page number. That column is the single most
auditable artifact of this package — keep it honest.