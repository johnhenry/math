import { assertCount, assertRange, type Budget, type Cancellable, Meter, type Progress, progress } from "./budget.ts";
import type { Domain } from "./sample.ts";

/** A complex function over plain numbers: `(re, im) -> [re, im]`. */
export type ComplexFn = (re: number, im: number) => readonly [number, number];

export interface ComplexRasterOptions extends Budget, Cancellable {
  /** Pixels across (real axis). Default 128. */
  width?: number;
  /** Pixels down (imaginary axis). Default 128. */
  height?: number;
}

/**
 * Grid of `f(z)` values for domain colouring. Row 0 is the *smallest* imaginary part (mathematical
 * orientation); flip when drawing to a canvas. Cells where `f` is not finite hold `NaN` in all four arrays
 * (a pole shows as `abs = Infinity` only if `f` returned an infinite modulus with finite parts; otherwise NaN).
 * `arg` is in `(-PI, PI]`.
 */
export interface ComplexRaster {
  width: number;
  /** Rows completed (may be fewer than requested when the budget ran out). */
  height: number;
  re: Float32Array;
  im: Float32Array;
  abs: Float32Array;
  arg: Float32Array;
  progress: Progress;
}

/** Sample `f` at the centre of each cell of a `width` x `height` grid over the rectangle. */
export function sampleComplexRaster(
  f: ComplexFn,
  reDomain: Domain,
  imDomain: Domain,
  options: ComplexRasterOptions = {},
): ComplexRaster {
  const width = options.width ?? 128;
  const height = options.height ?? 128;
  assertCount("width", width, 1);
  assertCount("height", height, 1);
  assertRange("re domain", reDomain);
  assertRange("im domain", imDomain);
  const meter = new Meter(options, options);
  const re = new Float32Array(width * height).fill(Number.NaN);
  const im = new Float32Array(width * height).fill(Number.NaN);
  const abs = new Float32Array(width * height).fill(Number.NaN);
  const arg = new Float32Array(width * height).fill(Number.NaN);
  let rows = 0;
  let reason: "cells" | "time" | undefined;
  for (let j = 0; j < height; j++) {
    reason = meter.check(width);
    if (reason) break;
    const y = imDomain.min + ((imDomain.max - imDomain.min) * (j + 0.5)) / height;
    for (let i = 0; i < width; i++) {
      const x = reDomain.min + ((reDomain.max - reDomain.min) * (i + 0.5)) / width;
      const w = f(x, y);
      const k = j * width + i;
      if (Number.isFinite(w[0]) && Number.isFinite(w[1])) {
        re[k] = w[0];
        im[k] = w[1];
        abs[k] = Math.hypot(w[0], w[1]);
        arg[k] = Math.atan2(w[1], w[0]);
      }
    }
    meter.spend(width);
    rows++;
  }
  return {
    width,
    height: rows,
    re: re.slice(0, width * rows),
    im: im.slice(0, width * rows),
    abs: abs.slice(0, width * rows),
    arg: arg.slice(0, width * rows),
    progress: progress(rows, height, reason),
  };
}

export interface ConformalLine {
  /** `"re"`: the image of the vertical line `Re z = value`; `"im"`: of the horizontal line `Im z = value`. */
  kind: "re" | "im";
  value: number;
  /** Image points; `NaN` rows are gaps (never first, last or adjacent). */
  x: Float64Array;
  y: Float64Array;
}

export interface ConformalGridOptions {
  /** Vertical grid lines (constant real part), evenly spaced including both edges. Default 11. */
  reLines?: number;
  /** Horizontal grid lines (constant imaginary part). Default 11. */
  imLines?: number;
  /** Samples along each line. Default 200. */
  samplesPerLine?: number;
  /** Image points with modulus above this become gaps (poles). Default 1e6. */
  bound?: number;
  /** Segments whose image is longer than this become gaps (branch cuts). Default: no limit. */
  maxStep?: number;
}

/** The image under `f` of a rectangular grid of lines: where the grid lines go, drawn as the conformal-map picture. */
export function conformalGrid(
  f: ComplexFn,
  reDomain: Domain,
  imDomain: Domain,
  options: ConformalGridOptions = {},
): ConformalLine[] {
  const nRe = options.reLines ?? 11;
  const nIm = options.imLines ?? 11;
  const n = options.samplesPerLine ?? 200;
  const bound = options.bound ?? 1e6;
  assertCount("reLines", nRe, 1);
  assertCount("imLines", nIm, 1);
  assertCount("samplesPerLine", n);
  assertRange("re domain", reDomain);
  assertRange("im domain", imDomain);
  const lines: ConformalLine[] = [];
  const trace = (kind: "re" | "im", value: number, d: Domain): ConformalLine => {
    const xs: number[] = [];
    const ys: number[] = [];
    let pending = false;
    let px = Number.NaN;
    let py = Number.NaN;
    for (let k = 0; k < n; k++) {
      const s = k === n - 1 ? d.max : d.min + ((d.max - d.min) * k) / (n - 1);
      const w = kind === "re" ? f(value, s) : f(s, value);
      const good = Number.isFinite(w[0]) && Number.isFinite(w[1]) && Math.hypot(w[0], w[1]) <= bound;
      if (!good) {
        pending = xs.length > 0;
        px = Number.NaN;
        continue;
      }
      const cut =
        options.maxStep !== undefined && !Number.isNaN(px) && Math.hypot(w[0] - px, w[1] - py) > options.maxStep;
      if ((pending || cut) && xs.length > 0) {
        xs.push(Number.NaN);
        ys.push(Number.NaN);
      }
      xs.push(w[0]);
      ys.push(w[1]);
      px = w[0];
      py = w[1];
      pending = false;
    }
    return { kind, value, x: Float64Array.from(xs), y: Float64Array.from(ys) };
  };
  for (let i = 0; i < nRe; i++)
    lines.push(
      trace("re", nRe === 1 ? reDomain.min : reDomain.min + ((reDomain.max - reDomain.min) * i) / (nRe - 1), imDomain),
    );
  for (let j = 0; j < nIm; j++)
    lines.push(
      trace("im", nIm === 1 ? imDomain.min : imDomain.min + ((imDomain.max - imDomain.min) * j) / (nIm - 1), reDomain),
    );
  return lines;
}

export interface ZeroOrPole {
  re: number;
  im: number;
  kind: "zero" | "pole";
  /** Multiplicity (zero) or order (pole), from the winding number of the cell it was found in. */
  order: number;
  /** `false` when the local refinement did not converge and `re`/`im` is only the cell centre. */
  refined: boolean;
}

export interface ZerosPolesOptions extends Budget, Cancellable {
  /** Cells per side of the search grid. Default 24. */
  grid?: number;
  /** Convergence tolerance on the root position. Default 1e-10 (relative to the rectangle size). */
  tolerance?: number;
}

export interface ZerosPoles {
  items: ZeroOrPole[];
  progress: Progress;
}

const wrap = (d: number) => {
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/**
 * Zeros and poles of `f` inside a rectangle, by the argument principle: the winding number of `f` around each
 * grid cell is (zeros - poles) inside it; non-zero cells are refined with Newton's method (on `f` for a
 * zero, on `1/f` for a pole, scaled by the multiplicity). A zero and a pole inside one cell cancel and are missed:
 * raise `grid`. A root exactly on a grid line can be reported once or twice; results within the tolerance
 * are merged. `progress.rows` counts grid rows searched.
 */
export function findZerosAndPoles(
  f: ComplexFn,
  reDomain: Domain,
  imDomain: Domain,
  options: ZerosPolesOptions = {},
): ZerosPoles {
  const grid = options.grid ?? 24;
  assertCount("grid", grid, 1);
  assertRange("re domain", reDomain);
  assertRange("im domain", imDomain);
  const size = Math.max(reDomain.max - reDomain.min, imDomain.max - imDomain.min);
  const tol = (options.tolerance ?? 1e-10) * size;
  const meter = new Meter(options, options);
  const dx = (reDomain.max - reDomain.min) / grid;
  const dy = (imDomain.max - imDomain.min) / grid;
  const found: ZeroOrPole[] = [];

  const argAt = (x: number, y: number): number => {
    const w = f(x, y);
    return Math.atan2(w[1], w[0]);
  };
  // winding of f along segment p->q, subdividing until the phase moves < 1 rad per piece
  const segment = (x0: number, y0: number, a0: number, x1: number, y1: number, a1: number, depth: number): number => {
    const d = wrap(a1 - a0);
    if (Math.abs(d) < 1 || depth >= 14) return d;
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    const am = argAt(xm, ym);
    return segment(x0, y0, a0, xm, ym, am, depth + 1) + segment(xm, ym, am, x1, y1, a1, depth + 1);
  };
  const winding = (x0: number, y0: number, x1: number, y1: number): number => {
    const pts: Array<[number, number]> = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ];
    const args = pts.map(([x, y]) => argAt(x, y));
    if (args.some((a) => !Number.isFinite(a))) return Number.NaN;
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const p = pts[k] as [number, number];
      const q = pts[k + 1] as [number, number];
      total += segment(p[0], p[1], args[k] as number, q[0], q[1], args[k + 1] as number, 0);
    }
    return Math.round(total / (2 * Math.PI));
  };

  const newton = (
    x: number,
    y: number,
    kind: "zero" | "pole",
    order: number,
    box: [number, number, number, number],
  ) => {
    const g = (a: number, b: number): [number, number] => {
      const w = f(a, b);
      if (kind === "zero") return [w[0], w[1]];
      const m = w[0] * w[0] + w[1] * w[1];
      return [w[0] / m, -w[1] / m]; // 1/f
    };
    let zx = x;
    let zy = y;
    for (let it = 0; it < 60; it++) {
      const [gr, gi] = g(zx, zy);
      if (!Number.isFinite(gr) || !Number.isFinite(gi)) return undefined;
      const h = 1e-7 * Math.max(1, Math.abs(zx), Math.abs(zy));
      const [ar, ai] = g(zx + h, zy);
      const dr = (ar - gr) / h; // derivative of an analytic function = d/dx
      const di = (ai - gi) / h;
      const den = dr * dr + di * di;
      if (!(den > 0) || !Number.isFinite(den)) return undefined;
      // step = order * g / g'
      const sr = (order * (gr * dr + gi * di)) / den;
      const si = (order * (gi * dr - gr * di)) / den;
      zx -= sr;
      zy -= si;
      if (Math.hypot(sr, si) < tol) {
        const pad = 0.5 * Math.max(dx, dy);
        if (zx < box[0] - pad || zx > box[1] + pad || zy < box[2] - pad || zy > box[3] + pad) return undefined;
        return [zx, zy] as const;
      }
      if (!Number.isFinite(zx) || !Number.isFinite(zy)) return undefined;
    }
    return undefined;
  };

  let rows = 0;
  let reason: "cells" | "time" | undefined;
  for (let j = 0; j < grid; j++) {
    reason = meter.check(grid * 4);
    if (reason) break;
    for (let i = 0; i < grid; i++) {
      const x0 = reDomain.min + i * dx;
      const y0 = imDomain.min + j * dy;
      const w = winding(x0, y0, x0 + dx, y0 + dy);
      if (!Number.isFinite(w) || w === 0) continue;
      const kind = w > 0 ? "zero" : "pole";
      const order = Math.abs(w);
      const cx = x0 + dx / 2;
      const cy = y0 + dy / 2;
      const refined = newton(cx, cy, kind, order, [x0, x0 + dx, y0, y0 + dy]);
      const [rx, ry] = refined ?? [cx, cy];
      if (found.some((p) => p.kind === kind && Math.hypot(p.re - rx, p.im - ry) < Math.max(tol * 1e3, 1e-7 * size)))
        continue;
      found.push({ re: rx, im: ry, kind, order, refined: refined !== undefined });
    }
    meter.spend(grid * 4);
    rows++;
  }
  found.sort((a, b) => a.re - b.re || a.im - b.im);
  return { items: found, progress: progress(rows, grid, reason) };
}
