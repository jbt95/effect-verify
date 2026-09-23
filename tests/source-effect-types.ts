import type { Effect } from "effect";
import { Sym, Verify } from "@effect-verifier/core";

type TypeFixtures = {
  readonly integer: (value: number) => Effect.Effect<number, "Denied" | "Missing", never>;
  readonly boolean: (enabled: boolean) => Effect.Effect<boolean, "Denied", never>;
  readonly widenedError: () => Effect.Effect<number, string, never>;
  readonly mixedSuccess: () => Effect.Effect<number | boolean, "Denied", never>;
  readonly service: () => Effect.Effect<number, "Denied", { readonly service: string }>;
  readonly errorObject: () => Effect.Effect<number, { readonly _tag: "Denied" }, never>;
};

Verify.sourceEffectFunction<TypeFixtures, "integer">({
  name: "integer-types",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "integer",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: (_inputs, value) => Sym.gte(value, Sym.literal(0)),
  failure: (_inputs, tag) =>
    Sym.or(Sym.eq(tag, Sym.literal("Denied")), Sym.eq(tag, Sym.literal("Missing"))),
});

Verify.sourceEffectFunction<TypeFixtures, "boolean">({
  name: "boolean-types",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "boolean",
  inputs: [Verify.boolean()],
  resultSort: "Bool",
  success: (_inputs, value) => value,
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

// @ts-expect-error boolean success requires the explicit Bool discriminator
Verify.sourceEffectFunction<TypeFixtures, "boolean">({
  name: "boolean-sort-required",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "boolean",
  inputs: [Verify.boolean()],
  success: (_inputs, value) => value,
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

// @ts-expect-error widened string errors are not finite literal tags
Verify.sourceEffectFunction<TypeFixtures, "widenedError">({
  name: "widened",
  sourceFile: "",
  functionName: "widenedError",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error mixed success payload sorts are unsupported
Verify.sourceEffectFunction<TypeFixtures, "mixedSuccess">({
  name: "mixed",
  sourceFile: "",
  functionName: "mixedSuccess",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error required environments are unsupported
Verify.sourceEffectFunction<TypeFixtures, "service">({
  name: "service",
  sourceFile: "",
  functionName: "service",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error object errors are unsupported
Verify.sourceEffectFunction<TypeFixtures, "errorObject">({
  name: "object",
  sourceFile: "",
  functionName: "errorObject",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});
