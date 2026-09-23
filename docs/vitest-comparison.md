# Effect Verify and Vitest

Vitest runs selected calls against the real JavaScript function. Effect Verify translates a supported pure function into a symbolic model and asks a solver whether a stated property can fail within declared input bounds. The difference is easiest to see with the same function.

|           | Vitest                                                       | Effect Verify                                                                     |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| What runs | Tests call the implementation with concrete values           | The source frontend parses and lowers the function; it does not call it           |
| Inputs    | Values selected by the test, fixtures, or generators         | Symbolic integers restricted by declared domains and assumptions                  |
| Result    | Pass or fail for the executions performed                    | `Verified` if no modeled counterexample exists; otherwise a counterexample        |
| Best for  | Runtime behavior, effects, I/O, integration, and regressions | Invariants expressible in the DSL or supported pure integer/boolean source subset |

## Example: a discount rule

Vitest can check representative cases against the implementation. The following snippet is intended for a repository test file such as `tests/discount.test.ts`, where the relative import to `examples/source/functions.ts` is correct:

```ts
import { expect, it } from "vitest";
import { priceAfterDiscount } from "../examples/source/functions.ts";

it("applies an allowed discount", () => {
  expect(priceAfterDiscount(100, 20, 30)).toBe(80);
});

it("rejects a discount above the configured maximum", () => {
  expect(priceAfterDiscount(100, 40, 30)).toBe(100);
});

it("rejects a discount greater than the price", () => {
  expect(priceAfterDiscount(10, 20, 30)).toBe(10);
});
```

These tests execute three concrete calls. The source proof in `examples/source/proof.ts` asks a broader question about that function:

```ts
import { Sym, Verify } from "@effect-verifier/core";

type SourceFunctions = typeof import("./functions.ts");

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
```

Here `SourceFunctions` is `typeof import("./functions.ts")`. The proof checks that the result is between zero and the price for every allowed combination of the three inputs, 251,252,001 integer triples in total. It is not running that many tests. Z3 checks whether the lowered formula has any counterexample.

Run it with:

```sh
pnpm build
pnpm effect-verify examples/source/proof.ts discountKeepsPriceInBounds
```

The proof's input bounds are preconditions for the claim. They do not validate or constrain calls made by the application.

## Example: a test set can miss a failing property

Suppose a Vitest suite checks a few positive values for `decrement`:

```ts
import { expect, it } from "vitest";
import { decrement } from "../examples/source/functions.ts";

it.each([1, 4, 10])("decrements %i without going negative", (value) => {
  expect(decrement(value)).toBe(value - 1);
  expect(decrement(value)).toBeGreaterThanOrEqual(0);
});
```

Those cases pass. The source proof `decrementIsNonNegative` claims nonnegativity for every input from 0 through 10. That claim is false. The current run returns the witness `value = 0`, `result = -1`; any valid counterexample would be sufficient because the exact SAT model is not part of the API:

```sh
pnpm build
pnpm effect-verify examples/source/proof.ts decrementIsNonNegative
```

Adding `0` to the Vitest cases would catch this bug too. The verifier's benefit is that it checks the stated property across the whole declared domain and gives a concrete violating input without relying on the test author to choose it.

## Where each fits

Use Vitest for the behavior of the running program, especially effects, I/O, integration, and syntax outside the verifier's subset. Use Effect Verify when you can state an invariant over finite safe-integer inputs and want it checked across the declared domain. The source frontend rejects unsupported code rather than approximating it, and it does not fully type-check the module. See the [soundness contract](soundness.md) for the exact limits.

A passing Vitest test establishes the result for the calls it performed. A `Verified` result establishes the assertion for the encoded model and domain. Neither result proves that callers enforce the source proof's input bounds. Keep both: tests exercise the implementation, while the verifier checks the supported invariant. The repository pairs source proofs with concrete calls and counterexample replay in [`tests/source.test.ts`](../tests/source.test.ts).

Build once, then run the repository examples from its root with `pnpm effect-verify`:

```sh
pnpm build
pnpm effect-verify examples/arithmetic/proof.ts clampNeverProducesNegative
pnpm effect-verify examples/source/proof.ts clampIsNonNegative
pnpm effect-verify examples/source/proof.ts transferPreservesBalanceBounds
pnpm effect-verify examples/source/proof.ts discountKeepsPriceInBounds
pnpm effect-verify examples/source/effect-proof.ts positiveOrDeniedIsSafe
pnpm effect-verify examples/schema/proof.ts assessmentValuesStayInRange
pnpm effect-verify examples/banking/proof.ts transferWithFeeCannotOverdraw
```
