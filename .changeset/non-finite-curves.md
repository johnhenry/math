---
"@johnhenry/math": patch
---

`GraphUtils.vectorToCurve` and `Graph3DUtils.pointMatrixToMesh3D` now handle non-finite values: a NaN or ±Infinity point splits the curve into separate `moveTo` segments (and a triangle touching one is dropped from the mesh) instead of drawing a line or face through it. `DualNumber.log` (and `sqrt`/`pow`) of an out-of-domain value now has a NaN derivative as well as a NaN value, instead of a finite-looking derivative such as `x.deriv / x.value` for `log(-1)`.
