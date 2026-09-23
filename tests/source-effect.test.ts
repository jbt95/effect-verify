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

const proofPath = fileURLToPath(new URL("./source-effect.test.ts", import.meta.url));

let backend: Z3Backend;

beforeAll(async () => {
  backend = await Effect.runPromise(makeZ3Backend());
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
});
