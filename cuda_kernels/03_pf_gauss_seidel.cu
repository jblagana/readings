// ============================================================================
// 03_pf_gauss_seidel.cu -- Minimal CUDA kernel #3: a tiny AC power flow
//
// A 5-bus system, all data hard-coded in per-unit (pu):
//   bus 1: swing, V = 1.00 angle 0
//   bus 2: PQ load  0.20 + j0.10
//   bus 3: PV gen   P = 0.30, |V| = 1.02
//   bus 4: PQ load  0.15 + j0.05
//   bus 5: PQ load  0.10 + j0.05
//
// Two solvers, identical physics:
//   CPU : classic Gauss-Seidel (sequential, uses the freshest updates)
//   GPU : Jacobi sweep (every bus updates from the PREVIOUS iteration's
//         voltages -> no data dependency -> fully parallel, 1 thread/bus)
// Both converge to the same solution; the program compares them to
// validate the GPU code, then reports the swing-bus generation and losses.
//
// The point is NOT speed (5 buses is launch-overhead-bound) -- it is to
// show the exact loop structure you would scale to 100k+ buses, and to
// make the CPU-vs-GPU verification habit concrete.
//
// Build:  nvcc -O3 -arch=sm_80 03_pf_gauss_seidel.cu -o 03_pf_gauss_seidel
// Run:    ./03_pf_gauss_seidel
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

#define NB 5
#define NL 6
#define TOL 1e-11
#define MAXIT 20000

// line data (1-based bus numbers):  from, to, r, x
static const int    L_FROM[] = {1, 1, 2, 2, 3, 4};
static const int    L_TO[]   = {2, 3, 3, 4, 5, 5};
static const double L_R[]    = {0.005, 0.010, 0.005, 0.010, 0.0075, 0.0125};
static const double L_X[]    = {0.020, 0.030, 0.015, 0.040, 0.025, 0.050};

// bus types: 0 = swing, 1 = PQ, 2 = PV
static const int    BUS_TYPE[] = {0, 1, 2, 1, 1};
static const double BUS_P[]    = {0.0, -0.20, 0.30, -0.15, -0.10};  // net inj.
static const double BUS_Q[]    = {0.0, -0.10, 0.0, -0.05, -0.05};   // PQ spec
static const double BUS_VM[]   = {1.00, 0.0, 1.02, 0.0, 0.0};       // |V| spec

// Build Ybus (flat NB*NB real/imag arrays) from line data.
static void build_ybus(double* Yre, double* Yim) {
  for (int i = 0; i < NB * NB; ++i) { Yre[i] = 0.0; Yim[i] = 0.0; }
  for (int l = 0; l < NL; ++l) {
    int i = L_FROM[l] - 1, j = L_TO[l] - 1;
    double r = L_R[l], x = L_X[l];
    double g = r / (r * r + x * x);    // y = 1/(r+jx) = g + jb
    double b = -x / (r * r + x * x);
    Yre[i * NB + i] += g; Yim[i * NB + i] += b;
    Yre[j * NB + j] += g; Yim[j * NB + j] += b;
    Yre[i * NB + j] -= g; Yim[i * NB + j] -= b;
    Yre[j * NB + i] -= g; Yim[j * NB + i] -= b;
  }
}

// One parallel Jacobi sweep. Update rule (textbook fixed-point form):
//   S_i = Y_ii V_i^2 + V_i * B_i   with  B_i = sum_{j!=i} Y_ij V_j
//   V_i_new = ( conj(S_i)/V_i_old - B_i ) / Y_ii
// PV buses use the previous Q estimate, enforce their |V| spec afterwards,
// and refresh the Q estimate.
__global__ void jacobi_sweep(const double* Yre, const double* Yim,
                             const int* type, const double* P,
                             const double* Q, const double* vm,
                             const double* vre, const double* vim,
                             const double* qest,
                             double* nre, double* nim, double* qout,
                             int nb) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= nb) return;
  if (type[i] == 0) { nre[i] = vre[i]; nim[i] = vim[i]; return; }  // swing
  double Vre = vre[i], Vim = vim[i];
  double m2 = Vre * Vre + Vim * Vim;
  if (m2 < 1e-16) { nre[i] = Vre; nim[i] = Vim; qout[i] = Q[i]; return; }
  double Yii_re = Yre[i * nb + i], Yii_im = Yim[i * nb + i];
  double B_re = 0.0, B_im = 0.0;
  for (int j = 0; j < nb; ++j) {
    if (j == i) continue;
    double yre = Yre[i * nb + j], yim = Yim[i * nb + j];
    B_re += yre * vre[j] - yim * vim[j];
    B_im += yre * vim[j] + yim * vre[j];
  }
  double Qi = (type[i] == 2) ? qest[i] : Q[i];
  // Correct GS/Jacobi update (the textbook form), derived from S = V*conj(I):
  //   V_new = (1/Y_ii) * ( conj(S)/conj(V_old) - B ),  B = sum_{j!=i} Y_ij V_j
  // Note conj(S)/conj(V) = conj(S)*V/|V|^2 -- S divided by the CONJUGATE of
  // the old voltage. Its fixed point satisfies V*conj(I) = S, the true
  // power equation. (The look-alikes (conj(S)/V - B)/Y_ii and
  // (S/V - B)/Y_ii solve the conjugate problem; S/conj(I_old) is correct
  // but not a contraction on every system. Three debugging runs taught us
  // to check the power balance, not just convergence -- see doc 02, 5.3.)
  double A_re = (P[i] * Vre + Qi * Vim) / m2;
  double A_im = (P[i] * Vim - Qi * Vre) / m2;
  double C_re = A_re - B_re, C_im = A_im - B_im;
  double d = Yii_re * Yii_re + Yii_im * Yii_im;
  double nre_i = (C_re * Yii_re + C_im * Yii_im) / d;   // V_new = C / Y_ii
  double nim_i = (C_im * Yii_re - C_re * Yii_im) / d;
  if (type[i] == 2) {  // PV: keep phase, enforce specified magnitude
    double m = sqrt(nre_i * nre_i + nim_i * nim_i);
    if (m < 1e-16) m = 1e-16;
    nre_i *= vm[i] / m; nim_i *= vm[i] / m;
    // refresh Q estimate from OLD values (Jacobi-consistent):
    // I_old = Y_ii*V_old + B;  Q = Im(V*conj(I)) = Vim*Ire - Vre*Iim
    double I_re = Yii_re * Vre - Yii_im * Vim + B_re;
    double I_im = Yii_re * Vim + Yii_im * Vre + B_im;
    qout[i] = Vim * I_re - Vre * I_im;
  } else {
    qout[i] = Q[i];
  }
  nre[i] = nre_i; nim[i] = nim_i;
}
int main() {
  cudaDeviceProp prop;
  CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));
  printf("device : %s\n", prop.name);
  printf("5-bus AC power flow: CPU Gauss-Seidel vs GPU Jacobi\n");
  printf("tol = %.1e, max sweeps = %d\n\n", TOL, MAXIT);

  // ---- build Ybus on host, upload all data ----
  double Yre[NB * NB], Yim[NB * NB];
  build_ybus(Yre, Yim);
  double *d_Yre, *d_Yim, *d_P, *d_Q, *d_vm, *d_vre[2], *d_vim[2], *d_qe[2];
  int *d_type;
  CUDA_CHECK(cudaMalloc(&d_Yre, NB * NB * sizeof(double)));
  CUDA_CHECK(cudaMalloc(&d_Yim, NB * NB * sizeof(double)));
  CUDA_CHECK(cudaMalloc(&d_type, NB * sizeof(int)));
  CUDA_CHECK(cudaMalloc(&d_P, NB * sizeof(double)));
  CUDA_CHECK(cudaMalloc(&d_Q, NB * sizeof(double)));
  CUDA_CHECK(cudaMalloc(&d_vm, NB * sizeof(double)));
  CUDA_CHECK(cudaMemcpy(d_Yre, Yre, NB * NB * sizeof(double),
                        cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_Yim, Yim, NB * NB * sizeof(double),
                        cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_type, BUS_TYPE, NB * sizeof(int),
                        cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_P, BUS_P, NB * sizeof(double),
                        cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_Q, BUS_Q, NB * sizeof(double),
                        cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_vm, BUS_VM, NB * sizeof(double),
                        cudaMemcpyHostToDevice));

  double v0[NB] = {1.0, 1.0, BUS_VM[2], 1.0, 1.0};  // flat start
  double q0[NB] = {0.0, 0.0, 0.0, 0.0, 0.0};        // Q estimates (PV bus)
  for (int b = 0; b < 2; ++b) {
    CUDA_CHECK(cudaMalloc(&d_vre[b], NB * sizeof(double)));
    CUDA_CHECK(cudaMalloc(&d_vim[b], NB * sizeof(double)));
    CUDA_CHECK(cudaMalloc(&d_qe[b], NB * sizeof(double)));
    CUDA_CHECK(cudaMemcpy(d_vre[b], v0, NB * sizeof(double),
                          cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemset(d_vim[b], 0, NB * sizeof(double)));
    CUDA_CHECK(cudaMemcpy(d_qe[b], q0, NB * sizeof(double),
                          cudaMemcpyHostToDevice));
  }

  // ---- GPU Jacobi, double buffered. Per-iteration host sync is fine at
  //      5 buses; a production solver syncs only every K sweeps. ----
  int cur = 0, nxt = 1, gpu_iters = MAXIT;
  bool gpu_conv = false;
  cudaEvent_t g0, g1;
  CUDA_CHECK(cudaEventCreate(&g0));
  CUDA_CHECK(cudaEventCreate(&g1));
  CUDA_CHECK(cudaEventRecord(g0));
  for (int it = 0; it < MAXIT; ++it) {
    jacobi_sweep<<<1, 16>>>(d_Yre, d_Yim, d_type, d_P, d_Q, d_vm,
                            d_vre[cur], d_vim[cur], d_qe[cur],
                            d_vre[nxt], d_vim[nxt], d_qe[nxt], NB);
    CUDA_CHECK(cudaDeviceSynchronize());
    double ore[NB], oim[NB], nre[NB], nim[NB];
    CUDA_CHECK(cudaMemcpy(ore, d_vre[cur], NB * sizeof(double),
                          cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(oim, d_vim[cur], NB * sizeof(double),
                          cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(nre, d_vre[nxt], NB * sizeof(double),
                          cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(nim, d_vim[nxt], NB * sizeof(double),
                          cudaMemcpyDeviceToHost));
    double maxd = 0.0;
    for (int i = 0; i < NB; ++i) {
      double dr = nre[i] - ore[i], di = nim[i] - oim[i];
      double dd = sqrt(dr * dr + di * di);
      if (dd > maxd) maxd = dd;
    }
    int sw = cur; cur = nxt; nxt = sw;
    if (maxd < TOL) { gpu_conv = true; gpu_iters = it + 1; break; }
  }
  CUDA_CHECK(cudaEventRecord(g1));
  CUDA_CHECK(cudaEventSynchronize(g1));
  float ms_gpu_total = 0.f;
  CUDA_CHECK(cudaEventElapsedTime(&ms_gpu_total, g0, g1));
  // ---- CPU Gauss-Seidel, in-place (sequential, uses freshest updates) ----
  double vre[NB], vim[NB], qe[NB];
  for (int i = 0; i < NB; ++i) { vre[i] = v0[i]; vim[i] = 0.0; qe[i] = 0.0; }
  int cpu_iters = MAXIT;
  bool cpu_conv = false;
  auto h0 = std::chrono::high_resolution_clock::now();
  for (int it = 0; it < MAXIT; ++it) {
    double maxd = 0.0;
    for (int i = 1; i < NB; ++i) {  // skip swing bus
      double Vre = vre[i], Vim = vim[i];
      double m2 = Vre * Vre + Vim * Vim;
      double B_re = 0.0, B_im = 0.0;
      for (int j = 0; j < NB; ++j) {
        if (j == i) continue;
        double yre = Yre[i * NB + j], yim = Yim[i * NB + j];
        B_re += yre * vre[j] - yim * vim[j];
        B_im += yre * vim[j] + yim * vre[j];
      }
      double Qi = (BUS_TYPE[i] == 2) ? qe[i] : BUS_Q[i];
      // Textbook GS: V_new = (1/Y_ii)*(conj(S)/conj(V_old) - B), B with
      // freshest neighbours. conj(S)/conj(V) = conj(S)*V/|V|^2
      double A_re = (BUS_P[i] * Vre + Qi * Vim) / m2;
      double A_im = (BUS_P[i] * Vim - Qi * Vre) / m2;
      double C_re = A_re - B_re, C_im = A_im - B_im;
      double d = Yre[i * NB + i] * Yre[i * NB + i] +
                 Yim[i * NB + i] * Yim[i * NB + i];
      double nre_i = (C_re * Yre[i * NB + i] + C_im * Yim[i * NB + i]) / d;
      double nim_i = (C_im * Yre[i * NB + i] - C_re * Yim[i * NB + i]) / d;
      if (BUS_TYPE[i] == 2) {  // PV: enforce |V|, refresh Q estimate
        double m = sqrt(nre_i * nre_i + nim_i * nim_i);
        if (m < 1e-16) m = 1e-16;
        nre_i *= BUS_VM[i] / m; nim_i *= BUS_VM[i] / m;
        // GS convention: Q from NEW V_i and current neighbours
        double In_re = Yre[i * NB + i] * nre_i - Yim[i * NB + i] * nim_i + B_re;
        double In_im = Yre[i * NB + i] * nim_i + Yim[i * NB + i] * nre_i + B_im;
        // Q = Im(V * conj(I)) = Vim*Ire - Vre*Iim
        qe[i] = nim_i * In_re - nre_i * In_im;
      }
      double dr = nre_i - Vre, di = nim_i - Vim;
      double dd = sqrt(dr * dr + di * di);
      if (dd > maxd) maxd = dd;
      vre[i] = nre_i; vim[i] = nim_i;
    }
    if (maxd < TOL) { cpu_conv = true; cpu_iters = it + 1; break; }
  }
  auto h1 = std::chrono::high_resolution_clock::now();
  double ms_cpu_total =
      std::chrono::duration<double, std::milli>(h1 - h0).count();

  // ---- verify: GPU Jacobi vs CPU GS (same physics, must agree) ----
  double fre[NB], fim[NB];
  CUDA_CHECK(cudaMemcpy(fre, d_vre[cur], NB * sizeof(double),
                        cudaMemcpyDeviceToHost));
  CUDA_CHECK(cudaMemcpy(fim, d_vim[cur], NB * sizeof(double),
                        cudaMemcpyDeviceToHost));
  double maxdiff = 0.0;
  for (int i = 0; i < NB; ++i) {
    double dr = fre[i] - vre[i], di = fim[i] - vim[i];
    double dd = sqrt(dr * dr + di * di);
    if (dd > maxdiff) maxdiff = dd;
  }

  // ---- power analysis at the (converged) CPU GS solution ----
  double I1_re = 0.0, I1_im = 0.0;
  for (int j = 0; j < NB; ++j) {
    I1_re += Yre[j] * vre[j] - Yim[j] * vim[j];
    I1_im += Yre[j] * vim[j] + Yim[j] * vre[j];
  }
  double P1 = vre[0] * I1_re - vim[0] * I1_im;  // swing P
  double Q1 = vre[0] * I1_im + vim[0] * I1_re;  // swing Q
  double P_loss = 0.0;
  for (int l = 0; l < NL; ++l) {
    int i = L_FROM[l] - 1, j = L_TO[l] - 1;
    double r = L_R[l], x = L_X[l];
    double g = r / (r * r + x * x), b = -x / (r * r + x * x);
    double dvr = vre[i] - vre[j], dvi = vim[i] - vim[j];
    double Ire = g * dvr - b * dvi, Iim = g * dvi + b * dvr;
    P_loss += (Ire * Ire + Iim * Iim) * r;
  }

  printf("CPU GS    : %6d sweeps, total %8.3f ms (%8.4f ms/sweep) %s\n",
         cpu_iters, ms_cpu_total, ms_cpu_total / cpu_iters,
         cpu_conv ? "converged" : "NOT converged!");
  printf("GPU Jacobi: %6d sweeps, total %8.3f ms (%8.4f ms/sweep) %s\n",
         gpu_iters, (double)ms_gpu_total, ms_gpu_total / gpu_iters,
         gpu_conv ? "converged" : "NOT converged!");
  printf("(5-bus GPU times are launch/sync-overhead dominated, as expected;)\n");
  printf("(a 100k-bus system would be memory-bandwidth dominated like 02.)\n");
  printf("Max |dV| between GPU and CPU solutions: %.3e -> %s\n\n", maxdiff,
         (cpu_conv && gpu_conv && maxdiff < 1e-7) ? "PASS" : "FAIL");
  for (int i = 0; i < NB; ++i)
    printf("bus %d: V = %8.5f %c %8.5f pu\n", i + 1, vre[i],
           vim[i] >= 0 ? '+' : ' ', vim[i]);
  printf("\nSwing bus 1: P = %.4f pu, Q = %.4f pu\n", P1, Q1);
  printf("Total load 0.4500 pu, PV gen 0.3000 pu, losses %.4f pu\n", P_loss);
  printf("Power balance residual (should be ~0): %.3e\n",
         (P1 + 0.30) - 0.45 - P_loss);
  return 0;
}