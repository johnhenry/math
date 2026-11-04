---
"@johnhenry/math": minor
---

Add `Symbolic.toGLSL` and `Symbolic.toWGSL`: compile an expression to a GLSL ES 3.0 / WGSL expression over float or complex numbers (`vec2`), with deterministic output and `ShaderUnsupportedError` for nodes with no shader form.
