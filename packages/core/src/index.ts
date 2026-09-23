export type { Domain, IntegerOptions, BitDomainOptions } from "./domain.js";

export type { ArithmeticExpr, BoolExpr, Expr, IntExpr, Sort, StringExpr } from "./expr.js";

export { formatExpr } from "./expr.js";

export { ProofCompileError, VerificationBackendError } from "./errors.js";

export type {
  Assertion,
  AssertionOutcome,
  Counterexample,
  CounterexampleInput,
  FailedAssertion,
  SourceProof,
  SourceEffectProof,
  FailedResult,
  VerificationBackend,
  VerificationProgram,
  VerificationResult,
  Variable,
  VerifiedAssertion,
  VerifiedResult,
} from "./program.js";

export { expressionOf, Sym } from "./symbolic.js";

export type {
  BoolSym,
  IntSym,
  StringSym,
  Numeric,
  Sym as Symbolic,
  SymbolicValue,
} from "./symbolic.js";

export {
  any,
  anyString,
  assume,
  assert,
  boolean,
  compileProof,
  int,
  isProof,
  isSourceProof,
  isSourceEffectProof,
  isValidSourceInputs,
  integer,
  proof,
  sourceFunction,
  sourceEffectFunction,
  uint,
  verifyProof,
  Verify,
} from "./verify.js";

export type {
  InputOptions,
  Proof,
  SourceFunctionProofOptions,
  SourceEffectProofOptions,
} from "./verify.js";
