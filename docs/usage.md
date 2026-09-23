# Usage guide

This guide covers the command-line interface, the three proof APIs, and common errors. The [soundness contract](soundness.md) remains authoritative for what a result means.

## Install and build

Use Node.js 22.18 or newer and pnpm 11.18 or newer. From the repository root:

```sh
pnpm install
pnpm build
```

The workspace packages resolve through `workspace:*`, so use the repository's package manager rather than installing each package separately.

## Run a proof

The CLI accepts one proof module and an optional export name:

```text
pnpm effect-verify <proof-module.ts|proof-module.js> [exportName]
```

For example:

```sh
pnpm effect-verify examples/source/proof.ts clampIsNonNegative
```

The proof module is loaded with Node. TypeScript files must use syntax that Node can erase without compiling, such as type annotations and `import type`; enums, namespaces with runtime values, and other non-erasable syntax are not supported. Compiled JavaScript proof modules also work.

When the export name is omitted, the CLI selects:

1. a proof exported as `default`, if present
2. the only proof in the module, if there is exactly one

Otherwise it asks you to name an export. Non-proof exports are ignored.

## Understand the result

The CLI writes successful verification results as JSON to stdout.

| Exit code | Result            | What to do                                                                                   |
| --------- | ----------------- | -------------------------------------------------------------------------------------------- |
| 0         | `Verified`        | Every assertion was unsatisfiable after negation under the shared assumptions.               |
| 1         | `Failed`          | Inspect the failed assertion and replay its modeled inputs.                                  |
| 2         | Operational error | Read the diagnostic on stderr. Unsupported or invalid input is never reported as `Verified`. |

A failed result includes a `counterexample` for every failed assertion and a top-level `failures` array for convenient automation. Integer values are JSON strings because the result can exceed JavaScript's safe-integer range.

For source proofs, replay only the declared inputs against the real function. The `result` entry is the verifier's modeled output, not another function argument.

## Build a symbolic proof

Use the symbolic API when the property is easier to state directly than to attach to a supported function. The proof is an Effect program that emits typed symbolic IR.

```ts
import { Effect } from "effect";
import { Sym, Verify } from "@effect-verifier/core";

export const uint8Bounds = Verify.proof(
  "uint8-bounds",
  Effect.gen(function* () {
    const value = yield* Verify.any(Verify.uint({ bits: 8 }), { name: "value" });

    yield* Verify.assert(Sym.gte(value, Sym.literal(0)), "UInt8 lower bound");
    yield* Verify.assert(Sym.lte(value, Sym.literal(255)), "UInt8 upper bound");
  }),
);
```

Run it:

```sh
pnpm effect-verify path/to/proof.ts uint8Bounds
```

The builder supports these allocation methods:

| Call                           | Symbolic input                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `Verify.integer({ min, max })` | A mathematical integer with optional inclusive bounds. Both bounds may be omitted.           |
| `Verify.uint({ bits })`        | An integer in `[0, 2^bits - 1]`, with `bits` from 1 through 53.                              |
| `Verify.int({ bits })`         | An integer in `[-2^(bits - 1), 2^(bits - 1) - 1]`.                                           |
| `Verify.boolean()`             | `true` or `false`.                                                                           |
| `Verify.anyString({ name })`   | A symbolic string. Add an explicit membership assumption when only finite strings are valid. |
| `Verify.any(domain, { name })` | An integer or boolean based on the domain.                                                   |

Use `Verify.assume` to add shared preconditions. Use `Verify.assert` for each property that must hold. Every assertion is checked independently as `assumptions && !assertion`. Unsatisfiable assumptions and proofs with no assertions are errors, so a result cannot pass vacuously.

`Sym` builds typed expressions rather than interpreting ordinary JavaScript operators. Use methods such as `Sym.add`, `Sym.and`, and `Sym.ifThenElse`; both branches of a conditional must have the same symbolic sort. Integer literals must be safe JavaScript integers. `Sym.div` and `Sym.mod` use SMT integer semantics, not JavaScript number division or remainder.

Keep the builder straight-line. Host-language branches, loops, mutation, and external effects can change which constraints are emitted and are outside the proof semantics.

## Prove a pure source function

`Verify.sourceFunction` attaches a postcondition to one exported pure TypeScript function. The CLI parses and lowers that function; it never imports or calls the target module.

Create the target function with explicit parameter and return annotations:

```ts
// functions.ts
export const clamp = (value: number): number => (value < 0 ? 0 : value);
```

Create a proof module beside it:

```ts
// proof.ts
import { Sym, Verify } from "@effect-verifier/core";

type Functions = typeof import("./functions.ts");

export const clampIsNonNegative = Verify.sourceFunction<Functions, "clamp">({
  name: "clamp-is-non-negative",
  sourceFile: "./functions.ts",
  functionName: "clamp",
  inputs: [Verify.integer({ min: -100, max: 100 })],
  assertion: (inputs, result) => Sym.gte(result, Sym.literal(0)),
});
```

The fields have distinct roles:

| Field            | Purpose                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | Human-readable proof name included in the result.                                                                                                   |
| `sourceFile`     | Target file, resolved relative to the proof module.                                                                                                 |
| `functionName`   | The single exported function declaration or exported `const` arrow function to verify.                                                              |
| `inputs`         | Positional domains matching the target parameters.                                                                                                  |
| `assertion`      | A predicate over the input symbols and symbolic result.                                                                                             |
| `resultSort`     | Optional for `number`; required as `"Bool"` for a boolean return. The source compiler equates the result symbol with the lowered return expression. |
| `assertionLabel` | Optional replacement for the formatted assertion in output.                                                                                         |

The first generic argument must resolve to a type-only module reference such as `typeof import("./functions.ts")`; a type alias for that reference is also supported. The second generic must be a supported export name. TypeScript uses them to check arity, parameter sorts, and result sort. The CLI then uses the TypeScript checker to resolve the first argument, including aliases, and require that `sourceFile` resolves to the same canonical module.

The source frontend currently accepts this subset:

| Area             | Accepted                                                                                                                               | Rejected                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Function shape   | Exported function or `const` arrow, explicit `number`/`boolean` signatures, no generics or async/generators                            | Optional, rest, defaulted, or dynamic signatures                                                    |
| Expressions      | Literals, parameters, immutable `const` locals, `+`, `-`, `*`, comparisons, strict equality, `!`, `&&`, `\|\|`, same-sort conditionals | Calls, division, modulo, coercion, mutation, unions, and mixed-sort branches                        |
| Statements       | Return paths, nested `if`/`else`, one canonical counted `for` loop up to 32 iterations                                                 | Nested or dynamic loops, `break`, `continue`, assignments, and incomplete returns                   |
| Numeric contract | Finite safe-integer `min` and `max` for every numeric input; statically safe arithmetic                                                | Unbounded numeric inputs, floating-point numbers, and results that may leave the safe-integer range |
| Result           | Numeric return with default `"Int"`, or boolean return with `resultSort: "Bool"`                                                       | A result sort that disagrees with the declaration or an independently supplied result range         |

Each numeric input needs a finite safe-integer domain:

```ts
inputs: [Verify.integer({ min: 0, max: 1_000 })];
```

Use `Verify.boolean()` for boolean parameters. The source frontend supports literals, parameters, immutable `const` locals, same-sort conditionals, unary `+` and `-`, arithmetic `+`, `-`, and `*`, numeric comparisons, strict equality, and boolean `!`, `&&`, and `||`. It also unrolls one canonical counted `for` loop of at most 32 iterations with literal bounds and steps.

The frontend rejects calls, mutable locals, dynamic or nested loops, division, modulo, floating-point arithmetic, incomplete returns, unsupported statements, and arithmetic that may leave JavaScript's safe-integer range. It also rejects unsupported exports and ambiguous shadowing. See [source functions in the soundness contract](soundness.md#source-functions) for the exact subset.

Declared input domains are preconditions. `isValidSourceInputs(proof, candidate)` checks a runtime tuple against those domains without loading the target function, but the caller remains responsible for invoking the real function only after validation.

## Prove an Effect source function

`Verify.sourceEffectFunction` verifies a small, effect-free subset of functions that return `Effect.succeed` or `Effect.fail`. It still parses the source; it does not run the Effect or provide services.

The target needs an explicit return type, a `number` or `boolean` success type, `never` or a finite union of string-literal errors, and `never` for the environment:

```ts
// effect-functions.ts
import { Effect } from "effect";

export const positiveOrDenied = (value: number): Effect.Effect<number, "Denied", never> =>
  value > 0 ? Effect.succeed(value) : Effect.fail("Denied");
```

Define one predicate for successful values and one for failure tags:

```ts
// effect-proof.ts
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
```

The frontend accepts only the actual imported `Effect.succeed` and `Effect.fail` functions, direct string-literal failure tags, supported payloads, and finite conditional branches. Arbitrary Effect methods, wrappers, object errors, generators, async functions, loops, and missing return paths are rejected. Boolean success values require `resultSort: "Bool"`.

The verifier keeps the outcome variant separate from the failure tag. This means a declared failure tag can safely be `"Success"` without colliding with the internal success variant. See [Effect-returning source functions](soundness.md#effect-returning-source-functions).

## Add Effect Schema inputs

`@effect-verifier/schema` extends the core `Verify` object with `anySchema`. The schema package walks the public Effect Schema AST and fails on anything outside its allowlist.

```ts
import { Effect, Schema } from "effect";
import { Sym } from "@effect-verifier/core";
import { Verify } from "@effect-verifier/schema";

const Score = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(100),
);

export const scoreStaysInRange = Verify.proof(
  "score-stays-in-range",
  Effect.gen(function* () {
    const score = yield* Verify.anySchema(Score, { name: "score" });

    yield* Verify.assert(Sym.gte(score, Sym.literal(0)));
    yield* Verify.assert(Sym.lte(score, Sym.literal(100)));
  }),
);
```

The supported Schema subset includes booleans, safe integers and numeric range refinements, same-sort literal unions, required records, and fixed tuples. Floating-point numbers, arbitrary filters, optional fields or tuple elements, index signatures, tuple rest elements, and mixed-sort unions are unsupported. String symbols are constrained only when they come from a finite literal union or an explicit assumption.

The `examples/schema/proof.ts` and `examples/banking/proof.ts` modules show nested schema values and explicit assumptions.

## Use the verifier programmatically

The CLI is a thin coordinator. Tests and build steps can call the core compiler and Z3 backend directly. Always close the backend when the check is done.

```ts
import { Effect } from "effect";
import { compileProof } from "@effect-verifier/core";
import { makeZ3Backend } from "@effect-verifier/z3";
import { uint8Bounds } from "./proof.ts";

const backend = await Effect.runPromise(makeZ3Backend());

try {
  const program = await Effect.runPromise(compileProof(uint8Bounds));
  console.log(program.assertions);

  const result = await Effect.runPromise(backend.verify(program));
  console.log(result);
} finally {
  await Effect.runPromise(backend.close());
}
```

Use `verifyProof(proof, backend)` when you do not need to inspect the normalized program. It compiles the proof and sends it to the backend in one step. The `backend` still needs to be closed.

A backend instance serializes its solver checks. Reusing one instance for several proofs is supported, but do not share it across unrelated processes without coordinating ownership.

## Common errors

### The CLI cannot choose a proof

Pass the named export as the second argument. The diagnostic asks you to export a `default` proof or name the export; inspect the module to find the declaration name.

### A TypeScript proof module cannot be loaded

Remove runtime TypeScript features that Node cannot erase. Compile the proof to JavaScript or change the construct to erasable TypeScript.

### The source function uses unsupported code

Check the exact allowlist in the [soundness contract](soundness.md). A compile error names the unsupported syntax. The verifier does not execute the function to discover a fallback meaning.

### A source proof is missing or unbounded

Source-function numeric inputs need both `min` and `max`, and both must be safe integers. The symbolic builder can use unbounded integer domains, but source proofs cannot because every JavaScript result must remain within the safe-integer range.

### `sourceFile` does not match the type-only import

Use the same file in `typeof import("./target.ts")` and `sourceFile`, resolving from the proof module. Relative paths in the two fields do not have to be textually identical, but they must identify the same canonical file.

### Z3 returns `unknown`

Treat `unknown` as an operational error. It is never a verified result. Simplify the formula or its domains if the solver cannot decide the query.
