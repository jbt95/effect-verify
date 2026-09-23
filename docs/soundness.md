# Soundness contract

This prototype document defines what a `Verified` result means and, just as importantly, what it does not mean. Start with the [usage guide](usage.md) for commands and proof construction, then use this document to set expectations for a result.

## What is modeled

- Symbolic values allocated by `Verify.any`, `Verify.anyString` (or `Verify.anySchema` through the schema package's `Verify` facade), plus source-function arguments/results created by `Verify.sourceFunction` and tagged outcomes created by `Verify.sourceEffectFunction`; expressions are built through the typed `Sym.*` API.
- Boolean logic, mathematical integer literals/arithmetic/comparisons, native String literals/variables/equality/conditionals, and the supported schema-generated constraints. Schema string variables are constrained to their exact finite literal/union members; they are not arbitrary strings.
- Effect Schema integer refinements `greaterThanOrEqualTo(n)` and `lessThanOrEqualTo(n)` encode inclusive endpoints `n`; `greaterThan(n)` encodes `n + 1`, and `lessThan(n)` encodes `n - 1`. Exclusive arithmetic is accepted only when the endpoint remains a safe integer. Refinements intersect exactly, and overflow, empty ranges, floats, and unknown refinements are rejected.
- Domain constraints registered at allocation time. For example, `Verify.uint({ bits: 8 })` means an integer `x` constrained by `0 <= x <= 255`.
- Explicit assumptions and each assertion's negation, translated into Z3 constraints.

## What is not modeled

Effect Verify is not a general TypeScript or JavaScript model checker.

### Source functions

Each source proof selects one exported function or exported `const` arrow function with explicit `number` or `boolean` parameter and return annotations. Parameters cannot be optional, rest, defaulted, generic, async, or generator parameters. The function cannot be generic, async, or a generator. Numeric parameters need finite safe-integer input bounds. The body is an expression, or a block with supported immutable `const` locals followed by a return, exhaustive nested `if`/`else` returns, or one supported counted loop.

Input-domain tuples are positional: use `Verify.integer(...)` for numeric parameters and `Verify.boolean()` for boolean parameters. Boolean-returning proofs must opt in with `resultSort: "Bool"`; numeric returns default to `"Int"`. The result sort selects only the symbolic result variable's sort. The source compiler equates that variable with the lowered return expression, so a proof cannot supply an independent result range. The supported expressions are numeric and boolean literals, parameter references, unary `+` and `-`, arithmetic `+`, `-`, and `*`, numeric comparisons, strict numeric equality, boolean `!`, `&&`, and `||`, and conditional expressions with same-sort branches.

Calls, mutable locals, assignments, unsupported statements, incomplete return paths, ambiguous local shadowing (including parameters), exceptions, floating-point operations, division, modulo, coercions, unions, mixed-sort conditionals, and other syntax are rejected. A single canonical counted `for` loop may be unrolled when it has a `let` induction variable initialized by a safe-integer literal, a comparison of that variable against a safe-integer literal, and a canonical `++`, `--`, `+= literal`, or `-= literal` update moving toward the bound. The loop must execute no more than 32 iterations. Zero or wrong-direction steps, unsafe induction values, dynamic bounds or steps, nested loops, mutation other than the induction update, `break`, `continue`, and unsupported loop-body control flow are rejected. The induction variable is substituted with its compile-time integer value on every iteration; only supported immutable `const` locals and conditional early returns may appear in the loop body. Supported conditional early returns before or within the loop are composed with the remaining path and the post-loop fallback return. No target function is executed.

A local must be a single named `const` with an initializer supported by the expression subset; locals are visible only after declaration, and nested blocks use lexical environments. Local shadowing is rejected rather than resolved. Every arithmetic result must be provably within JavaScript's safe-integer range; interval analysis can conservatively reject a function when it cannot establish that bound. The frontend checks syntax and stated annotations. For the source Effect API, it also uses targeted TypeScript checker resolution for the imported Effect return type and methods; it does not perform full semantic type-checking of the target module or infer behavior from arbitrary types.

### Effect-returning source functions

`Verify.sourceEffectFunction` is separate from `sourceFunction`, which retains its pure-function behavior. Its target must explicitly return `Effect.Effect<A, E, never>` from the actual imported Effect type, with success type exactly `number` or `boolean`, `E` equal to `never` or a finite union of string-literal tags, and no required environment. Numeric success values are modeled as safe integers under finite safe-integer input domains. The body may contain supported immutable `const` locals, returns, and finite conditional branches of actual imported `Effect.succeed` / `Effect.fail` calls, including import aliases. Failure payloads must be direct string literals. The API rejects wrappers, arbitrary calls, other Effect methods, object errors, dynamic or widened tags, unsupported payloads, async functions, generators, loops, and missing return paths.

The symbolic outcome has a variant tag (`"Success"` or `"Failure"`), a separate failure-tag string, and a success payload. This keeps the variant discriminator disjoint from error values, so a declared failure tag such as `"Success"` remains unambiguous. Proof callbacks supply separate success-value and failure-tag predicates. The source compiler combines them with an if-then-else on the variant tag, constrains failure tags to their declared finite set on failure outcomes, and guards the success-payload equality to success outcomes. Thus the inactive success payload is not inspected on a failure variant. Source is parsed and lowered only; target Effect values are never run and no services are provided.

### Proof construction

The symbolic DSL does not infer meaning from ordinary JavaScript operators. A proof builder is ordinary host code that emits constraints, not an interpreter for the program under test. Branching or side effects in the builder can change which constraints are emitted. Keep proof construction straight-line and declarative; arbitrary TypeScript execution is outside the model.

## Integer semantics

Numeric symbols are Z3 mathematical integers, not machine integers, bitvectors, or general IEEE-754 values. In the symbolic API, bounds are inclusive constraints and arithmetic is mathematical integer arithmetic. Integer `div` and `mod` use Z3/SMT integer semantics, not JavaScript `/` and `%`; they are only allowed in assertions when every divisor is nonzero under all assumptions, and are rejected inside assumptions.

For `Verify.sourceFunction` and `Verify.sourceEffectFunction`, a type-only module reference constrains the selected function name and positional input tuple at compile time. At verification time, the frontend inspects the selected proof export with the TypeScript checker, resolves the call's first type argument (including a type alias) to its module source file, and requires that canonical file to match `sourceFile` resolved relative to the proof module. Missing, ambiguous, unresolved, or mismatched identity fails closed. This check does not import the target module at runtime or execute its functions; the proof module itself is loaded to construct the proof. The frontend also validates the actual source declaration, parameter count, numeric annotations, and body. It models only explicitly declared finite safe-integer domains for numeric inputs; boolean inputs range over both boolean values. It uses interval analysis to ensure every source arithmetic result stays within `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`; within that restricted integer subset, the lowered `+`, `-`, `*`, comparisons, strict equality, boolean operators, and conditionals match their JavaScript behavior. Division, modulo, and operations whose safe-integer range cannot be established are rejected rather than translated as SMT integer division or assumed safe.

## Meaning of `Verified`

A result of kind `Verified` means that, for the exact IR emitted by the symbolic builder or source frontend, the configured Z3 backend returned UNSAT for `assumptions ∧ ¬assertion` for each assertion, after confirming assumptions are satisfiable and modeled operations are defined. A proof with no assertions is rejected. For a source proof, this applies to the selected function's supported syntax under the declared input domains—not to callers outside those domains, surrounding application code, or arbitrary JavaScript behavior.

A SAT result is a valid modeled counterexample and is a successful verifier execution with a failed property. `unknown`, solver initialization/translation/model errors, invalid IR, unsupported schemas, undefined operations, empty assertions, and impossible assumptions are operational errors; none may be reported as `Verified`.

## Assumptions

Assumptions restrict the input space exactly as written. They are not implicitly inferred from TypeScript types or schemas except for explicit domain/refinement constraints. The backend first checks that all assumptions can hold. Inconsistent assumptions are rejected to prevent vacuous success. No assumption is silently added to rescue an undefined operation.

## Unsupported operations and schemas

Only AST variants implemented by every backend are supported. An unknown/malformed expression is an error, not a default value. Schema translation uses an allowlist; unrecognized or ambiguously interpreted AST nodes fail clearly and never fall back to decoding a concrete example. The Schema AST is version-sensitive, so supported constructors/refinements are tested against the pinned Effect package.

## Solver/backend assumptions

The Z3 backend translates the typed IR using `z3-solver`. `UNSAT` is trusted according to the Z3 solver implementation and its integer-theory semantics; this prototype does not independently certify solver proof terms. A solver `unknown` response is an error. SAT models are decoded for every user-visible symbolic variable; a decoding failure is an error rather than an incomplete counterexample. Checks through one backend instance are serialized, and Node worker threads are cleaned up when the backend is closed.

## Input contracts

A source proof treats its declared input domains as preconditions. It does not prove that application callers validate those inputs or that the target function is always called with values in range. `isValidSourceInputs(proof, candidate)` checks a candidate tuple against those declared domains without loading or executing target code; callers remain responsible for invoking the target function themselves. The target function is parsed and lowered, not executed by the verifier. Counterexample replay in tests can confirm a modeled input against an implementation, but does not replace runtime validation or establish behavior beyond the supported subset.

Effect generator code and the `sourceFunction` / `sourceEffectFunction` assertion callbacks are ordinary host code that emits proof constraints. As described under [proof construction](#proof-construction), branching or side effects there can change which constraints are emitted.
