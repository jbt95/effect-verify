/**
 * Compile-time tests for `Verify.sourceEffectFunction`.
 *
 * Nothing here runs: the file exists so `tsc -p tsconfig.tests.json` checks the
 * generic argument constraints. A positive case must compile, and a case marked
 * with `@ts-expect-error` must fail to compile. An unused `@ts-expect-error`
 * directive is itself a compile error, so a rejection that silently became
 * accepted breaks the build.
 *
 * `EffectFixtures` is the real fixture module, so every `functionName` is
 * checked against its actual exports. `DocumentedRejections` covers the
 * documented rejections that the fixture module has no target for; its entries
 * are type-only shapes and are never handed to the source frontend.
 */
import type * as EffectFixturesModule from "./source-effect-fixtures.ts";
import type { Effect } from "effect";
import { Sym, Verify } from "@effect-verifier/core";

type EffectFixtures = typeof EffectFixturesModule;

type DocumentedRejections = {
  /** Success type is neither exactly `number` nor exactly `boolean`. */
  readonly mixedSuccess: () => Effect.Effect<number | boolean, "Denied", never>;
  /** A parameter is optional, so its position is not a fixed input tuple. */
  readonly optionalParameter: (value?: number) => Effect.Effect<number, "Denied", never>;
  /** The target does not return an `Effect` at all. */
  readonly plainFunction: (value: number) => number;
};

Verify.sourceEffectFunction<EffectFixtures, "integerOutcome">({
  name: "integer-types",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "integerOutcome",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: (_inputs, value) => Sym.gte(value, Sym.literal(0)),
  failure: (_inputs, tag) =>
    Sym.or(Sym.eq(tag, Sym.literal("Denied")), Sym.eq(tag, Sym.literal("Missing"))),
});

Verify.sourceEffectFunction<EffectFixtures, "booleanOutcome">({
  name: "boolean-types",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "booleanOutcome",
  inputs: [Verify.boolean()],
  resultSort: "Bool",
  success: (_inputs, value) => value,
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

// A declared failure tag may be "Success" because the outcome variant is separate.
Verify.sourceEffectFunction<EffectFixtures, "successNamedFailure">({
  name: "success-named-failure",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "successNamedFailure",
  inputs: [],
  success: (_inputs, value) => Sym.gte(value, Sym.literal(0)),
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Success")),
});

Verify.sourceEffectFunction<EffectFixtures, "integerOutcome">({
  name: "integer-sort-rejected",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "integerOutcome",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  // @ts-expect-error numeric success cannot declare the Bool result sort
  resultSort: "Bool",
  success: (_inputs, value) => Sym.gte(value, Sym.literal(0)),
  failure: (_inputs, tag) =>
    Sym.or(Sym.eq(tag, Sym.literal("Denied")), Sym.eq(tag, Sym.literal("Missing"))),
});

// @ts-expect-error boolean success requires the explicit Bool discriminator
Verify.sourceEffectFunction<EffectFixtures, "booleanOutcome">({
  name: "boolean-sort-required",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "booleanOutcome",
  inputs: [Verify.boolean()],
  success: (_inputs, value) => value,
  failure: (_inputs, tag) => Sym.eq(tag, Sym.literal("Denied")),
});

// @ts-expect-error widened string errors are not finite literal tags
Verify.sourceEffectFunction<EffectFixtures, "unknownFailure">({
  name: "widened",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "unknownFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error object errors are unsupported
Verify.sourceEffectFunction<EffectFixtures, "objectFailure">({
  name: "object",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "objectFailure",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error required environments are unsupported
Verify.sourceEffectFunction<EffectFixtures, "requiredEnvironment">({
  name: "service",
  sourceFile: "./source-effect-fixtures.ts",
  functionName: "requiredEnvironment",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error mixed success payload sorts are unsupported
Verify.sourceEffectFunction<DocumentedRejections, "mixedSuccess">({
  name: "mixed",
  sourceFile: "",
  functionName: "mixedSuccess",
  inputs: [],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error optional parameters are not a fixed input tuple
Verify.sourceEffectFunction<DocumentedRejections, "optionalParameter">({
  name: "optional-parameter",
  sourceFile: "",
  functionName: "optionalParameter",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});

// @ts-expect-error a target that does not return an Effect is not selectable
Verify.sourceEffectFunction<DocumentedRejections, "plainFunction">({
  name: "plain-function",
  sourceFile: "",
  functionName: "plainFunction",
  inputs: [Verify.integer({ min: 0, max: 1 })],
  success: () => Sym.literal(true),
  failure: () => Sym.literal(true),
});
