# @johnhenry/math

## 0.1.0

### Minor Changes

- a02c502: `Symbolic.parse(input, options)` and `Symbolic.fromLatex(latex, options)` take a new `ParseOptions` argument (exported type). `{ implicitMultiplication: true }` reads juxtaposition as multiplication, so `2x`, `x y`, `xy`, `2(x+1)`, `(x+1)(x-1)` and `3sin(x)` parse; with the option, `fromLatex` also reads Desmos-style input such as `\sin 2x`, `\sin x\cos x`, `3\left(x+1\right)` and `x^23` (TeX's one-token exponent). The default is off and behaves as before: `2x` is still an error and `xy` is one variable. With the option on, multi-letter variable names are unavailable (`theta` is `t*h*e*t*a`; use `x_1`), and a function name without parentheses is an error. Independently of the option, `fromLatex` now accepts TeX's single-token arguments (`\frac12`, `\frac1x`, `\sqrt2`, `\sin x` with a space) and a power on a function command (`\sin^{2}(x)` is `sin(x)^2`; a `-1` exponent such as `\sin^{-1}` throws as ambiguous between arcsin and the reciprocal, so write `\arcsin(x)` or `(\sin x)^{-1}`), `\dfrac`/`\tfrac`, and a `\text{if }` label in a `cases` row.

  `fromLatex` also no longer swallows the second backslash of a `\\` row separator followed by a space (`\begin{cases} 1 & x<0 \\ 2 & \text{otherwise} \end{cases}` used to fail).

- aaa0a0d: `Symbolic.simplify` now expands products and cancels common polynomial factors (johnhenry/math#92). `(x+1)^2 - x^2 - 2*x` simplifies to `1`, and `(x^2-1)/(x-1)` to `x + 1`. The expression is read as a rational function in its variables, with non-polynomial subexpressions such as `sin(x)` treated as opaque symbols; the expanded and cancelled form is used only when it is smaller than the form `simplify` already had, so shapes such as `(x+1)*2` are unchanged. Cancellation ignores the points where the original is undefined (`(x^2-1)/(x-1)` at `x = 1`), as a CAS does. `Symbolic.expand`, `differentiate`, `integrate`, `simplifyAssuming` and the other methods that simplify internally are unchanged (they keep the previous collected form). `Graph.topologicalSort` already returns `null` on a cyclic graph; a regression test now covers self-loops and cycles behind a DAG prefix.

### Patch Changes

- 142b75b: `GraphUtils.vectorToCurve` and `Graph3DUtils.pointMatrixToMesh3D` now handle non-finite values: a NaN or ±Infinity point splits the curve into separate `moveTo` segments (and a triangle touching one is dropped from the mesh) instead of drawing a line or face through it. `DualNumber.log` (and `sqrt`/`pow`) of an out-of-domain value now has a NaN derivative as well as a NaN value, instead of a finite-looking derivative such as `x.deriv / x.value` for `log(-1)`.

## 0.0.3

### Patch Changes

- 65ce864: `Structure.determinant` and `Structure.invertMatrix` now work over commutative rings such as `integersModulo(n)` with composite `n`, instead of throwing when a pivot is not a unit. When elimination hits a non-invertible pivot, `determinant` falls back to a division-free method (Berkowitz), and `invertMatrix` falls back to `det⁻¹ · adj(A)`. `invertMatrix` still throws `RangeError` when the determinant is zero (singular) or is not a unit. Field behaviour is unchanged.

## 0.0.2

### Patch Changes

- 869c974: `Structure.invertMatrix` no longer hangs or returns a bogus result. Over `integersModulo(n)` with composite `n`, `reciprocal(NaN)` used to loop forever; it now returns `NaN`, and `invertMatrix`/`determinant` choose an invertible pivot when one exists and otherwise throw a `RangeError` naming the element with no multiplicative inverse. Inverting a singular or non-square matrix now throws a `RangeError` instead of returning a matrix of zeros (so `powerMatrix` with a negative power throws too). Treated as a bug fix (the zero matrix was never a correct inverse); callers that relied on the zero-matrix result must catch the error.
