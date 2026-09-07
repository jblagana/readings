// ============================================================================
// 02_spmv.cu -- Minimal CUDA kernel #2: sparse matrix-vector product (SpMV)
//
// SpMV (y = A*x) is THE workhorse of power-flow solvers:
//   * Newton-Raphson: each iteration works with the sparse Jacobian J;
//     residual evaluations and correction updates are SpMV (the sparse
//     factorization is the harder, separate problem -- see doc 02).
//   * Gauss-Seidel / Jacobi sweeps: each sweep IS an SpMV with the Ybus.
//   * OPF interior-point methods: the KKT system is a bigger sparse linear
//     system -- same story.
//
// We build a "grid-like" banded matrix (each row talks to ~10 neighbours,
// like a bus connected to its neighbouring buses) in CSR format, run SpMV
// on CPU and GPU, verify, and time it.
//
// CSR (Compressed Sparse Row) in 30 seconds:
//   row_ptr[i]  = index where row i's entries start in col_idx/val
//   col_idx[k]  = which column the k-th non-zero belongs to
//   val[k]      = its value
//   row i = entries k = row_ptr[i] .. row_ptr[i+1]-1
//
// Build:  nvcc -O3 -arch=sm_80 02_spmv.cu -o 02_spmv
// Run:    ./02_spmv
// ============================================================================
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <chrono>
#include <vector>

#define CUDA_CHECK(call)                                                  \
  do {                                                                    \
    cudaError_t err__ = (call);                                           \
    if (err__ != cudaSuccess) {                                           \
      fprintf(stderr, "CUDA error %s:%d: %s\n", __FILE__, __LINE__,       \
              cudaGetErrorString(err__));                                 \
      exit(EXIT_FAILURE);                                                 \
    }                                                                     \
  } while (0)

// One thread per row. In CSR, row i's non-zeros are contiguous, so this is
// a clean, bandwidth-bound kernel.
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

static void cpu_spmv(const std::vector<int>& rp, const std::vector<int>& ci,
                     const std::vector<double>& v,
                     const std::vector<double>& x,
                     std::vector<double>& y) {
  for (long i = 0; i < (long)rp.size() - 1; ++i) {
    double s = 0.0;
    for (long k = rp[i]; k < rp[i + 1]; ++k) s += v[k] * x[ci[k]];
    y[i] = s;
  }
}

// Tiny deterministic PRNG (LCG) so CPU and GPU see exactly the same data.
struct LCG {
  unsigned long long s;
  explicit LCG(unsigned long long seed) : s(seed) {}
  double next() {
    s = s * 6364136223846793005ULL + 1442695040888963407ULL;
    return ((double)(s >> 40) / (double)(1ULL << 24)) - 0.5;
  }
};

int main() {
  cudaDeviceProp prop;
  CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));
  printf("device : %s\n", prop.name);

  const int B = 9;  // half-bandwidth: row i connects to B neighbours each side

  for (long N : {100000L, 1000000L}) {
    printf("\n== SpMV: N = %ld rows, bandwidth B = %d ==\n", N, B);

    // ---- build a grid-like banded CSR matrix on the host ----
    std::vector<int>   rp(N + 1, 0), ci;
    std::vector<double> v;
    long nnz = 0;
    LCG rng(12345);
    for (long i = 0; i < N; ++i) {
      rp[i] = (int)nnz;
      int lo = (int)(i - B) < 0 ? 0 : (int)(i - B);
      int hi = (int)(i + B) > (int)N - 1 ? (int)N - 1 : (int)(i + B);
      for (int j = lo; j <= hi; ++j) {
        ci.push_back(j);
        v.push_back(j == i ? 10.0 : rng.next());  // dominant diagonal
        nnz++;
      }
    }
    rp[N] = (int)nnz;
    printf("nnz = %ld  (approx %.1f non-zeros per row)\n", nnz,
           (double)nnz / (double)N);
    std::vector<double> x(N), y_cpu(N), y_gpu(N, 0.0);
    for (long i = 0; i < N; ++i) x[i] = rng.next();

    // ---- CPU reference + timing ----
    cpu_spmv(rp, ci, v, x, y_cpu);  // correctness reference
    const int cpu_runs = 5;
    auto c0 = std::chrono::high_resolution_clock::now();
    for (int r = 0; r < cpu_runs; ++r) cpu_spmv(rp, ci, v, x, y_cpu);
    auto c1 = std::chrono::high_resolution_clock::now();
    double ms_cpu =
        std::chrono::duration<double, std::milli>(c1 - c0).count() / cpu_runs;

    // ---- GPU side ----
    int *d_rp, *d_ci;
    double *d_v, *d_x, *d_y;
    CUDA_CHECK(cudaMalloc(&d_rp, (N + 1) * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_ci, nnz * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_v, nnz * sizeof(double)));
    CUDA_CHECK(cudaMalloc(&d_x, N * sizeof(double)));
    CUDA_CHECK(cudaMalloc(&d_y, N * sizeof(double)));
    CUDA_CHECK(cudaMemcpy(d_rp, rp.data(), (N + 1) * sizeof(int),
                          cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_ci, ci.data(), nnz * sizeof(int),
                          cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_v, v.data(), nnz * sizeof(double),
                          cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_x, x.data(), N * sizeof(double),
                          cudaMemcpyHostToDevice));

    const int block = 256;
    const int grid  = (int)((N + block - 1) / block);
    for (int w = 0; w < 3; ++w)
      spmv_csr<<<grid, block>>>(d_rp, d_ci, d_v, d_x, d_y, (int)N);
    CUDA_CHECK(cudaDeviceSynchronize());

    cudaEvent_t t0, t1;
    CUDA_CHECK(cudaEventCreate(&t0));
    CUDA_CHECK(cudaEventCreate(&t1));
    const int iters = 20;
    CUDA_CHECK(cudaEventRecord(t0));
    for (int it = 0; it < iters; ++it)
      spmv_csr<<<grid, block>>>(d_rp, d_ci, d_v, d_x, d_y, (int)N);
    CUDA_CHECK(cudaEventRecord(t1));
    CUDA_CHECK(cudaEventSynchronize(t1));
    float ms_gpu = 0.f;
    CUDA_CHECK(cudaEventElapsedTime(&ms_gpu, t0, t1));
    ms_gpu /= iters;

    CUDA_CHECK(cudaMemcpy(y_gpu.data(), d_y, N * sizeof(double),
                          cudaMemcpyDeviceToHost));

    // ---- verify ----
    double maxrel = 0.0;
    for (long i = 0; i < N; ++i) {
      double d = std::fabs(y_gpu[i] - y_cpu[i]) /
                 (std::fabs(y_cpu[i]) + 1e-30);
      if (d > maxrel) maxrel = d;
    }

    // effective bytes moved: read val + gathered x, write y (approx)
    double bytes = (2.0 * (double)nnz + 2.0 * (double)N) * sizeof(double);
    printf("CPU : %9.3f ms   (%7.1f GB/s effective)\n", ms_cpu,
           bytes / (ms_cpu * 1e-3) / 1e9);
    printf("GPU : %9.3f ms   (%7.1f GB/s effective)\n", ms_gpu,
           bytes / (ms_gpu * 1e-3) / 1e9);
    printf("speedup : %.1fx\n", ms_cpu / ms_gpu);
    printf("max rel diff = %.3e -> %s\n", maxrel,
           maxrel < 1e-12 ? "PASS" : "FAIL");

    cudaFree(d_rp); cudaFree(d_ci); cudaFree(d_v); cudaFree(d_x); cudaFree(d_y);
  }
  return 0;
}