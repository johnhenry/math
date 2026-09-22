# math

[![CI](https://github.com/johnhenry/math/actions/workflows/ci.yml/badge.svg)](https://github.com/johnhenry/math/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40johnhenry%2Fmath.svg)](LICENSE)

Full documentation: [opensource.johnhenry.me/math](https://opensource.johnhenry.me/math/)

The `@johnhenry/math` family: **pure-TypeScript libraries** — zero runtime dependencies,
`tsc`-only builds, nothing required beyond Node and npm to contribute.

Per-package, the deepest docs are
[`packages/math/docs/COOKBOOK.md`](./packages/math/docs/COOKBOOK.md) (every code fence is
executed as a test) and [`packages/iteration/docs/`](./packages/iteration/docs) (a full Diátaxis
tree plus a 1100-line reference).

## Contents

- [Which package do I want?](#which-package-do-i-want)
- [Packages](#packages)
- [Examples](#examples)
- [Philosophy](#philosophy)
- [Adding a new package](#adding-a-new-package)
- [Working in this repo](#working-in-this-repo)
- [Releasing](#releasing)
- [Family](#family)

## Which package do I want?

| I want to... | Start with |
|---|---|
| Do exact/symbolic mathematics — complex numbers, rationals, decimals, symbolic calculus, solve/series/LaTeX | [`math`](./packages/math) — everything scalar-math-shaped here builds on it |
| Do linear algebra over something other than plain floats (GF(7), quaternions, arbitrary rings) | [`math`](./packages/math)'s `Structure<T>` — Gauss-Jordan, matrices and vectors generic over any algebraic structure |
| Iterate over things lazily, asynchronously, with backpressure or bounded concurrency | [`iteration`](./packages/iteration) — independent of the rest of the family; shipped for years under two earlier names, don't judge it by the `0.0.0` |
| Write `(3).add(z)` on plain JS numbers | [`math-prototype-patch`](./packages/math-prototype-patch) — opt-in, collision-checked; read its README's warnings first |
| The engineering / high-performance counterpart — fixed-width tensors, WASM, WebGPU | not in this repo — see [math-plus](https://github.com/johnhenry/math-plus), a separate sibling repo |

## Packages

| Package | npm | What it is |
|---|---|---|
| [`packages/math`](./packages/math) | [`@johnhenry/math`](https://www.npmjs.com/package/@johnhenry/math) | Advanced college-level mathematics for TypeScript: complex/rational/decimal/interval/quaternion/dual numbers, linear algebra over arbitrary algebraic structures, a symbolic CAS, combinatorics, number theory, statistics, and renderer-agnostic plotting geometry |
| [`packages/iteration`](./packages/iteration) | [`@johnhenry/iteration`](https://www.npmjs.com/package/@johnhenry/iteration) | Sync + async iterator algebra: transducers, Python-`itertools` parity, terminal consumers, bounded concurrency, cancellation, and backpressure-aware channels |
| [`packages/math-prototype-patch`](./packages/math-prototype-patch) | [`@johnhenry/math-prototype-patch`](https://www.npmjs.com/package/@johnhenry/math-prototype-patch) | OPT-IN, collision-checked `Number.prototype` patch adding `@johnhenry/math`'s `ComplexNumber` fluent arithmetic to plain numbers |

## Examples

Runnable walkthroughs live in [`examples/`](./examples) — symbolic calculus, algebra over
arbitrary structures, exact numbers + autodiff, iteration pipelines, and the prototype patch:

```bash
npm install
npm run build        # examples import the built packages via bare specifiers
npm run examples     # run them all (also smoke-tested in CI)
node examples/01-symbolic-calculus.mjs   # or one at a time
```

## Philosophy

Everything here is on the **science and understanding** side of the family: correctness and
generality over raw throughput. Exact arithmetic (`Rational`, `Decimal`, `Interval`), algebra over
any carrier type (`Structure<T>` — do Gauss-Jordan over GF(7) or quaternions), symbolic forms that
show their work.

The constraints are deliberate and load-bearing:

- **Zero runtime dependencies** in every published package.
- **`tsc` only** — no bundler, no native toolchain, no WASM. Clone it, `npm install`, and you can
  hack on symbolic integration without installing Rust.
- **ESM, Node ≥26**, tests via `node:test` running TypeScript directly through native type
  stripping, property-based tests via `fast-check`, formatting and linting via Biome.

## Adding a new package

`@johnhenry/math-prototype-patch` is the real worked example (see the `0.0.0` CHANGELOG entry and
[johnhenry/math#28](https://github.com/johnhenry/math/issues/28)): the `ComplexNumber` fluent
arithmetic originally lived as an option inside `@johnhenry/math` itself, and was split into its
own package rather than kept as a flag.

**Smallest: a new function or `Structure<T>` instance inside `@johnhenry/math`.** Most new
mathematics — another special function, another algebraic structure, another CAS simplification
rule — is one more export from an existing module, reusing `@johnhenry/math`'s existing test
harness and zero-dependency guarantee. No new package, no new npm identity, no new semver line —
the whole cost is the export itself.

**A genuinely new package is warranted when the thing needs its own install footprint or its own
opt-in boundary that the rest of the family shouldn't inherit by default.** That's exactly why
`math-prototype-patch` couldn't stay a flag: it monkey-patches `Number.prototype`, a global,
ambient change that every consumer of `@johnhenry/math` would otherwise be forced to accept (or
explicitly opt out of) just by installing the core package. Splitting it out means the default
install of `@johnhenry/math` never touches a global at all.

Because this monorepo uses a plain `packages/*` workspace glob (no per-package registration list
like some sibling monorepos need), adding a package is close to boilerplate-only:

1. **`packages/<name>/package.json`** — `name: "@johnhenry/<name>"`, `version: "0.0.0"`,
   `"type": "module"`, `"engines": { "node": ">=26.0.0" }`, and a `repository.directory` pointing
   at `packages/<name>` — copy an existing package's shape (`math-prototype-patch`'s is the
   smallest reference).
2. **`packages/<name>/tsconfig.json`** — copy-paste of an existing package's; the family shares
   one `compilerOptions` shape (ES2023, `NodeNext`, strict, `erasableSyntaxOnly`).
3. **`packages/<name>/src/`, `test/`, `README.md`** — the package's actual content; tests via
   `node:test`, property-based laws via `fast-check` where the API has algebraic invariants to
   check.
4. **The one part that isn't boilerplate: deciding whether the package needs an npm dependency on
   `@johnhenry/math` at all**, and if so pinning it to the current `^0.0.x` line deliberately
   (`math-prototype-patch` depends on `@johnhenry/math`, `@johnhenry/iteration` does not — it's
   independent by design). Nothing else in the build needs to know a new package exists:
   `workspaces: ["packages/*"]` in the root `package.json` and every root script's
   `--workspaces --if-present` flag pick it up automatically — there is no hardcoded package list
   to edit, unlike `math-plus`'s or `optical-artifact-transport`'s monorepos.

Add the row to this README's `## Which package do I want?` and `## Packages` tables, and a
`CHANGELOG.md` entry. See `@johnhenry/math-plus`'s own "Adding a new package" section for the
contrasting case — a monorepo where new packages **do** need manual registration in root
`build`/`test` script strings.

## Working in this repo

```bash
npm install          # installs all workspaces
npm test             # runs every package's tests
npm run build        # tsc across all packages
npm run check        # Biome lint + format check
npm run examples     # run every example script
```

Per-package: `npm test -w @johnhenry/math`, `npm run build -w @johnhenry/iteration`, etc.

## Releasing

Bump the `version` in the package you want to publish, merge to the default branch, then cut a
GitHub Release. `.github/workflows/publish.yml` verifies everything and publishes any workspace
package whose version isn't yet on npm (idempotent — re-running is safe). Requires the `NPM_TOKEN`
repository secret.

## Family

Everything in this repo is on the **science and understanding** side of the family: correctness
and generality over raw throughput. Exact arithmetic (`Rational`, `Decimal`, `Interval`), algebra
over any carrier type (`Structure<T>` — do Gauss-Jordan over GF(7) or quaternions), symbolic forms
that show their work.

- **[math-plus](https://github.com/johnhenry/math-plus)** — the engineering counterpart: fixed-width
  tensors, Rust→WASM kernels, WebGPU, Arrow. It depends on this family rather than absorbing it,
  reusing `@johnhenry/math`'s scalar types (`ComplexNumber`, `Rational`, `Decimal`) at tensor API
  edges and bridging its `Symbolic` CAS into its tensor compiler. The two make opposite trade-offs
  on purpose: `@johnhenry/math`'s boxed, generic elements are precisely what a SIMD-friendly tensor
  runtime forbids, and vice versa — neither is a subset of the other.
- **[math-grapher](https://github.com/johnhenry/math-grapher)** — runs `@johnhenry/math`'s reactive
  `CellGraph` headlessly as an agent-drivable MCP server, so an agent can drive the same reactive
  cell graph this library exposes interactively without embedding a UI.
