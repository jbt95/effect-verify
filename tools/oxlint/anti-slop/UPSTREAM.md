# Vendored anti-slop

This directory is a vendored copy of [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop).
Upstream states that the project is meant to be vendored rather than consumed as a
dependency, so it is copied here instead of pinned in `package.json`.

## Provenance

| Field            | Value                                       |
| ---------------- | ------------------------------------------- |
| Upstream         | `https://github.com/dmmulroy/anti-slop`     |
| Commit           | `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`  |
| Commit date      | 2026-09-10                                  |
| Upstream path    | `skills/install-anti-slop/assets/anti-slop` |
| Upstream license | MIT, reproduced in `LICENSE`                |

The vendored tree was verified against that commit: after running this repository's
`oxfmt` over the upstream asset directory, every file is byte-identical to the copy here.

## Local differences from upstream

- **Formatting.** `pnpm format` reformats this directory to the repository style, so the
  files differ from upstream only in indentation and trailing commas.
- **`*.test.ts` files.** These come from upstream's `src/` tree and are not shipped in the
  skill asset bundle. They are kept because they document each rule's intended behaviour
  and make future three-way merges easier.
- **`LICENSE`.** Copied from the upstream repository root, which does not ship one inside
  the asset bundle.

## Registering the rules

`oxlint.config.ts` loads both entry points and enables every rule:

- `anti-slop` — `index.ts`, 18 generic rules
- `anti-slop-effect` — `effect/index.ts`, 5 Effect-specific rules, enabled because this
  repository depends on Effect directly

The directory is listed in `ignorePatterns` so the plugin does not lint itself.

## Known limitation

The `*.test.ts` files under this directory do not run. `RuleTester` from
`oxlint/plugins-dev` registers cases through the `describe` and `it` globals, and this
repository runs Vitest without `globals: enabled`, so those files register nothing. They
are documentation, not active tests. The rules themselves are exercised indirectly: they
run against this repository's own source on every `pnpm lint`.
