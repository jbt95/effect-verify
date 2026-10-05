import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cliPath = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url));

const proofModule = fileURLToPath(new URL("../examples/source/proof.ts", import.meta.url));

const leakyProofModule = fileURLToPath(new URL("./fixtures/leaky-proof.ts", import.meta.url));

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

interface CliOutcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

// `spawn` is used instead of `execFile` because a non-zero exit is an expected outcome
// for most of these cases, and `execFile` rejects on it, which would force the error
// object to be cast before its exit code could be read. `new Promise` is used rather
// than `Promise.withResolvers` because the workspace compiles against the ES2022 lib.
const invoke = (args: ReadonlyArray<string>): Promise<CliOutcome> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd: repoRoot });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });

describe("effect-verify CLI", () => {
  it("exits 0 and prints a JSON Verified envelope", async () => {
    const outcome = await invoke([proofModule, "clampIsNonNegative"]);

    expect(outcome.code).toBe(0);
    expect(JSON.parse(outcome.stdout)).toMatchObject({
      export: "clampIsNonNegative",
      kind: "Verified",
    });
  }, 30000);

  it("exits 1 and reports a counterexample when an assertion fails", async () => {
    const outcome = await invoke([proofModule, "decrementIsNonNegative"]);

    expect(outcome.code).toBe(1);
    expect(JSON.parse(outcome.stdout)).toMatchObject({ kind: "Failed" });

    // Whitespace is stripped so the assertion targets the decoded model itself rather
    // than the pretty-printing the CLI happens to use.
    const compact = outcome.stdout.replaceAll(/\s+/g, "");

    expect(compact).toContain('"name":"value","value":"0"');
    expect(compact).toContain('"name":"result","value":"-1"');
  }, 30000);

  it("exits 2 with a diagnostic on stderr for an unknown export", async () => {
    const outcome = await invoke([proofModule, "noSuchProof"]);

    expect(outcome.code).toBe(2);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toContain("noSuchProof");
  }, 30000);

  it("prints usage for --help and exits 0", async () => {
    const outcome = await invoke(["--help"]);

    expect(outcome.code).toBe(0);
    expect(outcome.stdout).toContain("Usage: effect-verify");
    expect(outcome.stdout).toContain("--timeout");
  });

  it("prints a version for --version and exits 0", async () => {
    const outcome = await invoke(["--version"]);

    expect(outcome.code).toBe(0);
    expect(outcome.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("lists proof exports for --list", async () => {
    const outcome = await invoke(["--list", proofModule]);

    expect(outcome.code).toBe(0);
    expect(outcome.stdout.split("\n")).toContain("clampIsNonNegative");
  }, 30000);

  it("rejects an unknown option instead of ignoring it", async () => {
    const outcome = await invoke([proofModule, "clampIsNonNegative", "--json"]);

    expect(outcome.code).toBe(2);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toContain("Unknown option");
  }, 30000);

  it("rejects a non-numeric --timeout value", async () => {
    const outcome = await invoke(["--timeout", "soon", proofModule, "clampIsNonNegative"]);

    expect(outcome.code).toBe(2);
    expect(outcome.stderr).toContain("--timeout");
  });

  it("verifies normally when a generous solver budget is set", async () => {
    const outcome = await invoke(["--timeout", "60000", proofModule, "clampIsNonNegative"]);

    expect(outcome.code).toBe(0);
    expect(JSON.parse(outcome.stdout)).toMatchObject({ kind: "Verified" });
  }, 30000);

  it("terminates even when the proof module leaves a live handle behind", async () => {
    const outcome = await invoke([leakyProofModule, "leakyProof"]);

    expect(outcome.code).toBe(0);
    expect(JSON.parse(outcome.stdout)).toMatchObject({ kind: "Verified" });
  }, 30000);
});
