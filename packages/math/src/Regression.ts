import { MatrixMath } from "./MatrixMath.ts";

/**
 * Regression — nonlinear least squares (Levenberg-Marquardt) and robust
 * (Huber) fitting, modelled on `scipy.optimize.least_squares` and
 * `scipy.optimize.curve_fit`.
 *
 * - {@link Regression.leastSquares} minimises `0.5 * Σ ρ((r_i / f_scale)²) * f_scale²`
 *   over residuals `r(x)`, with SciPy's robust `loss` options and SciPy's
 *   robust-loss Jacobian rescaling. The solver is a damped Gauss-Newton
 *   (Levenberg-Marquardt) iteration with Marquardt scaling, so it reaches the
 *   same minimiser as SciPy's `method="lm"` / `"trf"` to the requested
 *   tolerances (iteration counts differ).
 * - {@link Regression.curveFit} fits `y ≈ model(x, params)` and returns the
 *   parameter covariance exactly as `curve_fit` defines it.
 * - {@link Regression.huberLinear} is the robust line fit mallory's regression
 *   panel offers (Huber loss), solved to convergence instead of by SGD.
 */

export type RobustLoss = "linear" | "huber" | "soft_l1" | "cauchy" | "arctan";

export interface LeastSquaresOptions {
  /** Analytic Jacobian `d residual_i / d x_j` (m×n). Default: central differences. */
  jac?: (x: number[]) => number[][];
  /** Loss function ρ applied to scaled squared residuals. Default `"linear"` (plain least squares). */
  loss?: RobustLoss;
  /** Residual scale at which a robust loss turns over (SciPy's `f_scale`). Default 1. */
  fScale?: number;
  /** Relative cost-reduction tolerance (default 1e-8, as SciPy). */
  ftol?: number;
  /** Step-size tolerance (default 1e-8). */
  xtol?: number;
  /** Gradient infinity-norm tolerance (default 1e-8). */
  gtol?: number;
  /** Maximum residual-function evaluations (default `200 * n`, min 1000). */
  maxNfev?: number;
}

export interface LeastSquaresResult {
  x: number[];
  /** `0.5 * Σ ρ` at the solution (SciPy's `cost`; equals `0.5 Σ r²` for the linear loss). */
  cost: number;
  /** Residuals at the solution. */
  fun: number[];
  jac: number[][];
  /** Gradient `Jᵀ ρ'(r) r` at the solution. */
  grad: number[];
  /** Gradient infinity-norm. */
  optimality: number;
  nfev: number;
  njev: number;
  /** 0: max evaluations, 1: gtol, 2: ftol, 3: xtol, 4: ftol and xtol (SciPy's codes). */
  status: 0 | 1 | 2 | 3 | 4;
  success: boolean;
  message: string;
}

export interface CurveFitOptions extends Omit<LeastSquaresOptions, "jac"> {
  /** Analytic `d model / d params` for one point: `(x, params) => number[]`. */
  jac?: (x: number, params: number[]) => number[];
  /** Per-point standard deviations (weights `1/sigma`). */
  sigma?: number[];
  /** Treat `sigma` as absolute (don't rescale the covariance by reduced chi-square). Default false. */
  absoluteSigma?: boolean;
}

export interface CurveFitResult {
  params: number[];
  /** Parameter covariance, as `scipy.optimize.curve_fit`'s `pcov` (`Infinity` entries when singular). */
  covariance: number[][];
  /** Square roots of the covariance diagonal. */
  standardErrors: number[];
  /** `sqrt(Σ r²)`. */
  residualNorm: number;
  /** Coefficient of determination `1 - SS_res / SS_tot`. */
  rSquared: number;
  iterations: number;
  converged: boolean;
  fit: LeastSquaresResult;
}

export interface HuberLinearResult {
  slope: number;
  intercept: number;
  iterations: number;
  converged: boolean;
}

const EPS = Number.EPSILON;

/** ρ(z), ρ'(z), ρ''(z) for the SciPy robust losses, `z` = squared scaled residual. */
function rho(loss: RobustLoss, z: number): [number, number, number] {
  switch (loss) {
    case "linear":
      return [z, 1, 0];
    case "huber":
      if (z <= 1) return [z, 1, 0];
      return [2 * Math.sqrt(z) - 1, 1 / Math.sqrt(z), -0.5 * z ** -1.5];
    case "soft_l1": {
      const t = 1 + z;
      return [2 * (Math.sqrt(t) - 1), 1 / Math.sqrt(t), -0.5 * t ** -1.5];
    }
    case "cauchy": {
      const t = 1 + z;
      return [Math.log1p(z), 1 / t, -1 / (t * t)];
    }
    case "arctan":
      return [Math.atan(z), 1 / (1 + z * z), (-2 * z) / (1 + z * z) ** 2];
  }
}

function robustCost(loss: RobustLoss, f: number[], fScale: number): number {
  if (loss === "linear") return 0.5 * f.reduce((s, v) => s + v * v, 0);
  const c2 = fScale * fScale;
  return 0.5 * c2 * f.reduce((s, v) => s + rho(loss, (v / fScale) ** 2)[0], 0);
}

/** Invert a small symmetric matrix by Gauss-Jordan with partial pivoting; `null` when singular. */
function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-300) return null;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c];
    for (let j = 0; j < 2 * n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row.slice(n));
}

export class Regression {
  /**
   * Nonlinear least squares by Levenberg-Marquardt -- `scipy.optimize.least_squares`
   * (`method="lm"` for `loss: "linear"`; robust losses as `method="trf"` would
   * minimise them). `fun(x)` returns the residual vector.
   */
  static leastSquares(
    fun: (x: number[]) => number[],
    x0: number[],
    options: LeastSquaresOptions = {},
  ): LeastSquaresResult {
    const { loss = "linear", fScale = 1, ftol = 1e-8, xtol = 1e-8, gtol = 1e-8 } = options;
    const n = x0.length;
    const maxNfev = options.maxNfev ?? Math.max(1000, 200 * n);
    let nfev = 0;
    let njev = 0;
    const evalF = (x: number[]) => {
      nfev++;
      return fun(x);
    };
    const jacobian = (x: number[], f: number[]): number[][] => {
      njev++;
      if (options.jac) return options.jac(x);
      const m = f.length;
      const J = Array.from({ length: m }, () => new Array<number>(n).fill(0));
      for (let j = 0; j < n; j++) {
        const h = Math.cbrt(EPS) * Math.max(Math.abs(x[j]), 1);
        const xp = [...x];
        const xm = [...x];
        xp[j] += h;
        xm[j] -= h;
        const fp = fun(xp);
        const fm = fun(xm);
        for (let i = 0; i < m; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h);
      }
      return J;
    };

    let x = [...x0];
    let f = evalF(x);
    let cost = robustCost(loss, f, fScale);
    let J = jacobian(x, f);
    let lambda = 1e-3;
    let status: LeastSquaresResult["status"] = 0;
    let message = "The maximum number of function evaluations is exceeded.";

    /** Robust-loss scaled residual & Jacobian (SciPy's `scale_for_robust_loss`) and true gradient. */
    const scaled = (fv: number[], Jv: number[][]) => {
      if (loss === "linear") return { fs: fv, Js: Jv };
      const m = fv.length;
      const fs = new Array<number>(m);
      const Js = new Array<number[]>(m);
      for (let i = 0; i < m; i++) {
        const [, r1, r2] = rho(loss, (fv[i] / fScale) ** 2);
        let js = r1 + 2 * r2 * (fv[i] / fScale) ** 2;
        if (js < EPS) js = EPS;
        js = Math.sqrt(js);
        const fsc = r1 / js;
        fs[i] = fv[i] * fsc;
        Js[i] = Jv[i].map((v) => v * js);
      }
      return { fs, Js };
    };
    const gradientOf = (fv: number[], Jv: number[][]): number[] => {
      const g = new Array<number>(n).fill(0);
      for (let i = 0; i < fv.length; i++) {
        const w = loss === "linear" ? 1 : rho(loss, (fv[i] / fScale) ** 2)[1];
        for (let j = 0; j < n; j++) g[j] += Jv[i][j] * w * fv[i];
      }
      return g;
    };

    let grad = gradientOf(f, J);
    let optimality = Math.max(0, ...grad.map(Math.abs));
    if (optimality <= gtol) {
      status = 1;
      message = "`gtol` termination condition is satisfied.";
    }

    while (status === 0 && nfev < maxNfev) {
      const { fs, Js } = scaled(f, J);
      const JtJ = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const Jtf = new Array<number>(n).fill(0);
      for (let i = 0; i < fs.length; i++) {
        for (let a = 0; a < n; a++) {
          Jtf[a] += Js[i][a] * fs[i];
          for (let b = a; b < n; b++) JtJ[a][b] += Js[i][a] * Js[i][b];
        }
      }
      for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];

      let accepted = false;
      let dxNorm = 0;
      let reduction = 0;
      for (let tries = 0; tries < 40 && !accepted && nfev < maxNfev; tries++) {
        const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(JtJ[a][a], 1e-12) : v)));
        let dx: number[];
        try {
          dx = [
            ...MatrixMath.solve(
              A,
              Jtf.map((v) => -v),
            ),
          ];
        } catch {
          lambda *= 10;
          continue;
        }
        if (dx.some((v) => !Number.isFinite(v))) {
          lambda *= 10;
          continue;
        }
        const xn = x.map((v, i) => v + dx[i]);
        const fn = evalF(xn);
        const cn = robustCost(loss, fn, fScale);
        if (Number.isFinite(cn) && cn < cost) {
          reduction = cost - cn;
          dxNorm = Math.hypot(...dx);
          const xNorm = Math.hypot(...x);
          const prevCost = cost;
          x = xn;
          f = fn;
          cost = cn;
          lambda = Math.max(lambda / 10, 1e-14);
          accepted = true;
          J = jacobian(x, f);
          grad = gradientOf(f, J);
          optimality = Math.max(0, ...grad.map(Math.abs));
          const fHit = reduction < ftol * prevCost;
          const xHit = dxNorm < xtol * (xtol + xNorm);
          if (optimality <= gtol) {
            status = 1;
            message = "`gtol` termination condition is satisfied.";
          } else if (fHit && xHit) {
            status = 4;
            message = "Both `ftol` and `xtol` termination conditions are satisfied.";
          } else if (fHit) {
            status = 2;
            message = "`ftol` termination condition is satisfied.";
          } else if (xHit) {
            status = 3;
            message = "`xtol` termination condition is satisfied.";
          }
        } else lambda *= 10;
      }
      if (!accepted) {
        // no damped step lowers the cost: a (numerical) stationary point
        status = optimality <= Math.sqrt(gtol) || cost === 0 ? 1 : 2;
        message = "No further improvement is possible at this precision.";
        break;
      }
    }

    return { x, cost, fun: f, jac: J, grad, optimality, nfev, njev, status, success: status > 0, message };
  }

  /**
   * Fit `y ≈ model(x, params)` by least squares -- `scipy.optimize.curve_fit`
   * (default `method="lm"`). `covariance` follows `curve_fit`: `(JᵀJ)⁻¹`
   * scaled by the reduced chi-square unless `absoluteSigma` is set.
   */
  static curveFit(
    model: (x: number, params: number[]) => number,
    xs: number[],
    ys: number[],
    p0: number[],
    options: CurveFitOptions = {},
  ): CurveFitResult {
    if (xs.length !== ys.length) throw new Error("xs and ys must have the same length.");
    const m = xs.length;
    const n = p0.length;
    if (m < n) throw new Error(`curveFit needs at least as many points (${m}) as parameters (${n}).`);
    const sigma = options.sigma;
    const w = (i: number) => (sigma ? 1 / sigma[i] : 1);
    const { jac: pointJac, sigma: _s, absoluteSigma, ...rest } = options;
    const fit = Regression.leastSquares((p) => xs.map((x, i) => (model(x, p) - ys[i]) * w(i)), p0, {
      ...rest,
      jac: pointJac ? (p) => xs.map((x, i) => pointJac(x, p).map((d) => d * w(i))) : undefined,
    });
    const JtJ = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => fit.jac.reduce((s, row) => s + row[a] * row[b], 0)),
    );
    const inv = invert(JtJ);
    let covariance: number[][];
    if (!inv) covariance = Array.from({ length: n }, () => new Array<number>(n).fill(Number.POSITIVE_INFINITY));
    else {
      const sq = 2 * fit.cost; // Σ (r/σ)²
      const scale = absoluteSigma ? 1 : m > n ? sq / (m - n) : Number.POSITIVE_INFINITY;
      covariance = inv.map((row) => row.map((v) => v * scale));
    }
    const meanY = ys.reduce((a, b) => a + b, 0) / m;
    const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
    const ssRes = xs.reduce((s, x, i) => s + (ys[i] - model(x, fit.x)) ** 2, 0);
    return {
      params: fit.x,
      covariance,
      standardErrors: covariance.map((row, i) => Math.sqrt(row[i])),
      residualNorm: Math.sqrt(ssRes),
      rSquared: ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot,
      iterations: fit.nfev,
      converged: fit.success,
      fit,
    };
  }

  /**
   * Robust straight-line fit `y = slope·x + intercept` minimising the Huber
   * loss of the residuals scaled by `delta` -- the same objective as
   * `scipy.optimize.least_squares(..., loss="huber", f_scale=delta)` on a
   * linear model. Quadratic for residuals within `delta`, linear beyond, so an
   * outlier pulls the line far less than ordinary least squares. Solved by
   * iteratively reweighted least squares to convergence (the objective is convex).
   */
  static huberLinear(
    xs: number[],
    ys: number[],
    options: { delta?: number; maxIterations?: number; tolerance?: number } = {},
  ): HuberLinearResult {
    const { delta = 1, maxIterations = 200, tolerance = 1e-12 } = options;
    if (xs.length !== ys.length) throw new Error("xs and ys must have the same length.");
    if (xs.length < 2) throw new Error("Enter at least two (x, y) rows.");
    if (!(delta > 0)) throw new Error("delta must be positive.");
    const m = xs.length;
    const wls = (weights: number[]): [number, number] => {
      let sw = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < m; i++) {
        const w = weights[i];
        sw += w;
        sx += w * xs[i];
        sy += w * ys[i];
        sxx += w * xs[i] * xs[i];
        sxy += w * xs[i] * ys[i];
      }
      const det = sw * sxx - sx * sx;
      if (Math.abs(det) < 1e-300) return [0, sy / sw];
      return [(sw * sxy - sx * sy) / det, (sxx * sy - sx * sxy) / det];
    };
    let [slope, intercept] = wls(new Array<number>(m).fill(1));
    let iterations = 0;
    let converged = false;
    for (; iterations < maxIterations; iterations++) {
      const weights = xs.map((x, i) => {
        const r = Math.abs(ys[i] - (slope * x + intercept));
        return r <= delta ? 1 : delta / r;
      });
      const [s, b] = wls(weights);
      const change = Math.max(Math.abs(s - slope), Math.abs(b - intercept));
      slope = s;
      intercept = b;
      if (change <= tolerance * (1 + Math.abs(slope) + Math.abs(intercept))) {
        converged = true;
        iterations++;
        break;
      }
    }
    return { slope, intercept, iterations, converged };
  }

  /**
   * Indices of points whose residual from `y = slope·x + intercept` is more
   * than `thresholdMads` scaled median absolute deviations from the median
   * residual (MAD × 1.4826 estimates a Gaussian σ without being skewed by the
   * outliers themselves). Empty when the MAD is zero.
   */
  static outlierIndices(xs: number[], ys: number[], slope: number, intercept: number, thresholdMads = 2.5): number[] {
    if (xs.length === 0) return [];
    const median = (v: number[]) => {
      const s = [...v].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
    const med = median(residuals);
    const mad = median(residuals.map((r) => Math.abs(r - med)));
    if (mad === 0) return [];
    const scaled = mad * 1.4826;
    const out: number[] = [];
    residuals.forEach((r, i) => {
      if (Math.abs(r - med) / scaled > thresholdMads) out.push(i);
    });
    return out;
  }
}
