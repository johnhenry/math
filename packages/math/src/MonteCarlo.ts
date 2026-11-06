import type { Rng } from "./Random.ts";
import { Symbolic } from "./Symbolic.ts";

/**
 * MonteCarlo — seeded Monte Carlo helpers: dart-throwing π, crude Monte Carlo
 * integration with running error bands, histogramming of distribution samples,
 * the central limit theorem demo, random walks and the bootstrap.
 *
 * Every function takes an explicit {@link Rng} (see `Random.ts`), so the same
 * seed always reproduces the same run. They mirror mallory's Monte Carlo panel
 * (`lib/monte-carlo.ts`) and keep its result shapes.
 */

export interface DartPoint {
  x: number;
  y: number;
  inside: boolean;
}

export interface ConvergencePoint {
  n: number;
  estimate: number;
}

export interface DartPiResult {
  piEstimate: number;
  n: number;
  /** Capped at ~3000 points for rendering; the estimate itself uses all `n` throws. */
  points: DartPoint[];
  /** Running estimate at ~100 checkpoints. */
  convergence: ConvergencePoint[];
}

export interface IntegrationConvergencePoint extends ConvergencePoint {
  /** 95% CI half-width around `estimate` at this checkpoint. */
  errorBand: number;
}

export interface IntegrationResult {
  estimate: number;
  /** 95% CI half-width of the final estimate (`1.96 * (b-a) * stdErr`). */
  errorBand: number;
  n: number;
  convergence: IntegrationConvergencePoint[];
  /** Present only when an exact value was supplied or derivable (string integrands). */
  trueValue?: number;
  absoluteError?: number;
}

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

export interface BootstrapResult {
  /** The statistic on the original data. */
  estimate: number;
  /** The statistic on each resample. */
  replicates: number[];
  /** Standard deviation of the replicates. */
  standardError: number;
  /** Percentile confidence interval at `level`. */
  confidenceInterval: [number, number];
}

const MAX_RENDERED_DARTS = 3000;
const CHECKPOINTS = 100;

function requirePositiveInt(n: number, what: string): void {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${what} must be a positive integer.`);
}

export class MonteCarlo {
  /**
   * Dart-throwing estimate of π: darts land uniformly in the 2×2 square, and
   * the fraction inside the unit circle tends to π/4.
   */
  static estimatePi(n: number, rng: Rng): DartPiResult {
    requirePositiveInt(n, "Sample count");
    let inside = 0;
    const points: DartPoint[] = [];
    const renderEvery = Math.max(1, Math.floor(n / MAX_RENDERED_DARTS));
    const checkEvery = Math.max(1, Math.floor(n / CHECKPOINTS));
    const convergence: ConvergencePoint[] = [];
    for (let i = 0; i < n; i++) {
      const x = rng.nextFloat() * 2 - 1;
      const y = rng.nextFloat() * 2 - 1;
      const hit = x * x + y * y <= 1;
      if (hit) inside++;
      if (i % renderEvery === 0) points.push({ x, y, inside: hit });
      if ((i + 1) % checkEvery === 0) convergence.push({ n: i + 1, estimate: (inside / (i + 1)) * 4 });
    }
    return { piEstimate: (inside / n) * 4, n, points, convergence };
  }

  /**
   * Crude Monte Carlo integral of `f` over `[a, b]`: `(b-a) * mean(f(x_i))`,
   * `x_i ~ U(a, b)`, with Welford running variance for the error band. `f` is a
   * function, or an expression string in `variable` (default `"x"`), in which
   * case the exact value from `Symbolic.integrateDefinite` is reported too
   * (when it can be computed). Pass `trueValue` to supply your own reference.
   */
  static integrate(
    f: ((x: number) => number) | string,
    a: number,
    b: number,
    n: number,
    rng: Rng,
    options: { variable?: string; trueValue?: number } = {},
  ): IntegrationResult {
    if (!(b > a)) throw new Error(`Upper bound must be greater than lower bound -- got [${a}, ${b}].`);
    requirePositiveInt(n, "Sample count");
    const variable = options.variable ?? "x";
    let fn: (x: number) => number;
    let trueValue = options.trueValue;
    if (typeof f === "string") {
      const compiled = Symbolic.compile(f);
      fn = (x) => compiled({ [variable]: x });
      if (trueValue === undefined) {
        try {
          trueValue = Symbolic.integrateDefinite(Symbolic.parse(f), a, b, variable);
        } catch {
          // no closed form: report the estimate without a reference value
        }
      }
    } else fn = f;

    const checkEvery = Math.max(1, Math.floor(n / CHECKPOINTS));
    const span = b - a;
    const convergence: IntegrationConvergencePoint[] = [];
    let mean = 0;
    let m2 = 0;
    let band = 0;
    for (let i = 0; i < n; i++) {
      const y = fn(a + rng.nextFloat() * span);
      const count = i + 1;
      const delta = y - mean;
      mean += delta / count;
      m2 += delta * (y - mean);
      if (count % checkEvery === 0 || count === n) {
        band = 1.96 * span * Math.sqrt((count > 1 ? m2 / (count - 1) : 0) / count);
        if (count % checkEvery === 0) convergence.push({ n: count, estimate: span * mean, errorBand: band });
      }
    }
    const estimate = span * mean;
    const result: IntegrationResult = { estimate, errorBand: band, n, convergence };
    if (trueValue !== undefined) {
      result.trueValue = trueValue;
      result.absoluteError = Math.abs(estimate - trueValue);
    }
    return result;
  }

  /**
   * Partition `values` into `binCount` equal-width bins over `[min, max]`; each
   * bin is half-open `[x0, x1)` except the last, which also takes the maximum.
   */
  static histogram(values: readonly number[], binCount = 20): HistogramBin[] {
    requirePositiveInt(binCount, "Bin count");
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const width = (max - min) / binCount || 1;
    const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
      x0: min + i * width,
      x1: min + (i + 1) * width,
      count: 0,
    }));
    for (const v of values) bins[Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / width)))].count++;
    return bins;
  }

  /**
   * Central limit theorem demo: the means of `trials` batches of `sampleSize`
   * draws from `sampler`, plus a histogram of those means. The means have
   * standard deviation about `sd / sqrt(sampleSize)` whatever `sampler`'s shape.
   */
  static centralLimit(
    sampler: () => number,
    sampleSize: number,
    trials: number,
    binCount = 20,
  ): { means: number[]; mean: number; standardDeviation: number; bins: HistogramBin[] } {
    requirePositiveInt(sampleSize, "Sample size");
    requirePositiveInt(trials, "Trial count");
    const means: number[] = [];
    for (let t = 0; t < trials; t++) {
      let s = 0;
      for (let i = 0; i < sampleSize; i++) s += sampler();
      means.push(s / sampleSize);
    }
    const mean = means.reduce((x, y) => x + y, 0) / trials;
    const variance = trials > 1 ? means.reduce((x, y) => x + (y - mean) ** 2, 0) / (trials - 1) : 0;
    return { means, mean, standardDeviation: Math.sqrt(variance), bins: MonteCarlo.histogram(means, binCount) };
  }

  /**
   * Simple symmetric random walk on the integer lattice in `dimensions` (1-3)
   * dimensions: each step moves ±1 along one uniformly chosen axis. Returns
   * `steps + 1` positions starting at the origin.
   */
  static randomWalk(steps: number, rng: Rng, dimensions = 1): number[][] {
    requirePositiveInt(steps, "Step count");
    if (![1, 2, 3].includes(dimensions)) throw new Error("dimensions must be 1, 2 or 3.");
    const pos = new Array<number>(dimensions).fill(0);
    const path: number[][] = [[...pos]];
    for (let i = 0; i < steps; i++) {
      pos[rng.nextBelow(dimensions)] += rng.nextBelow(2) === 0 ? -1 : 1;
      path.push([...pos]);
    }
    return path;
  }

  /**
   * Nonparametric bootstrap of `statistic` over `data`: `resamples` draws with
   * replacement, giving the replicate distribution, its standard error and a
   * percentile confidence interval at `level` (default 0.95).
   */
  static bootstrap(
    data: readonly number[],
    statistic: (sample: number[]) => number,
    rng: Rng,
    options: { resamples?: number; level?: number } = {},
  ): BootstrapResult {
    const { resamples = 1000, level = 0.95 } = options;
    if (data.length === 0) throw new Error("bootstrap needs a non-empty sample.");
    requirePositiveInt(resamples, "Resample count");
    if (!(level > 0 && level < 1)) throw new Error("level must be strictly between 0 and 1.");
    const n = data.length;
    const replicates: number[] = [];
    for (let r = 0; r < resamples; r++) {
      const sample = new Array<number>(n);
      for (let i = 0; i < n; i++) sample[i] = data[rng.nextBelow(n)];
      replicates.push(statistic(sample));
    }
    const mean = replicates.reduce((x, y) => x + y, 0) / resamples;
    const standardError = Math.sqrt(
      resamples > 1 ? replicates.reduce((x, y) => x + (y - mean) ** 2, 0) / (resamples - 1) : 0,
    );
    const sorted = [...replicates].sort((x, y) => x - y);
    const q = (p: number) => {
      const h = (sorted.length - 1) * p;
      const lo = Math.floor(h);
      return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? sorted[lo]) - sorted[lo]);
    };
    return {
      estimate: statistic([...data]),
      replicates,
      standardError,
      confidenceInterval: [q((1 - level) / 2), q(1 - (1 - level) / 2)],
    };
  }
}
