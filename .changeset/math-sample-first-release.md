---
"@johnhenry/math-sample": patch
---

First release of `@johnhenry/math-sample`: pure-ESM, DOM-free, Web-Worker-safe 1D function sampling for plotting. Adaptive and uniform samplers (`sampleAdaptive`, `sampleUniform`) return `Float64Array`s with NaN gap rows for poles, domain edges and jump discontinuities, and are cancellable (`signal` / `isCancelled`). Also a viewport model (pan, zoom, pinch, fit, DPR-aware `backingStoreSize`), "nice" tick generation, SVG path and axes output, and root / intersection / crossing finders. `@johnhenry/math-sample/expr` compiles `@johnhenry/math` expressions (optional peer dependency) into the plain `(x) => number` the samplers take; pass `implicitMultiplication: true` to accept `2x` (needs `@johnhenry/math` ^0.1.0, now the optional peer range).
