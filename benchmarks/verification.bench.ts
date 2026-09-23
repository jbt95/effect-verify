import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { afterAll, beforeAll, bench } from "vitest";
import type { Proof, VerificationProgram, VerificationResult } from "@effect-verifier/core";
import { Sym, Verify, compileProof } from "@effect-verifier/core";
import { compileSourceProof } from "@effect-verifier/typescript";
import { makeZ3Backend } from "@effect-verifier/z3";
import type { Z3Backend } from "@effect-verifier/z3";
import { clampIsNonNegative } from "../examples/source/proof.ts";

const repeatedOptions = {
  iterations: 100,
  time: 0,
  warmupIterations: 10,
  warmupTime: 0,
} as const;

const perProofOptions = {
  iterations: 500,
  time: 0,
  warmupIterations: 50,
  warmupTime: 0,
} as const;

const failureOptions = {
  iterations: 100,
  time: 0,
  warmupIterations: 10,
  warmupTime: 0,
} as const;

const concurrentOptions = {
  iterations: 20,
  time: 0,
  warmupIterations: 3,
  warmupTime: 0,
} as const;

interface LatencySamples {
  readonly label: string;
  readonly warmupIterations: number;
  completed: number;
  readonly values: Array<number>;
}

const makeLatencySamples = (label: string, warmupIterations: number): LatencySamples => ({
  label,
  warmupIterations,
  completed: 0,
  values: [],
});

const recordLatency = async (
  samples: LatencySamples,
  operation: () => Promise<void>,
): Promise<void> => {
  const startedAt = performance.now();
  await operation();
  const elapsed = performance.now() - startedAt;

  if (samples.completed >= samples.warmupIterations) samples.values.push(elapsed);
  samples.completed += 1;
};

const nearestRank = (values: ReadonlyArray<number>, percentile: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1);
  const result = sorted[index];

  if (result === undefined) throw new Error("Cannot calculate a percentile without samples");

  return result;
};

const reportLatencies = (samples: ReadonlyArray<LatencySamples>): void => {
  const report = samples.flatMap(({ label, values }) =>
    values.length === 0
      ? []
      : [
          `${label}: n=${values.length}, p50=${nearestRank(values, 50).toFixed(2)} ms, p95=${nearestRank(values, 95).toFixed(2)} ms, p99=${nearestRank(values, 99).toFixed(2)} ms`,
        ],
  );

  if (report.length > 0) {
    console.info(`\nLatency percentiles (nearest rank; warmup excluded):\n${report.join("\n")}`);
  }
};

const makeBatchProof = (assertionCount: number): Proof<never> =>
  Verify.proof(
    `benchmark-${assertionCount}-assertions`,
    Effect.gen(function* () {
      const value = yield* Verify.any(Verify.integer({ min: 0, max: 255 }), {
        name: "value",
      });

      for (let index = 0; index < assertionCount; index += 1) {
        yield* Verify.assert(Sym.lte(value, Sym.literal(1_000 + index)), `bounded value ${index}`);
      }
    }),
  );

const failingIndexes = new Set([0]);

const makeMixedFailureProof = (): Proof<never> =>
  Verify.proof(
    "benchmark-mixed-failures",
    Effect.gen(function* () {
      const value = yield* Verify.any(Verify.integer({ min: 0, max: 255 }), {
        name: "value",
      });

      for (let index = 0; index < 8; index += 1) {
        yield* Verify.assert(
          failingIndexes.has(index)
            ? Sym.lt(value, Sym.literal(100))
            : Sym.lte(value, Sym.literal(1_000 + index)),
          `assertion ${index}`,
        );
      }
    }),
  );

const makeIndependentProof = (index: number): Proof<never> =>
  Verify.proof(
    `benchmark-independent-${index}`,
    Effect.gen(function* () {
      const value = yield* Verify.any(Verify.integer({ min: 0, max: 255 }), {
        name: "value",
      });

      yield* Verify.assert(
        Sym.lte(value, Sym.literal(256 + index)),
        `value ${index} stays in range`,
      );
    }),
  );

const compile = <E>(proof: Proof<E>): Promise<VerificationProgram> =>
  Effect.runPromise(compileProof(proof));

const requireVerified = (result: VerificationResult, name: string): void => {
  if (result.kind !== "Verified") {
    throw new Error(`${name} unexpectedly returned ${result.kind}`);
  }
};

const requireExpectedFailures = (result: VerificationResult): void => {
  if (result.kind !== "Failed") {
    throw new Error(`Mixed-failure proof unexpectedly returned ${result.kind}`);
  }

  const actual = result.failures.map(({ assertion }) => assertion);
  const expected = [...failingIndexes].map((index) => `assertion ${index}`);

  if (actual.join("|") !== expected.join("|")) {
    throw new Error(`Expected failures ${expected.join(", ")}, got ${actual.join(", ")}`);
  }
};

const sourceProofPath = fileURLToPath(new URL("../examples/source/proof.ts", import.meta.url));

const compileSource = (): VerificationProgram =>
  compileSourceProof(clampIsNonNegative, sourceProofPath, "clampIsNonNegative");

const batchSamples = makeLatencySamples(
  "Verify 1,000 assertions",
  repeatedOptions.warmupIterations,
);

const doubleBatchSamples = makeLatencySamples(
  "Verify 2,000 assertions",
  repeatedOptions.warmupIterations,
);

const failureSamples = makeLatencySamples(
  "Verify 8 assertions with a mixed failure",
  failureOptions.warmupIterations,
);

const independentSamples = makeLatencySamples(
  "Verify one independent proof",
  perProofOptions.warmupIterations,
);

const compileSamples = makeLatencySamples(
  "Compile a 1,000-assertion core proof",
  repeatedOptions.warmupIterations,
);

const sourceCompileSamples = makeLatencySamples(
  "Compile a TypeScript source proof",
  failureOptions.warmupIterations,
);

const sourceVerifySamples = makeLatencySamples(
  "Verify a precompiled TypeScript source proof",
  repeatedOptions.warmupIterations,
);

const sourceEndToEndSamples = makeLatencySamples(
  "Compile and verify a TypeScript source proof",
  failureOptions.warmupIterations,
);

let backend: Z3Backend;

let oneThousandAssertionProof: Proof<never>;

let oneThousandAssertions: VerificationProgram;

let twoThousandAssertions: VerificationProgram;

let mixedFailureProgram: VerificationProgram;

let sourceProgram: VerificationProgram;

let oneThousandIndependentProofs: ReadonlyArray<VerificationProgram>;

let nextIndependentProof = 0;

const concurrentRequestCount = 16;

let concurrentBatchIndex = 0;

const concurrentRequestLatencies: Array<number> = [];

beforeAll(async () => {
  backend = await Effect.runPromise(makeZ3Backend());
  oneThousandAssertionProof = makeBatchProof(1_000);

  const [compiledOneThousand, compiledTwoThousand, compiledFailures] = await Promise.all([
    compile(oneThousandAssertionProof),
    compile(makeBatchProof(2_000)),
    compile(makeMixedFailureProof()),
  ]);

  oneThousandAssertions = compiledOneThousand;
  twoThousandAssertions = compiledTwoThousand;
  mixedFailureProgram = compiledFailures;
  sourceProgram = compileSource();
  oneThousandIndependentProofs = await Promise.all(
    Array.from({ length: 1_000 }, (_, index) => compile(makeIndependentProof(index))),
  );
});

afterAll(async () => {
  reportLatencies([
    compileSamples,
    batchSamples,
    doubleBatchSamples,
    failureSamples,
    independentSamples,
    sourceCompileSamples,
    sourceVerifySamples,
    sourceEndToEndSamples,
  ]);

  if (concurrentRequestLatencies.length > 0) {
    const concurrent = makeLatencySamples("16 concurrent requests on one backend", 0);
    concurrent.values.push(...concurrentRequestLatencies);
    reportLatencies([concurrent]);
  }

  await Effect.runPromise(backend.close());
});

bench(
  "Compile a 1,000-assertion core proof",
  async () =>
    recordLatency(compileSamples, async () => {
      const program = await compile(oneThousandAssertionProof);

      if (program.assertions.length !== 1_000) throw new Error("Unexpected assertion count");
    }),
  repeatedOptions,
);

bench(
  "1,000 assertions in one proof",
  async () =>
    recordLatency(batchSamples, async () => {
      requireVerified(
        await Effect.runPromise(backend.verify(oneThousandAssertions)),
        "1,000-assertion proof",
      );
    }),
  repeatedOptions,
);

bench(
  "2,000 assertions in one proof",
  async () =>
    recordLatency(doubleBatchSamples, async () => {
      requireVerified(
        await Effect.runPromise(backend.verify(twoThousandAssertions)),
        "2,000-assertion proof",
      );
    }),
  repeatedOptions,
);

bench(
  "8 assertions with a mixed failure",
  async () =>
    recordLatency(failureSamples, async () => {
      requireExpectedFailures(await Effect.runPromise(backend.verify(mixedFailureProgram)));
    }),
  failureOptions,
);

bench(
  "One independent proof run",
  async () =>
    recordLatency(independentSamples, async () => {
      const program = oneThousandIndependentProofs[nextIndependentProof];

      if (program === undefined) throw new Error("Missing independent proof program");
      nextIndependentProof = (nextIndependentProof + 1) % oneThousandIndependentProofs.length;
      requireVerified(await Effect.runPromise(backend.verify(program)), "independent proof");
    }),
  perProofOptions,
);

bench(
  "Compile a TypeScript source proof",
  async () =>
    recordLatency(sourceCompileSamples, async () => {
      compileSource();
    }),
  failureOptions,
);

bench(
  "Verify a precompiled TypeScript source proof",
  async () =>
    recordLatency(sourceVerifySamples, async () => {
      requireVerified(await Effect.runPromise(backend.verify(sourceProgram)), "source proof");
    }),
  repeatedOptions,
);

bench(
  "Compile and verify a TypeScript source proof",
  async () =>
    recordLatency(sourceEndToEndSamples, async () => {
      const program = compileSource();
      requireVerified(await Effect.runPromise(backend.verify(program)), "source proof");
    }),
  failureOptions,
);

bench(
  "16 concurrent independent proofs on one backend",
  async () => {
    const batchIndex = concurrentBatchIndex;
    concurrentBatchIndex += 1;

    const results = await Promise.all(
      Array.from({ length: concurrentRequestCount }, async (_, index) => {
        const programIndex =
          (batchIndex * concurrentRequestCount + index) % oneThousandIndependentProofs.length;

        const program = oneThousandIndependentProofs[programIndex];

        if (program === undefined) throw new Error("Missing independent proof program");

        const requestStartedAt = performance.now();
        requireVerified(
          await Effect.runPromise(backend.verify(program)),
          "concurrent independent proof",
        );

        return performance.now() - requestStartedAt;
      }),
    );

    if (batchIndex >= concurrentOptions.warmupIterations) {
      concurrentRequestLatencies.push(...results);
    }
  },
  concurrentOptions,
);
