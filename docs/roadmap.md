# Roadmap

This prototype prioritizes a small proof language and explicit failure over broad, approximate source analysis.

## Implemented prototype

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

## Next: strengthen the core

- compare solver results and decoded models with direct evaluation across small finite domains
- expand translation and model-decoding tests beyond the current finite-domain differential checks
- add useful inspection output for normalized verification IR and translated solver expressions
- make proof-module discovery clearer when several exports are present
- improve compile-time ergonomics and validation for straight-line proof builders

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
