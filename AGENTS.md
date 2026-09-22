# Agent playbook

npm workspaces monorepo, 3 packages under `packages/` (`math`, `iteration`,
`math-prototype-patch`), Node >= 26, `node:test` (native TypeScript type
stripping, no build step needed to run tests), Biome for lint/format,
orchestrated with plain `npm run <script> --workspaces --if-present` (no
Turborepo, no per-package registration list — `workspaces: ["packages/*"]`
picks up every package automatically). Everything here ships pure
TypeScript with zero runtime dependencies; `tsc` is the only build tool, and
packages build to `dist/` only for publishing — local dev and the example
scripts can run straight off `src/` via type stripping.

`CLAUDE.md` in this directory is a symlink to this file.

## Workspace structure and build order

There is no dependency-ordering concern between the three packages for
build/test — `math-prototype-patch` is the only one with an internal
dependency (`@johnhenry/math`), and npm workspaces resolves that via the
published version range, not the workspace symlink build order:

| Package | Role |
| --- | --- |
| [`packages/math`](packages/math) | The core: exact/symbolic mathematics, `Structure<T>` linear algebra, CAS, number theory, plotting geometry. Everything else in the family depends on it. |
| [`packages/iteration`](packages/iteration) | Sync + async iterator algebra. Independent of `packages/math` — no internal dependency either direction. |
| [`packages/math-prototype-patch`](packages/math-prototype-patch) | Opt-in `Number.prototype` patch; depends on `@johnhenry/math` (pinned `^0.0.x`, bump deliberately alongside a `math` release). |

## The verification loop (before every push)

```bash
npm run build        # tsc across all packages
npm run typecheck     # tsc --workspaces --if-present, no emit
npm test              # node:test in every package
npm run check         # Biome lint + format check
npm run examples      # every root example script against the built packages
```

CI (`.github/workflows/ci.yml`) runs install, build, typecheck, test, check,
then an examples smoke step, in that order. Match that order locally — the
examples import the packages by bare specifier through the workspace
symlinks, so they need a fresh `npm run build` first, same as CI.

A genuinely fresh clone before a release:
`git clone . /tmp/math-verifyN && cd $_ && npm ci && npm run build && npm test`.
This is the only way to catch "works on my checked-out tree" bugs (missing
`files` entries, undeclared deps).

## Repo-specific gotchas

- **A stale internal version range breaks the dual-package-instance way,
  not the "can't resolve" way.** `math-prototype-patch`'s dependency on
  `@johnhenry/math` needs bumping every time `math`'s version moves past
  what the range matches — a stale `^0.0.0` when `math` is already at
  `0.0.1` doesn't fail to install; npm resolves two separate copies of
  `@johnhenry/math` (workspace symlink + a nested `node_modules` copy),
  and `instanceof` checks or CAS-object identity across the two silently
  diverge. Bump the range in the same PR that bumps `math`'s version.
- **README Node-version claims drift from `engines.node` independently.**
  The `## Philosophy` section once claimed "Node ≥22" after `engines.node`
  had already moved to `>=26.0.0` — nothing enforces that these two numbers
  agree, so re-check the README's prose whenever `engines` changes.
- **`math-prototype-patch` has no `prepare` script.** `npm run examples`
  (example 05) needs an explicit prior `npm run build`, unlike a package
  with a `prepare` hook that builds on install. CI already runs build
  before examples; do the same locally or example 05 fails on stale
  `dist/`.

## Definition of done

A change is done when all of the following hold, not just when tests pass:
- A regression test exists for any bug fixed — fixing a bug without a test
  that would have caught it means it can come back unnoticed.
- Anything the feature does **not** do is stated in the package's README,
  not only in an issue comment.
- `CHANGELOG.md` has an entry citing the commit/PR.
- If the change affects `packages/math`'s public API, `packages/math/docs/COOKBOOK.md`
  (every fenced block there runs as a test) is updated to match.

## Releases

Bump `version` in the package(s) you want to publish, add the `CHANGELOG.md`
entry, merge, then cut a GitHub Release. `.github/workflows/publish.yml`
verifies everything and publishes any workspace package whose version isn't
yet on npm (idempotent `npm view` pre-flight guard — re-running is safe).
Requires the `NPM_TOKEN` repository secret. `math` is the pilot candidate
for a future migration to Changesets (the `math-plus` model) — until that
lands, this repo's own npm-workspaces publish mechanism is current.
