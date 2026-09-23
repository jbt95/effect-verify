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

## Reference run

These numbers came from one `pnpm benchmark` run on an Apple M2 Pro Mac, macOS 25.6.0, Node.js 26.5.1, pnpm 11.18.0, Vitest 4.1.4, and the pinned Z3 solver. The benchmark intentionally uses one sample and no warmup, so this is a smoke-scale reference, not a stable performance guarantee.

| Workload                        | Mean wall time | Batch throughput |
| ------------------------------- | -------------: | ---------------: |
| `1,000 assertions in one proof` |    1,484.10 ms |   0.67 batches/s |
| `2,000 assertions in one proof` |    2,651.92 ms |   0.38 batches/s |
| `1,000 independent proof runs`  |    7,259.45 ms |   0.14 batches/s |

The independent workload is slower per proof than a single 1,000-assertion proof because each proof creates its own solver check. Compare results only on the same host and with the same benchmark configuration. Run the benchmark again on the target machine before using these numbers for capacity planning.

For a normal run, use `pnpm test`. For a focused benchmark file, run `pnpm exec vitest bench benchmarks/verification.bench.ts` after `pnpm build`.
