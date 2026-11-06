import assert from "node:assert/strict";
import { test } from "node:test";
import { Regression } from "../src/Regression.ts";

/** Relative closeness (absolute below 1e-12); goldens come from SciPy 1.18 (see the comment on each case). */
const near = (actual: number, expected: number, tol = 1e-9) => {
  const err = Math.abs(actual - expected);
  assert.ok(err <= tol * Math.abs(expected) || err < 1e-12, `${actual} vs ${expected}`);
};
const nearAll = (actual: number[], expected: number[], tol = 1e-9) => {
  assert.equal(actual.length, expected.length);
  for (const [i, v] of actual.entries()) near(v, expected[i], tol);
};

test("curveFit: three-parameter exponential decay matches curve_fit", () => {
  // scipy: curve_fit(lambda x,a,b,c: a*exp(-b*x)+c, xs, ys, p0=[4,1,0.1])
  const xs = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0];
  const ys = [5.1, 3.9, 3.1, 2.4, 1.9, 1.55, 1.2, 1.0, 0.8, 0.55];
  const r = Regression.curveFit((x, [a, b, c]) => a * Math.exp(-b * x) + c, xs, ys, [4, 1, 0.1], {
    ftol: 1e-14,
    xtol: 1e-14,
    gtol: 1e-14,
  });
  assert.ok(r.converged);
  nearAll(r.params, [4.853914936591083, 0.5299742271486282, 0.22258746757981918], 1e-6);
  // pcov
  nearAll(
    r.covariance.flat(),
    [
      0.0013758092138943787, -0.00023085992727467987, -0.0011066059456475079, -0.00023085992727467987,
      0.00012123314295689758, 0.00038590202773999187, -0.0011066059456475079, 0.00038590202773999187,
      0.0014544904806143265,
    ],
    1e-4,
  );
  nearAll(r.standardErrors, [0.03709190226847875, 0.011010592307269286, 0.03813778284869647], 1e-4);
  near(r.rSquared, 0.9997219279346644, 1e-6);
});

test("curveFit: sigma weights and absolute_sigma", () => {
  const xs = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
  const ys = [2.2, 3.9, 6.3, 7.8, 10.4, 11.9];
  const sigma = [0.1, 0.2, 0.2, 0.3, 0.1, 0.4];
  const model = (x: number, [a, b]: number[]) => a * x + b;
  // scipy: curve_fit(lambda x,a,b: a*x+b, xs, ys, sigma=sigma, p0=[1,0])
  const r = Regression.curveFit(model, xs, ys, [1, 0], { sigma, ftol: 1e-14, xtol: 1e-14, gtol: 1e-14 });
  nearAll(r.params, [2.0417727967906654, 0.10638963830611546], 1e-6);
  nearAll(
    r.covariance.flat(),
    [0.0019616916080893183, -0.005920741690120169, -0.005920741690120169, 0.024416689257198983],
    1e-5,
  );
  // scipy: ... absolute_sigma=True
  const r2 = Regression.curveFit(model, xs, ys, [1, 0], {
    sigma,
    absoluteSigma: true,
    ftol: 1e-14,
    xtol: 1e-14,
    gtol: 1e-14,
  });
  nearAll(
    r2.covariance.flat(),
    [0.0011207336009544124, -0.003382577632144901, -0.003382577632144901, 0.013949493366726778],
    1e-5,
  );
});

test("curveFit: gaussian peak", () => {
  // scipy: curve_fit(lambda x,a,mu,s: a*exp(-(x-mu)**2/(2*s**2)), xs, ys, p0=[2,0,1])
  const xs = [
    -3.0, -2.75, -2.5, -2.25, -2.0, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5,
    1.75, 2.0, 2.25, 2.5, 2.75, 3.0,
  ];
  const ys = [
    0.000299032208952562, -0.01892524483101824, 0.04350339854721348, 0.010357572408363888, 0.047772491345605794,
    0.027539856200662856, 0.14896829690496527, 0.2779998210066184, 0.5806629170747185, 0.8896631303553465,
    1.347739977588363, 1.7571689242729396, 2.2062422564614885, 2.436438672394751, 2.5205448456506088,
    2.2718343909026752, 1.9070990049725185, 1.3816776342966806, 0.9713953187809103, 0.5819761856806214,
    0.37833820809153174, 0.1724690647930986, 0.09973698340539279, -0.00656534670743842, 0.012715173077531762,
  ];
  const r = Regression.curveFit((x, [a, mu, s]) => a * Math.exp(-((x - mu) ** 2) / (2 * s * s)), xs, ys, [2, 0, 1], {
    ftol: 1e-14,
    xtol: 1e-14,
    gtol: 1e-14,
  });
  nearAll(r.params, [2.500806487148393, 0.400211274256699, 0.7995305499846952], 1e-6);
  nearAll(r.standardErrors, [0.013869829760633182, 0.005120206787276722, 0.005120639980412054], 1e-4);
});

test("leastSquares: Rosenbrock residuals (method='lm')", () => {
  // scipy: least_squares(lambda x: [10*(x[1]-x[0]**2), 1-x[0]], [-1.2, 1.0], method='lm')
  const r = Regression.leastSquares((x) => [10 * (x[1] - x[0] ** 2), 1 - x[0]], [-1.2, 1], {
    ftol: 1e-15,
    xtol: 1e-15,
    gtol: 1e-15,
  });
  assert.ok(r.success);
  nearAll(r.x, [1.0, 1.0], 1e-7);
  assert.ok(r.cost < 1e-15);
  assert.equal(r.fun.length, 2);
});

test("leastSquares: analytic Jacobian gives the same answer", () => {
  const xs = [0, 1, 2, 3, 4];
  const ys = [1.1, 2.9, 5.2, 6.8, 9.1];
  const fun = (p: number[]) => xs.map((x, i) => p[0] * x + p[1] - ys[i]);
  const jac = () => xs.map((x) => [x, 1]);
  const a = Regression.leastSquares(fun, [0, 0]);
  const b = Regression.leastSquares(fun, [0, 0], { jac });
  nearAll(a.x, b.x, 1e-6);
  // closed-form OLS
  const mx = 2;
  const my = ys.reduce((q, v) => q + v, 0) / ys.length;
  const slope = xs.reduce((q, x, i) => q + (x - mx) * (ys[i] - my), 0) / xs.reduce((q, x) => q + (x - mx) ** 2, 0);
  nearAll(b.x, [slope, my - slope * mx], 1e-6);
});

test("leastSquares: loss=huber, f_scale=1.0 on a line with outliers", () => {
  // scipy: least_squares(lambda p: p[0]*x + p[1] - y, [1.0, 0.0], loss='huber', f_scale=1.0)
  const xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0];
  const ys = [1.1, 2.8, 5.15, 6.9, 24.05, 11.2, 12.85, 15.1, 16.95, -1.0, 21.1, 22.9];
  const r = Regression.leastSquares((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [1.0, 0.0], {
    loss: "huber",
    fScale: 1.0,
    ftol: 1e-15,
    xtol: 1e-15,
    gtol: 1e-15,
  });
  nearAll(r.x, [1.9596799381620078, 1.218696327741359], 1e-5);
  near(r.cost, 34.03449843871975, 1e-6);
});

test("leastSquares: loss=huber, f_scale=2.5 on a line with outliers", () => {
  // scipy: least_squares(lambda p: p[0]*x + p[1] - y, [1.0, 0.0], loss='huber', f_scale=2.5)
  const xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0];
  const ys = [1.1, 2.8, 5.15, 6.9, 24.05, 11.2, 12.85, 15.1, 16.95, -1.0, 21.1, 22.9];
  const r = Regression.leastSquares((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [1.0, 0.0], {
    loss: "huber",
    fScale: 2.5,
    ftol: 1e-15,
    xtol: 1e-15,
    gtol: 1e-15,
  });
  nearAll(r.x, [1.9011319299951521, 1.5290007691151581], 1e-5);
  near(r.cost, 80.83754293520686, 1e-6);
});

test("leastSquares: loss=soft_l1, f_scale=1.0 on a line with outliers", () => {
  // scipy: least_squares(lambda p: p[0]*x + p[1] - y, [1.0, 0.0], loss='soft_l1', f_scale=1.0)
  const xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0];
  const ys = [1.1, 2.8, 5.15, 6.9, 24.05, 11.2, 12.85, 15.1, 16.95, -1.0, 21.1, 22.9];
  const r = Regression.leastSquares((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [1.0, 0.0], {
    loss: "soft_l1",
    fScale: 1.0,
    ftol: 1e-15,
    xtol: 1e-15,
    gtol: 1e-15,
  });
  nearAll(r.x, [1.9582678955185702, 1.2275001129934688], 1e-5);
  near(r.cost, 33.089167029024296, 1e-6);
});

test("leastSquares: loss=cauchy, f_scale=1.0 on a line with outliers", () => {
  // scipy: least_squares(lambda p: p[0]*x + p[1] - y, [1.0, 0.0], loss='cauchy', f_scale=1.0)
  const xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0];
  const ys = [1.1, 2.8, 5.15, 6.9, 24.05, 11.2, 12.85, 15.1, 16.95, -1.0, 21.1, 22.9];
  const r = Regression.leastSquares((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [1.0, 0.0], {
    loss: "cauchy",
    fScale: 1.0,
    ftol: 1e-15,
    xtol: 1e-15,
    gtol: 1e-15,
  });
  nearAll(r.x, [1.996293899077201, 1.0267490067435536], 1e-5);
  near(r.cost, 5.797089624800893, 1e-6);
});

test("leastSquares: loss=arctan, f_scale=1.0 on a line with outliers", () => {
  // scipy: least_squares(lambda p: p[0]*x + p[1] - y, [1.9, 0.9], loss='arctan', f_scale=1.0)
  const xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0];
  const ys = [1.1, 2.8, 5.15, 6.9, 24.05, 11.2, 12.85, 15.1, 16.95, -1.0, 21.1, 22.9];
  const r = Regression.leastSquares((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [1.9, 0.9], {
    loss: "arctan",
    fScale: 1.0,
    ftol: 1e-15,
    xtol: 1e-15,
    gtol: 1e-15,
  });
  nearAll(r.x, [1.9986938543449138, 1.0119561242114252], 1e-5);
  near(r.cost, 1.6558277613540404, 1e-6);
});

test("huberLinear matches least_squares(loss='huber') and resists outliers", () => {
  // scipy: least_squares(lambda p: p[0]*x + p[1] - y, [1, 0], loss='huber', f_scale=1.0)
  const xs = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0];
  const ys = [1.1, 2.8, 5.15, 6.9, 24.05, 11.2, 12.85, 15.1, 16.95, -1.0, 21.1, 22.9];
  const h = Regression.huberLinear(xs, ys, { delta: 1 });
  assert.ok(h.converged);
  nearAll([h.slope, h.intercept], [1.9596799381620078, 1.218696327741359], 1e-6);
  // ordinary least squares is dragged far off y = 2x + 1
  const ols = Regression.leastSquares((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [1, 0]);
  assert.ok(Math.abs(ols.x[0] - 2) > 0.1);
  assert.ok(Math.abs(h.slope - 2) < 0.1);
  assert.deepEqual(Regression.outlierIndices(xs, ys, h.slope, h.intercept), [4, 9]);
});

test("curveFit rejects bad input", () => {
  assert.throws(() => Regression.curveFit((x, p) => p[0] * x, [1, 2], [1], [1]), /same length/);
  assert.throws(() => Regression.curveFit((x, p) => p[0] + p[1] * x, [1], [1], [0, 0]), /at least as many/);
  assert.throws(() => Regression.huberLinear([1], [1]), /two/);
});

test("outlierIndices is empty when residuals are identical", () => {
  assert.deepEqual(Regression.outlierIndices([1, 2, 3], [3, 5, 7], 2, 1), []);
  assert.deepEqual(Regression.outlierIndices([], [], 1, 0), []);
});
