import assert from "node:assert/strict";
import { test } from "node:test";
import { Symbolic } from "@johnhenry/math";
import { taylorCoefficients } from "../src/expr.ts";
import {
  evaluateFourier,
  evaluateTaylor,
  fourierCoefficients,
  partialSums,
  sampleFourierPartialSums,
  sampleSeriesPartialSums,
  sampleTaylorPartialSums,
} from "../src/index.ts";

test("evaluateTaylor: Horner about x0", () => {
  assert.equal(evaluateTaylor([1, 2, 3], 1, 3), 1 + 2 * 2 + 3 * 4);
  assert.equal(evaluateTaylor([1, 2, 3], 1, 3, 1), 5);
});

test("taylorCoefficients: sin about 0 and exp about 1 match the closed forms", () => {
  const s = taylorCoefficients("sin(x)", 0, 5);
  assert.deepEqual(
    [...s].map((v) => Math.round(v * 1e12) / 1e12 + 0),
    [0, 1, 0, -1 / 6, 0, 1 / 120].map((v) => Math.round(v * 1e12) / 1e12),
  );
  const e = taylorCoefficients("exp(x)", 1, 3);
  assert.ok(Math.abs((e[3] as number) - Math.E / 6) < 1e-12);
  const p = taylorCoefficients("a*x^2", 0, 2, { params: { a: 3 } });
  assert.deepEqual([...p], [0, 0, 3]);
});

test("sampleTaylorPartialSums: orders approach sin; the order-1 curve is the tangent line", () => {
  const a = taylorCoefficients("sin(x)", 0, 9);
  const r = sampleTaylorPartialSums(a, 0, { min: -1, max: 1 }, [1, 3, 9], 5);
  assert.deepEqual([...(r.curves[0]?.y ?? [])], [-1, -0.5, 0, 0.5, 1]);
  const err = (c: number) => Math.abs((r.curves[c]?.y[4] as number) - Math.sin(1));
  assert.ok(err(0) > err(1) && err(1) > err(2));
  assert.ok(err(2) < 1e-6);
});

test("sampleTaylorPartialSums: non-finite coefficients give an empty curve, not gaps at the ends", () => {
  const r = sampleTaylorPartialSums([Number.NaN, 1], 0, { min: 0, max: 1 }, [1], 4);
  assert.equal(r.curves[0]?.x.length, 0);
});

test("sampleSeriesPartialSums: geometric series sum x^k converges to 1/(1-x) inside |x|<1 and orders share work", () => {
  let calls = 0;
  const r = sampleSeriesPartialSums(
    (k, x) => {
      calls++;
      return x ** k;
    },
    0,
    { min: -0.5, max: 0.5 },
    [4, 2, 8],
    3,
  );
  assert.equal(calls, 9 * 3);
  assert.deepEqual(r.orders, [4, 2, 8]);
  assert.ok(Math.abs((r.curves[2]?.y[2] as number) - 1 / (1 - 0.5)) < 1e-2);
  assert.ok(Math.abs((r.curves[1]?.y[1] as number) - 1) < 1e-12); // x = 0: sum is 1
  assert.throws(() => sampleSeriesPartialSums(() => 0, 1, { min: 0, max: 1 }, [0]), RangeError);
});

test("partialSums: basel series and the Aitken estimate beat the last partial sum for a geometric series", () => {
  const b = partialSums((k) => 1 / (k * k), 1, 1000);
  assert.ok(Math.abs((b.partial[999] as number) - Math.PI ** 2 / 6) < 1.1e-3);
  const g = partialSums((k) => 0.5 ** k, 0, 10);
  assert.ok(Math.abs(g.limitEstimate - 2) < 1e-12);
  assert.ok(Number.isNaN(partialSums((k) => k, 1, 2).limitEstimate));
});

test("fourierCoefficients: sin(x) + 0.5 cos(2x) on [-pi, pi] recovers b1=1 and a2=0.5", () => {
  const c = fourierCoefficients((x) => Math.sin(x) + 0.5 * Math.cos(2 * x), { min: -Math.PI, max: Math.PI }, 4);
  assert.ok(Math.abs((c.b[0] as number) - 1) < 1e-12);
  assert.ok(Math.abs((c.a[1] as number) - 0.5) < 1e-12);
  assert.ok(Math.abs(c.a0) < 1e-12 && Math.abs(c.a[0] as number) < 1e-12 && Math.abs(c.b[1] as number) < 1e-12);
  assert.equal(c.halfPeriod, Math.PI);
});

test("fourier: square wave coefficients 4/(k pi) for odd k, Gibbs overshoot near 1.179, shifted periods work", () => {
  const sq = (x: number) => (x < 0 ? -1 : 1);
  const c = fourierCoefficients(sq, { min: -1, max: 1 }, 41);
  assert.ok(Math.abs((c.b[0] as number) - 4 / Math.PI) < 1e-3);
  assert.ok(Math.abs(c.b[1] as number) < 1e-3);
  assert.ok(Math.abs((c.b[2] as number) - 4 / (3 * Math.PI)) < 1e-3);
  let peak = 0;
  for (let x = 0; x < 0.2; x += 0.001) peak = Math.max(peak, evaluateFourier(c, x));
  assert.ok(peak > 1.15 && peak < 1.2);
  const shifted = fourierCoefficients((x) => Math.cos((2 * Math.PI * (x - 5)) / 4), { min: 3, max: 7 }, 2);
  assert.equal(shifted.center, 5);
  assert.ok(Math.abs(evaluateFourier(shifted, 5) - 1) < 1e-10);
});

test("sampleFourierPartialSums: order 0 is the mean; curves have the requested sample count", () => {
  const c = fourierCoefficients((x) => 2 + Math.sin(x), { min: 0, max: 2 * Math.PI }, 3);
  const r = sampleFourierPartialSums(c, { min: 0, max: 6 }, [0, 1, 3], 7);
  assert.ok(Array.from(r.curves[0]?.y ?? []).every((v) => Math.abs(v - 2) < 1e-10));
  assert.equal(r.curves[2]?.x.length, 7);
  assert.throws(() => sampleFourierPartialSums(c, { min: 0, max: 1 }, [-1]), RangeError);
});

test("taylorCoefficients: order 12 of 1/(1+x^2) and sin(x)exp(x)/(1+x^2) is fast and exact", () => {
  const t0 = Date.now();
  const a = taylorCoefficients("1/(1+x^2)", 0, 12);
  assert.deepEqual(
    [...a].map((v) => v + 0),
    [1, 0, -1, 0, 1, 0, -1, 0, 1, 0, -1, 0, 1],
  );
  const b = taylorCoefficients("sin(x)*exp(x)/(1+x^2)", 0, 12);
  // sin x e^x = x + x^2 + x^3/3 - x^5/30 ...; times 1/(1+x^2): x + x^2 + (1/3-1)x^3 + (0-1)x^4 ...
  assert.ok(Math.abs((b[1] as number) - 1) < 1e-12 && Math.abs((b[2] as number) - 1) < 1e-12);
  assert.ok(Math.abs((b[3] as number) + 2 / 3) < 1e-12);
  assert.ok(Math.abs((b[4] as number) + 1) < 1e-12);
  assert.ok(Date.now() - t0 < 1000);
});

test("taylorCoefficients: jets agree with symbolic differentiation across functions", () => {
  for (const [src, x0] of [
    ["atan(x)", 0.3],
    ["sqrt(x)", 2],
    ["ln(x)*cos(x)", 1.5],
    ["x^2.5", 2],
    ["tanh(x)", 0.4],
    ["asin(x)", 0.2],
    ["2^x", 1],
  ] as const) {
    const a = taylorCoefficients(src, x0, 6);
    for (const h of [0.01]) {
      const f = Symbolic.compile(src);
      let s = 0;
      for (let k = 0; k <= 6; k++) s += (a[k] as number) * h ** k;
      assert.ok(Math.abs(s - f({ x: x0 + h })) < 1e-9, src);
    }
  }
});

test("taylorCoefficients: nodes without a jet rule fall back to symbolic differentiation (asinh)", () => {
  const a = taylorCoefficients("asinh(x)", 0, 5);
  assert.deepEqual(
    [...a].map((v) => Math.round(v * 1e9) / 1e9 + 0),
    [0, 1, 0, -1 / 6, 0, 3 / 40].map((v) => Math.round(v * 1e9) / 1e9),
  );
});
