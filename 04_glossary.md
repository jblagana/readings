---
layout: default
title: "04 — Glossary"
nav_order: 4
data_quiz: "Glossary"
no_tooltips: true
---

# 04 — Glossary: formal + plain language, two registers for every term

Convention: **bold** = the term. *Formal:* the definition you will meet in
papers. *Plain:* the 5-second version. Categories: **A** grid physics &
models, **B** optimization, **C** grid operations & DERMS, **D** planning,
**E** GPU/HPC.

---

## A. Grid physics & models

**bus** — *Formal:* a node of the network model where elements (lines,
transformers, generators, loads) connect; the basic unknown of power-flow
calculations (its voltage phasor). *Plain:* a junction in the "power
plumbing"; every calculation is really about the voltages at these junctions.

**swing (slack) / PV / PQ bus** — *Formal:* the three bus types: swing fixes
|V| and angle (absorbs balance error); PV controls P and |V| (Q is free); PQ
specifies P and Q (|V| is unknown). *Plain:* the reference bus is the grid's
"anchor"; a PV bus is a generator holding its voltage (plant with an AVR);
a PQ bus is a load you can't control. Every grid has exactly one swing bus.

**Ybus (bus admittance matrix)** — *Formal:* the $N \times N$ sparse matrix
relating bus currents to bus voltages, $I = Y_{bus} V$, assembled from line
admittances.
*Plain:* the grid's "connectivity + conductance" table; mostly zeros because
each bus only touches a handful of neighbours. Everything in power-flow math
is built from it.

**sparsity** — *Formal:* a matrix with a tiny fraction of non-zeros, stored
in compressed formats (CSR, CSC, COO). *Plain:* a matrix that is 99.9% empty
— you store only the ~0.1% that matters, and the whole GPU story is about
exploiting that structure.

**CSR (compressed sparse row)** — *Formal:* storage: `row_ptr[N+1]` (where
each row starts), `col_idx[nnz]`, `val[nnz]`. *Plain:* the "grocery list"
format for sparse matrices: for row i, read entries from position
`row_ptr[i]` to `row_ptr[i+1]` — contiguous in memory, fast for the GPU.

**complex power (S = P + jQ), power factor** — *Formal:* $S = V I^*$, $P$
the real (work-doing) part, $Q$ the reactive (field-sustaining) part; power
factor = $P/|S| = \cos\varphi$, the cosine of the angle between $V$ and $I$.
*Plain:* P is the water out of the
nozzle; Q is the pressure in the hose. Grid voltage is set by Q balance;
low power factor means you're paying for pressure, not water.

**per-unit (pu)** — *Formal:* normalization of all quantities by system bases
($S_{base}$, $V_{base}$) so values are dimensionless and $O(1)$. *Plain:*
"voltage = 1.0" means "nominal" whether it's 11 kV or 765 kV; makes all
matrices friendly and all papers comparable.

**transmission line (π model)** — *Formal:* a line represented by series
impedance $z = r + jx$ and (optional) shunt admittances at each end. *Plain:*
the wire has resistance (r, real losses/heat) and inductance (x, the
angle/voltage dance); capacitive charging is optional for short lines.

**AC power flow (Newton–Raphson)** — *Formal:* solve
$S_i = V_i \cdot (Y_{\text{bus}} V)_i$ for $V$ via successive
linearization: $J \Delta V = -F$, $J$ the Jacobian. *Plain:*
guess the voltages, compute the error, take a Newton step, repeat 4–8 times.
The "gold standard" answer every other method is judged against.

**Jacobian** — *Formal:* matrix of partial derivatives of the power-flow
equations w.r.t. voltage variables; sparse, factored each NR iteration.
*Plain:* the "sensitivity table" — how much each voltage should move to fix
each error. Its sparse block structure is what solvers exploit.

**fill-in** — *Formal:* new non-zeros appearing during sparse factorization
(LU) beyond the original pattern. *Plain:* solving a sparse system "spreads"
zeros into non-zeros in the intermediate math — the hidden cost that makes
big power-flow solves expensive and hard to parallelize.

**Gauss–Seidel / Jacobi** — *Formal:* iterative power-flow solvers that
update bus voltages one row at a time without forming or factoring a
Jacobian; Gauss–Seidel uses the freshest values within a sweep, Jacobi
uses only the previous sweep's values. *Plain:* instead of solving all the
equations at once (Newton–Raphson), each bus repeatedly "averages its
neighbours" until the voltages settle. Slower to converge, but one sweep is
embarrassingly parallel — exactly the shape the first GPU power-flow
kernels exploited.

**DC power flow** — *Formal:* linearization of AC power flow: $|V| \equiv 1$,
small angles, $Q$ and losses dropped; injections become the linear system
$B \theta = P$.

**N-1 contingency** — *Formal:* a single element (line, transformer,
generator) outage; the system must remain feasible (within limits) after
each one. *Plain:* crash-testing the grid one failure at a time; a 10,000-
line grid means ~10,000+ extra power flows — the #1 source of "embarrassingly
parallel" work on GPUs.

**state estimation (WLS)** — *Formal:* estimate bus voltages by minimizing
the weighted sum of squared measurement residuals,
$\hat{x} = \arg\min (z - h(x))^\top W (z - h(x))$. *Plain:* the grid has
more meters than
unknowns; this fuses the noisy readings into the best-guess "what is
actually happening right now" picture.

**weighted least squares (WLS)** — *Formal:* least-squares estimation in
which each residual is weighted by its precision (inverse variance);
linear closed form $\hat{x} = (H^\top W H)^{-1} H^\top W z$. *Plain:* fit
a line through noisy
points, but let the trustworthy (low-noise) readings count more — the
standard way to fuse many redundant meter measurements into one estimate.

**DistFlow** — *Formal:* branch-flow formulation of the (radial) distribution
power flow in squared-voltage variables; convex under mild conditions.
*Plain:* the distribution-level cousin of power flow, rewritten so solar and
batteries on the side-streets give (nearly) convex math — the workhorse of
distribution/DER optimization.

**radial / distribution network** — *Formal:* a network without meshed loops
(radial), operated at lower voltages, feeding end consumers. *Plain:* the
tree-shaped side-streets of the grid (vs. the meshed interstate highways of
transmission); DERs live here.

**microgrid** — *Formal:* a localized group of DERs + loads that can operate
grid-tied or islanded. *Plain:* a "power neighborhood" that can run on its
own when the big grid blips — a DERMS is exactly its brain.

**ancillary services** — *Formal:* products supporting reliable operation:
frequency regulation, voltage support, spinning reserve, black start.
*Plain:* the grid's "hazard pay": batteries get paid for standing ready to
react in seconds — a huge new market for DERs.

**timescales (strategic / daily / intraday / real-time)** — *Formal:* the
hierarchy of planning horizons (years → days → hours → minutes → seconds)
with correspondingly different decision variables and models. *Plain:* the
"when" axis of every grid problem; GPUs mostly attack the bottom (fast
re-optimization) and the middle (scenario storms); planning lives at the top.

---

## B. Optimization

**objective (function)** — *Formal:* the scalar $f(x)$ to minimize (or
maximize) over the decision variables $x$. *Plain:* "the score" — cost,
losses, risk, emissions; everything else in the model exists to keep the
score from being cheated.

**constraint** — *Formal:* an equation $g(x) = 0$ or inequality
$h(x) \le 0$ that admissible solutions must satisfy. *Plain:* the rules of the game; physics
(balance, limits) and regulation both show up as constraints.

**LP / QP** — *Formal:* linear (quadratic) objective + linear constraints.
*Plain:* linear cost, linear rules; always solvable to *global* optimality
in polynomial time — the "well-behaved" class.


**NLP / MNLP** — *Formal:* NLP — nonlinear programming: a (smooth, often
non-convex) objective subject to nonlinear equality/inequality constraints;
AC-OPF lives in this class. MNLP — mixed-integer nonlinear programming: an
NLP with some variables binary/integer (e.g. unit on/off states inside an
AC network model). *Plain:* "LP with curves" — the real-world class; much
harder than LP, and its solvers (interior point + branch-and-bound hybrids)
are exactly where GPU acceleration pays off.

**MILP / MINLP** — *Formal:* optimization with some variables restricted to
integer (binary) values (MILP: rest linear; MINLP: rest nonlinear).
*Plain:* "decide WHICH plants run" (0/1 choices) plus "how much". The
discretization is what makes these problems hard (NP-hard) and what
branch-and-bound attacks.

**convexity** — *Formal:* a set where line segments between any two points
stay inside; a function whose epigraph is convex. A convex optimization
problem has no duality gap and every local minimum is global. *Plain:*
"bowl-shaped" problems — any downhill path reaches the bottom. Non-convex
landscapes (AC-OPF!) have fake valleys; trust your answer only with
certificates (dual bounds, multiple starts).

**duality / KKT conditions** — *Formal:* the dual problem bounds the
primal's optimum; at an optimum (under mild conditions), primal variables,
dual variables (multipliers $\lambda$), and complementarity
($\lambda h = 0$) satisfy the KKT system. *Plain:* every constraint
carries a shadow price $\lambda$; at the optimum, "marginal cost =
marginal value" everywhere. In power markets the $\lambda$ of the
power-balance constraints **are** the LMPs.

**simplex / interior point (IPM)** — *Formal:* two classic LP solvers:
simplex walks vertices of the feasible polytope; IPM (barrier methods)
tracks a central path through the interior, solving a KKT linear system per
iteration. *Plain:* simplex is a hiker following the fence; IPM is a driver
staying in the middle of the road. IPM is more parallel-friendly (fewer,
bigger, structured solves) — the one GPUs exploit.

**branch-and-bound / cutting planes** — *Formal:* MILP engine: recursively
partition the solution space by fixing binaries (branch), bound subproblems
with LP relaxations, prune infeasible/unpromising nodes (bound); cutting
planes add valid inequalities to tighten relaxations. *Plain:* a game of
"20 questions" with pruning: split the on/off tree, keep only branches that
could beat the best known answer. The tree structure is where GPU parallelism
is being attacked today.

**ADMM (Alternating Direction Method of Multipliers)** — *Formal:* a
splitting algorithm: minimize $f(x) + g(z)$ s.t. $Ax = z$ by alternating
$x$-min, $z$-min, and a dual (multiplier) update; robust to non-convexity in
practice.
*Plain:* "neighbors each solve their own easy part, then trade prices until
they agree on the shared quantities." Converges slower than IPM but each
step is small, parallel, and restart-friendly — ideal for distributed DERMS
and GPU batching.

**Benders decomposition** — *Formal:* split a problem into a master (e.g.,
investment binaries) and subproblems (e.g., operations); subproblems send
optimality/feasibility "cuts" back to the master until no more improve it.
*Plain:* the planner and the operator keep arguing — the operator keeps
sending the planner "gotchas" (cuts) until the plan can't be beaten.
The parallel piece: all subproblems run at once (GPU-friendly).

**warm start** — *Formal:* initializing a solver with a previous solution
(and, for LP/IPM, its factorization/basis/iterates) so the next solve needs
fewer iterations. *Plain:* "I've solved yesterday's problem; today's is
almost the same — let me start from yesterday's answer." The single biggest
practical trick for real-time re-optimization on any hardware, GPU included.

**relaxation** — *Formal:* a simpler problem whose feasible set contains
the original's (e.g., drop integrality, drop non-convex terms); its optimum
bounds the original's. *Plain:* "solve an easier, slightly cheated version"
— the answer is a lower bound (min) you can trust, and the gap tells you how
hard the real problem is. DC-OPF is a relaxation of AC-OPF; LP relaxation of
UC is what branch-and-bound solves at every node.


---

## C. Grid operations & DERMS

**OPF (optimal power flow)** — *Formal:* choose generator setpoints (P, Q),
taps, etc. to minimize cost/losses subject to power-flow equations, line
limits, voltage limits. *Plain:* "the cheapest traffic pattern that keeps
every road under its weight limit" — the core daily optimization of any grid.

**DC-OPF / AC-OPF** — *Formal:* OPF with the (linear, lossless) DC power
flow vs. the full nonlinear AC model. *Plain:* the accountant's OPF (fast,
market standard, voltage-blind) vs. the engineer's OPF (hard, non-convex,
but real).

**SCOPF (security-constrained OPF)** — *Formal:* OPF plus N-1 (or N-k)
contingency constraints: the base-case dispatch must survive every single
outage within limits. *Plain:* OPF with "and it must still work if any one
wire breaks". Multiplies constraint count by ~100–1000 — the main driver of
"large-scale" in the operations literature, and a favorite GPU batching
target.

**security analysis** — *Formal:* the post-contingency check that after
each N-1 (in practice also N-2) outage every operational constraint — line
loading, bus voltages, frequency — remains within limits. *Plain:*
crash-test the grid: remove one line or one generator at a time and
verify nothing overloads; the core check behind N-1 operation and SCOPF.

**unit commitment (UC)** — *Formal:* multi-period MILP deciding generator
on/off states and levels, with start-up costs, ramp and min up/down
constraints, minimizing cost (optionally with network/contingency
constraints → SCUC). *Plain:* "which plants turn on this week, and when" —
the hotel-room booking problem for power plants; the largest MILP an
operator runs.

**SCUC / SCED** — *Formal:* security-constrained UC (the MILP, hourly/15-min
resolution) and security-constrained economic dispatch (the continuous
relaxation solved every interval to set real-time prices). *Plain:* SCUC =
the weekly schedule; SCED = the 5-minute re-tuning of the running plant
outputs, whose duals become the LMPs.

**rolling horizon** — *Formal:* re-solving the optimization at every time
step with a fixed-length window, committing only the first step (receding
horizon). *Plain:* "plan 24 h ahead every 5 minutes, but only promise the
next 5 minutes" — how uncertainty is tamed in real operation.

**ramp limits / start-up cost** — *Formal:* constraints on $|P_t - P_{t-1}|$
and fixed costs + time to bring a unit online. *Plain:* a plant can't jump
from 0 to full in a second (turbines spin up for an hour; batteries can
almost instant — which is exactly why storage changes UC).

**DER (distributed energy resource)** — *Formal:* a small-scale generation,
storage, or controllable-load asset at the distribution level (PV, battery,
EV, heat pump, DR). *Plain:* the "small stuff" — solar roofs, home
batteries, smart chargers. Billions of dollars of value, but each one is
tiny; the challenge is coordinating millions of them.

**DERMS** — *Formal:* the management system layer that aggregates DERs,
performs forecasting/planning/dispatch and real-time control, and
communicates with the utility and DER-CMS/ADMS per IEEE 2030.5 / IEEE 2020.
*Plain:* "the brain for a city's batteries, chargers and solar" — it owns
the portfolio and trades its aggregate flexibility with the grid.

**DER-CMS / ADMS** — *Formal:* the utility-side Distributed Energy Resource
Control & Management System (IEEE 2020) and Advanced Distribution
Management System; DERMS interconnects to them via OpenADR/2030.5.
*Plain:* the utility's control room for the distribution grid; your DERMS
is its "customer" (and partner) on the DER side.

**OpenADR / demand response (DR)** — *Formal:* an open protocol (NIST-backed)
for bidirectional demand-response signals between utilities and DERMS; DR is
the controlled shift/reduction of load. *Plain:* the "we'll pay you to not
use power at 6 pm" telephone line, standardized so any DERMS can talk to any
utility.

**IEEE 2030.5 / IEEE 2020** — *Formal:* 2030.5: standard for DER
interconnection and communication (the DER's "driver's license + SIM card");
IEEE 2020: framework/standard for DER-CMS functionality and interfaces.
*Plain:* the rules and plug-shapes that let DERs plug into the grid's
digital system without a bespoke integration project.

**feeder / voltage band** — *Formal:* a distribution circuit radiating from
a substation; the allowed voltage range (typically $0.95$–$1.05$ pu).
*Plain:*
a neighborhood's main power artery; if DERs push too much power in, voltages
rise and trip — the #1 DERMS control problem.


---

## D. Planning

**NPC (net present cost)** — *Formal:* the discounted sum of all operating,
fuel, maintenance, emission and investment costs over the planning horizon;
the standard planning objective. *Plain:* "the total price tag of the plan,
with interest" — comparing two plans means comparing two NPCs at the same
discount rate.

**capex / opex** — *Formal:* capital expenditure (one-time asset cost:
lines, plants, batteries) vs. operating expenditure (fuel, O&M, dispatch)
per period. *Plain:* "buy vs. run"; planning is mostly about buying the
right things so that the running costs of the next 20 years come down.

**TEP (transmission expansion planning)** — *Formal:* choose which
corridors/lines to build (and with what rating) to meet forecast loads and
constraints at minimum cost, usually via a Benders loop around OPF
subproblems. *Plain:* "which new highways does the power grid need in the
next 15 years" — decades-long, billion-dollar decisions, and (today)
almost no GPU-specific solvers: a research gap.

**scenario / scenario tree** — *Formal:* a single possible future (load,
wind, prices) sampled from a distribution; a tree structures them in time
for stochastic programs. *Plain:* "100 plausible futures, weighted by how
likely they are" — the planner optimizes the *average* (or worst) outcome.
Scenarios are embarrassingly parallel — a natural GPU workload.

**stochastic programming** — *Formal:* optimize expected cost over a
scenario set/tree, with non-anticipativity (decisions before uncertainty
realizes cannot depend on it). *Plain:* "plan for the weather forecast,
not for one sunny day."

**robust optimization** — *Formal:* optimize the worst case over an
uncertainty set (box, polyhedron); guarantees feasibility for every
realization at a tunable conservatism level. *Plain:* "make the plan that
survives the nastiest plausible weather" — mathematically friendlier than
full stochastic programs, at the cost of pessimism.

**multi-period / investment model** — *Formal:* a model with time stages:
assets installed in stage t serve stages t..T; capacity and energy-balance
constraints link stages (invest ↔ operate coupling). *Plain:* the plan has
memory: what you build in 2028 affects the 2035 constraint set. The
coupling is what makes these models big.

**levelized cost (LCOE/LCOS)** — *Formal:* NPC of an asset divided by its
lifetime output (or capacity served); enables comparing technologies
apple-to-apple. *Plain:* "cost per MWh over the asset's life, interest
included" — the number the press quotes; planning models generalize it.

**energy hub / multi-energy system** — *Formal:* a node converting and
coupling energy carriers (electricity, heat, gas, hydrogen) with
efficiencies; planning/optimizing over the coupled network. *Plain:* the
"power + boiler + battery + hydrogen" bundle where one MWh of electricity
can become heat or fuel; the next layer of "large-scale" beyond pure power.

---

## E. GPU / HPC

**GPU / SM / CUDA core** — *Formal:* a many-core processor; the SM
(streaming multiprocessor) is the GPU's core unit (tens of FP cores, shared
memory, schedulers); "CUDA cores" are the scalar FP pipelines inside an SM.
*Plain:* the GPU is a factory floor: 100+ workstations (SMs), each with
dozens of tiny machines (CUDA cores) that each do one multiply-add per
cycle.

**warp / SIMT** — *Formal:* 32 threads executing in lockstep (single
instruction, multiple threads); the GPU's scheduling granularity; branches
inside a warp serialize. *Plain:* 32 interns must do the same step at the
same time — if one branch says "if" and another "else", both paths run and
the losers wait. Branch divergence = wasted interns.

**thread / block / grid** — *Formal:* a kernel launch = a grid of blocks of
threads; blocks live on one SM and can communicate via shared memory;
threads inside a warp run lockstep. *Plain:* the org chart of the factory:
grid = whole shift, block = one workstation's crew (256 people), warp = 32
people who must stay in step.

**shared memory / global memory (HBM)** — *Formal:* per-SM scratch memory
(~100s KB, ns latency, block-scoped) vs. off-chip DRAM (tens of GB,
hundreds of ns latency, all threads). *Plain:* the workbench (shared: fast,
small, your crew only) vs. the warehouse (HBM: huge, slow, everyone). Most
kernel bugs are "I walked to the warehouse when the workbench would do."

**coalesced access** — *Formal:* a warp reading/writing contiguous
addresses issues one (few) memory transaction(s) instead of one per
thread. *Plain:* if 32 interns each need the *next* box on the shelf, the
forklift makes one run; if each needs a random box, it makes 32 runs.
Thread i touching element i (stride 1) is coalesced; element i·32 is not.

**launch overhead** — *Formal:* the fixed cost (~5–20 µs) of starting a
kernel on the GPU; dominates when the kernel itself runs <50 µs.
*Plain:* it takes a few microseconds just to "brief the shift" — so 5-bus
power flows on a GPU look embarrassingly slow; batch the work instead.

**roofline / bandwidth-bound vs compute-bound** — *Formal:* performance =
min(peak FLOPs, arithmetic intensity × memory bandwidth); kernels below
the "ridge point" are bandwidth-bound. *Plain:* the factory's output is
capped by either the machines (FLOPs) or the forklift (memory). SpMV and
power-flow sweeps live under the forklift's shadow — add more interns and
nothing changes; move bytes faster and everything does.

**Amdahl's law** — *Formal:* speedup $\le 1/(s + (1 - s)/p)$ for serial
fraction $s$ and $p$ processors. *Plain:* if 20% of your solver can't be parallelized,
a thousand GPUs give you at most 5×. Every honest GPU paper implicitly
reports its s.

**double precision (FP64)** — *Formal:* 64-bit IEEE-754 floating point
(~15–16 decimal digits); required for convergence-critical numerical work.
*Plain:* 16 digits of care; power-flow tolerances ($\sim 10^{-10}$) die in 7-digit
float. Data-center GPUs (A100: full-rate FP64) are the norm in this field
for this reason.

**cuSPARSE / cuSOLVER / NCCL** — *Formal:* NVIDIA's libraries: tuned sparse
kernels (SpMV, batched factorization), sparse/dense solvers, and
multi-GPU communication (all-reduce, etc.). *Plain:* the "don't reinvent"
shelf — use them before writing kernels; NCCL is how several GPUs gossip
for ADMM-style algorithms.

**batch processing / data parallelism** — *Formal:* packing many
independent problem instances (contingencies, scenarios, feeders) into one
kernel launch over a 3D index space. *Plain:* instead of 5,000 tiny jobs on
5,000 machines, one big job where 5,000 interns each take one case — the
simplest and most reliable GPU speedup in the field.

---

*End of glossary. ~70 terms; keep this file open while reading 03 — it is
the "second register" for every technical claim in the review.*