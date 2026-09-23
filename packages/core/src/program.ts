import type { Effect } from "effect";
import type { BoolExpr, Sort } from "./expr.js";
import type { VerificationBackendError } from "./errors.js";

export interface Variable {
  readonly id: number;
  readonly name: string;
  readonly sort: Sort;
  readonly domain: string;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export interface Assertion {
  readonly id: number;
  readonly label: string;
  readonly expression: BoolExpr;
}

export interface VerificationProgram {
  readonly proof: string;
  readonly variables: ReadonlyArray<Variable>;
  readonly assumptions: ReadonlyArray<BoolExpr>;
  readonly assertions: ReadonlyArray<Assertion>;
}

export interface SourceProof {
  readonly kind: "SourceProof";
  readonly name: string;
  readonly sourceFile: string;
  readonly functionName: string;
  readonly resultVariableId: number;
  readonly resultSort: Sort;
  readonly assertionLabel: string | undefined;
  readonly program: VerificationProgram;
}

export interface SourceEffectProof {
  readonly kind: "SourceEffectProof";
  readonly name: string;
  readonly sourceFile: string;
  readonly functionName: string;
  readonly resultVariableId: number;
  readonly resultSort: "Int" | "Bool";
  readonly tagVariableId: number;
  readonly failureTagVariableId: number;
  readonly assertionLabel: string | undefined;
  readonly program: VerificationProgram;
}

export interface VerifiedAssertion {
  readonly kind: "AssertionVerified";
  readonly label: string;
  readonly expression: string;
}

export interface CounterexampleInput {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
}

export interface Counterexample {
  readonly assertion: string;
  readonly expression: string;
  readonly inputs: ReadonlyArray<CounterexampleInput>;
}

export interface FailedAssertion {
  readonly kind: "AssertionFailed";
  readonly label: string;
  readonly expression: string;
  readonly counterexample: Counterexample;
}

export type AssertionOutcome = VerifiedAssertion | FailedAssertion;

export interface VerifiedResult {
  readonly kind: "Verified";
  readonly proof: string;
  readonly assertions: ReadonlyArray<VerifiedAssertion>;
}

export interface FailedResult {
  readonly kind: "Failed";
  readonly proof: string;
  readonly assertions: ReadonlyArray<AssertionOutcome>;
  readonly failures: ReadonlyArray<Counterexample>;
}

export type VerificationResult = VerifiedResult | FailedResult;

export interface VerificationBackend {
  readonly verify: (
    program: VerificationProgram,
  ) => Effect.Effect<VerificationResult, VerificationBackendError>;
}
