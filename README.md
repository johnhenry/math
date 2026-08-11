# Mallory

A family of **pure-TypeScript libraries** — zero runtime dependencies, `tsc`-only builds, nothing
required beyond Node and npm to contribute.

| Package | npm | What it is |
|---|---|---|
| [`packages/math`](./packages/math) | [`mallory-math`](https://www.npmjs.com/package/mallory-math) | Advanced college-level mathematics for TypeScript: complex/rational/decimal/interval/quaternion/dual numbers, linear algebra over arbitrary algebraic structures, a symbolic CAS, combinatorics, number theory, statistics, and renderer-agnostic plotting geometry |
| [`packages/iteration`](./packages/iteration) | `mallory-iteration` | Sync + async iterator algebra: transducers, Python-`itertools` parity, terminal consumers, bounded concurrency, cancellation, and backpressure-aware channels |

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
separately in [mallory-plus](https://github.com/johnhenry/mallory-plus), which depends on this
family rather than absorbing it. The two make opposite trade-offs on purpose: `mallory-math`'s
boxed, generic elements are precisely what a SIMD-friendly tensor runtime forbids, and vice versa.
Neither is a subset of the other.

## Working in this repo

```bash
npm install          # installs all workspaces
npm test             # runs every package's tests
npm run build        # tsc across all packages
npm run check        # Biome lint + format check
```

Per-package: `npm test -w mallory-math`, `npm run build -w mallory-iteration`, etc.

## Releasing

Bump the `version` in the package you want to publish, merge to the default branch, then cut a
GitHub Release. `.github/workflows/publish.yml` verifies everything and publishes any workspace
package whose version isn't yet on npm (idempotent — re-running is safe). Requires the `NPM_TOKEN`
repository secret.
