---
layout: default
title: "02 — GPU Basics and Kernels"
nav_order: 2
data_quiz: "GPU & kernels"
---

# 02 — GPU Basics and Kernels: how the hardware actually works

**Goal:** after this document you can (a) explain to another engineer *why* a
grid problem speeds up on a GPU (or *why it doesn't*), (b) read a CUDA kernel
end-to-end, and (c) run and extend the three kernels in `cuda_kernels/`.
Companion glossary terms are in `04_glossary.md`.

---

## 1. CPU vs GPU in one page

**Formal.** A CPU is an *oldest-job-first machine with 4–16 strong cores*,
big caches, out-of-order execution, and deep branch prediction — optimized
for *latency* of a single dependent instruction stream. A GPU is a
*throughput machine*: thousands of weak cores (tens of thousands of threads)
organized so that a **warp** *(glossary: 32 threads executing lockstep)* can
switch in one cycle, hiding memory latency by *context switching*, not by
cache. The GPU wins when a program has **enough independent work** to keep
all cores busy; it loses on serial, branchy, latency-bound code.

**Plain.** A CPU is 8 expert engineers who each think deeply. A GPU is 100,000
interns who each do one tiny thing, but a million tiny things happen per
hour. Grid optimization is full of "a million tiny things": multiply
$10^7$ non-zeros, run 2,000 contingency cases, sweep 100,000 buses.

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_cpu_vs_gpu.svg' | relative_url }}" alt="A CPU with four large cores and caches on the left, versus a GPU with a grid of many small cores and an HBM memory bar on the right" width="760">
  <figcaption>Two strategies for the same transistor budget. A CPU buys speed per instruction — deep pipelines, big caches, branch prediction. A GPU buys total work per second — thousands of threads kept in flight, so a slow memory read is covered by other warps while it resolves.</figcaption>
</figure>

**Amdahl's law** *(glossary)* sets the ceiling: if 20% of a solver is
fundamentally serial (e.g., a sparse *factorization* on one device), then no
matter how many GPUs you add, total speedup $\le 1/0.2 = 5\times$. This
single
equation explains why the literature splits into (a) *accelerate the linear
algebra* and (b) *parallelize the scenarios* — and why honest papers report
*what fraction they parallelized*.

<div class="widget am" id="am-root">
  <span class="widget-badge">Interactive</span>
  <p class="widget-title">Amdahl's law, made moveable</p>
  <p class="widget-sub">Drag the serial fraction $f$ — the speedup ceiling is $1/f$, no matter how many GPUs you buy.</p>
  <div class="am-bar" aria-hidden="true"><div class="am-serial"></div></div>
  <div class="am-bar-legend">
    <span class="am-key-serial">serial: <span class="am-serial-pct">20%</span></span>
    <span>parallel — any number of GPUs</span>
  </div>
  <div class="am-read">
    <span class="am-value">5.0×</span>
    <p class="am-text">The ceiling is 5.0× — the literature's honest middle. Factorize on CPU, sweep on GPU; parallelize the scenarios for the rest.</p>
  </div>
  <label class="am-label" for="am-slider">Serial fraction $f$</label>
  <input class="am-slider" id="am-slider" type="range" min="1" max="95" step="1" value="20" aria-label="Serial fraction, percent">
</div>

**The memory wall.** GPU FLOPs outgrow memory bandwidth by $\sim 10$–$100\times$. Most
power-system kernels (SpMV, sweeps) are **memory-bandwidth-bound** *(glossary:
roofline model)*: their speed is set by how fast bytes move from HBM
(A100: ~1.5–2 TB/s) — *not* by arithmetic. That is why `cuda_kernels/02_spmv.cu`
reports GB/s, and why double (64-bit) precision — which power systems demand
for convergence — costs 2× the bandwidth of single precision. A100s support
full-rate double, which is why this package's kernels use `double`.

---

## 2. Inside the GPU (just enough to read a kernel)

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_a100_die.svg' | relative_url }}" alt="An A100 die with six HBM memory stacks on its sides, four GPCs of SM tiles inside, and a zoomed box showing one SM: CUDA cores, shared memory, and warp schedulers" width="760">
  <figcaption>The A100 die. HBM stacks wrap the silicon and feed it at roughly 2 TB/s; the compute lives in 108 streaming multiprocessors. The zoomed SM is where your kernel code actually runs — CUDA cores grouped into 32-thread warps, a private fast shared-memory tile, and the schedulers that hide latency.</figcaption>
</figure>

- **SM** *(glossary: streaming multiprocessor)*: the GPU's "core" — dozens of
  CUDA cores, a shared memory tile, schedulers. An A100 has 108 SMs.
- **Thread → warp → block → grid**: a kernel is launched as a *grid* of
  *blocks* of 32–1024 *threads*; the hardware schedules threads in warps of 32.
  A **block** can communicate via **shared memory** *(glossary)* (fast, per-SM);
  different blocks communicate only through **global memory** *(glossary:
  HBM)* (slow).
- **Coalesced access** *(glossary)*: threads in a warp that read consecutive
  addresses make *one* memory transaction instead of 32. Your kernel either
  exploits this (fast) or doesn't (10× slower).
- **Latency hiding**: while warp A waits for memory, the scheduler runs warp
  B. Fewer resident warps → more waiting → "not enough parallelism", the
  most common GPU bug.
- **Launch overhead**: starting a kernel costs ~5–20 µs. Kernels that take
  <50 µs are *overhead-bound* — this is exactly the regime of
  `cuda_kernels/03_pf_gauss_seidel.cu` (5 buses), and the reason production
  GPU solvers batch work.
- **Precision**: CUDA C defaults arithmetic to `double` in device code;
  `--use_fast_math` (reciprocals, denormals-as-zero, FMA contraction) is fine
  for ML, *risky* for power-flow convergence — do not add it to 03 without
  checking the tolerance.

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_kernel_hierarchy.svg' | relative_url }}" alt="Kernel launch hierarchy: a grid of blocks, a zoomed block of thread dots with one warp bracketed, and a single thread" width="760">
  <figcaption>How a kernel launch maps onto the hardware. A launch is a grid of blocks; each block runs on exactly one SM (which is why blocks can use shared memory); and the hardware schedules a block's threads in warps of 32 that execute in lockstep.</figcaption>
</figure>

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_coalesced_access.svg' | relative_url }}" alt="Coalesced versus strided memory access: consecutive thread reads merge into one transaction, strided reads cause 32 transactions" width="760">
  <figcaption>Why index order matters. A warp's 32 memory requests arrive together, and the memory unit merges requests to consecutive addresses into one transaction. Stride by 4 and the same 32 reads cost 32 separate transactions — up to 10x the memory work.</figcaption>
</figure>

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_latency_hiding.svg' | relative_url }}" alt="Three warp timelines: while warp A waits for HBM, the scheduler runs warps B and C" width="760">
  <figcaption>Latency hiding, frame by frame. While warp A stalls on HBM, the scheduler runs warps B and C on the same SM. The stall is not removed — it is covered. If too few warps are resident, the bubbles become visible: "not enough parallelism".</figcaption>
</figure>

*(glossary: SM, warp, thread block, shared memory, global memory, HBM,
coalesced access, launch overhead, roofline, bandwidth-bound, latency-bound,
double precision, CUDA, nvcc)*

---

## 3. The software stack (what you will actually touch)

<figure class="rdiagram">
  <img src="{{ '/assets/images/fig_software_stack.svg' | relative_url }}" alt="Four stacked software layers: problem (MATPOWER, PyPSA, PowerModels.jl, GridCal, PGLib-OPF data), modeling (PuLP/Pyomo, PowerModels, CasADi, AMPL), solver (HiGHS, Gurobi, CPLEX, IPOPT, MOSEK), and a navy HPC/GPU layer (CUDA, cuBLAS/cuSPARSE/cuSOLVER, PyTorch/JAX/CuPy, NVIDIA cuOpt) marked as where this package builds" width="760">
  <figcaption>The stack from problem data to raw kernels. Kernels 01–03 sit at the bottom; everything above them is "someone else's problem" for our purposes.</figcaption>
</figure>

Rules of thumb that save weeks:

1. **Never write a raw kernel for a standard operation.** `cuSPARSE` SpMV,
   `cuSOLVER` LU, `cuBLAS` dense ops are tuned for years. Write kernels for
   the *application-specific* update rules (like the power-flow sweep in
   `cuda_kernels/03_pf_gauss_seidel.cu`).
2. **Python + PyTorch/JAX is a legitimate GPU path** for research: auto-diff,
   ADMM loops, and "GPU arrays" come free. Raw CUDA is for when the inner
   loop is the bottleneck.
3. **Measure before you optimize.** `cudaEvent` timing (as in the kernels) +
   `nsight systems` profiling is 90% of GPU debugging.
4. **Multi-GPU** is a separate topic: NCCL for all-reduce (ADMM-style
   algorithms), or simply *data-parallel batching* (run 100 contingency cases
   across 4 GPUs — trivial, and what most grid workloads use).

---

## 4. Why grid problems fit a GPU (the honest version)

Four distinct parallelism flavors, in order of maturity in the literature:

1. **Inside the linear algebra (SpMV/sweeps).** Every Newton/GS/IPM iteration
   contains sparse matrix-vector products over $10^5$–$10^7$ non-zeros. One
   thread per row, coalesced reads → memory-bandwidth-bound, predictable
   speedups of $\sim 10$–$100\times$ *for that piece*. This is what
   `02_spmv.cu` demonstrates.
   **Catch:** the sparse *factorization* (LU) — where most Newton time goes —
   is irregular and fill-in-heavy; GPU sparse LU exists (cuSPARSE) but is
   finicky. Many papers honestly split the solver: factorize once on CPU (or
   batched GPU LU), sweep on GPU.
2. **Across scenarios / contingencies.** N-1 cases, Monte-Carlo probabilistic
   studies, stochastic UC scenarios: each case is an *independent small
   problem*. Batch them into one kernel launch (batched LU / batched fast-
   decoupled flows) → near-linear scaling in number of cases. This is the
   most reliable speedup in the literature and the easiest to explain.
3. **Across the KKT/IPM system.** Interior-point OPF solves one big sparse
   (often banded or 4×4-block-structured) linear system per iteration;
   exploiting its structure (condensed space, Schur complements) on GPU is
   active 2024–2026 research (see 03, Subtopic B — EPSR 2024, TPWRS 2026).
4. **Across the branch-and-bound tree (UC).** The frontier: parallel node
   selection, warm-starting LP relaxations on GPU. Hard, immature, but where
   the big "market-clearing in seconds" claims live (03, Subtopic C).

**When a GPU does NOT help** *(say this in an interview and you pass)*:
problems below $\sim 10^3$ buses (launch overhead dominates — see kernel 03),
purely serial heuristics, or any pipeline where Amdahl's serial fraction is
large. "GPU-accelerated" with a 1.3× speedup on IEEE 14-bus is a red flag,
not a result.


---

## 5. The three kernels, walked through (measured on this box: A100-SXM4-40GB, CUDA 12.8, 2026-07-06)

Run everything with:
```bash
cd ~/Readings/cuda_kernels && ./build_and_run.sh
```
(or `cuda_kernels/run_kernels.ipynb`). Override the arch with `ARCH=sm_90 ./build_and_run.sh` on newer hardware.

### 5.1 `01_dot_product.cu` — the memory-bandwidth baseline

*(full walkthrough + measured numbers: see the results table at the end of
this section; the kernel itself is 43 lines — read it top to bottom)*

The kernel is the canonical **grid-stride** pattern:

```cuda
__global__ void dot_kernel(const double* x, const double* y, long n,
                           double* out) {
  long i  = (long)blockIdx.x * blockDim.x + threadIdx.x;   // global index
  long st = (long)gridDim.x * blockDim.x;                  // stride
  double s = 0.0;
  for (; i < n; i += st) s += x[i] * y[i];   // strided walk
  out[blockIdx.x] = s;                        // one partial sum per block
}
```

Why it matters: this *is* the inner loop of every power-flow sweep, just
with a gather. Teach yourself to read it in this order: (1) where does a
thread get its index, (2) what does one thread do, (3) how does the block
combine its 256 partial sums (shared-memory tree — see below), (4) who
combines the 2048 block partials (here: the host; in production: a second
kernel or `thrust::reduce`).

Three real bugs this file's PASS/FAIL check caught on this machine — the
first one is the most instructive:

1. **The missing block reduction (data race), then the half-done tree.**
   The naive kernel ends with `out[blockIdx.x] = s;` — executed by *all 256
   threads of the block* to the *same address*. Last write wins; only
   $\sim 1/256$ of the true sum survives (measured symptom: ratio
   **0.00389 $\approx 1/256$** at every size). The first fix added a
   shared-memory tree —
   which we started at `stride = 16` (a 32-thread habit) instead of
   `blockDim.x/2 = 128`; with 256-thread blocks that silently sums only
   the first 32 threads (measured symptom: ratio exactly **1/8**). The
   final version starts at `blockDim.x / 2`. *Lesson: whenever you see
   `out[blockIdx.x] = ...`, ask "which thread is allowed to write?" — and
   whenever you write a tree, ask "does it cover all threads?"*
2. **Compiler-eliminated benchmarking.** Timing `cpu_dot(...)` with an
   *unused* result lets `-O3` delete the loop entirely (it is a pure
   function). The first run on this box printed `CPU: 0.000 ms` — the loop
   had vanished. **Rule: always make the result of a timed region
   observable.** The file now stores `cpu_check` and verifies it.
3. **Verify against a reference, every time.** The GPU result is compared to
   a CPU reference with a hard PASS/FAIL; a GPU kernel that "runs" but sums
   the wrong elements is worse than none.

### 5.2 `02_spmv.cu` — the power-flow workhorse

The kernel (one thread per row of a CSR matrix):

```cuda
__global__ void spmv_csr(const int* row_ptr, const int* col_idx,
                         const double* val, const double* x, double* y,
                         int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  double s = 0.0;
  for (int k = row_ptr[i]; k < row_ptr[i + 1]; ++k)
    s += val[k] * x[col_idx[k]];
  y[i] = s;
}
```

The test matrix is *grid-like*: each row connects to 9 neighbours on each
side (19 non-zeros/row) plus a dominant diagonal — the same texture as a
Ybus or Newton Jacobian. Measured results (2026-07-06, this box):

| N (rows) | nnz | CPU (ms) | GPU (ms) | speedup | GPU effective BW | verify |
|---|---|---|---|---|---|---|
| 100,000 | 1.90 M | 1.69 | 0.027 | **62×** | 1.18 TB/s | PASS (max rel diff 0) |
| 1,000,000 | 19.0 M | 30.0 | 0.42 | **72×** | 0.76 TB/s | PASS (max rel diff 0) |

How to read this:

- **Speedup grows with size** (62× → 72×): small problems are launch-overhead
  and transfer-bound; big problems get deep into the bandwidth regime.
- **GPU effective bandwidth 0.76–1.18 TB/s** on an A100 (HBM peak ~1.5–2
  TB/s) is a healthy ~50–75% — the kernel is doing its job; further gains
  would come from mixed precision or better access patterns, not from more
  threads.
- **CPU is ~10–20 GB/s**: one core, streaming 190 MB — that is the honest
  single-thread baseline. (A tuned multithreaded CPU SpMV would do better;
  the *ratio* you should report in a paper is against your actual baseline.)
- **Why double precision:** power-flow convergence tolerances (~1e-10) need
  64-bit arithmetic; float would accumulate ~1e-7 errors per sweep and
  destroy Newton's quadratic convergence. A100s run double at full rate
  (unlike consumer GPUs) — one reason data-center GPUs dominate this field.

### 5.3 `03_pf_gauss_seidel.cu` — a real (5-bus) AC power flow, and why
    the physics check matters more than the convergence check

The program solves the same 5-bus system twice and compares:

- **CPU**: textbook Gauss–Seidel (sequential, in-place, freshest updates).
- **GPU**: **Jacobi** sweep — every bus updates from the *previous*
  iteration's voltages, so there is no data dependency and one thread per
  bus is enough. (This is why early GPU power-flow papers used Jacobi.)

The update rule, derived from the power equation $S = V \overline{I}$ with
$I = Y_{\text{bus}} V$:

$$V_{\text{new}} = \frac{1}{Y_{ii}} \left( \frac{\overline{S}}{\overline{V_{\text{old}}}} - \sum_{j \ne i} Y_{ij} V_j \right)$$

Note the details that matter: it is `conj(S)/conj(V_old)` — S divided by
the **conjugate** of the old voltage. The PV bus (bus 3) gets its magnitude
re-imposed after each update, and its Q is re-estimated as
`Im(V·conj(I))` (Jacobi-consistent: from old values).

Final measured run (2026-09-04, this box):

```
CPU GS    :     49 sweeps, total 0.005 ms  (0.0001 ms/sweep) converged
GPU Jacobi:    150 sweeps, total 26.1 ms   (0.174 ms/sweep)  converged
Max |dV| between GPU and CPU solutions: 2.1e-11 -> PASS
bus 1: 1.00000 + 0.00000   (swing)      bus 3: 1.01998 − 0.00673 (PV)
bus 2: 1.01012 − 0.00586   (load)       bus 4: 1.01054 − 0.01037 (load)
bus 5: 1.01547 − 0.00925   (load)
Swing bus 1: P = 0.1585 pu, Q = 1.2118 pu
Total load 0.4500 pu, PV gen 0.3000 pu, losses 0.0085 pu
Power balance residual (should be ~0): -1.0e-9
```

Reading it:

- **GPU Jacobi takes $\sim 3\times$ more sweeps** (150 vs 49) — expected:
  Jacobi uses stale values; GS's in-place updates converge faster.
- **GPU time is dominated by per-iteration host sync** (4 small memcpys +
  sync, ~0.17 ms each), *not* by the kernel (5 buses $\approx$ launch
  overhead).
  This is the honest picture of the "launch-overhead regime" — a 100k-bus
  system would look like 02 (bandwidth-bound, fast).
- **The power-balance residual ($-10^{-9}$) is the real correctness
  test.** Convergence ($\Delta V < \mathrm{tol}$) alone proved nothing, as
  our debugging showed.

**The debugging saga (kept because it teaches more than any tutorial page):
four bugs, all caught by self-verification:**

| # | Bug | Symptom | Catch |
|---|-----|---------|-------|
| 1 | GS update written as $\left(S/V_{\text{old}} - B\right)/Y_{ii}$ instead of $\left(\overline{S}/\overline{V_{\text{old}}} - B\right)/Y_{ii}$ — solves the **conjugate** power equation | converges happily; $P$ at the PV bus $\ne$ spec | power-balance residual |
| 2 | PV-bus $Q$ estimate computed as $V_{re} I_{im} + V_{im} I_{re}$ instead of $\operatorname{Im}(V \overline{I}) = V_{im} I_{re} - V_{re} I_{im}$ | small residual ($1.8 \times 10^{-2}$), PV bus $P$ off by $\sim 0.02$ | power-balance residual |
| 3 | "Fixing" #1 the wrong way (to $S/V_{\text{old}}$) — the conjugate problem again, plus the PV bus no longer at spec | residual 0.63 | hand check of actual bus powers |
| 4 | (in 01) reduction bugs — see 5.1 | ratios 1/256, 1/8 | PASS/FAIL + a debug program printing the ratio |

Takeaways for your own GPU solver work: (i) **derive your fixed point and
check which equation it satisfies** — conjugate conventions are the #1
silent bug in power-flow code; (ii) verify with a **physics invariant**
(Tellegen: $\sum P_{\text{injections}} = P_{\text{losses}}$) in addition
to "solver converged" and "GPU == CPU"; (iii) when GPU $\ne$ CPU or
residual $\ne$ 0, print a **ratio** and a **per-block/per-bus breakdown**
— "1/256" and "1/8" pointed straight at the thread-count bugs in minutes.

### 5.4 Results summary (final, all three kernels, 2026-09-04)

| Kernel | Workload | CPU | GPU (A100) | Speedup | Verify |
|---|---|---|---|---|---|
| 01 dot | N = 1e8 doubles | ~110–265 ms (single core, varies with load) | ~1.3–2.2 ms | ~85–190× | PASS |
| 02 SpMV | N = 1e5, nnz 1.9 M | ~1.4–1.7 ms | ~0.02 ms | ~60–75× | PASS |
| 02 SpMV | N = 1e6, nnz 19 M | ~15–30 ms | ~0.4–0.9 ms | ~30–72× | PASS |
| 03 PF | 5-bus, to tol 1e-11 | 49 GS sweeps, <0.01 ms | 150 Jacobi sweeps, ~26 ms (sync-bound) | (launch-overhead regime) | PASS + balance 1e-9 |

Numbers vary run-to-run on a shared machine (CPU timing especially); the
*ratios and the PASS/FAIL columns* are the stable facts. Re-run with
`./build_and_run.sh` (or `run_kernels.ipynb`).

---

## 6. Where to go next (your first three GPU projects)

1. **Batch it (1 day).** Modify `02_spmv.cu` so it solves *M independent
   10k-row problems* in one launch (3D grid: x = row, z = problem). This is
   exactly how N-1 contingency studies and multi-feeder DERMS dispatch get
   parallelized. Report speedup vs M = 1.
2. **Newton on the GPU (1 week).** Replace the Jacobi sweep in 03 with
   Newton–Raphson: factor the 5×5 (then 50×50) Jacobian on the CPU
   (cuSOLVER or even dense `double` math is fine at this size), do the
   residual/update SpMV on the GPU. You have just built the skeleton of a
   GPU power-flow solver — the structure of every paper in Subtopic A.
3. **The honest benchmark (ongoing).** Time your solver at 5 / 50 / 500 /
   5000 buses (generate networks with a simple radial/looped model), plot
   total wall time CPU vs GPU, and note where the curves cross. That
   crossing point is a publishable-quality sentence about *when* GPUs help.

Then read `03_gpu_grid_optimization_review.md` with all of the above in
your hands — you will recognize every claim in it.