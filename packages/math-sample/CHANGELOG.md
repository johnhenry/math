# @johnhenry/math-sample

## 0.1.0

### Minor Changes

- cc5f837: Parts 2 and 3: 3D samplers (`sampleSurface`, `sampleParametricSurface`, `sampleSpaceCurve`, `sampleVectorField3`) returning typed-array meshes with holes for non-finite values; `sampleComplexRaster`, `conformalGrid`, `findZerosAndPoles`; ODE `sampleSlopeField`, `integrateRk4`, `integrateAdaptive`, `sampleSolutionCurve`, `samplePhasePortrait` with fixed-point classification; Taylor, series and Fourier partial sums; `sampleImplicit`, `sampleContours`, `sampleGradient`. The grid and field samplers (surfaces, space curve, vector field, complex raster, zeros and poles, slope field, phase portrait field pass, implicit, contours, gradient) accept a cell/time budget and report where they stopped; `conformalGrid`, the ODE integrators and the series samplers do not. `taylorCoefficients` added to `/expr`.

### Patch Changes

- Updated dependencies [cc5f837]
  - @johnhenry/math@0.2.0

## 0.0.1

### Patch Changes

- 2654ac1: First release of `@johnhenry/math-sample`: pure-ESM, DOM-free, Web-Worker-safe 1D function sampling for plotting. Adaptive and uniform samplers (`sampleAdaptive`, `sampleUniform`) return `Float64Array`s with NaN gap rows for poles, domain edges and jump discontinuities, and are cancellable (`signal` / `isCancelled`). Also a viewport model (pan, zoom, pinch, fit, DPR-aware `backingStoreSize`), "nice" tick generation, SVG path and axes output, and root / intersection / crossing finders. `@johnhenry/math-sample/expr` compiles `@johnhenry/math` expressions (optional peer dependency) into the plain `(x) => number` the samplers take; pass `implicitMultiplication: true` to accept `2x` (needs `@johnhenry/math` ^0.1.0, now the optional peer range).
