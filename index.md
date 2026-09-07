---
layout: default
title: GPU-Accelerated Grid Optimization
nav_exclude: true
---

<div class="hero">
  <p class="hero-eyebrow">Review &amp; learning package</p>
  <h1>GPU-Accelerated Grid Optimization</h1>
  <p class="hero-sub">A structured path from electrical-engineering fundamentals to GPU kernels, grid optimization, DERMS, and a practical PhD roadmap — built on DOI-backed sources and real, benchmarked CUDA code.</p>
  <div class="hero-stats">
    <div class="stat"><span class="stat-num">6</span><span class="stat-label">cross-linked documents</span></div>
    <div class="stat"><span class="stat-num">41</span><span class="stat-label">DOI-backed papers</span></div>
    <div class="stat"><span class="stat-num">3</span><span class="stat-label">benchmarked CUDA kernels</span></div>
    <div class="stat"><span class="stat-num">8&times;A100</span><span class="stat-label">benchmark hardware</span></div>
  </div>
</div>

## Choose a path

<div class="card-grid">
  <a class="path-card" href="03_gpu_grid_optimization_review.html">
    <span class="path-tag">Fast lane &middot; ~3 h</span>
    <h3>Read the review first</h3>
    <p>Start with the literature review, keep the glossary open while reading, then learn to verify each venue on Scopus in five minutes.</p>
    <span class="path-link">03 &rarr; 04 &rarr; 05</span>
  </a>
  <a class="path-card" href="01_fundamentals_bridge.html">
    <span class="path-tag">Deep track &middot; 2&ndash;3 weeks</span>
    <h3>Build it from the ground up</h3>
    <p>Fundamentals first, then GPU internals with the kernels you can actually compile and run, then the full review, glossary, and Scopus guide.</p>
    <span class="path-link">01 &rarr; 06, every document</span>
  </a>
  <a class="path-card" href="06_phd_roadmap.html">
    <span class="path-tag">PhD preparation</span>
    <h3>Go straight for the research</h3>
    <p>Master the fundamentals, run and <em>modify</em> the CUDA kernels, then use the review and roadmap to pick one of five research directions.</p>
    <span class="path-link">01 &rarr; cuda_kernels &rarr; 03 &rarr; 06</span>
  </a>
  <a class="path-card" href="papers.html">
    <span class="path-tag">Interactive &middot; 41 slides</span>
    <h3>Explore the paper deck</h3>
    <p>Step through all 41 DOI-backed papers one at a time &mdash; each with a hook question, a summary, its contribution, and how it is cited. Keyboard-friendly and deep-linkable, with an overview to jump around.</p>
    <span class="path-link">Papers &rarr;</span>
  </a>
</div>

## The six sections

<div class="section-grid">
  <a class="section-card" href="01_fundamentals_bridge.html">
    <span class="section-num">01</span>
    <h3>Fundamentals bridge</h3>
    <p>Circuits, power flow, OPF, DERMS, planning, and the optimization toolbox — the prerequisite layer.</p>
  </a>
  <a class="section-card" href="02_gpu_basics_and_kernels.html">
    <span class="section-num">02</span>
    <h3>GPU basics and kernels</h3>
    <p>How a GPU actually works (warp, memory wall, roofline), plus annotated walkthroughs of the three kernels with measured A100 numbers.</p>
  </a>
  <a class="section-card" href="03_gpu_grid_optimization_review.html">
    <span class="section-num">03</span>
    <h3>Grid optimization review</h3>
    <p>The literature map: what works on the GPU, where the speedups come from, and where the gaps are.</p>
  </a>
  <a class="section-card" href="04_glossary.html">
    <span class="section-num">04</span>
    <h3>Glossary</h3>
    <p>~70 terms, each defined formally and again in plain language.</p>
  </a>
  <a class="section-card" href="05_scopus_search_guide.html">
    <span class="section-num">05</span>
    <h3>Scopus search guide</h3>
    <p>How to verify indexing in five minutes and keep the paper table current.</p>
  </a>
  <a class="section-card" href="06_phd_roadmap.html">
    <span class="section-num">06</span>
    <h3>PhD roadmap</h3>
    <p>Semester plan, five research directions, milestones, and target venues.</p>
  </a>
</div>

## Reproducibility artifacts

<div class="artifact-row">
  <a class="artifact" href="papers_scopus_table.csv"><span class="artifact-ico" aria-hidden="true">📊</span> Paper table (CSV)</a>
  <a class="artifact" href="papers.html"><span class="artifact-ico" aria-hidden="true">🎞️</span> Paper deck (41 slides)</a>
  <a class="artifact" href="cuda_kernels/"><span class="artifact-ico" aria-hidden="true">⚡</span> CUDA kernels &amp; benchmarks</a>
  <a class="artifact" href="00_README.html"><span class="artifact-ico" aria-hidden="true">📦</span> Package README</a>
  <a class="artifact" href="quiz.html"><span class="artifact-ico" aria-hidden="true">🎯</span> Self-generated quiz</a>
</div>

<p class="hero-note">Literature data collected 2026-09-04 via Crossref and OpenAlex; benchmark numbers measured on 8&times; A100-40GB (CUDA 12.8). Each document carries its own provenance and verification notes.</p>
