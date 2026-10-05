#!/usr/bin/env node
import { Effect } from "effect";
import { readFileSync } from "node:fs";
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

interface CliOptions {
  readonly modulePath: string | undefined;
  readonly exportName: string | undefined;
  readonly timeoutMilliseconds: number | undefined;
  readonly list: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const usage = `Usage: effect-verify <proof-module.ts|proof-module.js> [exportName] [options]

Verifies one proof export with Z3 and prints a JSON result to stdout.

Options:
  -l, --list           List the proof exports in the module, then exit.
      --timeout <ms>   Give the solver a per-query budget in milliseconds.
  -h, --help           Show this help, then exit.
  -V, --version        Print the version, then exit.

Exit codes:
  0  Verified       no counterexample exists for any assertion
  1  Failed         at least one assertion has a counterexample
  2  Usage or operational error; the diagnostic is written to stderr`;

// Boundary decoder for the package manifest. The manifest is external input, so it is
// parsed once here and narrowed to the one field this CLI reports.
const parseManifestVersion = (text: string): string | undefined => {
  const parsed: unknown = JSON.parse(text);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validate untrusted JSON.
  if (typeof parsed !== "object" || parsed === null) return undefined;

  if (!("version" in parsed)) return undefined;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validate untrusted JSON.
  return typeof parsed.version === "string" ? parsed.version : undefined;
};

const readVersion = (): string => {
  try {
    return (
      parseManifestVersion(readFileSync(new URL("../package.json", import.meta.url), "utf8")) ??
      "unknown"
    );
  } catch {
    // The manifest is absent or unreadable; report the marker instead.
    return "unknown";
  }
};

const parsePositiveInteger = (raw: string, flag: string): number => {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new CliUsageError(`${flag} requires a positive integer number of milliseconds`);

  return parsed;
};

const parseArguments = (argv: ReadonlyArray<string>): CliOptions => {
  const positional: Array<string> = [];
  let timeoutMilliseconds: number | undefined;
  let list = false;
  let help = false;
  let version = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === undefined) continue;

    if (argument === "-h" || argument === "--help") {
      help = true;
    } else if (argument === "-V" || argument === "--version") {
      version = true;
    } else if (argument === "-l" || argument === "--list") {
      list = true;
    } else if (argument === "--timeout") {
      const raw = argv[index + 1];

      if (raw === undefined) throw new CliUsageError("--timeout requires a value in milliseconds");

      timeoutMilliseconds = parsePositiveInteger(raw, "--timeout");
      index++;
    } else if (argument.startsWith("--timeout=")) {
      timeoutMilliseconds = parsePositiveInteger(argument.slice("--timeout=".length), "--timeout");
    } else if (argument.startsWith("-") && argument !== "-") {
      throw new CliUsageError(`Unknown option "${argument}"`);
    } else {
      positional.push(argument);
    }
  }

  const [modulePath, exportName, ...extra] = positional;

  if (extra.length > 0)
    throw new CliUsageError(
      `Unexpected extra argument "${extra[0]}"; pass at most a module path and an export name`,
    );

  return { modulePath, exportName, timeoutMilliseconds, list, help, version };
};

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

const verifySelectedProof = async (
  selected: ProofEntry,
  modulePath: string,
  timeoutMilliseconds: number | undefined,
): Promise<void> => {
  const program = isSourceEffectProof(selected.proof)
    ? compileSourceEffectProof(selected.proof, resolve(modulePath), selected.exportName)
    : isSourceProof(selected.proof) && selected.proof.kind === "SourceProof"
      ? compileSourceProof(selected.proof, resolve(modulePath), selected.exportName)
      : await Effect.runPromise(compileProof(selected.proof));

  const backend = await Effect.runPromise(
    timeoutMilliseconds === undefined ? makeZ3Backend() : makeZ3Backend({ timeoutMilliseconds }),
  );

  try {
    const result = await Effect.runPromise(backend.verify(program));
    console.log(JSON.stringify({ export: selected.exportName, ...result }, null, 2));

    if (result.kind === "Failed") process.exitCode = 1;
  } finally {
    // A cleanup failure must not overwrite a verdict already reported on stdout,
    // so it is reported separately instead of replacing the exit code.
    const closed = await Effect.runPromise(
      backend.close().pipe(
        Effect.match({
          onFailure: (cause) =>
            `solver cleanup failed after the verdict was reported: ${cause.message}`,
          onSuccess: () => undefined,
        }),
      ),
    );

    if (closed !== undefined) console.error(`effect-verify: ${closed}`);
  }
};

const run = async (): Promise<void> => {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    console.log(usage);

    return;
  }

  if (options.version) {
    console.log(readVersion());

    return;
  }

  if (options.modulePath === undefined) throw new CliUsageError(usage);

  const { modulePath } = options;
  const proofs = await loadProofs(modulePath);

  if (options.list) {
    for (const entry of proofs) console.log(entry.exportName);

    return;
  }

  await verifySelectedProof(
    selectProof(proofs, options.exportName, modulePath),
    modulePath,
    options.timeoutMilliseconds,
  );
};

// A proof module is ordinary host code and may leave a live handle behind, such as an
// interval or a server. Relying on the event loop draining would hang the process after
// the verdict is printed. The escape timer is unreferenced, so a clean run still exits
// naturally with fully written output; it only fires when something else is holding the
// loop open. Writing to a closed pipe, such as piping into `head`, is not an error.
const ignoreBrokenPipe = (stream: NodeJS.WriteStream): void => {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") return;

    throw error;
  });
};

ignoreBrokenPipe(process.stdout);

ignoreBrokenPipe(process.stderr);

const finish = (code: number): void => {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 250).unref();
};

run().then(
  () => finish(Number(process.exitCode ?? 0)),
  (cause) => {
    console.error(`effect-verify: ${errorMessage(cause)}`);

    finish(2);
  },
);
