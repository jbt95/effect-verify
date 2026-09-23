import { Sym, Verify } from "@effect-verifier/core";

type EffectFunctions = typeof import("./effect-functions.ts");

export const positiveOrDeniedIsSafe = Verify.sourceEffectFunction<
  EffectFunctions,
  "positiveOrDenied"
>({
  name: "positive-or-denied-is-safe",
  sourceFile: "./effect-functions.ts",
  functionName: "positiveOrDenied",
  inputs: [Verify.integer({ min: -2, max: 2 })],
  success: (_inputs, value) => Sym.gt(value, Sym.literal(0)),
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

export const enabledOrDeniedIsTrue = Verify.sourceEffectFunction<
  EffectFunctions,
  "enabledOrDenied"
>({
  name: "enabled-or-denied-is-true",
  sourceFile: "./effect-functions.ts",
  functionName: "enabledOrDenied",
  inputs: [Verify.boolean()],
  resultSort: "Bool",
  success: (_inputs, value) => value,
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});
