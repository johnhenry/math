import { assertCount, assertRange, type Budget, type Cancellable, Meter, type Progress, progress } from "./budget.ts";
import type { Domain, Samples } from "./sample.ts";

export type Fn2 = (x: number, y: number) => number;

export interface Grid2Options extends Budget, Cancellable {
  /** Cells per side of the sampling grid (`grid + 1` nodes per side). Default 128. */
  grid?: number | [number, number];
}

export interface ImplicitCurve {
  /**
   * Segments as rows: each segment is two rows (its endpoints) followed by one `NaN` separator row, so
   * `Samples` gap rules hold and `runsOf` yields one run per segment (join them if you wish).
   */
  segments: Samples;
  segmentCount: number;
  progress: Progress;
}

function dims(g: number | [number, number] | undefined): [number, number] {
  const [nx, ny] = typeof g === "number" ? [g, g] : (g ?? [128, 128]);
  assertCount("grid", nx, 1);
  assertCount("grid", ny, 1);
  return [nx, ny];
}

function marching(
  f: Fn2,
  xDomain: Domain,
  yDomain: Domain,
  levels: number[],
  options: Grid2Options,
): { segs: number[][]; progress: Progress } {
  const [nx, ny] = dims(options.grid);
  assertRange("x domain", xDomain);
  assertRange("y domain", yDomain);
  const meter = new Meter(options, options);
  const hx = (xDomain.max - xDomain.min) / nx;
  const hy = (yDomain.max - yDomain.min) / ny;
  const segs: number[][] = levels.map(() => []);
  let prev = new Float64Array(nx + 1);
  let cur = new Float64Array(nx + 1);
  const row = (j: number, out: Float64Array) => {
    const y = yDomain.min + j * hy;
    for (let i = 0; i <= nx; i++) out[i] = f(xDomain.min + i * hx, y);
  };
  let reason: "cells" | "time" | undefined;
  row(0, prev);
  meter.spend(nx + 1);
  let done = 0;
  for (let j = 0; j < ny; j++) {
    reason = meter.check(nx + 1);
    if (reason) break;
    row(j + 1, cur);
    meter.spend(nx + 1);
    const y0 = yDomain.min + j * hy;
    for (let i = 0; i < nx; i++) {
      const x0 = xDomain.min + i * hx;
      const v = [prev[i], prev[i + 1], cur[i + 1], cur[i]] as number[]; // corners ccw from bottom-left
      if (!v.every(Number.isFinite)) continue; // holes: no segments through undefined cells
      const cx = [x0, x0 + hx, x0 + hx, x0];
      const cy = [y0, y0, y0 + hy, y0 + hy];
      levels.forEach((level, li) => {
        const s = v.map((q) => q - level);
        // edge e joins corner e and corner e+1
        const cross = (e: number): [number, number] | undefined => {
          const a = s[e] as number;
          const b = s[(e + 1) % 4] as number;
          if (a < 0 === b < 0) return undefined; // a === 0 counts as >= 0 on the positive side
          const t = a / (a - b);
          const ea = e;
          const eb = (e + 1) % 4;
          return [
            (cx[ea] as number) + t * ((cx[eb] as number) - (cx[ea] as number)),
            (cy[ea] as number) + t * ((cy[eb] as number) - (cy[ea] as number)),
          ];
        };
        const pts: Array<[number, number] | undefined> = [0, 1, 2, 3].map(cross);
        const idx = [0, 1, 2, 3].filter((e) => pts[e]);
        const out = segs[li] as number[];
        const emit = (p: [number, number], q: [number, number]) => out.push(p[0], p[1], q[0], q[1]);
        if (idx.length === 2)
          emit(pts[idx[0] as number] as [number, number], pts[idx[1] as number] as [number, number]);
        else if (idx.length === 4) {
          // saddle: the cell centre decides which corners are connected
          const centre = ((s[0] as number) + (s[1] as number) + (s[2] as number) + (s[3] as number)) / 4;
          const p = pts as Array<[number, number]>;
          const bottomLeftPositive = (s[0] as number) >= 0;
          const joinsCorner0 = centre >= 0 === bottomLeftPositive; // centre agrees with corner 0: corners 0 and 2 are linked through the middle, so the curve cuts off corners 1 and 3
          if (joinsCorner0) {
            emit(p[0] as [number, number], p[1] as [number, number]);
            emit(p[2] as [number, number], p[3] as [number, number]);
          } else {
            emit(p[3] as [number, number], p[0] as [number, number]);
            emit(p[1] as [number, number], p[2] as [number, number]);
          }
        }
      });
    }
    [prev, cur] = [cur, prev];
    done++;
  }
  return { segs, progress: progress(done, ny, reason) };
}

function toSamples(flat: number[]): Samples {
  const n = flat.length / 4;
  const x = new Float64Array(n === 0 ? 0 : n * 3 - 1);
  const y = new Float64Array(x.length);
  for (let s = 0; s < n; s++) {
    const o = s * 3;
    x[o] = flat[4 * s] as number;
    y[o] = flat[4 * s + 1] as number;
    x[o + 1] = flat[4 * s + 2] as number;
    y[o + 1] = flat[4 * s + 3] as number;
    if (s < n - 1) {
      x[o + 2] = Number.NaN;
      y[o + 2] = Number.NaN;
    }
  }
  return { x, y };
}

/**
 * The curve `f(x, y) = level` (default 0) by marching squares on a regular grid. A saddle cell is joined by its
 * centre value. Cells with a non-finite corner are skipped (a hole, not a spike). With a budget,
 * `progress.rows` counts grid rows finished.
 */
export function sampleImplicit(
  f: Fn2,
  xDomain: Domain,
  yDomain: Domain,
  options: Grid2Options & { level?: number } = {},
): ImplicitCurve {
  const { segs, progress: p } = marching(f, xDomain, yDomain, [options.level ?? 0], options);
  const flat = segs[0] as number[];
  return { segments: toSamples(flat), segmentCount: flat.length / 4, progress: p };
}

export interface Contours {
  levels: number[];
  /** One entry per level, in `levels` order. */
  curves: Array<{ level: number; segments: Samples; segmentCount: number }>;
  progress: Progress;
}

/**
 * Contour lines of `f` at the given `levels`, or `count` (default 9) levels evenly spread strictly between the
 * grid's least and greatest values. One pass over the grid for all levels.
 */
export function sampleContours(
  f: Fn2,
  xDomain: Domain,
  yDomain: Domain,
  options: Grid2Options & { levels?: number[]; count?: number } = {},
): Contours {
  let levels = options.levels;
  if (!levels) {
    const [nx, ny] = dims(options.grid);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const v = f(
          xDomain.min + ((xDomain.max - xDomain.min) * i) / nx,
          yDomain.min + ((yDomain.max - yDomain.min) * j) / ny,
        );
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    const count = options.count ?? 9;
    levels = lo < hi ? Array.from({ length: count }, (_, k) => lo + ((hi - lo) * (k + 1)) / (count + 1)) : [];
  }
  const { segs, progress: p } = marching(f, xDomain, yDomain, levels, options);
  return {
    levels,
    curves: levels.map((level, k) => ({
      level,
      segments: toSamples(segs[k] as number[]),
      segmentCount: (segs[k] as number[]).length / 4,
    })),
    progress: p,
  };
}

export interface GradientField {
  columns: number;
  rows: number;
  /** Arrow tails. */
  x: Float64Array;
  y: Float64Array;
  /** Components; `NaN` where either component is non-finite. */
  u: Float64Array;
  v: Float64Array;
  magnitude: Float64Array;
  maxMagnitude: number;
  progress: Progress;
}

/** Sample the vector field `(fx, fy)` (e.g. the two partial derivatives of a scalar field) on a grid including the edges. */
export function sampleGradient(
  fx: Fn2,
  fy: Fn2,
  xDomain: Domain,
  yDomain: Domain,
  options: Grid2Options = {},
): GradientField {
  const [cols, rws] = typeof options.grid === "number" ? [options.grid, options.grid] : (options.grid ?? [16, 16]);
  assertCount("grid", cols);
  assertCount("grid", rws);
  assertRange("x domain", xDomain);
  assertRange("y domain", yDomain);
  const meter = new Meter(options, options);
  const n = cols * rws;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  const U = new Float64Array(n).fill(Number.NaN);
  const V = new Float64Array(n).fill(Number.NaN);
  const M = new Float64Array(n).fill(Number.NaN);
  let done = 0;
  let reason: "cells" | "time" | undefined;
  let max = 0;
  for (let j = 0; j < rws; j++) {
    reason = meter.check(cols);
    if (reason) break;
    const y = j === rws - 1 ? yDomain.max : yDomain.min + ((yDomain.max - yDomain.min) * j) / (rws - 1);
    for (let i = 0; i < cols; i++) {
      const x = i === cols - 1 ? xDomain.max : xDomain.min + ((xDomain.max - xDomain.min) * i) / (cols - 1);
      const k = j * cols + i;
      X[k] = x;
      Y[k] = y;
      const a = fx(x, y);
      const b = fy(x, y);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        U[k] = a;
        V[k] = b;
        M[k] = Math.hypot(a, b);
        if (M[k] > max) max = M[k] as number;
      }
    }
    meter.spend(cols);
    done++;
  }
  const m = cols * done;
  return {
    columns: cols,
    rows: done,
    x: X.slice(0, m),
    y: Y.slice(0, m),
    u: U.slice(0, m),
    v: V.slice(0, m),
    magnitude: M.slice(0, m),
    maxMagnitude: max,
    progress: progress(done, rws, reason),
  };
}
