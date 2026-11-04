# @johnhenry/math-sample

Sampling for plots (1D curves, 2D implicit/contour/gradient fields, 3D meshes, complex rasters, ODEs, series), as a library with no DOM in it. Give it a `(x) => number`
(or an `@johnhenry/math` expression) and a viewport; get back `Float64Array`s
with the poles and jumps already turned into gaps, plus the viewport maths,
"nice" ticks and SVG path output a plot needs. Pure ESM, zero runtime
dependencies, no globals beyond the language: it runs unchanged in a Web
Worker, so a plotter can send it *sources and a viewport*, and transfer the
arrays back.

```bash
npm install @johnhenry/math-sample
```

```ts
import { sampleAdaptive, samplesToSvgPath, axesToSvg, niceTicks } from "@johnhenry/math-sample";
import { compileExpression } from "@johnhenry/math-sample/expr"; // needs @johnhenry/math

const f = compileExpression("a*sin(x)", { params: { a: 2 } });
const view = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };

const s = sampleAdaptive(f, { min: view.xMin, max: view.xMax }, 400, {
  visibleYRange: { min: view.yMin, max: view.yMax },
});
s.x; s.y;                                    // Float64Array, NaN in y = gap
samplesToSvgPath(s, view, 600, 300);         // "M0.00 150.00 L1.50 ..."
```

## API

### Samples

`Samples` is `{ x: Float64Array; y: Float64Array }`. A row with `y = NaN` is a
gap: do not draw between its neighbours. Gaps are never first, last or
adjacent to another gap, so `runsOf(samples)` (half-open row ranges) is exactly
the polylines to draw.

| Function | Does |
|---|---|
| `sampleUniform(f, domain, n, options?)` | `n` evenly spaced evaluations, both ends included |
| `sampleAdaptive(f, domain, n, options?)` | the same base grid, with cells bisected where the curve bends |
| `runsOf(samples)` | `[start, end)` row ranges of consecutive data |
| `findDiscontinuities(samples)` | `{ before, after }` points either side of every gap |
| `findCrossings(samples, signedDistance)` | interpolated crossings of a boundary (`y => y` is the x-axis); not across gaps |
| `findRoots(f, domain, { resolution? })` | sign changes on a grid, polished by bisection; poles rejected |
| `findIntersections(f, g, domain, opts?)` | roots of `f - g`, each with `y = f(x)` |
| `toPoints(samples)` | `[x, y \| null][]`, JSON-safe |

`f` is any `(x: number) => number`. Domains are `{ min, max }` (finite, `min < max`);
`n` is an integer >= 2. Bad input throws `RangeError`.

**Options (all samplers):**

- `visibleYRange: { min, max }`: the y-range on screen. A sample far outside it
  (a pole's finite but enormous shoulders) is treated as a gap, and the curve
  is capped with an interpolated point just inside the edge, so it runs up to
  the border of the plot instead of stopping short. Also sets the default
  tolerance and, for `sampleAdaptive`, enables jump detection (`sampleUniform` does not detect jumps).
- `signal` (`{ aborted: boolean }`, so any `AbortSignal`) and `isCancelled: () => boolean`:
  checked every 256 evaluations; either one makes the sampler throw
  `SampleCancelledError`. `isCancelled: () => generation !== latest` is the
  generation-counter pattern for pan/zoom.

**Options (`sampleAdaptive`):**

- `maxDepth` (4): bisections per base cell.
- `tolerance`: a cell is split while its midpoint is further than this, in y
  units, from the straight line through its ends. Default `1e-4` of the visible
  y span, so zooming in refines more and zooming out less; with no
  `visibleYRange`, `1e-3`.
- `jumpFraction` (0.5 with `visibleYRange`; off without): a cell still this far
  apart (as a fraction of the y span) at `maxDepth`, whose height has not
  shrunk as it was halved, is a jump (a step, a pole) and becomes a gap. A
  steep slope loses height as it is halved, so it stays connected. `Infinity` turns it off.

### Viewport

`Viewport` is `{ xMin, xMax, yMin, yMax }`. Everything is unit-agnostic: use CSS
pixels or device pixels, as long as width and height agree.

`toScreenX/toScreenY(v, viewport, size)`, `toDataX/toDataY(s, viewport, size)`,
`panViewport(v, dxPx, dyPx, w, h)` (content follows the pointer),
`zoomViewport(v, factor, sx, sy, w, h)` (the data under the cursor stays put),
`viewportFromAnchor(...)`, `wheelZoomFactor(deltaY, step?)`,
`pinchZoomFactor(startDist, currentDist)`, `fitViewport(x, y, padding?)`, and
`backingStoreSize(cssW, cssH, dpr)` which returns `{ width, height, scale }` for
sizing a canvas: set `canvas.width/height` to those, `ctx.scale(scale, scale)`,
and draw in CSS pixels. A non-finite or non-positive `dpr` counts as 1.

### Ticks

`niceTicks(min, max, target = 6)` gives round values (1, 2 or 5 times a power of
ten) with no float drift (`0.3`, not `0.30000000000000004`). `tickStep` is the
step it chose, and `formatTick(v, step)` labels with matching decimals.
Degenerate or non-finite ranges give `[]`.

### SVG

`samplesToSvgPath(samples, viewport, w, h, { digits = 2 })` returns path data,
one `M ... L ...` subpath per run. `axesToSvg(viewport, w, h, { targetTickCount, stroke, labelFill, fontSize })`
returns `<line>`/`<text>` elements with inline attributes (axes at zero, or
hugging the nearest edge with labels flipped inward). `svgDocument(w, h, content)`
wraps them.

### Expressions (`@johnhenry/math-sample/expr`)

`compileExpression(exprOrSource, { variable = "x", params = {} })` returns a
`(x) => number` from an `@johnhenry/math` `Expr` or source string. This is the
only entry that needs `@johnhenry/math`, which is an **optional peer
dependency**; the main entry never imports it. In a Worker: post the source
string and params, compile there, sample, and `postMessage` the arrays with
`[s.x.buffer, s.y.buffer]` as transferables.

## 2D and 3D samplers, ODEs, series (part 2/3)

All of these take plain functions, return typed arrays, and never draw spikes: a
non-finite value is a **hole** (a gap row in curves, a skipped vertex in meshes,
`NaN` in rasters). The grid and field samplers (`sampleSurface`, `sampleParametricSurface`,
`sampleSpaceCurve`, `sampleVectorField3`, `sampleComplexRaster`, `findZerosAndPoles`, `sampleSlopeField`,
`samplePhasePortrait` (field pass), `sampleImplicit`, `sampleContours`, `sampleGradient`) accept a
**budget** and the cancellation options of part 1 (`signal`, `isCancelled`, which throw
`SampleCancelledError`). `conformalGrid`, the ODE integrators, and the series/Fourier samplers do not take a budget
(they are bounded by their own `samplesPerLine`, `maxSteps`, `samples` arguments):

```ts
{ maxCells?: number; maxMillis?: number; now?: () => number }
```

When the budget runs out the sampler stops at a row (or slab) boundary and
**returns what it has** with `progress: { rows, of, complete, reason? }`
(`reason` is `"cells"` or `"time"`), so a UI can say "stopped at row 120 of 161:
the time limit". The time limit is checked per row, so one row can overrun it.

### 3D (typed-array meshes)

| Function | Returns |
|---|---|
| `sampleSurface(f(x, y), xDomain, yDomain, { columns, rows, zRange, ...budget })` | `Mesh` for `z = f(x, y)` |
| `sampleParametricSurface(f(u, v) => [x, y, z], uDomain, vDomain, opts)` | `Mesh` |
| `sampleSpaceCurve(f(t) => [x, y, z], tDomain, { samples, maxStep, ...budget })` | `Curve3` |
| `curve3Runs(curve)` | `[start, end)` row ranges of consecutive data |
| `sampleVectorField3(f(x, y, z) => [a, b, c], xD, yD, zD, { grid, ...budget })` | `VectorField3` |

`Mesh` is `{ positions: Float32Array, normals: Float32Array, indices: Uint32Array, valid: Uint8Array,
vertexCount, columns, rows, bounds, progress }` (3 floats per vertex; triangles are counter-clockwise
seen from the side the normals point to, which is `+z` for `sampleSurface`, and `dP/du x dP/dv` for a
parametric surface). A hole vertex has `NaN` position, zero normal and `valid = 0`, and **no triangle
references it**, so GPU upload needs no special casing. `zRange` also turns a pole's huge but finite
shoulders into holes. A quad with one hole corner keeps its other triangle. `bounds` covers valid vertices
(`NaN`s when there are none). A valid vertex whose own normal degenerates (the poles of a sphere parameterisation) borrows
a neighbouring vertex's normal. Mind the sign: `dP/du x dP/dv` on the usual sphere parameterisation
`(sin v cos u, sin v sin u, cos v)` points **inward**; swap the arguments or negate a component for outward normals.
`Curve3` is `{ positions: Float64Array (3 per row), t, count, progress }` with `NaN` rows as gaps (never first,
last or adjacent). `VectorField3` is `{ origins, vectors, magnitudes: Float32Array, maxMagnitude, count,
skipped, progress }`; points where the field is non-finite are dropped and counted in `skipped`.

### Complex functions

`ComplexFn` is `(re, im) => [re, im]`.

- `sampleComplexRaster(f, reDomain, imDomain, { width, height })`: `{ re, im, abs, arg: Float32Array,
  width, height, progress }` sampled at cell centres, row 0 at the smallest imaginary part; `arg` in
  `(-PI, PI]`. Colour it yourself (hue from `arg`, brightness from `abs`).
- `conformalGrid(f, reDomain, imDomain, { reLines, imLines, samplesPerLine, bound, maxStep })`: the image of a
  rectangular grid of lines as `{ kind: "re" | "im", value, x, y }[]`; `NaN` gaps where `|f| > bound` (a pole)
  or a step exceeds `maxStep` (a branch cut).
- `findZerosAndPoles(f, reDomain, imDomain, { grid, tolerance })`: argument principle on every grid cell
  (winding number = zeros - poles), then Newton on `f` or `1/f` scaled by the multiplicity. Returns
  `{ items: { re, im, kind, order, refined }[] }`. A zero and a pole in one cell cancel, and two distinct
  roots in one cell are reported as one root of the combined order (Newton's step scaled by that order may fail to converge,
  giving `refined: false` at the cell centre): raise `grid` if you suspect it. A genuine multiple root (`z^3`) reports
  its multiplicity once with `refined: true`. The search grid is offset by an irrational fraction of a cell and
  extended past the rectangle, so roots and poles on round-number domains and on grid vertices are found; results
  outside the rectangle are dropped.

### ODEs

- `sampleSlopeField(f(x, y), xDomain, yDomain, { columns, rows })`: slopes and unit directions
  (`dirX`, `dirY`; vertical slopes are `(0, +-1)`; `NaN` where undefined).
- `integrateRk4(f(t, y[]) => number[], t0, y0[], tEnd, { steps })` and `integrateAdaptive(...,
  { atol, rtol, hMin, hMax })` (Dormand-Prince 5(4)): a `Trajectory { t, y (steps x dim), dim, steps,
  reason }` where `reason` is `"end" | "blowup" | "maxSteps" | "stopped" | "stepTooSmall"`. Either direction in
  `t`. `stop(t, y)` ends the run; `blowup` (default 1e12) catches finite-time singularities cleanly.
- `sampleSolutionCurve(f(x, y), x0, y0, xDomain, { method: "adaptive" | "rk4" })`: the solution through a
  point both ways as `Samples`, ending (not spiking) at an asymptote.
- `samplePhasePortrait(F(x, y) => [dx, dy], xDomain, yDomain, { grid, seeds, tMax, fixedPointStarts })`:
  `{ field, trajectories, fixedPoints, progress }`. Fixed points are found by Newton from a grid of starts
  and classified from the Jacobian by `classifyFixedPoint(J)`: `stable/unstable node`, `saddle`,
  `stable/unstable spiral`, `center`, the star/degenerate case, or `non-hyperbolic` (det ~ 0; linearisation
  says nothing). A `center` is a linear classification: the nonlinear system may spiral.

### Series

- `taylorCoefficients(expr, x0, order)` (in `/expr`, needs `@johnhenry/math`; computed by power-series arithmetic, so order
  12 or more is instant for `+ - * /`, powers, `exp ln sqrt sin cos tan sinh cosh tanh atan asin acos`; any other function
  falls back to repeated symbolic differentiation, keep `order` <= 8 there) then
  `sampleTaylorPartialSums(coefficients, x0, domain, orders, samples)`: one curve per order.
- `sampleSeriesPartialSums(term(k, x), from, domain, orders, samples)`: function-series partial sums in
  one pass over `k` (each term evaluated once per sample).
- `partialSums(term(k), from, to)`: numeric partial sums plus an Aitken delta-squared `limitEstimate`
  (a hint, not a convergence proof).
- `fourierCoefficients(f, { min, max }, terms)` (midpoint rule on 4096 samples by default; the interval is one
  period), `evaluateFourier`, `sampleFourierPartialSums(coefficients, domain, orders)`. Trig form
  `a0/2 + sum a_k cos(k pi (x - c) / L) + b_k sin(...)`. A function with jumps shows the Gibbs overshoot, as it should.

### 2D (implicit, contours, gradient)

- `sampleImplicit(f(x, y), xDomain, yDomain, { grid, level })`: marching squares, saddle cells settled by the
  centre value. Segments come back as `Samples` rows: two endpoints then a `NaN` row per segment, so
  `runsOf` gives one run per segment. Cells with a non-finite corner are skipped.
- `sampleContours(f, xDomain, yDomain, { grid, levels | count })`: one pass for all levels; default levels are
  spread strictly between the grid's least and greatest value.
- `sampleGradient(fx, fy, xDomain, yDomain, { grid })`: arrow tails and components with magnitudes.

## What it does not do (yet)

- **Implicit multiplication is opt-in.** `2x` fails to parse by default; write
  `2*x`, or pass `compileExpression(src, { implicitMultiplication: true })`
  (needs `@johnhenry/math` 0.1.0+; multi-letter variable names such as `theta`
  then become products, use `x_1`).
- **No interval-robust implicit mode.** `sampleImplicit` is a plain grid; thin features narrower
  than a cell and isolated points can be missed (the quadtree/interval variant needs
  `Symbolic.evaluateInterval`, johnhenry/math#108). Segments are not joined into long polylines.
- **Meshes are uniform grids.** No adaptive refinement for surfaces or space curves; normals come from
  finite differences of the vertex grid (one-sided at holes and edges), not from analytic gradients.
- **Budgets stop at row boundaries**, and the time limit is only checked there. The ODE integrators take
  `maxSteps`, not a budget.
- **Polar/parametric 2D curves and 3D adaptive sampling** are not here; wrap `sampleSpaceCurve`
  (with `z = 0`) or sample a parametric function through `sampleUniform` on each coordinate.
- **Gaps from steep or fast-oscillating functions.** Jump detection is a
  heuristic; a function that oscillates faster than the grid resolves can read
  as a jump. Raise the resolution or `maxDepth`, or set `jumpFraction: Infinity`.
- **Double-root and tangent roots are missed** by `findRoots` (no sign change).
- **No memoization or debouncing.** Callers own caching; use `isCancelled` to
  drop stale work.
- **Typed output is `Float64Array` only.** Convert with `Float32Array.from(s.y)`
  if you need less.

## Tests

`npm test -w @johnhenry/math-sample`. Golden values from NumPy, SciPy
(`brentq`) and SymPy (pole locations) are committed in `test/fixtures/goldens.json`;
regenerate with `scripts/generate-goldens.py` (the tests never call Python).
Behaviour was designed against [mallory](https://github.com/johnhenry/mallory)'s
samplers (MIT, same author); the code here is a rewrite.
