import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `oxlint/plugins-dev`'s RuleTester registers cases through the `describe` and `it`
    // globals rather than importing them, so the vendored rule tests under
    // tools/oxlint/anti-slop only register when globals are enabled.
    globals: true,
    // These are not unit tests. Each one compiles TypeScript through the real
    // compiler API or runs the Z3 solver, so the 5 s default is under what a
    // slow runner can finish: the slowest source-proof test takes 1.4 s on
    // development hardware and timed out on a 2-core CI runner. 30 s is the
    // budget `tests/cli.test.ts` already used for the same kind of work, and it
    // still catches a genuine hang.
    //
    // `hookTimeout` matters for the same reason plus one more. `Z3Backend.close`
    // awaits the queue of in-flight verifications, so a test that times out
    // leaves its solver call running and makes `afterAll` wait for the whole
    // backlog. Without a larger hook budget one slow test turns into a second
    // failure in the teardown that says nothing about the code under test.
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: [
      ...configDefaults.exclude,
      // Not a test file: it runs its assertions at module scope as a manual CLI probe,
      // so Vitest finds no suite in it. It is kept as vendored source.
      "tools/oxlint/anti-slop/rules/require-readable-spacing-cli.test.ts",
    ],
  },
});
