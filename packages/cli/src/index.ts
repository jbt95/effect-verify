#!/usr/bin/env node
import { Effect } from "effect";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { Proof, SourceProof, SourceEffectProof } from "@effect-verifier/core";
import { compileProof, isProof, isSourceEffectProof, isSourceProof } from "@effect-verifier/core";
import { compileSourceEffectProof, compileSourceProof } from "@effect-verifier/typescript";
import { makeZ3Backend } from "@effect-verifier/z3";

type ProofCandidate = Proof<unknown> | SourceProof | SourceEffectProof;

interface ProofEntry {
  readonly exportName: string;
  readonly proof: ProofCandidate;
}

const isProofCandidate = (value: unknown): value is ProofCandidate =>
  isProof(value) || isSourceProof(value);

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const loadProofs = async (modulePath: string): Promise<Array<ProofEntry>> => {
  const moduleUrl = pathToFileURL(resolve(modulePath)).href;
  const moduleExports: object = await import(moduleUrl);
  const proofs: Array<ProofEntry> = [];

  for (const [exportName, candidate] of Object.entries(moduleExports)) {
    const candidateValue: unknown = candidate;

    if (!isProofCandidate(candidateValue)) continue;

    proofs.push({ exportName, proof: candidateValue });
  }

  return proofs;
};

const selectProof = (
  proofs: ReadonlyArray<ProofEntry>,
  requestedExport: string | undefined,
  modulePath: string,
): ProofEntry => {
  if (requestedExport !== undefined) {
    const selected = proofs.find((entry) => entry.exportName === requestedExport);

    if (selected === undefined) {
      throw new Error(`No proof export named "${requestedExport}" was found in ${modulePath}`);
    }

    return selected;
  }

  const defaultProof = proofs.find((entry) => entry.exportName === "default");

  if (defaultProof !== undefined) return defaultProof;

  if (proofs.length === 1) {
    const onlyProof = proofs[0];

    if (onlyProof !== undefined) return onlyProof;
  }

  throw new Error("Export one proof as default or pass its export name as the second argument");
};

const verifySelectedProof = async (selected: ProofEntry, modulePath: string): Promise<void> => {
  const program = isSourceEffectProof(selected.proof)
    ? compileSourceEffectProof(selected.proof, resolve(modulePath), selected.exportName)
    : isSourceProof(selected.proof) && selected.proof.kind === "SourceProof"
      ? compileSourceProof(selected.proof, resolve(modulePath), selected.exportName)
      : await Effect.runPromise(compileProof(selected.proof));

  const backend = await Effect.runPromise(makeZ3Backend());

  try {
    const result = await Effect.runPromise(backend.verify(program));
    console.log(JSON.stringify({ export: selected.exportName, ...result }, null, 2));

    if (result.kind === "Failed") process.exitCode = 1;
  } finally {
    await Effect.runPromise(backend.close());
  }
};

const run = async (): Promise<void> => {
  const [modulePath, requestedExport] = process.argv.slice(2);

  if (modulePath === undefined) {
    throw new Error("Usage: effect-verify <proof-module.ts|proof-module.js> [exportName]");
  }

  const proofs = await loadProofs(modulePath);
  await verifySelectedProof(selectProof(proofs, requestedExport, modulePath), modulePath);
};

run().catch((cause) => {
  console.error(`effect-verify: ${errorMessage(cause)}`);
  process.exitCode = 2;
});
