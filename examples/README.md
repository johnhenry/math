# Examples

Runnable walkthroughs of the family. They import the packages by **bare
specifier** (`@johnhenry/math`, `@johnhenry/iteration`, ...) through the
workspace symlinks, so they exercise the real `exports` maps — build first:

```bash
npm install
npm run build
npm run examples          # all of them (CI runs this too)
npm run example:01        # or one at a time
```

| Example | Shows |
|---|---|
| `01-symbolic-calculus.mjs` | `Symbolic`: differentiate, integrate (by parts, u-substitution), definite integrals, limits, solve, systems, series, LaTeX |
| `02-algebra-over-structures.mjs` | `Structure.integersModulo(7)`: matrix inversion over GF(7) — the same Gauss-Jordan over any field/ring |
| `03-exact-numbers-and-autodiff.mjs` | `ComplexNumber`/`Rational`/`Decimal`, `Interval`'s outward rounding, and exact gradients/Hessians via `DualNumber` forward-mode |
| `04-iteration-pipelines.mjs` | `@johnhenry/iteration`: transducers, itertools parity, `foldSync`, `mapConcurrentAsync` bounded concurrency, `AsyncChannel` backpressure |
| `05-prototype-patch.mjs` | `@johnhenry/math-prototype-patch`: opt-in patch, collision error handling, reversibility |

The deeper source of truth is [`packages/math/docs/COOKBOOK.md`](../packages/math/docs/COOKBOOK.md)
— every fenced block there runs as a test — and
[`packages/iteration/docs/`](../packages/iteration/docs).

Note: Node ≥ 22.12. Example 05 needs the explicit `npm run build`
(`math-prototype-patch` has no `prepare` script), which `npm run examples`'
place in CI already guarantees.
