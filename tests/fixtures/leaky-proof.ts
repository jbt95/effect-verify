import { Effect } from "effect";
import { Sym, Verify } from "@effect-verifier/core";

// A proof module is ordinary host code, so it may leave a live handle behind. This one
// starts an interval that is never cleared, which keeps the Node event loop alive after
// the verdict has been printed. The CLI must still terminate.
setInterval(() => undefined, 1_000);

export const leakyProof = Verify.proof(
  "leaky-proof",
  Effect.gen(function* () {
    const value = yield* Verify.any(Verify.integer({ min: 0, max: 10 }), { name: "value" });

    yield* Verify.assert(Sym.gte(value, Sym.literal(0)), "value stays non-negative");
  }),
);
