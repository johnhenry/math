---
"@johnhenry/math": minor
---

Add the mallory Wave 1b numerics.

- **Graph**: `Graph#mst(algorithm?)` (Kruskal or Prim, weighted, disconnected graphs give a forest; returns edges, total weight and component count), `Graph#scc()` (Tarjan) and `Graph#condensation()` (component DAG plus `components`/`componentOf`).
- **Linear algebra**: `MatrixMath.eigen` is a general-matrix eigen solver (Hessenberg reduction + shifted QR) returning complex eigenvalues and unit eigenvectors, as `scipy.linalg.eig`. `frobeniusNormalForm` is the block-triangular permutation normal form via strongly connected components; `rationalCanonicalForm` is the exact similarity form (invariant factors and companion blocks over ℚ).
- **Statistics**: distributions gain `sf`, `ppf`/`quantile`, `std`, `rvs`, and a new `Distributions.fisherF`. Hypothesis tests gain `tTestIndependent` (pooled, SciPy's `ttest_ind` default), `welch`, `tTestPaired`, `chiSquareIndependence` (`chi2_contingency`, Yates correction by default), `alternative` options, a `ddof` argument and optional uniform `expected` for `chiSquareGoodnessOfFit`, and `confidenceIntervalDifference` / `confidenceIntervalProportion` alongside `confidenceIntervalMean`. Goldens come from SciPy 1.18.
- **Regression**: new `Regression` class: `leastSquares` (Levenberg-Marquardt with SciPy's `huber`/`soft_l1`/`cauchy`/`arctan` robust losses), `curveFit` (covariance, standard errors, R²), `huberLinear` and `outlierIndices`.
- **Monte Carlo**: new `Rng` (PCG32, bit-identical to `@johnhenry/math-plus-tensor-core`'s) and `MonteCarlo` (`estimatePi`, `integrate`, `histogram`, `centralLimit`, `randomWalk`, `bootstrap`).

**Breaking (0.x)**:

- `erf`, `erfc` and the normal CDF were Abramowitz-Stegun approximations good to about 1.5e-7; they are now accurate to about 1e-15, and `regularizedGammaQ` no longer computes `1 - P` in the tail, so `sf` and p-values keep full precision.
- `ContinuousDistribution` / `DiscreteDistribution` have new required members (`sf`, `ppf`, `quantile`, `std`, `rvs`); only code that implements those interfaces itself is affected.
- `HypothesisTests.chiSquareGoodnessOfFit` now throws when observed and expected totals differ, like `scipy.stats.chisquare`.
- `Distributions.normalQuantile` returns `NaN` outside `[0, 1]`.
