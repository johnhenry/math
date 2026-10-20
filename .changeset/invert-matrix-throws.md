---
"@johnhenry/math": patch
---

`Structure.invertMatrix` no longer hangs or returns a bogus result. Over `integersModulo(n)` with composite `n`, `reciprocal(NaN)` used to loop forever; it now returns `NaN`, and `invertMatrix`/`determinant` choose an invertible pivot when one exists and otherwise throw a `RangeError` naming the element with no multiplicative inverse. Inverting a singular or non-square matrix now throws a `RangeError` instead of returning a matrix of zeros (so `powerMatrix` with a negative power throws too). Treated as a bug fix (the zero matrix was never a correct inverse); callers that relied on the zero-matrix result must catch the error.
