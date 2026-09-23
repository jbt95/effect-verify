import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Proof, VerificationProgram } from "@effect-verifier/core";
import { Sym, Verify, compileProof, verifyProof } from "@effect-verifier/core";
import { makeZ3Backend } from "@effect-verifier/z3";
import type { Z3Backend } from "@effect-verifier/z3";

let backend: Z3Backend;

beforeAll(async () => {
  backend = await Effect.runPromise(makeZ3Backend());
});

afterAll(async () => {
  await Effect.runPromise(backend.close());
});

const check = <E>(proof: Proof<E>) => Effect.runPromise(verifyProof(proof, backend));

describe("typed symbolic verification", () => {
  it("preserves results for batches of passing assertions", async () => {
    const proof = Verify.proof(
      "passing-assertion-batch",
      Effect.gen(function* () {
        const value = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "value" });

        for (let index = 0; index < 130; index += 1) {
          yield* Verify.assert(
            Sym.lte(value, Sym.literal(1_000 + index)),
            `bounded value ${index}`,
          );
        }
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Verified");

    if (result.kind !== "Verified") throw new Error("Expected all assertions to be verified");

    expect(result.assertions.map(({ label }) => label)).toEqual(
      Array.from({ length: 130 }, (_, index) => `bounded value ${index}`),
    );
  });

  it("preserves individual failures in batches of assertions", async () => {
    const failingIndexes = new Set([0, 64, 129]);

    const proof = Verify.proof(
      "mixed-assertion-batch",
      Effect.gen(function* () {
        const value = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "value" });

        for (let index = 0; index < 130; index += 1) {
          yield* Verify.assert(
            failingIndexes.has(index)
              ? Sym.lt(value, Sym.literal(100))
              : Sym.lte(value, Sym.literal(1_000 + index)),
            `assertion ${index}`,
          );
        }
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected individual assertion failures");

    expect(result.assertions.map(({ label }) => label)).toEqual(
      Array.from({ length: 130 }, (_, index) => `assertion ${index}`),
    );
    expect(result.failures.map(({ assertion }) => assertion)).toEqual(
      [...failingIndexes].map((index) => `assertion ${index}`),
    );
  });

  it("compiles bounded inputs and proves their inclusive upper bound", async () => {
    const proof = Verify.proof(
      "uint8-bounds",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "x" });
        yield* Verify.assert(Sym.lte(x, Sym.literal(255)));
      }),
    );

    const program = await Effect.runPromise(compileProof(proof));
    expect(program.variables).toEqual([
      { id: 0, name: "x", sort: "Int", domain: "UInt8", minimum: 0, maximum: 255 },
    ]);
    expect(program.assumptions).toHaveLength(2);
    expect(await check(proof)).toMatchObject({ kind: "Verified", proof: "uint8-bounds" });
  });

  it("returns a valid UInt8 counterexample for x < 100", async () => {
    const proof = Verify.proof(
      "uint8-below-100",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "x" });
        yield* Verify.assert(Sym.lt(x, Sym.literal(100)), "x is below 100");
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a counterexample");
    const input = result.failures[0]?.inputs.find((entry) => entry.name === "x");
    expect(input).toBeDefined();
    const value = Number(input?.value);
    expect(Number.isSafeInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(100);
    expect(value).toBeLessThanOrEqual(255);
  });

  it("uses mathematical integer addition instead of UInt8 wraparound", async () => {
    const proof = Verify.proof(
      "uint8-addition",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "x" });
        yield* Verify.assert(Sym.lte(Sym.add(x, Sym.literal(1)), Sym.literal(255)));
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected overflow counterexample");
    expect(result.failures[0]?.inputs[0]?.value).toBe("255");
  });

  it("decodes negative integer models as plain decimal strings", async () => {
    const proof = Verify.proof(
      "negative-counterexample",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.integer(), { name: "x" });
        yield* Verify.assert(Sym.gte(x, Sym.literal(0)));
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a negative counterexample");
    expect(result.failures[0]?.inputs[0]?.value).toMatch(/^-[0-9]+$/);
  });

  it("translates every integer and boolean expression constructor", async () => {
    const proof = Verify.proof(
      "all-expression-constructors",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.integer(), { name: "x" });
        const flag = yield* Verify.any(Verify.boolean(), { name: "flag" });
        const otherFlag = yield* Verify.any(Verify.boolean(), { name: "otherFlag" });
        yield* Verify.assume(Sym.eq(x, Sym.literal(-6)));
        yield* Verify.assume(flag);
        yield* Verify.assume(Sym.not(otherFlag));

        const nestedConditional = Sym.ifThenElse(
          flag,
          Sym.ifThenElse(otherFlag, x, Sym.literal(-6)),
          Sym.literal(-6),
        );

        const booleanConditional = Sym.ifThenElse(flag, Sym.literal(true), otherFlag);

        yield* Verify.assert(
          Sym.and(
            Sym.literal(true),
            Sym.eq(Sym.add(x, Sym.literal(7)), Sym.literal(1)),
            Sym.eq(Sym.sub(x, Sym.literal(-2)), Sym.literal(-4)),
            Sym.eq(Sym.mul(x, Sym.literal(-2)), Sym.literal(12)),
            Sym.eq(Sym.div(x, Sym.literal(2)), Sym.literal(-3)),
            Sym.eq(Sym.mod(x, Sym.literal(4)), Sym.literal(2)),
            Sym.lt(x, Sym.literal(0)),
            Sym.lte(x, Sym.literal(-6)),
            Sym.gt(x, Sym.literal(-7)),
            Sym.gte(x, Sym.literal(-6)),
            Sym.eq(x, nestedConditional),
            Sym.eq(flag, booleanConditional),
            Sym.eq(flag, Sym.literal(true)),
            Sym.neq(x, Sym.literal(0)),
            Sym.neq(flag, otherFlag),
            Sym.or(Sym.literal(false), flag),
          ),
        );
      }),
    );

    expect(await check(proof)).toMatchObject({ kind: "Verified" });
  });

  it("translates native String literals, variables, equality, inequality, conditionals, and models", async () => {
    const proof = Verify.proof(
      "strings",
      Effect.gen(function* () {
        const text = yield* Verify.anyString({ name: "text" });
        const flag = yield* Verify.any(Verify.boolean(), { name: "flag" });
        yield* Verify.assume(
          Sym.eq(text, Sym.ifThenElse(flag, Sym.literal("actual content"), Sym.literal("other"))),
        );
        yield* Verify.assert(
          Sym.and(Sym.neq(text, Sym.literal("not actual")), Sym.eq(text, Sym.literal("other"))),
        );
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a string counterexample");
    expect(result.failures[0]?.inputs.find(({ name }) => name === "text")?.value).toBe(
      "actual content",
    );
  });

  it("decodes every user-visible integer and boolean input", async () => {
    const proof = Verify.proof(
      "all-model-inputs",
      Effect.gen(function* () {
        const integer = yield* Verify.any(Verify.integer(), { name: "integer" });
        const enabled = yield* Verify.any(Verify.boolean(), { name: "enabled" });
        const disabled = yield* Verify.any(Verify.boolean(), { name: "disabled" });
        yield* Verify.assume(Sym.eq(integer, Sym.literal(-13)));
        yield* Verify.assume(enabled);
        yield* Verify.assume(Sym.not(disabled));
        yield* Verify.assert(Sym.literal(false));
      }),
    );

    const result = await check(proof);
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a counterexample");
    expect(result.failures[0]?.inputs.map(({ name, value }) => [name, value])).toEqual([
      ["integer", "-13"],
      ["enabled", "true"],
      ["disabled", "false"],
    ]);
  });

  it("rejects malformed IR references instead of returning Verified", async () => {
    const program: VerificationProgram = {
      proof: "malformed-reference",
      variables: [],
      assumptions: [],
      assertions: [
        {
          id: 0,
          label: "unknown-variable",
          expression: { kind: "Variable", id: 123, sort: "Bool" },
        },
      ],
    };

    await expect(Effect.runPromise(backend.verify(program))).rejects.toThrow(
      "Unknown or non-boolean symbolic variable id: 123",
    );
  });

  it("rejects malformed String IR references", async () => {
    const program: VerificationProgram = {
      proof: "malformed-string-reference",
      variables: [],
      assumptions: [],
      assertions: [
        {
          id: 0,
          label: "unknown-string",
          expression: {
            kind: "Equal",
            sort: "String",
            left: { kind: "Variable", id: 123, sort: "String" },
            right: { kind: "StringLiteral", value: "value" },
          },
        },
      ],
    };

    await expect(Effect.runPromise(backend.verify(program))).rejects.toThrow(
      "Unknown or non-string symbolic variable id: 123",
    );
  });

  it("rejects modulo with a possibly zero divisor", async () => {
    const proof = Verify.proof(
      "unsafe-modulo",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.integer(), { name: "x" });
        const y = yield* Verify.any(Verify.integer(), { name: "y" });
        yield* Verify.assert(Sym.eq(Sym.mod(x, y), Sym.literal(0)));
      }),
    );

    await expect(check(proof)).rejects.toThrow("zero divisor");
  });

  it("rejects division and modulo in assumptions", async () => {
    const proof = Verify.proof(
      "undefined-assumption-operation",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.integer(), { name: "x" });
        yield* Verify.assume(Sym.eq(Sym.div(x, Sym.literal(0)), Sym.literal(0)));
        yield* Verify.assert(Sym.literal(true));
      }),
    );

    await expect(check(proof)).rejects.toThrow("not supported");
  });

  it("rejects inconsistent assumptions instead of proving vacuously", async () => {
    const proof = Verify.proof(
      "impossible",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.integer(), { name: "x" });
        yield* Verify.assume(Sym.lt(x, Sym.literal(0)));
        yield* Verify.assume(Sym.gte(x, Sym.literal(0)));
        yield* Verify.assert(Sym.literal(true));
      }),
    );

    await expect(check(proof)).rejects.toThrow("assumptions are inconsistent");
  });

  it("rejects proofs that contain no assertions", async () => {
    const proof = Verify.proof(
      "empty",
      Effect.gen(function* () {
        yield* Verify.any(Verify.boolean(), { name: "flag" });
      }),
    );

    await expect(check(proof)).rejects.toThrow("no assertions");
  });

  it("fails closed when division may have a zero divisor", async () => {
    const proof = Verify.proof(
      "unsafe-division",
      Effect.gen(function* () {
        const x = yield* Verify.any(Verify.integer(), { name: "x" });
        const y = yield* Verify.any(Verify.integer(), { name: "y" });
        yield* Verify.assert(Sym.eq(Sym.div(x, y), Sym.literal(0)));
      }),
    );

    await expect(check(proof)).rejects.toThrow("zero divisor");
  });

  it("permits division when assumptions prove the divisor is nonzero", async () => {
    const proof = Verify.proof(
      "safe-division",
      Effect.gen(function* () {
        const value = yield* Verify.any(Verify.integer(), { name: "value" });
        yield* Verify.assume(Sym.neq(value, Sym.literal(0)));
        yield* Verify.assert(Sym.eq(Sym.div(value, value), Sym.literal(1)));
        yield* Verify.assert(Sym.eq(value, value));
      }),
    );

    expect(await check(proof)).toMatchObject({ kind: "Verified" });
  });

  it("serializes concurrent solver checks", async () => {
    const makeProof = (name: string) =>
      Verify.proof(
        name,
        Effect.gen(function* () {
          const x = yield* Verify.any(Verify.uint({ bits: 8 }), { name });
          yield* Verify.assert(Sym.lte(x, Sym.literal(255)));
        }),
      );

    const results = await Promise.all([check(makeProof("first")), check(makeProof("second"))]);
    expect(results.map((result) => result.kind)).toEqual(["Verified", "Verified"]);
  });
});
