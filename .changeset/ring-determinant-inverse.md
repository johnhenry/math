---
"@johnhenry/math": patch
---

`Structure.determinant` and `Structure.invertMatrix` now work over commutative rings such as `integersModulo(n)` with composite `n`, instead of throwing when a pivot is not a unit. When elimination hits a non-invertible pivot, `determinant` falls back to a division-free method (Berkowitz), and `invertMatrix` falls back to `det⁻¹ · adj(A)`. `invertMatrix` still throws `RangeError` when the determinant is zero (singular) or is not a unit. Field behaviour is unchanged.
