---
layout: default
title: "05 — Scopus Search Guide"
nav_order: 5
data_quiz: "Scopus guide"
---

# 05 — Scopus Search Guide: verify, query, and keep this table alive

This folder was **not** built inside Scopus (no access from this machine).
It was built from **DOI-backed metadata** (Crossref + OpenAlex, 2026-07-06).
This document tells you how to (a) confirm each entry is Scopus-indexed in
about 5 minutes, (b) run the searches that reproduce and extend
`papers_scopus_table.csv`, and (c) keep the table current.

---

## 1. What "Scopus-indexed" actually means (30 seconds)

A paper is "Scopus-indexed" iff its **journal or conference proceedings**
appears in Scopus's *Sources* list **and** the article's metadata was
ingested. Consequences you should care about:

- Indexing is **per venue, not per paper**: if the journal is listed, all
  recent articles are (with a small lag).
- Some IEEE conference proceedings are indexed, some are not — **check the
  proceedings title, not the IEEE brand**.
- Scopus lags by weeks–months for new titles; a 2025–2026 journal may have
  a DOI but not yet be indexed → the `scopus_likely = check` rows in the
  CSV.
- For a PhD thesis/CV, what usually matters is: venue in Scopus **or**
  high CiteScore / well-known conference — your program's rule is the
  rule; the CiteScore index lists the journals and their quartiles.

**5-minute verification per entry:**
1. Open `scopus.com` (via your university/NSG account).
2. *Sources* tab → search the exact venue name → note ISSN + "Scopus
   coverage period".
3. Paste the DOI into the Scopus search box → the article either appears
   (indexed) or doesn't.

---

## 2. Target venue list for this subfield (tiered)

**Tier 1 — top power-systems journals (definitely Scopus, high CiteScore):**
- *IEEE Transactions on Power Systems* (TPWRS) — ISSN 0885-8950
- *IEEE Transactions on Smart Grid* (TSG) — ISSN 1949-3053
- *Applied Energy*, *Energy* (Elsevier)
- *International Journal of Electrical Power & Energy Systems* (IJEPES)
- *Electric Power Systems Research* (EPSR)
- *Computers & Electrical Engineering* (C&EE)
- *IEEE Transactions on Industry Applications* (motor/EV DER loads)
- *Renewable and Sustainable Energy Reviews* (reviews)
- *Wiley Interdisciplinary Reviews: Energy and Environment* (reviews)

**Tier 2 — solid journals (Scopus-indexed; verify recent years):**
- *IEEE Access*, *Energies* (MDPI — Scopus-indexed, but some MDPI titles
  were delisted in 2023/24 — always check the current Sources list)
- *Sustainable Cities and Society*, *Energy Reports*
- *Optimization and Engineering* (Springer — venue of the GPU-SCOPF paper)
- *Concurrency and Computation: Practice & Experience* (CCPE)
- *Journal of Parallel and Distributed Computing* (JPDC)

**Tier 3 — venues in the table whose status you must verify:**
- *IEEE Texas Power and Energy Conference* (TPEC) proceedings
- *IEEE PES General Meeting* (PESGM) proceedings
- *North American Power Symposium* (NAPS) proceedings
- *International Conference on Power System Technology* (POWERCON)
- *ISGT East / ISGT-Europe / ISGT-Asia* proceedings
- *IEEE EI2*, *EPEC*, *EPEE*, *Clemson PSC*, *ROPEC* proceedings
- NREL technical reports (10.2172/... DOIs) — **not** Scopus-indexed
  (they are reports; cite them as such)
- arXiv preprints — not indexed; cite the *published* version when it
  exists


---

## 3. Ready-to-paste Scopus queries

Use Advanced Search; `TITLE-ABS-KEY` = title + abstract + keywords. Replace
`2012-2026` with your window. These were the seeds for this package's table.

**A. GPU power flow / sparse solvers**
```
TITLE-ABS-KEY ( ( "GPU" OR "CUDA" OR "graphics processing unit" )
  AND ( "power flow" OR "load flow" OR "state estimation" OR "sparse" )
  AND ( "power system" OR "electric power" ) )
```
**B. GPU optimal power flow / SCOPF**
```
TITLE-ABS-KEY ( ( "GPU" OR "CUDA" OR "graphics processing unit" )
  AND ( "optimal power flow" OR "OPF" OR "security-constrained"
        OR "interior point" OR "SCOPF" ) )
```
**C. GPU / parallel unit commitment & market clearing**
```
TITLE-ABS-KEY ( ( "GPU" OR "CUDA" OR "graphics processing unit"
        OR "parallel" OR "high performance computing" )
  AND ( "unit commitment" OR "market clearing" OR "economic dispatch"
        OR "branch and bound" ) )
```
**D. DERMS (intersect with GPU for the niche you care about)**
```
TITLE-ABS-KEY ( "DERMS" OR "distributed energy resource management" )
AND
TITLE-ABS-KEY ( "GPU" OR "CUDA" OR "parallel computing"
  OR "real-time optimization" )
```
**E. Planning / TEP**
```
TITLE-ABS-KEY ( ( "transmission expansion planning" OR "investment planning"
        OR "energy system planning" )
  AND ( "GPU" OR "parallel" OR "high performance computing"
        OR "large-scale" ) )
```
**F. Anchor surveys (start here when snowballing):**
- "A survey of high-performance computing approaches in power systems"
  (PESGM 2016, DOI `10.1109/pesgm.2016.7741984`) — cite back/forward.
- "Distributed energy resource management systems — DERMS: State of the
  art and how to move forward" (WIREs Energy & Environment, 2022,
  DOI `10.1002/wene.460`).
- "A Survey of Distributed Optimization and Control Algorithms for Electric
  Power Systems" (IEEE TSG, 2017, DOI `10.1109/tsg.2017.2720471`).

**Query hygiene tips**
- Run `TITLE`-only first (high precision), then widen to `TITLE-ABS-KEY`.
- "GPU" rarely false-positives in power systems; "CUDA" can (it's also a
  city name in other fields).
- Use the *Document type = Article* filter to drop reviews/proceedings
  when you want algorithms only (re-allow "proceedings" for the C/E
  queries — that's where a lot of GPU work appears).
- Export CSV "all fields" → dedupe on DOI → import to Zotero.

**Snowballing (20% of the effort, 80% of the finds):**
1. Open the 3 anchor surveys in Scopus.
2. *Cited by* (forward) + *References* (backward) for each.
3. Keep everything whose title matches your A–E clauses.
4. Repeat one level deeper for anything you keep.

---

## 4. Free API alternatives (how this table was actually built)

Reproducible, no account needed:

```bash
# Crossref (DOI metadata): bibliographic search
curl -s "https://api.crossref.org/works?query.bibliographic=GPU%20power%20flow&filter=from-pub-date:2012&rows=10&select=title,container-title,issued,DOI"

# OpenAlex (richer: venue, OA status): title search
curl -s "https://api.openalex.org/works?filter=title.search:GPU%20power%20flow,publication_year:2014-2026&per-page=10&select=title,publication_year,doi,primary_location"
```

Useful for: confirming DOIs/venues/years, finding open-access PDFs
(OpenAlex `is_oa` + `pdf_url`), and building the initial table fast.
Caveats: Crossref's free tier rate-limits hard (pace yourself: one query
per ~30 s); OpenAlex's `search=` does full-text matching — prefer
`filter=title.search:` for precision.

---

## 5. How to read a "speedup" claim critically (your review checklist)

When a paper says "we achieved 25× speedup on GPU", check **all** of:

1. **Baseline**: single CPU core? tuned multithreaded library? same
   machine? (25× vs 1 core is very different from 25× vs a 64-core
   PARDISO.)
2. **What fraction was parallelized**: SpMV only? the whole solve
   including factorization? (Amdahl: if factorization is 60% of CPU time
   and stays serial, the ceiling is 2.5×.)
3. **Problem size & instance**: IEEE 30-bus speedups mean little; ask for
   10k/100k-bus instances (PGLib-OPF, IEEE CDF cases) and *total* wall
   time, not per-iteration time.
4. **Transfer + launch overhead included?** Small problems often lose
   once H2D/D2H copies are counted honestly.
5. **Precision**: FP64 (trustworthy for power systems) or FP32 (then
   report accuracy loss vs an FP64 reference)?
6. **Reproducibility**: open code + data? If not, discount the claim.
7. **Correctness check**: did they verify the GPU solution against a CPU
   reference (max residual, objective gap)? If a paper never shows a
   "GPU result == CPU result" number, the speedup is meaningless.

Items 1–3 + 7 are exactly what `03_gpu_grid_optimization_review.md` grades
each paper on — and what your own thesis must do.

<div class="widget cg" id="cg-root">
  <span class="widget-badge">Interactive</span>
  <p class="widget-title">Grade a speedup claim</p>
  <p class="widget-sub">Open the paper's benchmark section and tick each item as you find it. Items 1–3 and 7 are load-bearing — the verdict says what to do with the number.</p>
  <ol class="cg-items">
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">1</span><span class="cg-q">Baseline — single CPU core, or a tuned multithreaded library? Same machine?</span></div>
      <p class="cg-why">25× vs 1 core is very different from 25× vs a 64-core PARDISO.</p>
      <div class="cg-seg" data-item="1">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">2</span><span class="cg-q">What fraction was parallelized — SpMV only, or the whole solve including factorization?</span></div>
      <p class="cg-why">If factorization is 60% of CPU time and stays serial, Amdahl caps the honest claim at 2.5× (02 §1).</p>
      <div class="cg-seg" data-item="2">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">3</span><span class="cg-q">Problem size &amp; instance — IEEE 30-bus, or 10k/100k-bus? Total wall time, not per-iteration?</span></div>
      <p class="cg-why">Small-bus speedups are often launch overhead wearing a costume (02, kernel 03).</p>
      <div class="cg-seg" data-item="3">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">4</span><span class="cg-q">Transfer + launch overhead included, or hidden?</span></div>
      <p class="cg-why">Once H2D/D2H copies are counted honestly, small problems often lose.</p>
      <div class="cg-seg" data-item="4">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">5</span><span class="cg-q">Precision — FP64, or FP32 with the accuracy loss vs an FP64 reference reported?</span></div>
      <p class="cg-why">Power systems need double precision for convergence; FP32 speedups are a different result.</p>
      <div class="cg-seg" data-item="5">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">6</span><span class="cg-q">Reproducibility — open code + data?</span></div>
      <p class="cg-why">You should be able to re-run the number, not just re-read it.</p>
      <div class="cg-seg" data-item="6">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
    <li class="cg-item">
      <div class="cg-item-head"><span class="cg-num">7</span><span class="cg-q">Correctness check — GPU solution verified against a CPU reference (residual, objective gap)?</span></div>
      <p class="cg-why">If a paper never shows a "GPU result == CPU result" number, the speedup is meaningless.</p>
      <div class="cg-seg" data-item="7">
        <button type="button" data-state="pass" aria-pressed="false">Yes</button>
        <button type="button" data-state="na" aria-pressed="false">Not stated</button>
        <button type="button" data-state="fail" aria-pressed="false">Red flag</button>
      </div>
    </li>
  </ol>
  <div class="cg-score" aria-hidden="true">
    <span class="cg-score-cell is-none"></span><span class="cg-score-cell is-none"></span><span class="cg-score-cell is-none"></span><span class="cg-score-cell is-none"></span><span class="cg-score-cell is-none"></span><span class="cg-score-cell is-none"></span><span class="cg-score-cell is-none"></span>
  </div>
  <div class="cg-verdict is-none" id="cg-verdict">
    <span class="cg-verdict-title">Ungraded</span>
    <p class="cg-verdict-text">Tick the seven items — the verdict updates live.</p>
  </div>
  <button type="button" class="cg-reset" id="cg-reset">Reset</button>
</div>