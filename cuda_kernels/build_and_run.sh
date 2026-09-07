#!/usr/bin/env bash
# Build and benchmark the three tutorial CUDA kernels.
# Requires: nvcc (CUDA toolkit). Tested on: CUDA 12.8, 4x A100-40GB (sm_80).
# Override GPU arch if needed:  ARCH=sm_90 ./build_and_run.sh
set -euo pipefail
cd "$(dirname "$0")"

ARCH=${ARCH:-sm_80}
CFLAGS="-O3 -arch=${ARCH}"

echo "== Building with: nvcc ${CFLAGS} =="
nvcc ${CFLAGS} 01_dot_product.cu      -o 01_dot_product
nvcc ${CFLAGS} 02_spmv.cu             -o 02_spmv
nvcc ${CFLAGS} 03_pf_gauss_seidel.cu  -o 03_pf_gauss_seidel

echo
echo "== 01: dot product (memory-bandwidth baseline) =="
./01_dot_product

echo
echo "== 02: CSR sparse matrix-vector product (the power-flow workhorse) =="
./02_spmv

echo
echo "== 03: 5-bus AC power flow (GPU Jacobi vs CPU Gauss-Seidel) =="
./03_pf_gauss_seidel

echo
echo "== All kernels done =="
