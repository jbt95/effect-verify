import { Effect } from "effect";
import { Sym } from "@effect-verifier/core";
import { Schema, Verify } from "@effect-verifier/schema";

const Money = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(100_000),
);

export const TransferInput = Schema.Struct({
  balance: Money,
  amount: Money,
});

export const transferCannotOverdraw = Verify.proof(
  "transfer-cannot-overdraw",
  Effect.gen(function* () {
    const input = yield* Verify.anySchema(TransferInput, { name: "transfer" });
    yield* Verify.assume(Sym.lte(input.amount, input.balance));
    const remaining = Sym.sub(input.balance, input.amount);
    yield* Verify.assert(Sym.gte(remaining, Sym.literal(0)), "balance remains non-negative");
  }),
);

const TransferWithFeeInput = Schema.Struct({
  balance: Money,
  amount: Money,
  fee: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(500),
  ),
});

export const transferWithFeeCannotOverdraw = Verify.proof(
  "transfer-with-fee-cannot-overdraw",
  Effect.gen(function* () {
    const input = yield* Verify.anySchema(TransferWithFeeInput, { name: "transfer" });
    const debit = Sym.add(input.amount, input.fee);
    yield* Verify.assume(Sym.lte(debit, input.balance));

    const remaining = Sym.sub(input.balance, debit);
    yield* Verify.assert(Sym.gte(remaining, Sym.literal(0)), "balance covers amount and fee");
    yield* Verify.assert(
      Sym.eq(Sym.add(remaining, debit), input.balance),
      "remaining balance plus debit equals starting balance",
    );
  }),
);
