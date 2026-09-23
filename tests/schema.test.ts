import { Effect, Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sym, compileProof, verifyProof } from "@effect-verifier/core";
import { Verify } from "@effect-verifier/schema";
import { makeZ3Backend } from "@effect-verifier/z3";
import type { Z3Backend } from "@effect-verifier/z3";

let backend: Z3Backend;

beforeAll(async () => {
  backend = await Effect.runPromise(makeZ3Backend());
});

afterAll(async () => {
  await Effect.runPromise(backend.close());
});

describe("Effect Schema translation", () => {
  it("turns the supported integer refinements into inclusive constraints", async () => {
    const Byte = Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(255),
    );

    const proof = Verify.proof(
      "schema-byte",
      Effect.gen(function* () {
        const input = yield* Verify.anySchema(Byte, { name: "byte" });
        yield* Verify.assert(Sym.lte(input, Sym.literal(255)));
        yield* Verify.assert(Sym.gte(input, Sym.literal(0)));
      }),
    );

    expect(await Effect.runPromise(verifyProof(proof, backend))).toMatchObject({
      kind: "Verified",
      proof: "schema-byte",
    });
  });

  it("builds symbolic nested struct and tuple values", async () => {
    const Input = Schema.Struct({
      balance: Schema.Int,
      values: Schema.Tuple(Schema.Int, Schema.Boolean),
    });

    const proof = Verify.proof(
      "nested-schema",
      Effect.gen(function* () {
        const input = yield* Verify.anySchema(Input, { name: "input" });
        yield* Verify.assert(Sym.gte(input.balance, Sym.literal(0)));
        yield* Verify.assert(Sym.eq(input.values[1], Sym.literal(true)));
      }),
    );

    const result = await Effect.runPromise(verifyProof(proof, backend));
    expect(result.kind).toBe("Failed");

    if (result.kind !== "Failed") throw new Error("Expected a counterexample");
    expect(result.failures[0]?.inputs.map((input) => input.name)).toEqual([
      "input.balance",
      "input.values[0]",
      "input.values[1]",
    ]);
  });

  it("constrains finite literal unions rather than choosing one arbitrarily", async () => {
    const Choice = Schema.Union(Schema.Literal(1), Schema.Literal(2));

    const proof = Verify.proof(
      "literal-union",
      Effect.gen(function* () {
        const value = yield* Verify.anySchema(Choice, { name: "choice" });
        yield* Verify.assert(Sym.lte(value, Sym.literal(2)));
        yield* Verify.assert(Sym.gte(value, Sym.literal(1)));
      }),
    );

    expect(await Effect.runPromise(verifyProof(proof, backend))).toMatchObject({
      kind: "Verified",
    });
  });

  it("constrains finite string unions in nested records and tuples", async () => {
    const Choice = Schema.Union(
      Schema.Literal("red"),
      Schema.Literal("blue"),
      Schema.Literal("red"),
    );

    const Input = Schema.Struct({ record: Choice, tuple: Schema.Tuple(Choice, Choice) });

    for (const [path, member] of [
      ["input.record", "red"],
      ["input.record", "blue"],
      ["input.tuple[1]", "red"],
      ["input.tuple[1]", "blue"],
    ] as const) {
      const proof = Verify.proof(
        "finite-string-member",
        Effect.gen(function* () {
          const input = yield* Verify.anySchema(Input, { name: "input" });
          const value = path === "input.record" ? input.record : input.tuple[1];
          yield* Verify.assume(Sym.eq(value, Sym.literal(member)));
          yield* Verify.assert(Sym.literal(false));
        }),
      );

      const result = await Effect.runPromise(verifyProof(proof, backend));
      expect(result.kind).toBe("Failed");

      if (result.kind !== "Failed") throw new Error("Expected a member model");
      expect(result.failures[0]?.inputs.find((input) => input.name === path)?.value).toBe(member);
    }

    const impossible = Verify.proof(
      "outside-string-choice",
      Effect.gen(function* () {
        const value = yield* Verify.anySchema(Choice, { name: "choice" });
        yield* Verify.assume(Sym.eq(value, Sym.literal("green")));
        yield* Verify.assert(Sym.literal(true));
      }),
    );

    await expect(Effect.runPromise(verifyProof(impossible, backend))).rejects.toThrow(
      "assumptions are inconsistent",
    );
  });

  it("merges exclusive integer bounds as exact inclusive safe-integer endpoints", async () => {
    const Range = Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThan(2),
      Schema.lessThan(5),
      Schema.greaterThanOrEqualTo(3),
      Schema.lessThanOrEqualTo(4),
    );

    const proof = Verify.proof(
      "exclusive-range",
      Effect.gen(function* () {
        const input = yield* Verify.anySchema(Range, { name: "range" });
        yield* Verify.assert(
          Sym.and(Sym.gte(input, Sym.literal(3)), Sym.lte(input, Sym.literal(4))),
        );
      }),
    );

    expect(await Effect.runPromise(verifyProof(proof, backend))).toMatchObject({
      kind: "Verified",
    });

    const empty = Verify.proof(
      "empty-exclusive-range",
      Effect.gen(function* () {
        yield* Verify.anySchema(
          Schema.Number.pipe(Schema.int(), Schema.greaterThan(2), Schema.lessThanOrEqualTo(2)),
        );
        yield* Verify.assert(Sym.literal(true));
      }),
    );

    await expect(Effect.runPromise(compileProof(empty))).rejects.toThrow("empty range");
  });

  it("rejects exclusive-bound overflow, floats, mixed literal unions, and unknown refinements", async () => {
    const cases: ReadonlyArray<readonly [Schema.Schema<unknown>, string]> = [
      [Schema.Number.pipe(Schema.int(), Schema.greaterThan(Number.MAX_SAFE_INTEGER)), "overflows"],
      [Schema.Number.pipe(Schema.int(), Schema.lessThan(Number.MIN_SAFE_INTEGER)), "overflows"],
      [Schema.Number.pipe(Schema.int(), Schema.greaterThan(1.5)), "safe integer"],
      [
        Schema.Union(Schema.Literal("text"), Schema.Literal(1)),
        "same boolean, integer, or string sort",
      ],
      [
        Schema.Number.pipe(
          Schema.int(),
          Schema.filter((value) => value !== 0),
        ),
        "only Schema.int",
      ],
    ];

    for (const [schema, message] of cases) {
      const proof = Verify.proof(
        "unsupported-schema",
        Effect.gen(function* () {
          yield* Verify.anySchema(schema, { name: "value" });
          yield* Verify.assert(Sym.literal(true));
        }),
      );

      await expect(Effect.runPromise(compileProof(proof))).rejects.toThrow(message);
    }
  });

  it("rejects floating-point schemas and arbitrary predicates", async () => {
    const unsupported = Verify.proof(
      "unsupported-number",
      Effect.gen(function* () {
        yield* Verify.anySchema(Schema.Number, { name: "number" });
        yield* Verify.assert(Sym.literal(true));
      }),
    );

    await expect(Effect.runPromise(compileProof(unsupported))).rejects.toThrow("floating-point");

    const Filtered = Schema.Number.pipe(
      Schema.int(),
      Schema.filter((value) => value >= 0),
    );

    const arbitrary = Verify.proof(
      "arbitrary-filter",
      Effect.gen(function* () {
        yield* Verify.anySchema(Filtered, { name: "filtered" });
        yield* Verify.assert(Sym.literal(true));
      }),
    );

    await expect(Effect.runPromise(compileProof(arbitrary))).rejects.toThrow("only Schema.int");
  });
});
