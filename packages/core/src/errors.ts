import { Data } from "effect";

export class ProofCompileError extends Data.TaggedError("ProofCompileError")<{
  readonly message: string;
}> {}

export class VerificationBackendError extends Data.TaggedError("VerificationBackendError")<{
  readonly message: string;
}> {}
