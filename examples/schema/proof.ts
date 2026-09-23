import { Effect, Schema } from "effect";
import { Sym } from "@effect-verifier/core";
import { Verify } from "@effect-verifier/schema";

const Score = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(100),
);

const Assessment = Schema.Struct({
  scores: Schema.Tuple(Score, Score),
  verdict: Schema.Union(Schema.Literal(0), Schema.Literal(1), Schema.Literal(2)),
});

export const assessmentValuesStayInRange = Verify.proof(
  "assessment-values-stay-in-range",
  Effect.gen(function* () {
    const assessment = yield* Verify.anySchema(Assessment, { name: "assessment" });
    const total = Sym.add(assessment.scores[0], assessment.scores[1]);

    yield* Verify.assert(Sym.gte(total, Sym.literal(0)), "combined score is non-negative");
    yield* Verify.assert(Sym.lte(total, Sym.literal(200)), "combined score is at most 200");
    yield* Verify.assert(Sym.gte(assessment.verdict, Sym.literal(0)), "verdict is non-negative");
    yield* Verify.assert(Sym.lte(assessment.verdict, Sym.literal(2)), "verdict is at most 2");
  }),
);
