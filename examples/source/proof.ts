import { Sym, Verify } from "@effect-verifier/core";

type SourceFunctions = typeof import("./functions.ts");

export const clampIsNonNegative = Verify.sourceFunction<SourceFunctions, "clamp">({
  name: "clamp-is-non-negative",
  sourceFile: "./functions.ts",
  functionName: "clamp",
  inputs: [Verify.integer({ min: -100, max: 100 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});

export const decrementIsNonNegative = Verify.sourceFunction<SourceFunctions, "decrement">({
  name: "decrement-is-non-negative",
  sourceFile: "./functions.ts",
  functionName: "decrement",
  inputs: [Verify.integer({ min: 0, max: 10 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});

export const transferPreservesBalanceBounds = Verify.sourceFunction<
  SourceFunctions,
  "balanceAfterTransfer"
>({
  name: "transfer-preserves-balance-bounds",
  sourceFile: "./functions.ts",
  functionName: "balanceAfterTransfer",
  inputs: [
    Verify.integer({ min: 0, max: 1_000 }),
    Verify.integer({ min: 0, max: 500 }),
    Verify.integer({ min: 0, max: 25 }),
    Verify.integer({ min: 0, max: 500 }),
  ],
  assertion: ([balance], result) =>
    Sym.and(Sym.gte(result, Sym.literal(0)), Sym.lte(result, balance)),
});

export const discountKeepsPriceInBounds = Verify.sourceFunction<
  SourceFunctions,
  "priceAfterDiscount"
>({
  name: "discount-keeps-price-in-bounds",
  sourceFile: "./functions.ts",
  functionName: "priceAfterDiscount",
  inputs: [
    Verify.integer({ min: 0, max: 1_000 }),
    Verify.integer({ min: 0, max: 500 }),
    Verify.integer({ min: 0, max: 500 }),
  ],
  assertion: ([price], result) => Sym.and(Sym.gte(result, Sym.literal(0)), Sym.lte(result, price)),
});
