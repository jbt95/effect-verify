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

Apple M5, macOS 26.6.2, Node.js 26.9.0, pnpm 11.18.0, Vitest 4.1.4, pinned Z3 solver.
These are one run, not performance guarantees.

| Workload                                     | p50 (ms) | p95 (ms) | p99 (ms) | Samples |
| -------------------------------------------- | -------: | -------: | -------: | ------: |
| Compile a 1,000-assertion core proof         |     0.27 |     0.40 |     1.64 |     100 |
| Verify 1,000 assertions                      |    61.42 |    71.33 |    73.62 |     100 |
| Verify 2,000 assertions                      |   118.63 |   138.05 |   144.07 |     100 |
| Verify 8 assertions with a mixed failure     |    20.10 |    22.97 |    23.77 |     100 |
| Verify one independent proof                 |     6.43 |     7.21 |     7.76 |     500 |
| Compile a TypeScript source proof            |   210.11 |   238.19 |   248.39 |     100 |
| Verify a precompiled TypeScript source proof |     6.74 |     7.37 |     7.82 |     100 |
| Compile and verify a TypeScript source proof |   216.09 |   234.08 |   257.56 |     100 |
| 16 concurrent requests on one backend        |    51.08 |    99.84 |   110.73 |     320 |

The main p99 finding is that compiling a TypeScript source proof takes roughly 31 times as
long at p50 as verifying its already-compiled program. The source frontend, not the Z3
wrapper, dominates this path; a Rust rewrite of the solver wrapper is therefore not
supported by these measurements. Compiling the related source module through the
already-loaded TypeScript `Program` reduced source-compilation p50 from about 320 ms to
about 210 ms. Backend verification under 16 concurrent submissions reaches about 111 ms
p99 because one backend serializes solver work.

Source compilation is linear in the length of a statement chain. Each `if` used to
re-lower its own continuation once per branch, so a chain of N sequential `if`
statements cost time exponential in N. That cost is now paid once per statement: a
30-`if` chain that previously took minutes to lower compiles in well under a second.

The backend explicitly releases each Z3 solver and decoded counterexample model. Repeated
benchmark runs had intermittently failed with a WASM `memory access out of bounds` error
before deterministic release was added; the full repeated benchmark and the serial test
suite passed afterward. This is evidence consistent with delayed native cleanup, though it
does not prove that cleanup was the only cause of the earlier failures.

An older smoke run used a single warmup-free sample and reported 154.98 ms for 1,000
assertions, 120.25 ms for 2,000 assertions, and 6,103.31 ms for 1,000 independent proofs.
Its methodology differs, so do not compare those numbers directly with the repeated
latency results above.
