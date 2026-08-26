# math

The `@johnhenry/math` family: **pure-TypeScript libraries** — zero runtime dependencies,
`tsc`-only builds, nothing required beyond Node and npm to contribute.

| Package | npm | What it is |
|---|---|---|
| [`packages/math`](./packages/math) | [`@johnhenry/math`](https://www.npmjs.com/package/@johnhenry/math) | Advanced college-level mathematics for TypeScript: complex/rational/decimal/interval/quaternion/dual numbers, linear algebra over arbitrary algebraic structures, a symbolic CAS, combinatorics, number theory, statistics, and renderer-agnostic plotting geometry |
| [`packages/iteration`](./packages/iteration) | [`@johnhenry/iteration`](https://www.npmjs.com/package/@johnhenry/iteration) | Sync + async iterator algebra: transducers, Python-`itertools` parity, terminal consumers, bounded concurrency, cancellation, and backpressure-aware channels |
| [`packages/math-prototype-patch`](./packages/math-prototype-patch) | [`@johnhenry/math-prototype-patch`](https://www.npmjs.com/package/@johnhenry/math-prototype-patch) | OPT-IN, collision-checked `Number.prototype` patch adding `@johnhenry/math`'s `ComplexNumber` fluent arithmetic to plain numbers |

Full documentation for the whole family lives at
[opensource.johnhenry.me/math/](https://opensource.johnhenry.me/math/). Per-package, the deepest
docs are [`packages/math/docs/COOKBOOK.md`](./packages/math/docs/COOKBOOK.md) (every code fence is
executed as a test) and [`packages/iteration/docs/`](./packages/iteration/docs) (a full Diátaxis
tree plus a 1100-line reference).

## Which package do I want?

- **Doing mathematics** — complex arithmetic, exact rationals, symbolic calculus, Gauss-Jordan
  over GF(7) — `@johnhenry/math`.
- **Iterating over things** — lazily, asynchronously, with backpressure — `@johnhenry/iteration`.
  It's independent of the rest and the most mature package here (shipped for years under two
  earlier names; don't judge it by the `0.0.0`).
- **Writing `(3).add(z)` on plain numbers** — `@johnhenry/math-prototype-patch`, after reading its
  README's warnings.

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
- **ESM, Node ≥22**, tests via `node:test` running TypeScript directly through native type
  stripping, property-based tests via `fast-check`, formatting and linting via Biome.

The engineering counterpart — fixed-width tensors, Rust→WASM kernels, WebGPU, Arrow — lives
separately in [math-plus](https://github.com/johnhenry/math-plus), which depends on this
family rather than absorbing it. The two make opposite trade-offs on purpose: `@johnhenry/math`'s
boxed, generic elements are precisely what a SIMD-friendly tensor runtime forbids, and vice versa.
Neither is a subset of the other. A third sibling,
[math-grapher](https://github.com/johnhenry/math-grapher), runs `@johnhenry/math`'s reactive
`CellGraph` headlessly as an agent-drivable MCP server.

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
