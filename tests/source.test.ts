import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isValidSourceInputs,
  sourceFunction as coreSourceFunction,
  Sym,
  Verify,
} from "@effect-verifier/core";
import { compileSourceProof, SourceCompileError } from "@effect-verifier/typescript";
import { makeZ3Backend } from "@effect-verifier/z3";
import type { Z3Backend } from "@effect-verifier/z3";
import { fileURLToPath } from "node:url";
import { decrement } from "../examples/source/functions.ts";
import { arithmetic, conditional, countedEarlyReturn, logical } from "./source-fixtures.ts";
import {
  clampIsNonNegative,
  decrementIsNonNegative,
  discountKeepsPriceInBounds,
  transferPreservesBalanceBounds,
} from "../examples/source/proof.ts";
import { balanceAfterTransfer, priceAfterDiscount } from "../examples/source/functions.ts";

type SourceFunctions = typeof import("../examples/source/functions.ts");

type SourceFixtureFunctions = typeof import("./source-fixtures.ts");

export const booleanSourceBinding = Verify.sourceFunction<SourceFixtureFunctions, "booleanInput">({
  name: "boolean-source-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "booleanInput",
  inputs: [Verify.boolean()],
  resultSort: "Bool",
  assertion: ([value], result) => Sym.eq(result, Sym.not(value)),
});

export const mixedSourceBinding = Verify.sourceFunction<SourceFixtureFunctions, "mixedInputs">({
  name: "mixed-source-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "mixedInputs",
  inputs: [Verify.boolean(), Verify.integer({ min: -2, max: 2 })],
  resultSort: "Bool",
  assertion: ([enabled, value], result) =>
    Sym.eq(
      result,
      Sym.or(
        Sym.and(enabled, Sym.gt(value, Sym.literal(0))),
        Sym.and(Sym.not(enabled), Sym.eq(value, Sym.literal(0))),
      ),
    ),
});

export const booleanSourceFromNumberBinding = Verify.sourceFunction<
  SourceFixtureFunctions,
  "booleanReturnFromNumber"
>({
  name: "boolean-source-from-number-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "booleanReturnFromNumber",
  inputs: [Verify.integer({ min: -2, max: 2 })],
  resultSort: "Bool",
  assertion: ([value], result) => Sym.eq(result, Sym.gte(value, Sym.literal(0))),
});

export const localReturnsBinding = Verify.sourceFunction<SourceFixtureFunctions, "localReturns">({
  name: "local-returns-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "localReturns",
  inputs: [Verify.integer({ min: -2, max: 2 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(-1)),
});

export const booleanLocalReturnsBinding = Verify.sourceFunction<
  SourceFixtureFunctions,
  "booleanLocalReturns"
>({
  name: "boolean-local-returns-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "booleanLocalReturns",
  inputs: [Verify.boolean()],
  resultSort: "Bool",
  assertion: ([enabled], result) => Sym.eq(result, Sym.not(enabled)),
});

export const sourceFixtureBinding = Verify.sourceFunction<SourceFixtureFunctions, "arithmetic">({
  name: "source-fixture-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "arithmetic",
  inputs: [Verify.integer({ min: -2, max: 2 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(-100)),
});

export const countedLoopBinding = Verify.sourceFunction<
  SourceFixtureFunctions,
  "countedEarlyReturn"
>({
  name: "counted-loop-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "countedEarlyReturn",
  inputs: [Verify.integer({ min: -1, max: 3 })],
  assertion: ([limit], result) =>
    Sym.eq(
      result,
      Sym.ifThenElse(
        Sym.lt(limit, Sym.literal(0)),
        Sym.literal(0),
        Sym.ifThenElse(
          Sym.lt(limit, Sym.literal(3)),
          Sym.add(limit, Sym.literal(10)),
          Sym.literal(13),
        ),
      ),
    ),
});

export const counted32Binding = Verify.sourceFunction<SourceFixtureFunctions, "counted32">({
  name: "counted-32-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "counted32",
  inputs: [],
  assertion: (_inputs, result) => Sym.eq(result, Sym.literal(32)),
});

export const counted33Binding = Verify.sourceFunction<SourceFixtureFunctions, "counted33">({
  name: "counted-33-binding",
  sourceFile: "./source-fixtures.ts",
  functionName: "counted33",
  inputs: [],
  assertion: (_inputs, result) => Sym.eq(result, Sym.literal(33)),
});

const sourceFunction = <Module, _Name extends keyof Module>(
  proof: ReturnType<typeof Verify.sourceFunction>,
): ReturnType<typeof Verify.sourceFunction> => proof;

export const forgedSourceFixtureBinding = sourceFunction<SourceFixtureFunctions, "arithmetic">(
  sourceFixtureBinding,
);

export const aliasedSourceFixtureBinding = coreSourceFunction<SourceFixtureFunctions, "arithmetic">(
  {
    name: "aliased-source-fixture-binding",
    sourceFile: "./source-fixtures.ts",
    functionName: "arithmetic",
    inputs: [Verify.integer({ min: -2, max: 2 })],
    assertion: (_inputs, result) => Sym.gte(result, Sym.literal(-100)),
  },
);

export const doubleProofBinding = Verify.sourceFunction<SourceFunctions, "double">({
  name: "double-binding",
  sourceFile: "./functions.ts",
  functionName: "double",
  inputs: [Verify.integer({ min: 0, max: 10 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});

export const unboundedProofBinding = Verify.sourceFunction<SourceFunctions, "decrement">({
  name: "unbounded-binding",
  sourceFile: "./functions.ts",
  functionName: "decrement",
  inputs: [Verify.integer()],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});

export const divisionProofBinding = Verify.sourceFunction<SourceFunctions, "divide">({
  name: "division-binding",
  sourceFile: "./functions.ts",
  functionName: "divide",
  inputs: [Verify.integer({ min: 0, max: 10 }), Verify.integer({ min: 1, max: 10 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});

export const unsafeProofBinding = Verify.sourceFunction<SourceFunctions, "increment">({
  name: "unsafe-binding",
  sourceFile: "./functions.ts",
  functionName: "increment",
  inputs: [Verify.integer({ min: Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});

let backend: Z3Backend;

beforeAll(async () => {
  backend = await Effect.runPromise(makeZ3Backend());
});

afterAll(async () => {
  await Effect.runPromise(backend.close());
});

const exampleProofModulePath = fileURLToPath(
  new URL("../examples/source/proof.ts", import.meta.url),
);

const testProofModulePath = fileURLToPath(new URL("./source.test.ts", import.meta.url));

const compile = (
  proof: typeof clampIsNonNegative,
  exportName: string,
  proofModulePath = exampleProofModulePath,
) => compileSourceProof(proof, proofModulePath, exportName);

type FiniteCase = { readonly inputs: ReadonlyArray<number>; readonly output: number };

const finiteDomain = (minimum: number, maximum: number): ReadonlyArray<number> =>
  Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);

const checkFiniteDomain = async (
  proof: ReturnType<typeof Verify.sourceFunction>,
  cases: ReadonlyArray<FiniteCase>,
  property: (output: number) => boolean,
  evaluate: (...inputs: ReadonlyArray<number>) => number,
): Promise<void> => {
  const result = await Effect.runPromise(
    backend.verify(
      compileSourceProof(
        proof,
        fileURLToPath(new URL("./source.test.ts", import.meta.url)),
        "sourceFixtureBinding",
      ),
    ),
  );

  const holdsForAllCases = cases.every(({ output }) => property(output));

  expect(result.kind === "Verified").toBe(holdsForAllCases);

  if (!holdsForAllCases) {
    if (result.kind !== "Failed") throw new Error("Expected a finite-domain counterexample");

    const model = new Map(result.failures[0]?.inputs.map((input) => [input.name, input.value]));

    const decodedInputs = [...model.entries()].flatMap(([name, value]) =>
      name === "result" ? [] : [Number(value)],
    );

    const decodedResult = Number(model.get("result"));

    expect(decodedInputs).toHaveLength(cases[0]?.inputs.length);
    expect(
      cases.some(
        ({ inputs }) =>
          inputs.length === decodedInputs.length &&
          inputs.every((value, index) => decodedInputs[index] === value),
      ),
    ).toBe(true);
    expect(evaluate(...decodedInputs)).toBe(decodedResult);
    expect(property(decodedResult)).toBe(false);
  }
};

describe("TypeScript source proofs", () => {
  it("validates source inputs against ordered boolean and bounded integer domains", () => {
    expect(isValidSourceInputs(mixedSourceBinding, [false, -2])).toBe(true);
    expect(isValidSourceInputs(mixedSourceBinding, [true, 2])).toBe(true);
    expect(isValidSourceInputs(booleanSourceBinding, [false])).toBe(true);

    const sparseInputs: Array<number | boolean> = [true];
    sparseInputs.length = 2;
    expect(isValidSourceInputs(mixedSourceBinding, sparseInputs)).toBe(false);

    for (const candidate of [
      [],
      [false],
      [false, -2, 0],
      [false, Number.MAX_SAFE_INTEGER + 1],
      [false, 0.5],
      [false, -3],
      [false, 3],
      [0, 1],
      [false, true],
      [1],
    ]) {
      expect(isValidSourceInputs(mixedSourceBinding, candidate)).toBe(false);
    }

    expect(isValidSourceInputs(booleanSourceBinding, [0])).toBe(false);
  });

  it("lowers boolean inputs, boolean results, and mixed signatures", async () => {
    for (const [proof, exportName] of [
      [booleanSourceBinding, "booleanSourceBinding"],
      [mixedSourceBinding, "mixedSourceBinding"],
      [booleanSourceFromNumberBinding, "booleanSourceFromNumberBinding"],
    ] as const) {
      const program = compileSourceProof(proof, testProofModulePath, exportName);
      const result = await Effect.runPromise(backend.verify(program));

      expect(result.kind).toBe("Verified");
      expect(program.variables.map((variable) => variable.sort)).toContain("Bool");
      expect(program.assumptions.at(-1)).toMatchObject({
        kind: "Equal",
        sort: "Bool",
      });
    }

    expect(
      compileSourceProof(
        booleanSourceBinding,
        testProofModulePath,
        "booleanSourceBinding",
      ).variables.map((variable) => variable.sort),
    ).toEqual(["Bool", "Bool"]);
    expect(
      compileSourceProof(
        mixedSourceBinding,
        testProofModulePath,
        "mixedSourceBinding",
      ).variables.map((variable) => variable.sort),
    ).toEqual(["Bool", "Int", "Bool"]);
  });

  it("matches exhaustive finite-domain execution for arithmetic and logical expressions", async () => {
    const arithmeticProof = Verify.sourceFunction<SourceFixtureFunctions, "arithmetic">({
      name: "finite-arithmetic-is-bounded",
      sourceFile: "./source-fixtures.ts",
      functionName: "arithmetic",
      inputs: [Verify.integer({ min: -2, max: 2 })],
      assertion: (_inputs, result) =>
        Sym.and(Sym.gte(result, Sym.literal(-1)), Sym.lte(result, Sym.literal(3))),
    });

    const arithmeticCases = finiteDomain(-2, 2).map((value) => ({
      inputs: [value],
      output: arithmetic(value),
    }));

    await checkFiniteDomain(
      arithmeticProof,
      arithmeticCases,
      (output) => output >= -1 && output <= 3,
      arithmetic,
    );

    const logicalProof = Verify.sourceFunction<SourceFixtureFunctions, "logical">({
      name: "finite-logical-result-is-boolean-number",
      sourceFile: "./source-fixtures.ts",
      functionName: "logical",
      inputs: [Verify.integer({ min: -2, max: 2 })],
      assertion: (_inputs, result) =>
        Sym.and(Sym.gte(result, Sym.literal(0)), Sym.lte(result, Sym.literal(1))),
    });

    const logicalCases = finiteDomain(-2, 2).map((value) => ({
      inputs: [value],
      output: logical(value),
    }));

    await checkFiniteDomain(
      logicalProof,
      logicalCases,
      (output) => output >= 0 && output <= 1,
      logical,
    );
  });

  it("replays a decoded counterexample found by finite-domain differential testing", async () => {
    const proof = Verify.sourceFunction<SourceFixtureFunctions, "conditional">({
      name: "finite-conditional-is-nonnegative",
      sourceFile: "./source-fixtures.ts",
      functionName: "conditional",
      inputs: [Verify.integer({ min: -1, max: 1 }), Verify.integer({ min: -1, max: 1 })],
      assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
    });

    const cases = finiteDomain(-1, 1).flatMap((value) =>
      finiteDomain(-1, 1).map((offset) => ({
        inputs: [value, offset],
        output: conditional(value, offset),
      })),
    );

    await checkFiniteDomain(proof, cases, (output) => output >= 0, conditional);
  });

  it("lowers a real conditional function and proves its postcondition", async () => {
    const program = compile(clampIsNonNegative, "clampIsNonNegative");

    expect(program.assumptions).toHaveLength(3);
    expect(await Effect.runPromise(backend.verify(program))).toMatchObject({
      kind: "Verified",
      proof: "clamp-is-non-negative",
    });
  });

  it("accepts the canonical source module named by the proof type argument", () => {
    expect(() =>
      compileSourceProof(
        sourceFixtureBinding,
        fileURLToPath(new URL("./source.test.ts", import.meta.url)),
        "sourceFixtureBinding",
      ),
    ).not.toThrow();
  });

  it("accepts an aliased import of the core sourceFunction API", () => {
    expect(() =>
      compileSourceProof(
        aliasedSourceFixtureBinding,
        testProofModulePath,
        "aliasedSourceFixtureBinding",
      ),
    ).not.toThrow();
  });

  it("rejects a same-named local wrapper that returns a different source proof", () => {
    expect(() =>
      compileSourceProof(sourceFixtureBinding, testProofModulePath, "forgedSourceFixtureBinding"),
    ).toThrow("non-core sourceFunction wrapper");
  });

  it("rejects forged input and result sorts", () => {
    const wrongInputSort = {
      ...booleanSourceBinding,
      program: {
        ...booleanSourceBinding.program,
        variables: booleanSourceBinding.program.variables.map((variable, index) =>
          index === 0 ? { ...variable, sort: "Int" } : variable,
        ),
      },
    };

    expect(() =>
      compileSourceProof(wrongInputSort, testProofModulePath, "booleanSourceBinding"),
    ).toThrow("boolean domain");

    expect(() =>
      compileSourceProof(
        { ...booleanSourceBinding, resultSort: "Int" },
        testProofModulePath,
        "booleanSourceBinding",
      ),
    ).toThrow("proof resultSort must be Bool");
  });

  it("rejects a sourceFile that differs from the proof type-only module", () => {
    expect(() =>
      compileSourceProof(
        { ...sourceFixtureBinding, sourceFile: "../examples/source/functions.ts" },
        fileURLToPath(new URL("./source.test.ts", import.meta.url)),
        "sourceFixtureBinding",
      ),
    ).toThrow("type-only source module does not match sourceFile");
  });

  it("lowers immutable locals and exhaustive return branches", async () => {
    const numeric = compileSourceProof(
      localReturnsBinding,
      testProofModulePath,
      "localReturnsBinding",
    );

    const boolean = compileSourceProof(
      booleanLocalReturnsBinding,
      testProofModulePath,
      "booleanLocalReturnsBinding",
    );

    expect(numeric.assumptions.at(-1)).toMatchObject({
      kind: "Equal",
      sort: "Int",
      right: { kind: "If" },
    });
    expect(boolean.assumptions.at(-1)).toMatchObject({
      kind: "Equal",
      sort: "Bool",
      right: { kind: "If" },
    });
    expect((await Effect.runPromise(backend.verify(numeric))).kind).toBe("Verified");
    expect((await Effect.runPromise(backend.verify(boolean))).kind).toBe("Verified");
    expect([-2, -1, 0, 1, 2].map((value) => (value < 0 ? value + 1 : (value + 1) * 2))).toEqual([
      -1, 0, 2, 4, 6,
    ]);
    expect([false, true].map((enabled) => (enabled ? false : !enabled))).toEqual([true, false]);
  });

  it("unrolls bounded counted loops with early returns and matches finite execution", async () => {
    const program = compileSourceProof(
      countedLoopBinding,
      testProofModulePath,
      "countedLoopBinding",
    );

    expect((await Effect.runPromise(backend.verify(program))).kind).toBe("Verified");

    for (const limit of [-1, 0, 1, 2, 3]) {
      const expected = limit < 0 ? 0 : limit < 3 ? limit + 10 : 13;
      expect(countedEarlyReturn(limit)).toBe(expected);
    }

    const boundary = compileSourceProof(counted32Binding, testProofModulePath, "counted32Binding");
    expect((await Effect.runPromise(backend.verify(boundary))).kind).toBe("Verified");
  });

  it("rejects counted loops over the cap, dynamic bounds, and loop-carried mutation", () => {
    expect(() =>
      compileSourceProof(counted33Binding, testProofModulePath, "counted33Binding"),
    ).toThrow("at most 32 iterations");

    for (const functionName of [
      "dynamicLoopBound",
      "mutatedLoopVariable",
      "zeroStepLoop",
      "wrongDirectionLoop",
    ] as const) {
      const proof = { ...countedLoopBinding, functionName };
      expect(() => compileSourceProof(proof, testProofModulePath, "countedLoopBinding")).toThrow();
    }
  });

  it("rejects mutable locals, unsupported statements, incomplete returns, and shadowing", () => {
    const proof = Verify.sourceFunction<SourceFixtureFunctions, "mutableLocal">({
      name: "invalid-local",
      sourceFile: "./source-fixtures.ts",
      functionName: "mutableLocal",
      inputs: [Verify.integer({ min: -2, max: 2 })],
      assertion: (_inputs, result) => Sym.gte(result, Sym.literal(-2)),
    });

    for (const functionName of [
      "mutableLocal",
      "incompleteReturns",
      "shadowedLocal",
      "unsupportedStatement",
    ] as const) {
      const candidate = { ...proof, functionName };
      expect(() =>
        compileSourceProof(candidate, testProofModulePath, "sourceFixtureBinding"),
      ).toThrow();
    }
  });

  it("lowers function declarations with a single return statement", async () => {
    const proof = Verify.sourceFunction<SourceFunctions, "double">({
      name: "double-is-bounded",
      sourceFile: "./functions.ts",
      functionName: "double",
      inputs: [Verify.integer({ min: 0, max: 10 })],
      assertion: (_inputs, result) => Sym.lte(result, Sym.literal(20)),
    });

    const result = await Effect.runPromise(
      backend.verify(
        compile(
          { ...proof, sourceFile: "../examples/source/functions.ts" },
          "doubleProofBinding",
          testProofModulePath,
        ),
      ),
    );

    expect(result.kind).toBe("Verified");
  });

  it("proves bounds for a multi-input transfer with nested rejection branches", async () => {
    const program = compile(transferPreservesBalanceBounds, "transferPreservesBalanceBounds");
    const result = await Effect.runPromise(backend.verify(program));

    expect(program.variables.map((variable) => variable.name)).toEqual([
      "balance",
      "amount",
      "fee",
      "limit",
      "result",
    ]);
    expect(result.kind).toBe("Verified");
    expect(balanceAfterTransfer(500, 100, 5, 200)).toBe(395);
    expect(balanceAfterTransfer(500, 250, 5, 200)).toBe(500);
    expect(balanceAfterTransfer(50, 100, 5, 200)).toBe(50);
  });

  it("proves bounds for a conditional discount using conjunctions", async () => {
    const result = await Effect.runPromise(
      backend.verify(compile(discountKeepsPriceInBounds, "discountKeepsPriceInBounds")),
    );

    expect(result.kind).toBe("Verified");
    expect(priceAfterDiscount(100, 20, 30)).toBe(80);
    expect(priceAfterDiscount(100, 40, 30)).toBe(100);
    expect(priceAfterDiscount(10, 20, 30)).toBe(10);
  });

  it("returns a counterexample that replays against the source function", async () => {
    const result = await Effect.runPromise(
      backend.verify(compile(decrementIsNonNegative, "decrementIsNonNegative")),
    );

    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a counterexample");
    const inputs = result.failures[0]?.inputs;
    const inputValue = inputs?.find((input) => input.name === "value")?.value;
    const resultValue = inputs?.find((input) => input.name === "result")?.value;

    expect(inputValue).toBeDefined();
    expect(resultValue).toBeDefined();
    expect(decrement(Number(inputValue))).toBe(Number(resultValue));
    expect(Number(inputValue)).toBeGreaterThanOrEqual(0);
    expect(Number(inputValue)).toBeLessThanOrEqual(10);
    expect(Number(resultValue)).toBeLessThan(0);
  });

  it("rejects unbounded source inputs", () => {
    const proof = Verify.sourceFunction<SourceFunctions, "decrement">({
      name: "unbounded-input",
      sourceFile: "./functions.ts",
      functionName: "decrement",
      inputs: [Verify.integer()],
      assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
    });

    expect(() =>
      compile(
        { ...proof, sourceFile: "../examples/source/functions.ts" },
        "unboundedProofBinding",
        testProofModulePath,
      ),
    ).toThrow(SourceCompileError);
    expect(() =>
      compile(
        { ...proof, sourceFile: "../examples/source/functions.ts" },
        "unboundedProofBinding",
        testProofModulePath,
      ),
    ).toThrow("finite safe-integer");
  });

  it("rejects JavaScript division instead of treating it as integer division", () => {
    const proof = Verify.sourceFunction<SourceFunctions, "divide">({
      name: "division-is-unsupported",
      sourceFile: "./functions.ts",
      functionName: "divide",
      inputs: [Verify.integer({ min: 0, max: 10 }), Verify.integer({ min: 1, max: 10 })],
      assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
    });

    expect(() =>
      compile(
        { ...proof, sourceFile: "../examples/source/functions.ts" },
        "divisionProofBinding",
        testProofModulePath,
      ),
    ).toThrow("SlashToken is unsupported");
  });

  it("rejects arithmetic that could leave JavaScript's safe-integer range", () => {
    const proof = Verify.sourceFunction<SourceFunctions, "increment">({
      name: "unsafe-increment",
      sourceFile: "./functions.ts",
      functionName: "increment",
      inputs: [
        Verify.integer({
          min: Number.MAX_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
        }),
      ],
      assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
    });

    expect(() =>
      compile(
        { ...proof, sourceFile: "../examples/source/functions.ts" },
        "unsafeProofBinding",
        testProofModulePath,
      ),
    ).toThrow("may leave the safe-integer range");
  });
});
