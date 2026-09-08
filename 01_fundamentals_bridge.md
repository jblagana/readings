---
layout: default
title: "01 — Fundamentals Bridge"
nav_order: 1
data_quiz: "Fundamentals"
---

# 01 — Fundamentals Bridge: from Circuits to GPU-based Grid Optimization

**Goal of this document:** make you able to read any paper in
`03_gpu_grid_optimization_review.md` without getting lost. We assume you know
circuit theory (Ohm/Kirchhoff, AC steady state, basic power). Everything else
is rebuilt from that foundation, always in two registers:

1. **Formal** — the definition as it appears in papers.
2. **Plain** — what it actually means, with a comparison to something familiar.

Glossary terms carry a dotted underline and a small ¹ — hover one (or
focus it with the keyboard) to see its definition. Every term is defined
formally and in plain language in `04_glossary.md`.

---

## 1. The big picture: what "grid optimization" actually is

Formal: *Electricity grid optimization* is the family of problems in which a
system operator or planner chooses the **setpoints of controllable devices**
(generation output, transformer taps, storage charge/discharge, curtailment,
future assets) so as to **optimize an objective** (cost, losses, risk,
emissions) **subject to physical and regulatory constraints** (power balance,
line limits, voltage bands, reserve requirements).

Plain: the power grid is simultaneously (a) a giant **real-time auction** —
every generator bids, every load buys — and (b) a giant **physics puzzle** —
power must obey Kirchhoff's laws at every millisecond. Grid optimization is
solving both at once: *find the cheapest (or safest) traffic pattern such that
no road overflows and every car keeps moving.*

Three nested problems (this package keeps them straight):

| Layer | Question | Timescale | Core model |
|---|---|---|---|
| **Dispatch / operation** | Where does power flow *now / next hour*? | seconds–hours | Power flow + OPF (Sec. 3, 5) |
| **Security** | Does it still work if one line/generator fails? | seconds–hours | N-1 constraints (Sec. 6) |
| **Planning** | What should we *build* over the next 5–30 years? | years | Investment models (Sec. 8) |

**Why "large-scale"?** A national transmission network has 10⁴–10⁵ buses and
10⁵–10⁶ branch constraints; a realistic SCOPF multiplies that by hundreds to
thousands of contingency scenarios; a planning study multiplies by years ×
scenarios; a DERMS can coordinate 10³–10⁶ distributed devices. The
*computational* question of the PhD era is: **can a GPU (or GPU cluster) solve
these fast enough for the timescale at which they matter?** That is the entire
field you are entering.

---

## 2. The physics layer: re-connecting what you already know

### 2.1 Complex power

Formal: for voltage phasor V = |V|∠θ and current phasor I = |I|∠φ, complex
power is S = V I* = P + jQ (W), with P = |V||I| cos(θ−φ) the **active power**
and Q = |V||I| sin(θ−φ) the **reactive power**. cos(θ−φ) is the **power
factor**.

Plain: P does the real work (light, motor, heat). Q sloshes back and forth,
maintaining the electric and magnetic fields the system needs — like pumping
pressure into a hose versus water that exits the nozzle. Grid voltage
magnitudes are *set by Q balance*: too little Q support and voltages sag.
This matters because every optimization below has both P and Q variables.

### 2.2 The per-unit (pu) system

Formal: all quantities normalized by bases: S_base (e.g., 100 MVA) and
V_base (nominal voltage at that bus), from which I_base, Z_base follow.

Plain: the grid spans 0.4 kV to 765 kV. In per-unit, transformers become
*identities* (V and S scale together), voltages sit near 1.0, and all matrices
are well-conditioned. **Every paper you will read works in pu.** Rule of
thumb: 1.0 pu = nominal; 0.95–1.05 pu = typical band. "|V| = 1.02" means 2%
above nominal.

### 2.3 Transmission lines and the Ybus

Formal: a line between buses i and j is a π-network: series impedance
z = r + jx, optional shunt admittances. With line admittance y = 1/z = g + jb,
the **bus admittance matrix** Ybus adds y to the diagonal (Y_ii) and −y to the
off-diagonals (Y_ij = Y_ji).

Plain: each bus "talks" only to the buses it is physically connected to —
typically 2–10 neighbours out of thousands. So Ybus is a **sparse** matrix:
mostly zeros. *Sparsity is the seed of everything GPU-related in this field*:
sparse matrices can be stored compactly (CSR format) and multiplied by vectors
in fully parallel, memory-bandwidth-bound kernels (see
`02_gpu_basics_and_kernels.md` and `cuda_kernels/02_spmv.cu`).


---

## 3. Power flow: the workhorse "given the grid, what happens?"

Formal: the **power flow (load flow)** problem: given the network (Ybus), the
loads S_i, and generator settings, solve the nonlinear equations
S_i = V_i (Σ_j Y_ij V_j) for the unknown bus voltages V. Bus types:
**swing** (V and angle fixed — the reference), **PV** (P and |V| controlled),
**PQ** (P and Q specified, V unknown).

Plain: "If everyone injects/loads what they inject/load, where do all the
voltages and flows end up?" The traffic-network analogue: given the demands,
what are the speeds and densities on every road? No closed form exists; we
iterate.

Two classic iterative solvers (both appear in the GPU literature):

- **Newton–Raphson** *(glossary: Newton method)*: linearize at the current
  estimate → solve a *sparse* linear system J·ΔV = −F (J = Jacobian) →
  update. Quadratic convergence (4–8 iterations even for huge systems), but
  each step needs a sparse matrix *factorization* — the hardest part to
  parallelize because of **fill-in** *(glossary)*.
- **Gauss–Seidel / Jacobi** *(glossary)*: a simpler row-wise update that reuses
  only current values; linear (slower) convergence, but the Jacobi form is
  *embarrassingly parallel* — one thread per bus. That is exactly why
  `cuda_kernels/03_pf_gauss_seidel.cu` exists, and why the earliest GPU power
  flow papers used it.

**DC vs AC:** the **DC power flow** *(glossary)* is a linearization (drop Q,
assume |V| = 1, small angle differences). It becomes a *linear* system, which
is why **DC-OPF** is the workhorse of market clearing — and why
"GPU-accelerated DC-OPF" is an active subtopic (03, Subtopic B).

**Why scale is hard.** State dimension is O(N) for N buses, but the real cost
is (i) the sparse factorization whose fill-in can grow like O(N^{1.5}–N²) in
meshed networks, and (ii) **N-1 contingency analysis** *(glossary)*, which
multiplies the whole thing by hundreds to thousands of cases. These two facts
— *sparse, iterative, replicated across many scenarios* — are precisely the
structure a GPU likes.


---

## 4. State estimation and security analysis (short, but you will meet them)

Formal: **state estimation** *(glossary)* fuses meter measurements (redundant,
noisy) into the best estimate of the system state (bus voltages), typically by
**weighted least squares** (WLS). **Security analysis** checks whether each
**N-1 contingency** (one line or generator lost) keeps all constraints
satisfied.

Plain: the grid has ~10⁵–10⁶ meters but ~10⁴–10⁵ unknown voltages; state
estimation is "triangulation with error bars". Security analysis is "crash
testing": remove every line, one at a time, and check nothing overloads.
*GPU angle:* N-1 is thousands of independent small solves — the single most
"embarrassingly parallel" problem in the field (see `cuda_kernels/02_spmv.cu`
for why each of those small solves is a SpMV story).

*(glossary: state estimation, WLS, N-1 contingency, security analysis)*

---

## 5. Optimal power flow: where optimization meets physics

Formal: **OPF** *(glossary)*:
minimize  f(x)  (e.g., generation cost or losses)
subject to  S_i(V) = injection setpoints,
            line flow limits,  voltage limits,  generator limits,
            x = (P, Q setpoints, transformer taps, …)

**AC-OPF is non-convex** (the S = VI* equations are bilinear in the variables).
That is *the* central fact of the whole subfield:

- **DC-OPF** *(glossary)*: linearize the physics → an **LP** *(glossary)*.
  Fast, globally optimal, but blind to voltage/reactive reality. Used for
  market clearing.
- **AC-OPF**: the real problem. Standard workarounds: **convex relaxations**
  (second-order cone, SDP — sometimes tight, sometimes not), penalty/phase-
  shift heuristics, and simply running a general-purpose NLP solver and
  hoping (which is what most industrial practice does).

Solver families you will see in every paper *(glossary: all of these)*:

| Family | Solves | Example tools | Notes |
|---|---|---|---|
| **LP / simplex, interior point** | DC-OPF, linear dispatch | HiGHS, GLPK, Gurobi | IPM is the parallelizable one |
| **NLP: SQP, interior-point** | AC-OPF | IPOPT, Gurobi/NLP, CasADi | solves a sequence of KKT linear systems |
| **MILP / branch-and-bound** | UC, discrete choices | Gurobi, CPLEX, HiGHS | the slow one; see Section 6 |
| **Decomposition: ADMM, Benders, Aitken** | big problems → pieces | hand-rolled + solvers | ADMM is GPU-friendly (see 03) |

One-paragraph **interior point** *(glossary)*: instead of jumping to the
boundary (simplex walks vertices), it drives the iterates through the *inside*
of the feasible region while a "barrier" keeps constraints satisfied; each
iteration solves one (sparse) KKT linear system. Because iterations are
independent except for the solve, and because the linear systems are sparse,
IPM maps naturally to hardware — which is why "GPU + interior point + OPF"
is a recurring combination in `03`.

Plain: OPF is "the auction with physics": pick the prices/outputs that clear
the market *and* keep every wire under its limit. DC-OPF is the accountant's
version (linear, fast, a bit blind); AC-OPF is the engineer's version (hard,
but real).


---

## 6. Unit commitment and market clearing: the biggest operational problem

Formal: **unit commitment (UC)** *(glossary)* decides, hour by hour (and
faster, with rolling windows), *which generators are ON* (binary variables)
and at what output (continuous), over a horizon of 24–168 h, respecting
ramp limits, minimum up/down times, and start-up costs, minimizing total cost.
**SCUC** *(glossary: security-constrained UC)* adds N-1 feasibility of the
resulting dispatch. **SCED** *(glossary: security-constrained economic
dispatch)* is the continuous relaxation solved every 5 minutes (or faster) to
set real-time prices (LMPs).

Plain: committing a coal plant for 8 hours is like booking a hotel room —
you pay whether you use it or not (no-load + start-up costs), and it takes
time to arrive (ramps). The UC problem is a **MILP** *(glossary)*: thousands
of binary on/off variables × 96–672 time steps × ramp/network constraints.
This is the single largest optimization a grid operator runs — and MILP is
exactly the part that parallelizes *worst* (branch-and-bound is inherently
tree-searching). Hence the literature's split: (a) parallelize the *inner*
LPs/OPFs on GPU, (b) parallelize *scenarios* of stochastic UC, (c) attack the
branch-and-bound tree itself (the newest, hardest work — see 03, Subtopic C).

*(glossary: unit commitment, SCUC, SCED, MILP, branch-and-bound, LMP, ramp
limits, start-up cost, rolling horizon)*

---

## 7. DERMS: the control layer for distributed energy resources

Formal: a **Distributed Energy Resource (DER)** *(glossary)* is any
generation/storage/load asset at the *distribution* level (rooftop PV,
battery, EV charger, heat pump, demand response). A **DERMS** *(glossary:
Distributed Energy Resource Management System)* is the software layer that
**forecasts, plans, dispatches, and in real time controls** a portfolio of
DERs so as to meet an objective (cost, voltage, peak shaving, ancillary
services) while respecting interconnection and grid-code constraints. The
governing standards are **IEEE 2030.5** (DER interconnection & communication
protocol), **IEEE 2020** (DER-CMS framework), and **OpenADR** *(glossary:
OpenADR, demand response)* (demand-response signaling).

Plain: think of a DERMS as "the thermostat + accountant + traffic cop for a
city's millions of batteries, chargers and solar roofs". It sits *below* the
transmission operator and *above* individual inverters. The timescale ladder
*(glossary: timescales)* is the mental model:

| Timescale | DECISION | Typical math |
|---|---|---|
| **Strategic / planning** (years) | which DERs to build, sizing | investment LP/MILP (Sec. 8) |
| **Daily** (24 h ahead) | storage charging plan, DR programs | MILP / stochastic programming |
| **Intraday** (1–60 min) | re-dispatch, re-planning | OPF / MPC |
| **Real-time** (sub-second–1 s) | inverter setpoints, voltage support | fast OPF, droop control, ADMM |

**Why compute matters here.** A large DERMS coordinates 10³–10⁶ devices at
seconds-scale cadence; distribution networks are *radial and numerous*
(hundreds of feeders, each a small OPF — embarrassingly parallel across
feeders, see `cuda_kernels/02_spmv.cu`); and the real-time tier needs
*re-optimization in under a second*, which is exactly the gap GPU acceleration
is being pushed into (03, Subtopic D). The distribution-level power-flow
model used is **DistFlow** *(glossary)*, a squared-voltage formulation that
turns radial OPF into (almost) convex math.


---

## 8. Energy system planning: the slow, big loop

Formal: **energy-system planning** decides *what to build and when*: the
**net present cost (NPC)** *(glossary)* objective discounts years of
operating + fuel + maintenance + emission costs plus **capex** *(glossary:
capital expenditure)* of new assets, minimized over binary/continuous
investment variables subject to multi-period capacity, energy-balance, and
network constraints. **Transmission expansion planning (TEP)** *(glossary)*
is the network-specific version (which lines to add, where, with what
conductor). Uncertainty enters via **scenario trees / stochastic
programming** *(glossary: stochastic programming)* or **robust
optimization** *(glossary)* (worst-case over an uncertainty set).

Plain: "Which wind farm, which battery, which new line — over 20 years —
gives the cheapest *promise* of reliable power?" Planning is *large-scale*
for a different reason than operations: the combinatorics of *years ×
seasons × scenarios × candidate assets*. A study might be 20 years × 8760
hours × 100 wind scenarios × 10⁴ candidate sites. The optimization structure
is LP/MILP/MINLP again — but the models are enormous, so the HPC angle here
is usually: parallelize the scenario tree, use decomposition (Benders for
invest-vs-operate), or speed up the inner OPFs (where GPUs re-enter).

**GPU + planning today:** thin but real — mostly GPU-accelerated *inner
power flows* inside TEP loops and GPU Monte-Carlo for uncertainty. Dedicated
"GPU TEP solver" work is rare — a gap (see 03, Subtopic E, and
`06_phd_roadmap.md` Direction 4).

*(glossary: NPC, capex, TEP, scenario, stochastic programming, robust
optimization, Benders decomposition, multi-period model, levelized cost)*

---

## 9. The optimization toolbox: what you will see in every paper

Each entry: formal in one line, plain in one line, GPU relevance.

- **LP / QP** *(glossary)* — linear (quadratic) objective + linear
  constraints; polyhedral feasible set. *Plain:* linear cost, linear rules;
  always solvable to global optimality. *GPU:* interior-point LPs parallelize
  well (big sparse KKT system per iteration); batched LPs across scenarios.
- **NLP / MNLP** *(glossary)* — nonlinear objective/constraints. AC-OPF
  lives here. *GPU:* same KKT story; the nonlinear *function* evaluations
  (power-flow-like) are vectorizable.
- **MILP / MINLP** *(glossary)* — some variables integer/binary. UC and
  planning live here. *GPU:* the frontier (Subtopic C); branch-and-bound
  trees + warm-started LPs.
- **Convexity** *(glossary)* — if the feasible set and objective are convex,
  *every* local minimum is global; duality gap = 0. *Plain:* the bowl-shaped
  problems. Everything else is a landscape with fake valleys. **This property
  decides which tools you trust.**
- **Duality / KKT conditions** *(glossary)* — every constrained optimum
  satisfies stationarity + primal/dual feasibility + complementary slackness;
  the *dual variables* are the prices (LMPs are duals of the power-balance
  constraints — this is not a coincidence). *GPU:* KKT systems are the linear
  systems that get solved on the GPU in IPM.
- **Interior point method (IPM)** *(glossary)* — barrier-function path to the
  optimum; per iteration: factor one sparse KKT system. *GPU:* see Subtopic B.
- **Branch-and-bound / cutting planes** *(glossary)* — MILP engines:
  recurse on binaries, cut off fractional solutions, solve LP relaxations.
  *GPU:* parallel nodes + GPU LP relaxations (Subtopic C).
- **ADMM** *(glossary: Alternating Direction Method of Multipliers)* — split
  a problem into pieces, alternate local solves + a consensus step with
  multipliers. *Plain:* "neighbors solve their own little problems and
  trade prices until they agree." *GPU:* the local solves batch beautifully
  on GPU; ADMM is the workhorse of *distributed* DERMS (each feeder/inverter
  a subproblem).
- **Benders decomposition** *(glossary)* — split invest (master) from
  operate (subproblems); subproblems send "cuts" back. *GPU:* parallel
  subproblems; GPU inner OPFs.
- **Warm start** *(glossary)* — use the previous solution as the initial
  guess (or factorization) for the next solve. *Why it matters for GPUs:*
  the expensive part is often the *first* solve; a warm start + cached factor
  is what makes *real-time* re-optimization feasible.

*(glossary: LP, QP, NLP, MILP, MINLP, convexity, duality, KKT conditions,
IPM, branch-and-bound, cutting plane, ADMM, Benders, warm start, LMP)*

---

## 10. Where the GPU comes in: the map

| Problem | Parallelism flavor | Typical speedups reported (see 03) |
|---|---|---|
| Power flow (Newton/GS) | SpMV/sweeps + batched scenarios | 2–50× per sweep; 100s–1000s× batched |
| State estimation | batched WLS / criticality | 5–100× |
| DC-OPF (market clearing) | IPM KKT + multi-start | 5–100× (2024–2026 papers) |
| AC-OPF / SCOPF | IPM + N-1 batching | 2–30× (case-dependent) |
| UC / SCUC | scenario parallel + GPU LP relaxations | 5–1000× on the *relaxation* step |
| DERMS dispatch | per-feeder OPF batching + ADMM | emerging (2023–2026) |
| Planning / TEP | scenario trees + inner OPFs | emerging |

Next: **`02_gpu_basics_and_kernels.md`** turns each row into hardware.
Then **`03`** reads the papers with the map above.

*(glossary: everything above — `04_glossary.md` is the index)*