import { Effect } from "effect";
import { Sym, Verify } from "@effect-verifier/core";

export const uint8Bounds = Verify.proof(
  "uint8-bounds",
  Effect.gen(function* () {
    const x = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "x" });
    yield* Verify.assert(Sym.lte(x, Sym.literal(255)), "UInt8 upper bound");
    yield* Verify.assert(Sym.gte(x, Sym.literal(0)), "UInt8 lower bound");
  }),
);

export const uint8Below100 = Verify.proof(
  "uint8-below-100",
  Effect.gen(function* () {
    const x = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "x" });
    yield* Verify.assert(Sym.lt(x, Sym.literal(100)), "x is less than 100");
  }),
);

export const clampNeverProducesNegative = Verify.proof(
  "clamp-never-produces-negative",
  Effect.gen(function* () {
    const input = yield* Verify.any(Verify.integer({ min: -100, max: 100 }), {
      name: "input",
    });

    const clamped = Sym.ifThenElse(Sym.gte(input, Sym.literal(0)), input, Sym.literal(0));

    yield* Verify.assert(Sym.gte(clamped, Sym.literal(0)), "clamped value is non-negative");
    yield* Verify.assert(Sym.lte(clamped, Sym.literal(100)), "clamped value stays in range");
  }),
);
