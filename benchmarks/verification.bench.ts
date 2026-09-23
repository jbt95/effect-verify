import { Effect } from "effect";
import { afterAll, beforeAll, bench } from "vitest";
import type { Proof, VerificationProgram, VerificationResult } from "@effect-verifier/core";
import { Sym, Verify, compileProof } from "@effect-verifier/core";
import { makeZ3Backend } from "@effect-verifier/z3";
import type { Z3Backend } from "@effect-verifier/z3";

const benchmarkOptions = {
  iterations: 1,
  time: 0,
  warmupIterations: 0,
  warmupTime: 0,
} as const;

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

let backend: Z3Backend;

let oneThousandAssertions: VerificationProgram;

let twoThousandAssertions: VerificationProgram;

let oneThousandIndependentProofs: ReadonlyArray<VerificationProgram>;

beforeAll(async () => {
  backend = await Effect.runPromise(makeZ3Backend());
  [oneThousandAssertions, twoThousandAssertions] = await Promise.all([
    compile(makeBatchProof(1_000)),
    compile(makeBatchProof(2_000)),
  ]);
  oneThousandIndependentProofs = await Promise.all(
    Array.from({ length: 1_000 }, (_, index) => compile(makeIndependentProof(index))),
  );
});

afterAll(async () => {
  await Effect.runPromise(backend.close());
});

bench(
  "1,000 assertions in one proof",
  async () => {
    const result = await Effect.runPromise(backend.verify(oneThousandAssertions));
    requireVerified(result, "1,000-assertion proof");
  },
  benchmarkOptions,
);

bench(
  "2,000 assertions in one proof",
  async () => {
    const result = await Effect.runPromise(backend.verify(twoThousandAssertions));
    requireVerified(result, "2,000-assertion proof");
  },
  benchmarkOptions,
);

bench(
  "1,000 independent proof runs",
  async () => {
    for (const program of oneThousandIndependentProofs) {
      const result = await Effect.runPromise(backend.verify(program));
      requireVerified(result, "independent proof");
    }
  },
  benchmarkOptions,
);
