# @johnhenry/math

## 0.0.3

### Patch Changes

- 65ce864: `Structure.determinant` and `Structure.invertMatrix` now work over commutative rings such as `integersModulo(n)` with composite `n`, instead of throwing when a pivot is not a unit. When elimination hits a non-invertible pivot, `determinant` falls back to a division-free method (Berkowitz), and `invertMatrix` falls back to `det⁻¹ · adj(A)`. `invertMatrix` still throws `RangeError` when the determinant is zero (singular) or is not a unit. Field behaviour is unchanged.

## 0.0.2

### Patch Changes

- 869c974: `Structure.invertMatrix` no longer hangs or returns a bogus result. Over `integersModulo(n)` with composite `n`, `reciprocal(NaN)` used to loop forever; it now returns `NaN`, and `invertMatrix`/`determinant` choose an invertible pivot when one exists and otherwise throw a `RangeError` naming the element with no multiplicative inverse. Inverting a singular or non-square matrix now throws a `RangeError` instead of returning a matrix of zeros (so `powerMatrix` with a negative power throws too). Treated as a bug fix (the zero matrix was never a correct inverse); callers that relied on the zero-matrix result must catch the error.
