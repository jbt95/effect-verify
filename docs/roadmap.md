# Roadmap

This project prioritizes a small proof language and explicit failure over broad, approximate source analysis.

## Implemented

### Verification

- pnpm workspace with strict TypeScript 7.x builds
- typed Effect proof builder for mathematical integers, booleans, and symbolic strings
- Z3 backend with explicit assumptions, independent assertions, and decoded counterexamples
- bounded and unbounded symbolic input domains
- fail-closed Effect Schema translation for integers, literal unions, required records, and fixed tuples
- pure TypeScript source proofs for supported numeric and boolean functions
- one bounded counted-loop unrolling form with a 32-iteration cap
- source Effect proofs for direct `Effect.succeed` and `Effect.fail` outcomes with finite string-literal errors
- JSON CLI output, repository examples, solver tests, and concrete counterexample replay
- documented soundness boundaries and source-to-proof identity checks

### Tooling

- continuous integration running format, lint, type checks, the vendored rule suite, the
  test suite, and an end-to-end assertion of the documented CLI exit-code contract
- `tests/` and `benchmarks/` covered by a dedicated `tsconfig.tests.json`
- per-query solver budget through `makeZ3Backend({ timeoutMilliseconds })` and `--timeout`,
  where an expired budget is an error rather than a `Verified` result
- CLI flags for `--help`, `--version`, `--list`, and `--timeout`; unrecognized options are
  rejected instead of ignored
- deterministic CLI termination, so a proof module that leaves a live handle cannot stall
  the process
- npm packaging metadata and a `prepack` build for all five packages, verified to ship
  real `dist` output from a clean clone
- an MIT `LICENSE` file backing the license declared in every package manifest

### Performance

Source compilation no longer re-lowers a statement's continuation once per branch. That
made a chain of sequential `if` statements cost time exponential in the chain length: 28 of
them took 148 seconds before the fix and 0.8 seconds after. Long chains are now flat.

## Next: publish

The five packages are versioned, licensed, and pack correctly, but none is on a registry.
Before the first release:

- claim the npm scope
- confirm the version matches the documented behavior
- publish, then verify a consumer can `npm install` and run the CLI

## Next: strengthen the core

- compare solver results and decoded models with direct evaluation across small finite domains
- expand translation and model-decoding tests beyond the current finite-domain differential checks
- add useful inspection output for normalized verification IR and translated solver expressions
- add a mode that verifies every proof in a module instead of requiring an export name
- improve compile-time ergonomics and validation for straight-line proof builders

## Later: restructure the frontend

`packages/typescript/src/index.ts` is a single translation unit of roughly two thousand
lines containing two structurally duplicated statement walkers. Every new statement kind or
expression form must currently be implemented twice, and the two copies have already
diverged. Until the walkers are merged, adding a form such as `switch`, `while`, `/`, `%`,
or `Math.*` risks a `Verified` result about a function the frontend only half modeled.

## Later: extend Effect semantics

First define a small, explicit semantics for success and typed failure alternatives. Then consider verification-specific service implementations for symbolic dependencies. Verification must never invoke real filesystem or network services.

If loops are added to the symbolic builder, they need explicit finite bounds. Arbitrary loops and recursion remain outside the intended subset.

## Explicit non-goals

The project does not plan to model:

- arbitrary JavaScript execution or compiler transforms
- unrestricted TypeScript static analysis
- implicit coercion or floating-point arithmetic
- silent approximations for unknown schemas or source syntax
- application-wide proof that runtime callers satisfy proof input domains
- vacuous proofs based on inconsistent assumptions

A smaller fail-closed IR is preferred when broad support would weaken the meaning of `Verified`.
