import { assertCount, assertRange, type Budget, type Cancellable, Meter, type Progress, progress } from "./budget.ts";
import { type Domain, SampleCancelledError, type Samples } from "./sample.ts";

/** `dy/dx = f(x, y)` for a scalar equation. */
export type Slope = (x: number, y: number) => number;
/** `dy/dt = f(t, y)` for a system; returns a new array (or the same-length output) of derivatives. */
export type System = (t: number, y: readonly number[]) => readonly number[];
/** Autonomous planar system `[dx/dt, dy/dt] = F(x, y)`. */
export type Field2 = (x: number, y: number) => readonly [number, number];

export interface SlopeField {
  columns: number;
  rows: number;
  /** Grid points (cell centres when `centered`, else grid nodes), `columns * rows` each, row-major from the smallest y. */
  x: Float64Array;
  y: Float64Array;
  slope: Float64Array;
  /**
   * Unit direction `(dirX, dirY)` of each segment in data space (`(1, m) / |(1, m)|`; a vertical slope `+-Infinity`
   * is `(0, +-1)`). `NaN` where the slope is `NaN` (undefined there).
   */
  dirX: Float64Array;
  dirY: Float64Array;
  progress: Progress;
}

export interface SlopeFieldOptions extends Budget, Cancellable {
  columns?: number;
  rows?: number;
}

/** Evaluate the slope field of `dy/dx = f(x, y)` on a `columns` x `rows` grid including both edges. */
export function sampleSlopeField(
  f: Slope,
  xDomain: Domain,
  yDomain: Domain,
  options: SlopeFieldOptions = {},
): SlopeField {
  const columns = options.columns ?? 20;
  const rows = options.rows ?? 20;
  assertCount("columns", columns);
  assertCount("rows", rows);
  assertRange("x domain", xDomain);
  assertRange("y domain", yDomain);
  const meter = new Meter(options, options);
  const n = columns * rows;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const slope = new Float64Array(n).fill(Number.NaN);
  const dirX = new Float64Array(n).fill(Number.NaN);
  const dirY = new Float64Array(n).fill(Number.NaN);
  let done = 0;
  let reason: "cells" | "time" | undefined;
  for (let j = 0; j < rows; j++) {
    reason = meter.check(columns);
    if (reason) break;
    const yy = j === rows - 1 ? yDomain.max : yDomain.min + ((yDomain.max - yDomain.min) * j) / (rows - 1);
    for (let i = 0; i < columns; i++) {
      const xx = i === columns - 1 ? xDomain.max : xDomain.min + ((xDomain.max - xDomain.min) * i) / (columns - 1);
      const k = j * columns + i;
      x[k] = xx;
      y[k] = yy;
      const m = f(xx, yy);
      slope[k] = m;
      if (Number.isNaN(m)) continue;
      if (!Number.isFinite(m)) {
        dirX[k] = 0;
        dirY[k] = m > 0 ? 1 : -1;
      } else {
        const len = Math.hypot(1, m);
        dirX[k] = 1 / len;
        dirY[k] = m / len;
      }
    }
    meter.spend(columns);
    done++;
  }
  const m = columns * done;
  return {
    columns,
    rows: done,
    x: x.slice(0, m),
    y: y.slice(0, m),
    slope: slope.slice(0, m),
    dirX: dirX.slice(0, m),
    dirY: dirY.slice(0, m),
    progress: progress(done, rows, reason),
  };
}

export type StopReason = "end" | "blowup" | "maxSteps" | "stopped" | "stepTooSmall";

export interface Trajectory {
  /** Times of the accepted steps, including the start. */
  t: Float64Array;
  /** `steps * dim` states, row-major. */
  y: Float64Array;
  dim: number;
  steps: number;
  reason: StopReason;
}

export interface OdeOptions extends Cancellable {
  /** Stop (reason `"stopped"`) when this returns true for an accepted state. */
  stop?: (t: number, y: readonly number[]) => boolean;
  /** Abort with `"blowup"` when any component is non-finite or its magnitude exceeds this. Default 1e12. */
  blowup?: number;
  /** Hard cap on accepted steps. Default 100000. */
  maxSteps?: number;
}

export interface Rk4Options extends OdeOptions {
  /** Number of equal steps from `t0` to `tEnd`. Default 200. */
  steps?: number;
}

export interface AdaptiveOdeOptions extends OdeOptions {
  /** Absolute tolerance per step. Default 1e-8. */
  atol?: number;
  /** Relative tolerance per step. Default 1e-6. */
  rtol?: number;
  /** First step size; default `|tEnd - t0| / 100`. */
  h0?: number;
  /** Smallest step; below it the integration stops with `"stepTooSmall"`. Default `|tEnd - t0| * 1e-12`. */
  hMin?: number;
  /** Largest step. Default `|tEnd - t0|`. */
  hMax?: number;
}

function bad(y: readonly number[], limit: number): boolean {
  for (const v of y) if (!Number.isFinite(v) || Math.abs(v) > limit) return true;
  return false;
}

function collect(ts: number[], ys: number[], dim: number, reason: StopReason): Trajectory {
  return { t: Float64Array.from(ts), y: Float64Array.from(ys), dim, steps: ts.length, reason };
}

function check(opts: OdeOptions): void {
  if (opts.signal?.aborted || opts.isCancelled?.()) throw new SampleCancelledError();
}

/** One classical RK4 step. */
function rk4Step(f: System, t: number, y: readonly number[], h: number): number[] {
  const n = y.length;
  const k1 = f(t, y);
  const k2 = f(
    t + h / 2,
    y.map((v, i) => v + (h / 2) * (k1[i] as number)),
  );
  const k3 = f(
    t + h / 2,
    y.map((v, i) => v + (h / 2) * (k2[i] as number)),
  );
  const k4 = f(
    t + h,
    y.map((v, i) => v + h * (k3[i] as number)),
  );
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++)
    out[i] =
      (y[i] as number) +
      (h / 6) * ((k1[i] as number) + 2 * (k2[i] as number) + 2 * (k3[i] as number) + (k4[i] as number));
  return out;
}

/**
 * Fixed-step classical Runge-Kutta (order 4) for a system `y' = f(t, y)` from `t0` to `tEnd` (which may be
 * smaller than `t0`: integrates backward). Stops early, with a reason, on blow-up or `options.stop`.
 */
export function integrateRk4(
  f: System,
  t0: number,
  y0: readonly number[],
  tEnd: number,
  options: Rk4Options = {},
): Trajectory {
  const steps = options.steps ?? 200;
  assertCount("steps", steps, 1);
  if (!Number.isFinite(t0) || !Number.isFinite(tEnd)) throw new RangeError("t0 and tEnd must be finite");
  const limit = options.blowup ?? 1e12;
  const maxSteps = Math.max(options.maxSteps ?? 100000, steps + 1); // never truncate a run the caller asked for
  const dim = y0.length;
  const h = (tEnd - t0) / steps;
  const ts = [t0];
  const ys = [...y0];
  let y: readonly number[] = y0;
  let reason: StopReason = "end";
  for (let k = 0; k < steps; k++) {
    if (ts.length >= maxSteps) {
      reason = "maxSteps";
      break;
    }
    if (k % 64 === 0) check(options);
    const t = t0 + k * h;
    const next = rk4Step(f, t, y, h);
    if (bad(next, limit)) {
      reason = "blowup";
      break;
    }
    y = next;
    const tn = k === steps - 1 ? tEnd : t0 + (k + 1) * h;
    ts.push(tn);
    ys.push(...y);
    if (options.stop?.(tn, y)) {
      reason = "stopped";
      break;
    }
  }
  return collect(ts, ys, dim, reason);
}

// Dormand-Prince 5(4)
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A: number[][] = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

/**
 * Adaptive Dormand-Prince (RK45) with error control, forward or backward in `t`. Stops with `"blowup"` near a
 * finite-time singularity, or `"stepTooSmall"` when the step would fall below `hMin`.
 */
export function integrateAdaptive(
  f: System,
  t0: number,
  y0: readonly number[],
  tEnd: number,
  options: AdaptiveOdeOptions = {},
): Trajectory {
  if (!Number.isFinite(t0) || !Number.isFinite(tEnd)) throw new RangeError("t0 and tEnd must be finite");
  const span = Math.abs(tEnd - t0);
  const dir = tEnd >= t0 ? 1 : -1;
  const dim = y0.length;
  const atol = options.atol ?? 1e-8;
  const rtol = options.rtol ?? 1e-6;
  const limit = options.blowup ?? 1e12;
  const maxSteps = options.maxSteps ?? 100000;
  const hMin = options.hMin ?? span * 1e-12;
  const hMax = options.hMax ?? span;
  let h = Math.min(options.h0 ?? span / 100, hMax);
  const ts = [t0];
  const ys = [...y0];
  if (span === 0) return collect(ts, ys, dim, "end");
  let t = t0;
  let y: readonly number[] = y0;
  let reason: StopReason = "end";
  let iterations = 0;
  let badSteps = 0;
  let sinceBad = Number.POSITIVE_INFINITY;
  while (dir * (tEnd - t) > 0) {
    if (ts.length >= maxSteps || iterations++ > maxSteps * 20) {
      reason = "maxSteps";
      break;
    }
    if (iterations % 64 === 0) check(options);
    if (h < hMin) {
      reason = "stepTooSmall";
      break;
    }
    const last = dir * (t + dir * h - tEnd) >= 0;
    const hh = last ? Math.abs(tEnd - t) : h;
    const step = dir * hh;
    const k: Array<readonly number[]> = [];
    for (let s = 0; s < 7; s++) {
      const arg = y.map((v, i) => {
        let acc = 0;
        for (let m = 0; m < s; m++) acc += (A[s]?.[m] as number) * ((k[m] as readonly number[])[i] as number);
        return v + step * acc;
      });
      k.push(f(t + (C[s] as number) * step, arg));
    }
    const y5 = y.map(
      (v, i) => v + step * B5.reduce((acc, b, s) => acc + b * ((k[s] as readonly number[])[i] as number), 0),
    );
    const y4 = y.map(
      (v, i) => v + step * B4.reduce((acc, b, s) => acc + b * ((k[s] as readonly number[])[i] as number), 0),
    );
    if (bad(y5, limit)) {
      // may be a bad step rather than a blow-up: try smaller before giving up
      // bad steps count only while they recur within 10 accepted steps (a Zeno approach to the limit);
      // isolated ones over a long run are forgiven
      if (sinceBad > 10) badSteps = 0;
      sinceBad = 0;
      if (++badSteps > 12 || hh <= hMin * 2) {
        reason = "blowup";
        break;
      }
      h = hh / 4;
      continue;
    }
    let err = 0;
    for (let i = 0; i < dim; i++) {
      const sc = atol + rtol * Math.max(Math.abs(y[i] as number), Math.abs(y5[i] as number));
      err = Math.max(err, Math.abs((y5[i] as number) - (y4[i] as number)) / sc);
    }
    if (err <= 1 || hh <= hMin) {
      t = last ? tEnd : t + step;
      y = y5;
      sinceBad++;
      ts.push(t);
      ys.push(...y);
      if (options.stop?.(t, y)) {
        reason = "stopped";
        break;
      }
    }
    const factor = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
    h = Math.min(hMax, hh * factor);
  }
  return collect(ts, ys, dim, reason);
}

export interface SolutionCurveOptions extends AdaptiveOdeOptions {
  /** `"adaptive"` (default) or `"rk4"` with `steps` per direction. */
  method?: "adaptive" | "rk4";
  steps?: number;
  /** Curve points with |y| beyond this end the curve (a blow-up asymptote). Default 1e6. */
  yLimit?: number;
}

/**
 * The solution curve of `dy/dx = f(x, y)` through `(x0, y0)`, extended both ways across `xDomain`, as
 * `Samples` (x ascending). It ends where the solution blows up, so a vertical asymptote leaves a clean
 * end, not a spike. `reasonBefore` / `reasonAfter` say why each side stopped.
 */
export function sampleSolutionCurve(
  f: Slope,
  x0: number,
  y0: number,
  xDomain: Domain,
  options: SolutionCurveOptions = {},
): Samples & { reasonBefore: StopReason; reasonAfter: StopReason } {
  assertRange("x domain", xDomain);
  const sys: System = (t, y) => [f(t, y[0] as number)];
  const limit = options.yLimit ?? 1e6;
  const run = (end: number) => {
    const o = { ...options, blowup: limit };
    return options.method === "rk4"
      ? integrateRk4(sys, x0, [y0], end, { ...o, steps: options.steps ?? 200 })
      : integrateAdaptive(sys, x0, [y0], end, o);
  };
  const xs: number[] = [];
  const ys: number[] = [];
  let reasonBefore: StopReason = "end";
  let reasonAfter: StopReason = "end";
  // A start outside the window is first carried to the nearest edge, so the curve begins exactly at the edge.
  if (x0 < xDomain.min || x0 > xDomain.max) {
    const edge = x0 < xDomain.min ? xDomain.min : xDomain.max;
    const toEdge = run(edge);
    if (toEdge.reason !== "end") {
      const r = toEdge.reason;
      return { x: new Float64Array(0), y: new Float64Array(0), reasonBefore: r, reasonAfter: r };
    }
    x0 = edge;
    y0 = toEdge.y[toEdge.steps - 1] as number;
  }
  if (x0 > xDomain.min) {
    const back = run(xDomain.min);
    reasonBefore = back.reason;
    for (let k = back.steps - 1; k >= 1; k--) {
      xs.push(back.t[k] as number);
      ys.push(back.y[k] as number);
    }
  }
  xs.push(x0);
  ys.push(y0);
  if (x0 < xDomain.max) {
    const fwd = run(xDomain.max);
    reasonAfter = fwd.reason;
    for (let k = 1; k < fwd.steps; k++) {
      xs.push(fwd.t[k] as number);
      ys.push(fwd.y[k] as number);
    }
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), reasonBefore, reasonAfter };
}

export type FixedPointType =
  | "stable node"
  | "unstable node"
  | "saddle"
  | "stable spiral"
  | "unstable spiral"
  | "center"
  | "stable star or degenerate node"
  | "unstable star or degenerate node"
  | "non-hyperbolic";

export interface FixedPoint {
  x: number;
  y: number;
  /** `[[dFx/dx, dFx/dy], [dFy/dx, dFy/dy]]` by central differences. */
  jacobian: [[number, number], [number, number]];
  trace: number;
  determinant: number;
  /** Eigenvalues as `[re, im]` pairs (complex conjugates for a spiral or center). */
  eigenvalues: [[number, number], [number, number]];
  type: FixedPointType;
}

/** Numerical Jacobian of a planar field at a point, by central differences. */
export function jacobian2(F: Field2, x: number, y: number): [[number, number], [number, number]] {
  const h = 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
  const xp = F(x + h, y);
  const xm = F(x - h, y);
  const yp = F(x, y + h);
  const ym = F(x, y - h);
  return [
    [(xp[0] - xm[0]) / (2 * h), (yp[0] - ym[0]) / (2 * h)],
    [(xp[1] - xm[1]) / (2 * h), (yp[1] - ym[1]) / (2 * h)],
  ];
}

/** Classify an equilibrium from its 2x2 Jacobian (linearisation; `tolerance` is the zero threshold, default 1e-7). */
export function classifyFixedPoint(
  J: [[number, number], [number, number]],
  tolerance = 1e-7,
): Pick<FixedPoint, "trace" | "determinant" | "eigenvalues" | "type"> {
  const tr = J[0][0] + J[1][1];
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const disc = tr * tr - 4 * det;
  const scale = Math.max(1, Math.abs(tr), Math.abs(det));
  let eigenvalues: [[number, number], [number, number]];
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    eigenvalues = [
      [(tr + s) / 2, 0],
      [(tr - s) / 2, 0],
    ];
  } else {
    const s = Math.sqrt(-disc) / 2;
    eigenvalues = [
      [tr / 2, s],
      [tr / 2, -s],
    ];
  }
  let type: FixedPointType;
  if (Math.abs(det) <= tolerance * scale) type = "non-hyperbolic";
  else if (det < 0) type = "saddle";
  else if (Math.abs(tr) <= tolerance * scale) type = "center";
  else if (disc > tolerance * scale * scale) type = tr < 0 ? "stable node" : "unstable node";
  else if (disc >= -tolerance * scale * scale)
    type = tr < 0 ? "stable star or degenerate node" : "unstable star or degenerate node";
  else type = tr < 0 ? "stable spiral" : "unstable spiral";
  return { trace: tr, determinant: det, eigenvalues, type };
}

export interface PhasePortraitOptions extends Budget, Cancellable {
  /** Field arrows per axis (`[columns, rows]` or one number). Default 15. */
  grid?: number | [number, number];
  /** Trajectory start points. Default: a 5 x 5 interior grid. */
  seeds?: Array<[number, number]>;
  /** Integrate each seed forward to `+tMax` and backward to `-tMax`. Default: 10. */
  tMax?: number;
  /** Search for fixed points with Newton from this many starts per axis. Default 8. 0 disables. */
  fixedPointStarts?: number;
  /** Trajectories are cut when they leave the window grown by this factor on each side. Default 0.5. */
  margin?: number;
}

export interface PhasePortrait {
  field: {
    columns: number;
    rows: number;
    x: Float64Array;
    y: Float64Array;
    /** The vector at each node; `NaN` where `F` is non-finite. */
    u: Float64Array;
    v: Float64Array;
    magnitude: Float64Array;
  };
  /** One entry per seed: backward half reversed then forward half, joined at the seed. */
  trajectories: Array<{
    seed: [number, number];
    x: Float64Array;
    y: Float64Array;
    reasonBefore: StopReason;
    reasonAfter: StopReason;
  }>;
  fixedPoints: FixedPoint[];
  progress: Progress;
}

/**
 * Phase portrait of an autonomous planar system: the vector field on a grid, trajectories from seed points
 * (forward and backward, cut at the window's margin or at blow-up), and fixed points classified from the Jacobian.
 * With a budget, `progress.rows` counts field rows and the trajectories and fixed points are only computed
 * when the field finished.
 */
export function samplePhasePortrait(
  F: Field2,
  xDomain: Domain,
  yDomain: Domain,
  options: PhasePortraitOptions = {},
): PhasePortrait {
  assertRange("x domain", xDomain);
  assertRange("y domain", yDomain);
  const g = options.grid ?? 15;
  const [columns, rows] = typeof g === "number" ? [g, g] : g;
  assertCount("columns", columns);
  assertCount("rows", rows);
  const meter = new Meter(options, options);
  const n = columns * rows;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const u = new Float64Array(n).fill(Number.NaN);
  const v = new Float64Array(n).fill(Number.NaN);
  const mag = new Float64Array(n).fill(Number.NaN);
  let done = 0;
  let reason: "cells" | "time" | undefined;
  for (let j = 0; j < rows; j++) {
    reason = meter.check(columns);
    if (reason) break;
    const y = j === rows - 1 ? yDomain.max : yDomain.min + ((yDomain.max - yDomain.min) * j) / (rows - 1);
    for (let i = 0; i < columns; i++) {
      const x = i === columns - 1 ? xDomain.max : xDomain.min + ((xDomain.max - xDomain.min) * i) / (columns - 1);
      const k = j * columns + i;
      fx[k] = x;
      fy[k] = y;
      const w = F(x, y);
      if (Number.isFinite(w[0]) && Number.isFinite(w[1])) {
        u[k] = w[0];
        v[k] = w[1];
        mag[k] = Math.hypot(w[0], w[1]);
      }
    }
    meter.spend(columns);
    done++;
  }
  const m = columns * done;
  const out: PhasePortrait = {
    field: {
      columns,
      rows: done,
      x: fx.slice(0, m),
      y: fy.slice(0, m),
      u: u.slice(0, m),
      v: v.slice(0, m),
      magnitude: mag.slice(0, m),
    },
    trajectories: [],
    fixedPoints: [],
    progress: progress(done, rows, reason),
  };
  if (reason) return out;

  const w = xDomain.max - xDomain.min;
  const hgt = yDomain.max - yDomain.min;
  const mar = options.margin ?? 0.5;
  const inside = (x: number, y: number) =>
    x >= xDomain.min - mar * w &&
    x <= xDomain.max + mar * w &&
    y >= yDomain.min - mar * hgt &&
    y <= yDomain.max + mar * hgt;
  const sys: System = (_t, s) => {
    const r = F(s[0] as number, s[1] as number);
    return [r[0], r[1]];
  };
  const tMax = options.tMax ?? 10;
  const seeds =
    options.seeds ??
    Array.from({ length: 25 }, (_, q): [number, number] => [
      xDomain.min + (w * ((q % 5) + 0.5)) / 5,
      yDomain.min + (hgt * (Math.floor(q / 5) + 0.5)) / 5,
    ]);
  for (const seed of seeds) {
    const o: AdaptiveOdeOptions = {
      ...options,
      stop: (_t, s) => !inside(s[0] as number, s[1] as number),
      hMax: tMax / 20,
    };
    const fwd = integrateAdaptive(sys, 0, seed, tMax, o);
    const bwd = integrateAdaptive(sys, 0, seed, -tMax, o);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = bwd.steps - 1; k >= 1; k--) {
      xs.push(bwd.y[2 * k] as number);
      ys.push(bwd.y[2 * k + 1] as number);
    }
    for (let k = 0; k < fwd.steps; k++) {
      xs.push(fwd.y[2 * k] as number);
      ys.push(fwd.y[2 * k + 1] as number);
    }
    out.trajectories.push({
      seed,
      x: Float64Array.from(xs),
      y: Float64Array.from(ys),
      reasonBefore: bwd.reason,
      reasonAfter: fwd.reason,
    });
  }

  const starts = options.fixedPointStarts ?? 8;
  const eps = 1e-8 * Math.max(w, hgt);
  for (let a = 0; a < starts && starts > 0; a++) {
    for (let b = 0; b < starts; b++) {
      let x = xDomain.min + (w * (a + 0.5)) / starts;
      let y = yDomain.min + (hgt * (b + 0.5)) / starts;
      let ok = false;
      for (let it = 0; it < 50; it++) {
        const r = F(x, y);
        if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) break;
        const J = jacobian2(F, x, y);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
        const dx = (J[1][1] * r[0] - J[0][1] * r[1]) / det;
        const dy = (-J[1][0] * r[0] + J[0][0] * r[1]) / det;
        x -= dx;
        y -= dy;
        if (Math.hypot(dx, dy) < eps) {
          ok = true;
          break;
        }
      }
      if (!ok || !inside(x, y) || x < xDomain.min || x > xDomain.max || y < yDomain.min || y > yDomain.max) continue;
      const r = F(x, y);
      if (Math.hypot(r[0], r[1]) > 1e-6) continue;
      if (out.fixedPoints.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-5 * Math.max(w, hgt))) continue;
      const J = jacobian2(F, x, y);
      out.fixedPoints.push({ x, y, jacobian: J, ...classifyFixedPoint(J) });
    }
  }
  out.fixedPoints.sort((p, q) => p.x - q.x || p.y - q.y);
  return out;
}
