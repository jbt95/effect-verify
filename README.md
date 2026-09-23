# Effect Verify

Effect Verify is a prototype solver-backed verifier for an explicit symbolic subset of Effect TypeScript. It can verify:

- mathematical-integer properties built with `Sym` and `Verify`
- a restricted subset of exported pure TypeScript functions
- a smaller set of functions that return `Effect.succeed` or `Effect.fail`

The verifier does not execute the function under test. It parses and lowers supported source, asks Z3 whether an assertion can fail, and returns either `Verified` or a concrete counterexample.

This is not a general JavaScript model checker. It rejects unsupported source, schemas, and operations instead of guessing. Read the [soundness contract](docs/soundness.md) before relying on a result.

## Requirements

- Node.js 22.18 or newer. The CLI loads TypeScript proof modules with Node's native type stripping.
- pnpm 11.18 or newer. The repository pins the expected version in `package.json`.

## Quick start

Run these commands from the repository root:

```sh
pnpm install
pnpm build
pnpm effect-verify examples/source/proof.ts clampIsNonNegative
```

The final command prints a JSON result whose `kind` is `Verified`. To see a counterexample, run a property that is false:

```sh
pnpm effect-verify examples/source/proof.ts decrementIsNonNegative
```

The current run reports the witness `value = 0` and `result = -1`. The exact SAT model is not part of the API; any valid counterexample proves the claim is false. This command exits with status 1 because the proof failed.

Other examples cover the main APIs:

| Proof API                          | Example command                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Symbolic builder                   | `pnpm effect-verify examples/arithmetic/proof.ts uint8Bounds`                |
| Effect Schema inputs               | `pnpm effect-verify examples/schema/proof.ts assessmentValuesStayInRange`    |
| Pure source function               | `pnpm effect-verify examples/source/proof.ts transferPreservesBalanceBounds` |
| Effect source function             | `pnpm effect-verify examples/source/effect-proof.ts positiveOrDeniedIsSafe`  |
| Assumptions and banking invariants | `pnpm effect-verify examples/banking/proof.ts transferWithFeeCannotOverdraw` |

## Write a source proof

A source proof connects a symbolic postcondition to one exported pure function. This example assumes `functions.ts` and `proof.ts` are in the same directory.

```ts
// functions.ts
export const clamp = (value: number): number => (value < 0 ? 0 : value);
```

```ts
// proof.ts
import { Sym, Verify } from "@effect-verifier/core";

type Functions = typeof import("./functions.ts");

export const clampIsNonNegative = Verify.sourceFunction<Functions, "clamp">({
  name: "clamp-is-non-negative",
  sourceFile: "./functions.ts",
  functionName: "clamp",
  inputs: [Verify.integer({ min: -100, max: 100 })],
  assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
});
```

Run it with:

```sh
pnpm effect-verify proof.ts clampIsNonNegative
```

The input domain is a precondition on the claim. The verifier does not check that application code supplies inputs in that domain.

The frontend requires explicit `number` or `boolean` parameter and return types. It supports the operators and statement forms listed in the [source proof guide](docs/usage.md#prove-a-pure-source-function). Unsupported code produces a compile error; it is never approximated.

## CLI results and exit codes

The command syntax is:

```text
effect-verify <proof-module.ts|proof-module.js> [exportName]
```

If the export name is omitted, the CLI selects a `default` proof or the only proof in the module.

| Exit code | Result               | Meaning                                                                                                              |
| --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0         | `Verified`           | Z3 found no counterexample for any assertion under the encoded assumptions.                                          |
| 1         | `Failed`             | Z3 found at least one counterexample. The JSON result includes values for the modeled inputs and result.             |
| 2         | No structured result | The proof, source, schema, solver, or CLI operation was unsupported or invalid. The diagnostic is written to stderr. |

A `Verified` result applies to the encoded model and its stated domains. It does not prove behavior for inputs outside those domains, arbitrary JavaScript syntax, or runtime effects that were not modeled. [Test the running program as well as the modeled property](docs/vitest-comparison.md).

## Documentation map

- [Documentation index](docs/README.md): task-oriented links to every guide.
- [Usage guide](docs/usage.md): CLI behavior, proof APIs, examples, and troubleshooting.
- [Soundness contract](docs/soundness.md): the exact modeled subset and the meaning of each result.
- [Architecture](docs/architecture.md): package boundaries and the compilation pipeline.
- [Effect Verify and Vitest](docs/vitest-comparison.md): what a proof establishes compared with a passing test.
- [Benchmarks](docs/benchmarks.md): solver throughput at larger batch and suite sizes.
- [Roadmap](docs/roadmap.md): current prototype scope and planned work.

## Development

```sh
pnpm test          # build, type-check examples, and run tests
pnpm lint          # run Oxlint
pnpm format:check  # check formatting with Oxfmt
pnpm benchmark     # run the solver performance benchmark
pnpm check         # run formatting, lint, and tests
```
