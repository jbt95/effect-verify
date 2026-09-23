# Benchmarks

Run the latency benchmark from the repository root:

```sh
pnpm benchmark
```

This builds the workspace, then runs `benchmarks/verification.bench.ts` in Vitest benchmark mode. It uses explicit warmup iterations and repeated samples; the custom report gives nearest-rank p50, p95, and p99 in milliseconds. The benchmark takes about 100 seconds on the reference machine. Percentiles from 100 samples are still rough tail estimates, not service-level guarantees.

## Workloads

| Workload                                        |      Samples | What it measures                                                                                |
| ----------------------------------------------- | -----------: | ----------------------------------------------------------------------------------------------- |
| Compile a 1,000-assertion core proof            |          100 | Core proof-builder compilation, without Z3.                                                     |
| Verify 1,000 / 2,000 assertions                 |     100 each | Backend verification of precompiled, all-pass proofs.                                           |
| Verify 8 assertions with a mixed failure        |          100 | The batched query's failing path, individual fallback, and counterexample decoding.             |
| Verify one independent proof                    |          500 | A single small backend verification per sample.                                                 |
| Compile a TypeScript source proof               |          100 | TypeScript frontend compilation without Z3.                                                     |
| Verify a precompiled TypeScript source proof    |          100 | Backend verification without frontend compilation.                                              |
| Compile and verify a TypeScript source proof    |          100 | The combined in-process path.                                                                   |
| 16 concurrent independent proofs on one backend | 320 requests | Per-request latency under concurrent submission to the serialized backend; includes queue wait. |

The benchmark uses bounded integer examples to make solver and wrapper costs visible. Real formulas and deployment conditions can have very different latency. All-pass and failure cases must return their expected results or the benchmark fails.

## Latest reference run

Apple M2 Pro, macOS 26.6.2, Node.js 26.5.1, pnpm 11.18.0, Vitest 4.1.4, pinned Z3 solver. These are one run, not performance guarantees.

| Workload                                     | p50 (ms) | p95 (ms) | p99 (ms) | Samples |
| -------------------------------------------- | -------: | -------: | -------: | ------: |
| Compile a 1,000-assertion core proof         |     0.42 |     0.57 |     1.96 |     100 |
| Verify 1,000 assertions                      |    59.10 |    64.23 |    65.09 |     100 |
| Verify 2,000 assertions                      |   113.34 |   119.33 |   122.56 |     100 |
| Verify 8 assertions with a mixed failure     |    17.90 |    18.67 |    19.89 |     100 |
| Verify one independent proof                 |     5.75 |     6.12 |     6.71 |     500 |
| Compile a TypeScript source proof            |   320.23 |   348.46 |   377.69 |     100 |
| Verify a precompiled TypeScript source proof |     6.91 |     7.91 |     8.19 |     100 |
| Compile and verify a TypeScript source proof |   325.98 |   352.80 |   383.09 |     100 |
| 16 concurrent requests on one backend        |    49.39 |    90.39 |    93.16 |     320 |

The main p99 finding is that compiling a TypeScript source proof takes about 46 times as long at p50 as verifying its already-compiled program. The source frontend, not the Z3 wrapper, dominates this path; a Rust rewrite of the solver wrapper is therefore not supported by these measurements. Compiling the related source module through the already-loaded TypeScript `Program` reduced source-compilation p50 from about 384 ms to about 320 ms in this run. Backend verification under 16 concurrent submissions reaches about 93 ms p99 because one backend serializes solver work.

The backend now explicitly releases each Z3 solver and decoded counterexample model. Repeated benchmark runs had intermittently failed with a WASM `memory access out of bounds` error before deterministic release was added; the full repeated benchmark and the serial test suite passed afterward. This is evidence consistent with delayed native cleanup, though it does not prove that cleanup was the only cause of the earlier failures.

An older smoke run used a single warmup-free sample and reported 154.98 ms for 1,000 assertions, 120.25 ms for 2,000 assertions, and 6,103.31 ms for 1,000 independent proofs. Its methodology differs, so do not compare those numbers directly with the repeated latency results above. The earlier reference run was on the same M2 Pro with macOS 25.6.0; both used Node.js 26.5.1, pnpm 11.18.0, Vitest 4.1.4, and the pinned Z3 solver.
