import { assertCount, assertRange } from "./budget.ts";
import type { Domain, Samples } from "./sample.ts";

/** Evaluate `sum a_k (x - x0)^k` for `k <= order` by Horner's rule. */
export function evaluateTaylor(
  coefficients: ArrayLike<number>,
  x0: number,
  x: number,
  order = coefficients.length - 1,
): number {
  const top = Math.min(order, coefficients.length - 1);
  let acc = 0;
  for (let k = top; k >= 0; k--) acc = acc * (x - x0) + (coefficients[k] as number);
  return acc;
}

export interface PartialSumCurves {
  /** The orders requested, ascending as given. */
  orders: number[];
  /** One `Samples` per order; `y` is `NaN` where the partial sum is not finite (gap rules as in 1D). */
  curves: Samples[];
}

function cleanSamples(x: Float64Array, y: Float64Array): Samples {
  // enforce: gaps not first/last/adjacent
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < x.length; k++) {
    const yy = y[k] as number;
    if (Number.isFinite(yy)) {
      xs.push(x[k] as number);
      ys.push(yy);
    } else if (ys.length > 0 && !Number.isNaN(ys[ys.length - 1] as number)) {
      xs.push(x[k] as number);
      ys.push(Number.NaN);
    }
  }
  while (ys.length > 0 && Number.isNaN(ys[ys.length - 1] as number)) {
    ys.pop();
    xs.pop();
  }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys) };
}

function grid(domain: Domain, n: number): Float64Array {
  assertRange("domain", domain);
  assertCount("samples", n);
  const x = new Float64Array(n);
  for (let k = 0; k < n; k++) x[k] = k === n - 1 ? domain.max : domain.min + ((domain.max - domain.min) * k) / (n - 1);
  return x;
}

/**
 * Taylor partial sums of the given coefficients (`a_k = f^(k)(x0) / k!`) about `x0`, one curve per requested
 * order, over a uniform grid. With `@johnhenry/math`, `taylorCoefficients` in `@johnhenry/math-sample/expr`
 * produces the coefficients from an expression.
 */
export function sampleTaylorPartialSums(
  coefficients: ArrayLike<number>,
  x0: number,
  domain: Domain,
  orders: number[],
  samples = 400,
): PartialSumCurves {
  const x = grid(domain, samples);
  const curves = orders.map((order) => {
    if (!Number.isInteger(order) || order < 0)
      throw new RangeError(`order must be a non-negative integer, got ${order}`);
    const y = new Float64Array(samples);
    for (let k = 0; k < samples; k++) y[k] = evaluateTaylor(coefficients, x0, x[k] as number, order);
    return cleanSamples(x, y);
  });
  return { orders: [...orders], curves };
}

/**
 * Partial sums of a function series `sum_{k=from}^{n} term(k, x)`, one curve per order `n`, computed
 * in a single pass over `k` so each term is evaluated once per sample.
 */
export function sampleSeriesPartialSums(
  term: (k: number, x: number) => number,
  from: number,
  domain: Domain,
  orders: number[],
  samples = 400,
): PartialSumCurves {
  if (!Number.isInteger(from)) throw new RangeError("from must be an integer");
  const x = grid(domain, samples);
  const sorted = [...new Set(orders)].sort((a, b) => a - b);
  for (const o of sorted)
    if (!Number.isInteger(o) || o < from) throw new RangeError(`order ${o} must be an integer >= from (${from})`);
  const sums = new Float64Array(samples);
  const byOrder = new Map<number, Samples>();
  let k = from;
  for (const o of sorted) {
    for (; k <= o; k++) for (let i = 0; i < samples; i++) sums[i] = (sums[i] as number) + term(k, x[i] as number);
    byOrder.set(o, cleanSamples(x, Float64Array.from(sums)));
  }
  return { orders: [...orders], curves: orders.map((o) => byOrder.get(o) as Samples) };
}

export interface NumericSeries {
  /** `partial[n - from]` is the sum of terms `from..n`. */
  partial: Float64Array;
  from: number;
  /** Aitken delta-squared extrapolation of the last three partial sums; `NaN` when it cannot be formed. A hint, not a proof of convergence. */
  limitEstimate: number;
}

/** Partial sums of the numeric series `sum_{k=from}^{to} term(k)`, with an Aitken limit estimate. */
export function partialSums(term: (k: number) => number, from: number, to: number): NumericSeries {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new RangeError("need integers from <= to");
  const partial = new Float64Array(to - from + 1);
  let s = 0;
  for (let k = from; k <= to; k++) {
    s += term(k);
    partial[k - from] = s;
  }
  let limitEstimate = Number.NaN;
  const n = partial.length;
  if (n >= 3) {
    const a = partial[n - 3] as number;
    const b = partial[n - 2] as number;
    const c = partial[n - 1] as number;
    const den = c - 2 * b + a;
    limitEstimate = den === 0 ? c : c - ((c - b) * (c - b)) / den;
  }
  return { partial, from, limitEstimate };
}

export interface FourierCoefficients {
  /** Half-period `L`: the function has period `2L`. */
  halfPeriod: number;
  /** The centre of the period interval used `[center - L, center + L]`. */
  center: number;
  /** Constant term `a0 / 2` is `a0 / 2`; `a0` is `(1/L) * integral f`. */
  a0: number;
  /** `a[k - 1]` multiplies `cos(k pi (x - center) / L)`. */
  a: Float64Array;
  /** `b[k - 1]` multiplies `sin(k pi (x - center) / L)`. */
  b: Float64Array;
}

/**
 * Fourier coefficients of `f` on `[a, b]` taken as one period, by the trapezoid rule on `samples` points
 * (exact for trig polynomials below the Nyquist order; for a function with jumps the coefficients carry
 * ordinary O(1/samples) quadrature error). `terms` is the highest harmonic. Trig form:
 * `a0/2 + sum a_k cos(k w x) + b_k sin(k w x)` about the interval centre.
 */
export function fourierCoefficients(
  f: (x: number) => number,
  period: Domain,
  terms: number,
  samples = 4096,
): FourierCoefficients {
  assertRange("period", period);
  assertCount("terms", terms, 1);
  assertCount("samples", samples, 4);
  const L = (period.max - period.min) / 2;
  const center = (period.max + period.min) / 2;
  const a = new Float64Array(terms);
  const b = new Float64Array(terms);
  const vals = new Float64Array(samples);
  for (let i = 0; i < samples; i++) vals[i] = f(period.min + ((period.max - period.min) * (i + 0.5)) / samples); // midpoint
  let a0 = 0;
  for (let i = 0; i < samples; i++) a0 += vals[i] as number;
  a0 = (2 * a0) / samples;
  for (let k = 1; k <= terms; k++) {
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < samples; i++) {
      const t = Math.PI * k * (((i + 0.5) / samples) * 2 - 1);
      sa += (vals[i] as number) * Math.cos(t);
      sb += (vals[i] as number) * Math.sin(t);
    }
    a[k - 1] = (2 * sa) / samples;
    b[k - 1] = (2 * sb) / samples;
  }
  return { halfPeriod: L, center, a0, a, b };
}

/** Value of the Fourier partial sum with harmonics up to `n` at `x`. */
export function evaluateFourier(c: FourierCoefficients, x: number, n = c.a.length): number {
  const top = Math.min(n, c.a.length);
  const w = Math.PI / c.halfPeriod;
  let s = c.a0 / 2;
  for (let k = 1; k <= top; k++) {
    const t = k * w * (x - c.center);
    s += (c.a[k - 1] as number) * Math.cos(t) + (c.b[k - 1] as number) * Math.sin(t);
  }
  return s;
}

/** One curve per harmonic count in `orders` (0 = just the constant term). */
export function sampleFourierPartialSums(
  c: FourierCoefficients,
  domain: Domain,
  orders: number[],
  samples = 400,
): PartialSumCurves {
  const x = grid(domain, samples);
  const curves = orders.map((n) => {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`order must be a non-negative integer, got ${n}`);
    const y = new Float64Array(samples);
    for (let i = 0; i < samples; i++) y[i] = evaluateFourier(c, x[i] as number, n);
    return cleanSamples(x, y);
  });
  return { orders: [...orders], curves };
}
