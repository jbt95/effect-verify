# Benchmarks

The repository includes a repeatable Vitest benchmark for solver throughput at test-suite scale. It is separate from `pnpm test` so normal correctness runs stay fast and deterministic.

## Run the benchmark

From the repository root:

```sh
pnpm benchmark
```

The script builds the workspace, then runs `benchmarks/verification.bench.ts` in Vitest benchmark mode. It uses one warmup-free sample per workload so the large cases do not repeat unnecessarily. Benchmark timings still vary with CPU load, Node version, Z3 worker startup, and system thermals.

The benchmark reuses one backend instance and prepares proof programs before measuring. The backend also reuses one Z3 context and creates a fresh solver for each proof, so the independent-proof workload measures solver checks without creating a new Z3 context for every case. Each workload therefore measures verification work rather than module imports or proof compilation.

## Workloads

| Workload                        | What it measures                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `1,000 assertions in one proof` | One backend verification with 1,000 assertions sharing one input domain.                       |
| `2,000 assertions in one proof` | Solver and backend scaling as a single proof grows to 2,000 assertions.                        |
| `1,000 independent proof runs`  | 1,000 separate backend verifications, which is closer to a suite containing many small proofs. |

All workloads must return `Verified`; an unexpected `Failed` or operational error fails the benchmark. These workloads use small bounded integer properties to make solver and backend overhead visible; add domain-specific formulas before using the numbers for a complex application. The independent runs execute sequentially because one backend instance serializes solver checks. The benchmark does not report a universal performance threshold because solver performance depends on the host and the encoded formula.

## Reference runs

Both tables below use one warmup-free sample per workload. They are smoke-scale references, not stable performance guarantees. The latest run includes batched assertion checks; the machine had the same CPU and Node version as the previous run, but a different macOS version, so treat the comparison as directional.

| Workload                        | Previous reference |  Latest run | Latest throughput |
| ------------------------------- | -----------------: | ----------: | ----------------: |
| `1,000 assertions in one proof` |        1,484.10 ms |   154.98 ms |    6.45 batches/s |
| `2,000 assertions in one proof` |        2,651.92 ms |   120.25 ms |    8.32 batches/s |
| `1,000 independent proof runs`  |        7,259.45 ms | 6,103.31 ms |    0.16 batches/s |

The previous reference was recorded on an Apple M2 Pro Mac running macOS 25.6.0. The latest run was recorded on the same model with macOS 26.6.2. Both used Node.js 26.5.1, pnpm 11.18.0, Vitest 4.1.4, and the pinned Z3 solver.

The latest 1,000- and 2,000-assertion workloads use the batched fast path when all assertions pass. The independent-proof workload does not, and still pays for a solver check per proof. In this run, the 2,000-assertion result was faster than the 1,000-assertion result. Since each workload runs once, in order, don't read these measurements as a scaling curve. Repeat the benchmark under stable conditions before using the numbers for capacity planning.

For a normal run, use `pnpm test`. For a focused benchmark file, run `pnpm exec vitest bench benchmarks/verification.bench.ts` after `pnpm build`.
