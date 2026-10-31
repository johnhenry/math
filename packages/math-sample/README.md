# @johnhenry/math-sample

Sampling for plots, as a library with no DOM in it. Give it a `(x) => number`
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

## What it does not do (yet)

- **Implicit multiplication is opt-in.** `2x` fails to parse by default; write
  `2*x`, or pass `compileExpression(src, { implicitMultiplication: true })`
  (needs `@johnhenry/math` 0.1.0+; multi-letter variable names such as `theta`
  then become products, use `x_1`).
- **1D `y = f(x)` only.** Implicit/interval curves, parametric and polar,
  surfaces, ODEs and series samplers are planned as later parts.
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
