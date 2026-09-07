// ============================================================================
// 01_dot_product.cu -- Minimal CUDA kernel #1: vector dot product
//
// What this teaches:
//   * moving data host -> device, running a kernel, moving results back
//   * the grid-stride loop (works for ANY vector size, on any GPU)
//   * timing CPU vs GPU fairly, and verifying correctness
//
// Why this matters for grid optimization:
//   A power-flow Newton step needs y = J * dV (a sparse matrix-vector
//   product). SpMV is the same "read numbers, multiply-add, write result"
//   pattern as a dot product -- this kernel is the warm-up for 02_spmv.cu.
//
// Build:  nvcc -O3 -arch=sm_80 01_dot_product.cu -o 01_dot_product
// Run:    ./01_dot_product
// ============================================================================
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <chrono>

#define CUDA_CHECK(call)                                                  \
  do {                                                                    \
    cudaError_t err__ = (call);                                           \
    if (err__ != cudaSuccess) {                                           \
      fprintf(stderr, "CUDA error %s:%d: %s\n", __FILE__, __LINE__,       \
              cudaGetErrorString(err__));                                 \
      exit(EXIT_FAILURE);                                                 \
    }                                                                     \
  } while (0)

// Grid-stride kernel: launch more threads than elements; each thread walks
// a strided subset of the vector. NOTE the block reduction: without the
// shared-memory tree below, ALL threads in a block write to out[blockIdx.x]
// (data race!) and only one thread's 1/256 share survives -- the classic
// "missing reduction" bug, caught by the PASS/FAIL check in main().
__global__ void dot_kernel(const double* x, const double* y, long n,
                           double* out) {
  __shared__ double sdata[256];  // one slot per thread (block <= 256)
  long i  = (long)blockIdx.x * blockDim.x + threadIdx.x;
  long st = (long)gridDim.x * blockDim.x;
  double s = 0.0;
  for (; i < n; i += st) s += x[i] * y[i];   // strided walk
  sdata[threadIdx.x] = s;
  __syncthreads();
  // in-block tree reduction. START AT blockDim.x/2, NOT A HARDCODED 16:
  // with 256 threads, starting at 16 only sums the first 32 threads and
  // silently discards 7/8 of the block's work (the exact bug we caught:
  // measured ratio was 1/8).
  for (int stride = blockDim.x / 2; stride > 0; stride >>= 1) {
    if (threadIdx.x < stride)
      sdata[threadIdx.x] += sdata[threadIdx.x + stride];
    __syncthreads();
  }
  if (threadIdx.x == 0) out[blockIdx.x] = sdata[0];
}

static double cpu_dot(const double* x, const double* y, long n) {
  double s = 0.0;
  for (long i = 0; i < n; ++i) s += x[i] * y[i];
  return s;
}

int main() {
  cudaDeviceProp prop;
  CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));
  printf("device : %s\n", prop.name);

  const long N = 100000000L;  // 1e8 doubles = 800 MB per array
  printf("dot product: N = %ld doubles (%.0f MB per array)\n", N,
         (double)N * 8.0 / 1e6);

  double* hx = (double*)malloc(N * sizeof(double));
  double* hy = (double*)malloc(N * sizeof(double));
  for (long i = 0; i < N; ++i) {  // deterministic data, no RNG needed
    hx[i] = 1e-3 * (double)(i % 1000);
    hy[i] = 1e-3 * (double)((i * 7) % 1000);
  }

  double ref = cpu_dot(hx, hy, N);  // CPU reference (correctness)

  // ---------------- GPU side ----------------
  double *dx = nullptr, *dy = nullptr, *dout = nullptr;
  CUDA_CHECK(cudaMalloc(&dx, N * sizeof(double)));
  CUDA_CHECK(cudaMalloc(&dy, N * sizeof(double)));
  const int block = 256;
  const int grid  = 2048;  // 2048 blocks x 256 threads = 524288 threads
  CUDA_CHECK(cudaMalloc(&dout, grid * sizeof(double)));
  CUDA_CHECK(cudaMemcpy(dx, hx, N * sizeof(double), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(dy, hy, N * sizeof(double), cudaMemcpyHostToDevice));

  for (int w = 0; w < 3; ++w)  // warm-up: page allocation, clock ramp-up
    dot_kernel<<<grid, block>>>(dx, dy, N, dout);
  CUDA_CHECK(cudaDeviceSynchronize());

  cudaEvent_t t0, t1;
  CUDA_CHECK(cudaEventCreate(&t0));
  CUDA_CHECK(cudaEventCreate(&t1));
  const int iters = 20;
  CUDA_CHECK(cudaEventRecord(t0));
  for (int it = 0; it < iters; ++it)
    dot_kernel<<<grid, block>>>(dx, dy, N, dout);
  CUDA_CHECK(cudaEventRecord(t1));
  CUDA_CHECK(cudaEventSynchronize(t1));
  float ms_gpu = 0.f;
  CUDA_CHECK(cudaEventElapsedTime(&ms_gpu, t0, t1));
  ms_gpu /= iters;

  double* hout = (double*)malloc(grid * sizeof(double));
  CUDA_CHECK(cudaMemcpy(hout, dout, grid * sizeof(double),
                        cudaMemcpyDeviceToHost));
  double gpu = 0.0;
  for (int b = 0; b < grid; ++b) gpu += hout[b];

  // ---------------- CPU timing ----------------
  // NOTE: use the return value, or -O3 will eliminate the loop entirely
  // (pure function, unused result). This is a classic benchmarking trap.
  auto c0 = std::chrono::high_resolution_clock::now();
  double cpu_check = cpu_dot(hx, hy, N);
  auto c1 = std::chrono::high_resolution_clock::now();
  double ms_cpu =
      std::chrono::duration<double, std::milli>(c1 - c0).count();
  double cpu_rel = std::fabs(cpu_check - ref) / (std::fabs(ref) + 1e-300);

  double rel   = std::fabs(gpu - ref) / (std::fabs(ref) + 1e-300);
  // Threshold 1e-9, NOT 1e-12: GPU partial sums and the CPU sequential sum
  // add the same 1e8 terms in DIFFERENT orders; double-precision rounding
  // then legitimately differs by ~n*eps ~ 1e-10 relative. (The CPU
  // self-check above uses the identical order and must match to ~0.)
  double bytes = 2.0 * (double)N * sizeof(double);  // read x and y once
  printf("CPU : %9.3f ms   (%7.1f GB/s effective)\n", ms_cpu,
         bytes / (ms_cpu * 1e-3) / 1e9);
  printf("CPU self-check (2nd run vs ref): rel = %.3e -> %s\n", cpu_rel,
         cpu_rel < 1e-12 ? "PASS" : "FAIL");
  printf("GPU : %9.3f ms   (%7.1f GB/s effective)\n", ms_gpu,
         bytes / (ms_gpu * 1e-3) / 1e9);
  printf("speedup : %.1fx\n", ms_cpu / ms_gpu);
  printf("CPU ref = %.12e\n", ref);
  printf("GPU res = %.12e\n", gpu);
  printf("rel diff = %.3e -> %s\n", rel, rel < 1e-9 ? "PASS" : "FAIL");

  free(hx); free(hy); free(hout);
  cudaFree(dx); cudaFree(dy); cudaFree(dout);
  return 0;
}
