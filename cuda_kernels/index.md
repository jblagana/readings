---
layout: default
title: CUDA Kernels
nav_exclude: true
data_quiz: "Kernels lab"
---

# CUDA kernels

Three real, self-verifying CUDA kernels — the code behind the walkthroughs in [02 — GPU basics and kernels](../02_gpu_basics_and_kernels.html). Each program builds its own deterministic test data, runs CPU and GPU versions, times both, and prints a PASS/FAIL correctness check.

## The kernels

| # | Kernel | What it teaches | Why it matters for grid optimization |
| --- | --- | --- | --- |
| 01 | [dot product](01_dot_product.cu) | Host↔device transfer, grid-stride loop, shared-memory block reduction, fair CPU/GPU timing | The "read numbers, multiply-add, write result" pattern that SpMV (and therefore power flow) is built from. |
| 02 | [SpMV (CSR)](02_spmv.cu) | One-thread-per-row sparse matrix-vector product on a banded, grid-like matrix | SpMV is the workhorse of Newton–Raphson power flow, GS/Jacobi sweeps, and interior-point OPF. |
| 03 | [5-bus AC power flow](03_pf_gauss_seidel.cu) | A full (tiny) power flow: Ybus build, CPU Gauss–Seidel vs GPU Jacobi, swing-bus power and loss reporting | The exact sweep loop you would scale to 100k+ buses; makes the CPU-vs-GPU verification habit concrete. |

## Files

| File | What it is |
| --- | --- |
| [01_dot_product.cu](01_dot_product.cu) | Source: vector dot product, 1e8 doubles, GB/s + speedup reported. |
| [02_spmv.cu](02_spmv.cu) | Source: CSR SpMV at $N = 10^5$ and $10^6$ rows, bandwidth $B = 9$. |
| [03_pf_gauss_seidel.cu](03_pf_gauss_seidel.cu) | Source: 5-bus system, CPU GS vs GPU Jacobi, Tellegen balance check. |
| [build_and_run.sh](build_and_run.sh) | Builds all three with `nvcc` and runs the benchmarks. |
| [run_kernels.ipynb](run_kernels.ipynb) | Notebook harness used to capture the A100 benchmark numbers. |

> **Compiled binaries** from the A100 benchmark runs are intentionally not published — they are Linux-specific, and `./build_and_run.sh` rebuilds them in seconds on any CUDA machine.

## Build and run

Requires a machine with `nvcc` (CUDA toolkit). Tested on CUDA 12.8 / A100-40GB (`sm_80`); override the arch if needed:

```bash
cd cuda_kernels
./build_and_run.sh            # default: sm_80
ARCH=sm_90 ./build_and_run.sh # e.g. on H100
```

Each run prints CPU vs GPU timing, effective bandwidth, speedup, and a PASS/FAIL correctness line. The measured A100 numbers are summarized in [02 — GPU basics and kernels](../02_gpu_basics_and_kernels.html); times will vary with GPU load.

[← Back to the reading package](../index.html)
