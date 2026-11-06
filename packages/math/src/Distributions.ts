import { SpecialFunctions as SF } from "./SpecialFunctions.ts";

/**
 * Distributions — common probability distributions (continuous and discrete),
 * each exposing `pdf`/`pmf`, `cdf`, `mean`, `variance` and a random `sample`,
 * plus a small suite of {@link HypothesisTests}. CDFs use the exact incomplete
 * gamma/beta functions from {@link SpecialFunctions} rather than numeric
 * integration, so they are accurate in the tails.
 *
 * Names follow SciPy (`pdf`/`pmf`, `cdf`, `sf`, `ppf`, `rvs`) with the
 * `scipy.stats` parameterisations noted per factory, except where noted
 * (`exponential` takes a *rate*, `gamma` a *scale*).
 *
 * Every factory takes an optional trailing `rng: () => number` (default
 * `Math.random`), threaded through to every nested distribution it samples
 * from — pass a seeded generator to make `sample()` deterministic in tests.
 */

export interface ContinuousDistribution {
  pdf(x: number): number;
  cdf(x: number): number;
  /** Survival function `1 - cdf(x)`, accurate in the upper tail. */
  sf(x: number): number;
  /** Percent-point function (inverse CDF) for `p` in `[0, 1]`. */
  ppf(p: number): number;
  /** Alias of {@link ppf}. */
  quantile(p: number): number;
  mean(): number;
  variance(): number;
  std(): number;
  sample(): number;
  /** `n` independent draws (SciPy's `rvs(size=n)`). */
  rvs(n: number): number[];
}

export interface DiscreteDistribution {
  pmf(k: number): number;
  cdf(k: number): number;
  sf(k: number): number;
  /** Smallest integer `k` with `cdf(k) >= p`. */
  ppf(p: number): number;
  quantile(p: number): number;
  mean(): number;
  variance(): number;
  std(): number;
  sample(): number;
  rvs(n: number): number[];
}

type Rng = () => number;

/** Build a continuous distribution; `ppf` is derived by bisection unless supplied. */
function continuous(
  d: Pick<ContinuousDistribution, "pdf" | "cdf" | "sf" | "mean" | "variance" | "sample"> & {
    ppf?: (p: number) => number;
    /** Support lower/upper bound (used to bracket the numerical inverse). */
    lower?: number;
    upper?: number;
  },
): ContinuousDistribution {
  const ppf =
    d.ppf ??
    ((p: number) =>
      invertContinuous(d.cdf, d.sf, p, d.lower ?? Number.NEGATIVE_INFINITY, d.upper ?? Number.POSITIVE_INFINITY));
  return {
    pdf: d.pdf,
    cdf: d.cdf,
    sf: d.sf,
    ppf,
    quantile: ppf,
    mean: d.mean,
    variance: d.variance,
    std: () => Math.sqrt(d.variance()),
    sample: d.sample,
    rvs: (n) => Array.from({ length: n }, () => d.sample()),
  };
}

function discrete(
  d: Pick<DiscreteDistribution, "pmf" | "cdf" | "sf" | "mean" | "variance" | "sample"> & { max?: number },
): DiscreteDistribution {
  const ppf = (p: number): number => {
    if (Number.isNaN(p) || p < 0 || p > 1) return Number.NaN;
    if (p === 0) return -1;
    const max = d.max ?? Number.POSITIVE_INFINITY;
    if (p === 1) return max;
    let hi = Math.max(1, Math.ceil(d.mean() + 4 * Math.sqrt(d.variance())));
    while (hi < max && d.cdf(hi) < p) hi *= 2;
    hi = Math.min(hi, max);
    let lo = -1; // cdf(-1) = 0 < p
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (d.cdf(mid) >= p) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  return {
    pmf: d.pmf,
    cdf: d.cdf,
    sf: d.sf,
    ppf,
    quantile: ppf,
    mean: d.mean,
    variance: d.variance,
    std: () => Math.sqrt(d.variance()),
    sample: d.sample,
    rvs: (n) => Array.from({ length: n }, () => d.sample()),
  };
}

/**
 * Invert a continuous CDF by bracketing + bisection. Uses `cdf` for the lower
 * half and `sf` for the upper half so tail quantiles keep full precision.
 */
function invertContinuous(
  cdf: (x: number) => number,
  sf: (x: number) => number,
  p: number,
  lower: number,
  upper: number,
): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return Number.NaN;
  if (p === 0) return lower;
  if (p === 1) return upper;
  const below = p <= 0.5 ? (x: number) => cdf(x) < p : (x: number) => sf(x) > 1 - p;
  let lo = lower;
  if (!Number.isFinite(lo)) {
    lo = -1;
    for (let step = 1; !below(lo); step *= 2) lo -= step;
  }
  let hi = Number.isFinite(upper) ? upper : lo + 1;
  if (!Number.isFinite(upper)) {
    for (let step = 1; below(hi); step *= 2) {
      lo = hi;
      hi += step;
    }
  }
  for (let i = 0; i < 400; i++) {
    const mid = lo + (hi - lo) / 2;
    if (mid === lo || mid === hi) break;
    if (below(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The inverse standard-normal CDF (Acklam's rational approximation). */
function normInv(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

export class Distributions {
  /** The inverse standard-normal CDF (quantile / probit function), to ~1e-15 after one Halley refinement. */
  static normalQuantile(p: number, mean = 0, sd = 1): number {
    if (Number.isNaN(p) || p < 0 || p > 1) return Number.NaN;
    let x = normInv(p);
    if (Number.isFinite(x)) {
      const e = 0.5 * SF.erfc(-x / Math.SQRT2) - p;
      const u = e * SQRT_2PI * Math.exp((x * x) / 2);
      x -= u / (1 + (x * u) / 2);
    }
    return mean + sd * x;
  }

  /** Normal(`mean`, `sd`) -- `scipy.stats.norm(loc=mean, scale=sd)`. */
  static normal(mean = 0, sd = 1, rng: Rng = Math.random): ContinuousDistribution {
    return continuous({
      pdf: (x) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * SQRT_2PI),
      cdf: (x) => 0.5 * SF.erfc(-(x - mean) / (sd * Math.SQRT2)),
      sf: (x) => 0.5 * SF.erfc((x - mean) / (sd * Math.SQRT2)),
      ppf: (p) => Distributions.normalQuantile(p, mean, sd),
      mean: () => mean,
      variance: () => sd * sd,
      sample: () => mean + sd * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()),
    });
  }

  /** Exponential with the given `rate` -- `scipy.stats.expon(scale=1/rate)`. */
  static exponential(rate = 1, rng: Rng = Math.random): ContinuousDistribution {
    return continuous({
      pdf: (x) => (x < 0 ? 0 : rate * Math.exp(-rate * x)),
      cdf: (x) => (x < 0 ? 0 : -Math.expm1(-rate * x)),
      sf: (x) => (x < 0 ? 1 : Math.exp(-rate * x)),
      ppf: (p) => (p < 0 || p > 1 ? Number.NaN : -Math.log1p(-p) / rate),
      mean: () => 1 / rate,
      variance: () => 1 / (rate * rate),
      sample: () => -Math.log(1 - rng()) / rate,
    });
  }

  /** Uniform on `[a, b]` -- `scipy.stats.uniform(loc=a, scale=b-a)`. */
  static uniform(a = 0, b = 1, rng: Rng = Math.random): ContinuousDistribution {
    return continuous({
      pdf: (x) => (x >= a && x <= b ? 1 / (b - a) : 0),
      cdf: (x) => (x < a ? 0 : x > b ? 1 : (x - a) / (b - a)),
      sf: (x) => (x < a ? 1 : x > b ? 0 : (b - x) / (b - a)),
      ppf: (p) => (p < 0 || p > 1 ? Number.NaN : a + p * (b - a)),
      mean: () => (a + b) / 2,
      variance: () => (b - a) ** 2 / 12,
      sample: () => a + rng() * (b - a),
    });
  }

  /** Gamma with `shape` and `scale` -- `scipy.stats.gamma(a=shape, scale=scale)`. */
  static gamma(shape: number, scale = 1, rng: Rng = Math.random): ContinuousDistribution {
    return continuous({
      pdf: (x) => {
        if (x < 0) return 0;
        if (x === 0) return shape < 1 ? Number.POSITIVE_INFINITY : shape === 1 ? 1 / scale : 0;
        return Math.exp((shape - 1) * Math.log(x) - x / scale - SF.lnGamma(shape) - shape * Math.log(scale));
      },
      cdf: (x) => (x <= 0 ? 0 : SF.regularizedGammaP(shape, x / scale)),
      sf: (x) => (x <= 0 ? 1 : SF.regularizedGammaQ(shape, x / scale)),
      lower: 0,
      mean: () => shape * scale,
      variance: () => shape * scale * scale,
      sample: () => Distributions.sampleGamma(shape, rng) * scale,
    });
  }

  /** Chi-square with `df` degrees of freedom -- `scipy.stats.chi2(df)`. */
  static chiSquare(df: number, rng: Rng = Math.random): ContinuousDistribution {
    const g = Distributions.gamma(df / 2, 2, rng);
    return { ...g, mean: () => df, variance: () => 2 * df, std: () => Math.sqrt(2 * df) };
  }

  /** Student's t with `df` degrees of freedom -- `scipy.stats.t(df)`. */
  static studentT(df: number, rng: Rng = Math.random): ContinuousDistribution {
    const lc = SF.lnGamma((df + 1) / 2) - SF.lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
    const cdf = (x: number): number => {
      if (x === Number.POSITIVE_INFINITY) return 1;
      if (x === Number.NEGATIVE_INFINITY) return 0;
      const ib = SF.regularizedIncompleteBeta(df / (df + x * x), df / 2, 0.5);
      return x >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
    };
    return continuous({
      pdf: (x) => Math.exp(lc - ((df + 1) / 2) * Math.log1p((x * x) / df)),
      cdf,
      sf: (x) => cdf(-x),
      mean: () => (df > 1 ? 0 : Number.NaN),
      variance: () => (df > 2 ? df / (df - 2) : df > 1 ? Number.POSITIVE_INFINITY : Number.NaN),
      sample: () => {
        const z = Distributions.normal(0, 1, rng).sample();
        const chi = Distributions.chiSquare(df, rng).sample();
        return z / Math.sqrt(chi / df);
      },
    });
  }

  /** Fisher-Snedecor F with numerator `d1` and denominator `d2` degrees of freedom -- `scipy.stats.f(d1, d2)`. */
  static fisherF(d1: number, d2: number, rng: Rng = Math.random): ContinuousDistribution {
    const lbeta = SF.lnGamma(d1 / 2) + SF.lnGamma(d2 / 2) - SF.lnGamma((d1 + d2) / 2);
    return continuous({
      pdf: (x) => {
        if (x < 0) return 0;
        if (x === 0) return d1 < 2 ? Number.POSITIVE_INFINITY : d1 === 2 ? 1 : 0;
        return Math.exp(
          0.5 * d1 * Math.log(d1) +
            0.5 * d2 * Math.log(d2) +
            (d1 / 2 - 1) * Math.log(x) -
            ((d1 + d2) / 2) * Math.log(d2 + d1 * x) -
            lbeta,
        );
      },
      cdf: (x) => (x <= 0 ? 0 : SF.regularizedIncompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2)),
      sf: (x) => (x <= 0 ? 1 : SF.regularizedIncompleteBeta(d2 / (d2 + d1 * x), d2 / 2, d1 / 2)),
      lower: 0,
      mean: () => (d2 > 2 ? d2 / (d2 - 2) : Number.NaN),
      variance: () =>
        d2 > 4
          ? (2 * d2 * d2 * (d1 + d2 - 2)) / (d1 * (d2 - 2) ** 2 * (d2 - 4))
          : d2 > 2
            ? Number.POSITIVE_INFINITY
            : Number.NaN,
      sample: () =>
        (Distributions.sampleGamma(d1 / 2, rng) * 2) / d1 / ((Distributions.sampleGamma(d2 / 2, rng) * 2) / d2),
    });
  }

  /** Binomial(`n`, `p`) -- `scipy.stats.binom(n, p)`. */
  static binomial(n: number, p: number, rng: Rng = Math.random): DiscreteDistribution {
    const logChoose = (k: number) => SF.lnGamma(n + 1) - SF.lnGamma(k + 1) - SF.lnGamma(n - k + 1);
    const pmf = (k: number): number => {
      if (k < 0 || k > n || !Number.isInteger(k)) return 0;
      if (p === 0) return k === 0 ? 1 : 0;
      if (p === 1) return k === n ? 1 : 0;
      return Math.exp(logChoose(k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
    };
    return discrete({
      pmf,
      cdf: (k) => {
        if (k < 0) return 0;
        const f = Math.floor(k);
        return f >= n ? 1 : SF.regularizedIncompleteBeta(1 - p, n - f, f + 1);
      },
      sf: (k) => {
        if (k < 0) return 1;
        const f = Math.floor(k);
        return f >= n ? 0 : SF.regularizedIncompleteBeta(p, f + 1, n - f);
      },
      max: n,
      mean: () => n * p,
      variance: () => n * p * (1 - p),
      sample: () => {
        let count = 0;
        for (let i = 0; i < n; i++) if (rng() < p) count++;
        return count;
      },
    });
  }

  /** Poisson(`lambda`) -- `scipy.stats.poisson(mu=lambda)`. */
  static poisson(lambda: number, rng: Rng = Math.random): DiscreteDistribution {
    return discrete({
      pmf: (k) => (k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(lambda) - lambda - SF.lnGamma(k + 1))),
      cdf: (k) => (k < 0 ? 0 : SF.regularizedGammaQ(Math.floor(k) + 1, lambda)),
      sf: (k) => (k < 0 ? 1 : SF.regularizedGammaP(Math.floor(k) + 1, lambda)),
      mean: () => lambda,
      variance: () => lambda,
      sample: () => {
        // Knuth's product method underflows exp(-lambda) past ~745, so split
        // large rates into independent Poisson(<=500) pieces and add them.
        let remaining = lambda;
        let total = 0;
        while (remaining > 0) {
          const part = Math.min(remaining, 500);
          remaining -= part;
          const L = Math.exp(-part);
          let k = 0;
          let prod = 1;
          do {
            k++;
            prod *= rng();
          } while (prod > L);
          total += k - 1;
        }
        return total;
      },
    });
  }

  /** Marsaglia-Tsang gamma sampler (shape ≥ 0). */
  private static sampleGamma(shape: number, rng: Rng = Math.random): number {
    if (shape < 1) return Distributions.sampleGamma(shape + 1, rng) * rng() ** (1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = Distributions.normal(0, 1, rng).sample();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
}

/** Result of a hypothesis test. `df` is `NaN` for tests without a single degrees-of-freedom value. */
export interface TestResult {
  statistic: number;
  df: number;
  pValue: number;
}

export type Alternative = "two-sided" | "less" | "greater";

export interface TTestOptions {
  /** Alternative hypothesis (SciPy's `alternative`). Default `"two-sided"`. */
  alternative?: Alternative;
}

export interface TTestIndependentOptions extends TTestOptions {
  /** Pooled-variance Student test when true (SciPy's `ttest_ind` default), Welch's when false. Default `true`. */
  equalVar?: boolean;
}

export interface ChiSquareIndependenceResult extends TestResult {
  /** Expected frequencies under independence. */
  expected: number[][];
}

const sumOf = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const meanOf = (xs: readonly number[]) => sumOf(xs) / xs.length;
const sampleVar = (xs: readonly number[]) => {
  const m = meanOf(xs);
  return xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
};

/** p-value of a t statistic under the chosen alternative. */
function tPValue(t: number, df: number, alternative: Alternative = "two-sided"): number {
  const dist = Distributions.studentT(df);
  if (alternative === "less") return dist.cdf(t);
  if (alternative === "greater") return dist.sf(t);
  return Math.min(1, 2 * dist.sf(Math.abs(t)));
}

export class HypothesisTests {
  /** One-sample Student t-test against a hypothesised mean `mu0` -- `scipy.stats.ttest_1samp`. */
  static tTestOneSample(sample: number[], mu0 = 0, options: TTestOptions = {}): TestResult {
    const n = sample.length;
    const se = Math.sqrt(sampleVar(sample) / n);
    const t = (meanOf(sample) - mu0) / se;
    const df = n - 1;
    return { statistic: t, df, pValue: tPValue(t, df, options.alternative) };
  }

  /**
   * Welch's two-sample t-test (unequal variances) -- `scipy.stats.ttest_ind(a, b, equal_var=False)`.
   * This is the mallory behaviour; for SciPy's pooled default see {@link tTestIndependent}.
   */
  static tTestTwoSample(a: number[], b: number[], options: TTestOptions = {}): TestResult {
    return HypothesisTests.tTestIndependent(a, b, { ...options, equalVar: false });
  }

  /** Alias of Welch's test (`tTestTwoSample`). */
  static welch(a: number[], b: number[], options: TTestOptions = {}): TestResult {
    return HypothesisTests.tTestTwoSample(a, b, options);
  }

  /** Independent two-sample t-test -- `scipy.stats.ttest_ind`. Pooled-variance (`equalVar: true`) by default, like SciPy. */
  static tTestIndependent(a: number[], b: number[], options: TTestIndependentOptions = {}): TestResult {
    const { equalVar = true, alternative } = options;
    const na = a.length;
    const nb = b.length;
    const va = sampleVar(a);
    const vb = sampleVar(b);
    let t: number;
    let df: number;
    if (equalVar) {
      df = na + nb - 2;
      const pooled = ((na - 1) * va + (nb - 1) * vb) / df;
      t = (meanOf(a) - meanOf(b)) / Math.sqrt(pooled * (1 / na + 1 / nb));
    } else {
      const sa = va / na;
      const sb = vb / nb;
      t = (meanOf(a) - meanOf(b)) / Math.sqrt(sa + sb);
      df = (sa + sb) ** 2 / (sa ** 2 / (na - 1) + sb ** 2 / (nb - 1));
    }
    return { statistic: t, df, pValue: tPValue(t, df, alternative) };
  }

  /** Paired t-test on matched samples -- `scipy.stats.ttest_rel`. */
  static tTestPaired(a: number[], b: number[], options: TTestOptions = {}): TestResult {
    if (a.length !== b.length) throw new Error("tTestPaired requires samples of equal length.");
    return HypothesisTests.tTestOneSample(
      a.map((x, i) => x - b[i]),
      0,
      options,
    );
  }

  /**
   * Pearson chi-square goodness-of-fit test -- `scipy.stats.chisquare`.
   * `expected` defaults to uniform; `ddof` is SciPy's delta degrees of freedom
   * (the p-value uses `k - 1 - ddof`). Throws when the totals disagree.
   */
  static chiSquareGoodnessOfFit(observed: number[], expected?: number[], ddof = 0): TestResult {
    const k = observed.length;
    const exp = expected ?? new Array<number>(k).fill(sumOf(observed) / k);
    if (exp.length !== k) throw new Error("observed and expected must have the same length.");
    const so = sumOf(observed);
    const se = sumOf(exp);
    if (Math.abs(so - se) > 1e-8 * Math.max(Math.abs(so), Math.abs(se))) {
      throw new Error(`observed (${so}) and expected (${se}) frequencies must sum to the same total.`);
    }
    const chi2 = observed.reduce((s, o, i) => s + (o - exp[i]) ** 2 / exp[i], 0);
    const df = k - 1 - ddof;
    return { statistic: chi2, df, pValue: Distributions.chiSquare(df).sf(chi2) };
  }

  /**
   * Chi-square test of independence on a contingency table --
   * `scipy.stats.chi2_contingency`. Like SciPy, applies Yates' continuity
   * correction by default when there is one degree of freedom.
   */
  static chiSquareIndependence(table: number[][], options: { correction?: boolean } = {}): ChiSquareIndependenceResult {
    const { correction = true } = options;
    const r = table.length;
    const c = table[0].length;
    const rows = table.map(sumOf);
    const cols = Array.from({ length: c }, (_, j) => sumOf(table.map((row) => row[j])));
    const total = sumOf(rows);
    const expected = table.map((_, i) => cols.map((cj) => (rows[i] * cj) / total));
    const df = (r - 1) * (c - 1);
    let stat = 0;
    for (let i = 0; i < r; i++) {
      for (let j = 0; j < c; j++) {
        let diff = Math.abs(table[i][j] - expected[i][j]);
        if (correction && df === 1) diff = Math.max(0, diff - 0.5);
        stat += diff ** 2 / expected[i][j];
      }
    }
    return { statistic: stat, df, pValue: df === 0 ? 1 : Distributions.chiSquare(df).sf(stat), expected };
  }

  /** t-based confidence interval for the mean of a sample. */
  static confidenceIntervalMean(sample: number[], level = 0.95): [number, number] {
    const n = sample.length;
    const m = meanOf(sample);
    const se = Math.sqrt(sampleVar(sample) / n);
    const tCrit = Distributions.studentT(n - 1).ppf(1 - (1 - level) / 2);
    return [m - tCrit * se, m + tCrit * se];
  }

  /** Welch confidence interval for `mean(a) - mean(b)`. */
  static confidenceIntervalDifference(a: number[], b: number[], level = 0.95): [number, number] {
    const sa = sampleVar(a) / a.length;
    const sb = sampleVar(b) / b.length;
    const df = (sa + sb) ** 2 / (sa ** 2 / (a.length - 1) + sb ** 2 / (b.length - 1));
    const d = meanOf(a) - meanOf(b);
    const half = Distributions.studentT(df).ppf(1 - (1 - level) / 2) * Math.sqrt(sa + sb);
    return [d - half, d + half];
  }

  /** Wilson score interval for a binomial proportion (`scipy.stats.binomtest(...).proportion_ci(method="wilson", ...)` without continuity correction). */
  static confidenceIntervalProportion(successes: number, n: number, level = 0.95): [number, number] {
    const z = Distributions.normalQuantile(1 - (1 - level) / 2);
    const phat = successes / n;
    const denom = 1 + (z * z) / n;
    const centre = (phat + (z * z) / (2 * n)) / denom;
    const half = (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) / denom;
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
  }
}
