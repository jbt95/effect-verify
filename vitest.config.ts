import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `oxlint/plugins-dev`'s RuleTester registers cases through the `describe` and `it`
    // globals rather than importing them, so the vendored rule tests under
    // tools/oxlint/anti-slop only register when globals are enabled.
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      // Not a test file: it runs its assertions at module scope as a manual CLI probe,
      // so Vitest finds no suite in it. It is kept as vendored source.
      "tools/oxlint/anti-slop/rules/require-readable-spacing-cli.test.ts",
    ],
  },
});
