/** A real function of one variable, e.g. a compiled expression. */
export type Fn1 = (x: number) => number;

/** A closed interval of the x-axis. */
export interface Domain {
  min: number;
  max: number;
}

/** The y-range currently on screen; lets the sampler cap blow-ups and scale its tolerance. */
export interface YRange {
  min: number;
  max: number;
}

/**
 * Sampled curve as two parallel typed arrays. A row whose `y` is `NaN` is a
 * gap: the curve is not drawn between the rows on either side of it (a pole,
 * a domain edge, a jump). Gaps are never first, last, or adjacent to another
 * gap.
 */
export interface Samples {
  x: Float64Array;
  y: Float64Array;
}

/** Anything that looks like an `AbortSignal`; kept structural so the package needs no DOM or Node types. */
export interface CancelSignal {
  readonly aborted: boolean;
}

export interface SampleOptions {
  /**
   * The y-range on screen. Samples far outside it (a pole's shoulders, which
   * are finite but huge) are treated as gaps, and the curve is capped with an
   * interpolated point at the edge of the range. Also sets the default
   * adaptive tolerance, and enables jump detection.
   */
  visibleYRange?: YRange;
  /** Abort when `signal.aborted` becomes true. Checked every few hundred evaluations. */
  signal?: CancelSignal;
  /** Polled alongside `signal`; return true to abort (the generation-counter pattern: `() => gen !== latest`). */
  isCancelled?: () => boolean;
}

export interface AdaptiveOptions extends SampleOptions {
  /** How many times one base-grid cell may be bisected. Default 4. */
  maxDepth?: number;
  /**
   * Bisect a cell while its midpoint sits further than this (in y units) from
   * the straight line between its ends. Default: `1e-4` of the visible y span
   * when `visibleYRange` is given, else `1e-3`.
   */
  tolerance?: number;
  /**
   * A cell that is still this far apart at `maxDepth` (as a fraction of the
   * visible y span) is a jump, not a steep slope, and becomes a gap. Default
   * `0.5` when `visibleYRange` is given; with no range there is no scale to
   * judge against and jumps are not detected. `Infinity` disables it. To tell
   * a jump from a steep slope, the height must also persist (at least 80%)
   * from the parent cell to the finest one. A function that oscillates faster
   * than the grid can resolve can still look like a jump; raise the
   * resolution or `maxDepth`.
   */
  jumpFraction?: number;
}

/** Thrown by the samplers when `signal` or `isCancelled` reports cancellation. */
export class SampleCancelledError extends Error {
  constructor() {
    super("sampling cancelled");
    this.name = "SampleCancelledError";
  }
}

const CANCEL_CHECK_INTERVAL = 256;
const DEFAULT_MAX_DEPTH = 4;
const FALLBACK_TOLERANCE = 1e-3;
const RELATIVE_TOLERANCE = 1e-4;
const DEFAULT_JUMP_FRACTION = 0.5;
const JUMP_PERSISTENCE = 0.8;

function checkDomain(domain: Domain, resolution: number): void {
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || !(domain.max > domain.min)) {
    throw new RangeError(`domain must be finite with min < max, got [${domain.min}, ${domain.max}]`);
  }
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError(`resolution must be an integer >= 2, got ${resolution}`);
  }
}

function guardedEval(f: Fn1, options: SampleOptions): Fn1 {
  const { signal, isCancelled } = options;
  if (!signal && !isCancelled) return f;
  let count = 0;
  const poll = () => {
    if (signal?.aborted || isCancelled?.()) throw new SampleCancelledError();
  };
  poll();
  return (x) => {
    if (++count % CANCEL_CHECK_INTERVAL === 0) poll();
    return f(x);
  };
}

function isOffRange(y: number, range: YRange | undefined): boolean {
  if (!range) return false;
  const span = range.max - range.min;
  return Math.abs(y) > Math.abs(range.min) + Math.abs(range.max) + 5 * span;
}

/** Where segment a-b crosses the nearer edge of `range`, inset 3% so end markers are not clipped. Null if undefined. */
function edgeCrossing(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  range: YRange | undefined,
): [number, number] | null {
  if (!range || !Number.isFinite(ay) || !Number.isFinite(by) || ay === by) return null;
  const span = range.max - range.min;
  const edge = by > ay ? range.max - 0.03 * span : range.min + 0.03 * span;
  const t = (edge - ay) / (by - ay);
  if (!Number.isFinite(t) || t < 0 || t > 1) return null;
  return [ax + t * (bx - ax), edge];
}

/** Turn raw points (NaN / Infinity / off-range = invalid) into the gap-marked `Samples` form. */
function toSamples(rx: number[], ry: number[], range: YRange | undefined): Samples {
  const ox: number[] = [];
  const oy: number[] = [];
  let prevValid = false;
  let px = 0;
  let py = 0;
  let havePrev = false;
  for (let i = 0; i < rx.length; i++) {
    const x = rx[i];
    const y = ry[i];
    const finite = Number.isFinite(y);
    const valid = finite && !isOffRange(y, range);
    if (valid) {
      if (!prevValid && havePrev) {
        const e = edgeCrossing(px, py, x, y, range);
        if (e) {
          ox.push(e[0]);
          oy.push(e[1]);
        }
      }
      ox.push(x);
      oy.push(y);
    } else {
      if (oy.length > 0 && !Number.isNaN(oy[oy.length - 1])) {
        if (prevValid && finite) {
          const e = edgeCrossing(px, py, x, y, range);
          if (e) {
            ox.push(e[0]);
            oy.push(e[1]);
          }
        }
        ox.push(x);
        oy.push(Number.NaN);
      }
    }
    px = x;
    py = y;
    prevValid = valid;
    havePrev = true;
  }
  if (oy.length > 0 && Number.isNaN(oy[oy.length - 1])) {
    ox.pop();
    oy.pop();
  }
  return { x: Float64Array.from(ox), y: Float64Array.from(oy) };
}

/** Evaluate `f` at `resolution` evenly spaced points over `domain` (both ends included). */
export function sampleUniform(f: Fn1, domain: Domain, resolution: number, options: SampleOptions = {}): Samples {
  checkDomain(domain, resolution);
  const g = guardedEval(f, options);
  const rx = new Array<number>(resolution);
  const ry = new Array<number>(resolution);
  const span = domain.max - domain.min;
  for (let i = 0; i < resolution; i++) {
    const x = i === resolution - 1 ? domain.max : domain.min + (i / (resolution - 1)) * span;
    rx[i] = x;
    ry[i] = g(x);
  }
  return toSamples(rx, ry, options.visibleYRange);
}

/**
 * Like {@link sampleUniform}, but bisects each cell of the base grid where the
 * curve bends: a cell is split while its midpoint deviates from the straight
 * line through its ends by more than the tolerance, up to `maxDepth` times. A
 * straight stretch costs nothing extra; a sharp bend or narrow spike that a
 * uniform grid would straddle is resolved. Cells that still jump at the
 * deepest level become gaps (see `jumpFraction`).
 */
export function sampleAdaptive(f: Fn1, domain: Domain, baseResolution: number, options: AdaptiveOptions = {}): Samples {
  checkDomain(domain, baseResolution);
  const range = options.visibleYRange;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const tolerance = options.tolerance ?? (range ? (range.max - range.min) * RELATIVE_TOLERANCE : FALLBACK_TOLERANCE);
  const jumpFraction = options.jumpFraction ?? (range ? DEFAULT_JUMP_FRACTION : Number.POSITIVE_INFINITY);
  const jumpAbs = range ? jumpFraction * (range.max - range.min) : Number.POSITIVE_INFINITY;
  const g = guardedEval(f, options);

  const rx: number[] = [];
  const ry: number[] = [];

  // Pushes `a` and the refinement points strictly between a and b (not b).
  const refine = (ax: number, ay: number, bx: number, by: number, depth: number, parentDy: number): void => {
    if (!Number.isFinite(ay) || !Number.isFinite(by) || isOffRange(ay, range) || isOffRange(by, range)) {
      rx.push(ax);
      ry.push(ay);
      return;
    }
    if (depth >= maxDepth) {
      rx.push(ax);
      ry.push(ay);
      const dy = Math.abs(by - ay);
      // A jump keeps its height as the cell halves; a steep slope loses about half of it per halving.
      if (dy > jumpAbs && dy >= JUMP_PERSISTENCE * parentDy) {
        rx.push((ax + bx) / 2);
        ry.push(Number.NaN);
      }
      return;
    }
    const mx = (ax + bx) / 2;
    const my = g(mx);
    // A non-finite midpoint is a singularity between a and b: record it as the gap it is.
    if (!Number.isFinite(my)) {
      rx.push(ax, mx);
      ry.push(ay, my);
      return;
    }
    if (Math.abs(my - (ay + by) / 2) <= tolerance) {
      rx.push(ax);
      ry.push(ay);
      return;
    }
    const dy = Math.abs(by - ay);
    refine(ax, ay, mx, my, depth + 1, dy);
    refine(mx, my, bx, by, depth + 1, dy);
  };

  const span = domain.max - domain.min;
  let lx = domain.min;
  let ly = g(lx);
  for (let i = 1; i < baseResolution; i++) {
    const x = i === baseResolution - 1 ? domain.max : domain.min + (i / (baseResolution - 1)) * span;
    const y = g(x);
    refine(lx, ly, x, y, 0, Number.POSITIVE_INFINITY);
    lx = x;
    ly = y;
  }
  rx.push(lx);
  ry.push(ly);
  return toSamples(rx, ry, range);
}

/** Half-open row ranges `[start, end)` of consecutive data rows, i.e. the polylines to draw. */
export function runsOf(samples: Samples): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < samples.y.length; i++) {
    if (Number.isNaN(samples.y[i])) {
      if (start >= 0) runs.push([start, i]);
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  }
  if (start >= 0) runs.push([start, samples.y.length]);
  return runs;
}

/**
 * The two edges of every gap: the last point before it and the first after.
 * Where the curve really breaks lies between them; the distance is at most one
 * sampling cell, so mark both edges rather than guessing a position.
 */
export function findDiscontinuities(samples: Samples): { before: Point; after: Point }[] {
  const out: { before: Point; after: Point }[] = [];
  for (let i = 1; i < samples.y.length - 1; i++) {
    if (!Number.isNaN(samples.y[i])) continue;
    out.push({
      before: { x: samples.x[i - 1], y: samples.y[i - 1] },
      after: { x: samples.x[i + 1], y: samples.y[i + 1] },
    });
  }
  return out;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the polyline crosses a boundary. `signedDistance(y)` is negative on
 * one side and non-negative on the other, and linear in y (`y` for the x-axis,
 * `y - c` for the line y = c), so zero can be interpolated between two rows.
 * Pairs across a gap never count.
 */
export function findCrossings(samples: Samples, signedDistance: (y: number) => number): Point[] {
  const out: Point[] = [];
  for (const [start, end] of runsOf(samples)) {
    for (let i = start + 1; i < end; i++) {
      const d0 = signedDistance(samples.y[i - 1]);
      const d1 = signedDistance(samples.y[i]);
      if (d0 >= 0 === d1 >= 0) continue;
      const t = d0 / (d0 - d1);
      out.push({
        x: samples.x[i - 1] + t * (samples.x[i] - samples.x[i - 1]),
        y: samples.y[i - 1] + t * (samples.y[i] - samples.y[i - 1]),
      });
    }
  }
  return out;
}

export interface RootOptions extends SampleOptions {
  /** Grid points scanned for sign changes. Default 1000. */
  resolution?: number;
}

/**
 * Roots of `f` on `domain`: scan a uniform grid for sign changes (or exact
 * zeros) and polish each by bisection. Poles (sign change through infinity)
 * are not roots and are rejected. Roots where `f` only touches zero without
 * changing sign (such as x^2 at 0) fall between grid points and are missed.
 */
export function findRoots(f: Fn1, domain: Domain, options: RootOptions = {}): number[] {
  const n = options.resolution ?? 1000;
  checkDomain(domain, n);
  const g = guardedEval(f, options);
  const span = domain.max - domain.min;
  const roots: number[] = [];
  let ax = domain.min;
  let ay = g(ax);
  if (ay === 0) roots.push(ax);
  for (let i = 1; i < n; i++) {
    const bx = i === n - 1 ? domain.max : domain.min + (i / (n - 1)) * span;
    const by = g(bx);
    if (by === 0) {
      roots.push(bx);
    } else if (Number.isFinite(ay) && Number.isFinite(by) && ay !== 0 && ay < 0 !== by < 0) {
      let lo = ax;
      let hi = bx;
      let flo = ay;
      for (let k = 0; k < 100; k++) {
        const mid = (lo + hi) / 2;
        if (mid === lo || mid === hi) break;
        const fm = g(mid);
        if (fm === 0) {
          lo = hi = mid;
          break;
        }
        if (flo < 0 === fm < 0) {
          lo = mid;
          flo = fm;
        } else {
          hi = mid;
        }
      }
      const r = (lo + hi) / 2;
      const fr = g(r);
      if (Math.abs(fr) <= Math.max(Math.abs(ay), Math.abs(by))) roots.push(r);
    }
    ax = bx;
    ay = by;
  }
  return roots;
}

/** Where `f` and `g` meet on `domain`: the roots of `f - g`, each with `y = f(x)`. Same caveats as {@link findRoots}. */
export function findIntersections(f: Fn1, g: Fn1, domain: Domain, options: RootOptions = {}): Point[] {
  return findRoots((x) => f(x) - g(x), domain, options).map((x) => ({ x, y: f(x) }));
}

/** `[x, y]` pairs as plain arrays, with `y = null` at gaps (JSON-safe, unlike NaN). */
export function toPoints(samples: Samples): [number, number | null][] {
  const out: [number, number | null][] = new Array(samples.x.length);
  for (let i = 0; i < out.length; i++) {
    const y = samples.y[i];
    out[i] = [samples.x[i], Number.isNaN(y) ? null : y];
  }
  return out;
}
