import { Effect, Exit } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Sym,
  Verify,
  isSourceProof,
  isValidSourceInputs,
  sourceEffectFunction as coreSourceEffectFunction,
} from "@effect-verifier/core";
import { compileSourceEffectProof } from "@effect-verifier/typescript";
import { makeZ3Backend } from "@effect-verifier/z3";
import type { Z3Backend } from "@effect-verifier/z3";
import { fileURLToPath } from "node:url";
import { integerOutcome } from "./source-effect-fixtures.ts";

type Fixtures = typeof import("./source-effect-fixtures.ts");

const sourceEffectFunction = <Module, _Name extends keyof Module>(
  proof: ReturnType<typeof Verify.sourceEffectFunction>,
): ReturnType<typeof Verify.sourceEffectFunction> => proof;

export const aliasedEffectBinding = coreSourceEffectFunction<Fixtures, "directFailure">({
  name: "aliased-effect",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "directFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

export const integerEffectBinding = Verify.sourceEffectFunction<Fixtures, "integerOutcome">({
  name: "integer-effect",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "integerOutcome",
  inputs: [Verify.integer({ min: -1, max: 1 })],
  resultSort: "Int",
  success: (_inputs, value) => Sym.gte(value, Sym.literal(1)),
  failure: (_inputs, tag) =>
    Sym.or(Sym.eq(tag, Sym.literal("Denied")), Sym.eq(tag, Sym.literal("Missing"))),
});

export const forgedEffectBinding = sourceEffectFunction<Fixtures, "integerOutcome">(
  integerEffectBinding,
);

export const booleanEffectBinding = Verify.sourceEffectFunction<Fixtures, "booleanOutcome">({
  name: "boolean-effect",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "booleanOutcome",
  inputs: [Verify.boolean()],
  resultSort: "Bool",
  success: (_inputs, value) => value,
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

export const directSuccessBinding = Verify.sourceEffectFunction<Fixtures, "directSuccess">({
  name: "direct-success",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "directSuccess",
  inputs: [Verify.integer({ min: -1, max: 1 })],
  success: (_inputs, value) => Sym.gte(value, Sym.literal(-1)),
  failure: () => Sym.literal(true),
});

export const directBooleanSuccessBinding = Verify.sourceEffectFunction<
  Fixtures,
  "directBooleanSuccess"
>({
  name: "direct-boolean-success",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "directBooleanSuccess",
  inputs: [],
  resultSort: "Bool",
  success: (_inputs, value) => value,
  failure: () => Sym.literal(true),
});

export const failureEffectBinding = Verify.sourceEffectFunction<Fixtures, "directFailure">({
  name: "failure-effect",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "directFailure",
  inputs: [],
  resultSort: "Int",
  success: () => Sym.literal(true),
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

export const successNamedFailureBinding = Verify.sourceEffectFunction<
  Fixtures,
  "successNamedFailure"
>({
  name: "success-named-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "successNamedFailure",
  inputs: [],
  success: () => Sym.literal(false),
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Success")),
});

export const forgedSucceedBinding = Verify.sourceEffectFunction<Fixtures, "forgedSucceed">({
  name: "forged-succeed",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "forgedSucceed",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const unsupportedMethodBinding = Verify.sourceEffectFunction<Fixtures, "unsupportedMethod">({
  name: "unsupported-effect-method",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unsupportedMethod",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const unsupportedMapBinding = Verify.sourceEffectFunction<Fixtures, "unsupportedMap">({
  name: "unsupported-effect-map",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unsupportedMap",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const unsupportedFlatMapBinding = Verify.sourceEffectFunction<
  Fixtures,
  "unsupportedFlatMap"
>({
  name: "unsupported-effect-flatMap",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unsupportedFlatMap",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const unsupportedGenBinding = Verify.sourceEffectFunction<Fixtures, "unsupportedGen">({
  name: "unsupported-effect-gen",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unsupportedGen",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const unsupportedTryPromiseBinding = Verify.sourceEffectFunction<
  Fixtures,
  "unsupportedTryPromise"
>({
  name: "unsupported-effect-tryPromise",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unsupportedTryPromise",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const wrongSuccessSortBinding = Verify.sourceEffectFunction<Fixtures, "wrongSuccessSort">({
  name: "wrong-success-sort",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "wrongSuccessSort",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const wrongFailureTagBinding = Verify.sourceEffectFunction<Fixtures, "wrongFailureTag">({
  name: "wrong-failure-tag",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "wrongFailureTag",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const recordFailureBinding = Verify.sourceEffectFunction<Fixtures, "recordFailure">({
  name: "record-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "recordFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const dynamicFailureBinding = Verify.sourceEffectFunction<Fixtures, "dynamicFailure">({
  name: "dynamic-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "dynamicFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const localEffectBinding = Verify.sourceEffectFunction<Fixtures, "localOutcome">({
  name: "local-effect",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "localOutcome",
  inputs: [Verify.integer({ min: -1, max: 1 })],
  resultSort: "Int",
  success: (_inputs, value) => Sym.gte(value, Sym.literal(0)),
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

// The compile-time name filter rejects every target below, so each binding is a deliberate
// type-level bypass: the proof must still be refused at verification time with the diagnostic
// that docs/soundness.md documents.
// @ts-expect-error the target widens E to string, which is not a finite union of literal tags
export const unknownFailureBinding = Verify.sourceEffectFunction<Fixtures, "unknownFailure">({
  name: "unknown-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unknownFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error the target declares an object-shaped error, not a string-literal tag
export const objectFailureBinding = Verify.sourceEffectFunction<Fixtures, "objectFailure">({
  name: "object-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "objectFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error the target takes a string parameter, so it has no supported argument tuple
export const arbitraryFailureBinding = Verify.sourceEffectFunction<Fixtures, "arbitraryFailure">({
  name: "arbitrary-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "arbitraryFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

export const requiredEnvironmentBinding = Verify.sourceEffectFunction<
  Fixtures,
  // @ts-expect-error a required environment layer leaves no supported argument tuple
  "requiredEnvironment"
>({
  name: "required-environment",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "requiredEnvironment",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

const proofPath = fileURLToPath(new URL("./source-effect.test.ts", import.meta.url));

let backend: Z3Backend;

beforeAll(async () => {
  // A query that overruns this budget returns `unknown` and fails loudly instead of
  // stalling: Z3's `check` is synchronous native code, so no JS timer can cut it off.
  // Every query here finishes far inside 20 s, so the budget is a safety net only.
  backend = await Effect.runPromise(makeZ3Backend({ timeoutMilliseconds: 20_000 }));
});

afterAll(async () => {
  await Effect.runPromise(backend.close());
});

describe("source Effect proofs", () => {
  it("lowers direct success/failure, conditional branches, multi-tag errors, and immutable locals", async () => {
    for (const [proof, exportName] of [
      [integerEffectBinding, "integerEffectBinding"],
      [booleanEffectBinding, "booleanEffectBinding"],
      [failureEffectBinding, "failureEffectBinding"],
      [successNamedFailureBinding, "successNamedFailureBinding"],
      [directSuccessBinding, "directSuccessBinding"],
      [directBooleanSuccessBinding, "directBooleanSuccessBinding"],
      [localEffectBinding, "localEffectBinding"],
      [aliasedEffectBinding, "aliasedEffectBinding"],
    ] as const) {
      const program = compileSourceEffectProof(proof, proofPath, exportName);
      expect(program.variables.map((variable) => variable.sort)).toContain("String");
      expect(
        program.assumptions.some(
          (expression) =>
            expression.kind === "Or" &&
            expression.operands.some((item) => item.kind === "Equal" && item.sort === "String"),
        ),
      ).toBe(true);
      expect((await Effect.runPromise(backend.verify(program))).kind).toBe("Verified");
    }

    expect(isSourceProof(integerEffectBinding)).toBe(true);
    expect(isValidSourceInputs(integerEffectBinding, [-1])).toBe(true);
    expect(isValidSourceInputs(integerEffectBinding, [2])).toBe(false);
  }, 15000);

  it("distinguishes the success variant from a failure tag named Success", async () => {
    const matchingFailure = compileSourceEffectProof(
      successNamedFailureBinding,
      proofPath,
      "successNamedFailureBinding",
    );

    expect((await Effect.runPromise(backend.verify(matchingFailure))).kind).toBe("Verified");

    const incorrectSuccessClaim = Verify.sourceEffectFunction<Fixtures, "successNamedFailure">({
      name: "incorrect-success-claim",
      sourceFile: "./source-effect-fixtures.ts",
      functionName: "successNamedFailure",
      inputs: [],
      success: () => Sym.literal(true),
      failure: () => Sym.literal(false),
    });

    const result = await Effect.runPromise(
      backend.verify(
        compileSourceEffectProof(incorrectSuccessClaim, proofPath, "successNamedFailureBinding"),
      ),
    );

    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a counterexample");

    const model = new Map(result.failures[0]?.inputs.map((item) => [item.name, item.value]));
    expect(model.get("outcomeTag")).toBe("Failure");
    expect(model.get("failureTag")).toBe("Success");
  });

  it("guards inactive success payloads on failure variants", async () => {
    const proof = Verify.sourceEffectFunction<Fixtures, "integerOutcome">({
      name: "inactive-payload-guard",
      sourceFile: "./source-effect-fixtures.ts",
      functionName: "integerOutcome",
      inputs: [Verify.integer({ min: -1, max: -1 })],
      resultSort: "Int",
      success: () => Sym.literal(false),
      failure: () => Sym.literal(true),
    });

    const program = compileSourceEffectProof(proof, proofPath, "integerEffectBinding");
    expect((await Effect.runPromise(backend.verify(program))).kind).toBe("Verified");
  });

  it("decodes tag and active payload in a SAT counterexample", async () => {
    const proof = Verify.sourceEffectFunction<Fixtures, "integerOutcome">({
      name: "decoded-outcome-counterexample",
      sourceFile: "./source-effect-fixtures.ts",
      functionName: "integerOutcome",
      inputs: [Verify.integer({ min: 1, max: 1 })],
      resultSort: "Int",
      success: (_inputs, value) => Sym.eq(value, Sym.literal(0)),
      failure: () => Sym.literal(true),
    });

    const program = compileSourceEffectProof(proof, proofPath, "integerEffectBinding");
    const result = await Effect.runPromise(backend.verify(program));
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a counterexample");
    const model = new Map(result.failures[0]?.inputs.map((item) => [item.name, item.value]));
    expect(model.get("outcomeTag")).toBe("Success");
    expect(model.get("successValue")).toBe("1");
    const replay = Effect.runSyncExit(integerOutcome(1));

    expect(Exit.isSuccess(replay)).toBe(true);

    if (Exit.isSuccess(replay)) {
      expect(replay.value).toBe(Number(model.get("successValue")));
    }

    for (const input of [-1, 0, 1]) {
      const finiteReplay = Effect.runSyncExit(integerOutcome(input));
      expect(finiteReplay._tag).toBe(input > 0 ? "Success" : "Failure");
    }
  });

  it("rejects forged constructors, fake Effect methods, and unsupported payloads", () => {
    expect(() =>
      compileSourceEffectProof({ ...integerEffectBinding }, proofPath, "integerEffectBinding"),
    ).toThrow("forged source effect proof");
    expect(() =>
      compileSourceEffectProof(integerEffectBinding, proofPath, "forgedEffectBinding"),
    ).toThrow("non-core sourceEffectFunction wrapper");

    for (const [proof, exportName] of [
      [forgedSucceedBinding, "forgedSucceedBinding"],
      [unsupportedMethodBinding, "unsupportedMethodBinding"],
      [unsupportedMapBinding, "unsupportedMapBinding"],
      [unsupportedFlatMapBinding, "unsupportedFlatMapBinding"],
      [unsupportedGenBinding, "unsupportedGenBinding"],
      [unsupportedTryPromiseBinding, "unsupportedTryPromiseBinding"],
      [wrongSuccessSortBinding, "wrongSuccessSortBinding"],
      [wrongFailureTagBinding, "wrongFailureTagBinding"],
      [recordFailureBinding, "recordFailureBinding"],
      [dynamicFailureBinding, "dynamicFailureBinding"],
    ] as const) {
      expect(() => compileSourceEffectProof(proof, proofPath, exportName)).toThrow();
    }
  }, 15000);

  it("rejects widened, object, and dynamic error types and required environments", () => {
    // The frontend reads the declared error type before it lowers a body, so the widened, the
    // object-shaped, and the dynamic-tag targets all fail on the finite-union rule. Only the
    // required-environment target has its own diagnostic.
    for (const [proof, exportName, diagnostic] of [
      [
        unknownFailureBinding,
        "unknownFailureBinding",
        "Effect error type must be a finite union of string literals",
      ],
      [
        objectFailureBinding,
        "objectFailureBinding",
        "Effect error type must be a finite union of string literals",
      ],
      [
        arbitraryFailureBinding,
        "arbitraryFailureBinding",
        "Effect error type must be a finite union of string literals",
      ],
      [
        requiredEnvironmentBinding,
        "requiredEnvironmentBinding",
        "Effect functions requiring an environment are unsupported",
      ],
    ] as const) {
      expect(() => compileSourceEffectProof(proof, proofPath, exportName)).toThrow(diagnostic);
    }
  });
});
