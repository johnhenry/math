---
"@johnhenry/math-sample": minor
---

Parts 2 and 3: 3D samplers (`sampleSurface`, `sampleParametricSurface`, `sampleSpaceCurve`, `sampleVectorField3`) returning typed-array meshes with holes for non-finite values; `sampleComplexRaster`, `conformalGrid`, `findZerosAndPoles`; ODE `sampleSlopeField`, `integrateRk4`, `integrateAdaptive`, `sampleSolutionCurve`, `samplePhasePortrait` with fixed-point classification; Taylor, series and Fourier partial sums; `sampleImplicit`, `sampleContours`, `sampleGradient`. The grid and field samplers (surfaces, space curve, vector field, complex raster, zeros and poles, slope field, phase portrait field pass, implicit, contours, gradient) accept a cell/time budget and report where they stopped; `conformalGrid`, the ODE integrators and the series samplers do not. `taylorCoefficients` added to `/expr`.
