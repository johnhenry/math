import assert from "node:assert/strict";
import { test } from "node:test";
import { Distributions } from "../src/Distributions.ts";
import { MonteCarlo } from "../src/MonteCarlo.ts";
import { Rng } from "../src/Random.ts";

test("estimatePi is seeded and converges", () => {
  const a = MonteCarlo.estimatePi(100000, new Rng(42));
  const b = MonteCarlo.estimatePi(100000, new Rng(42));
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.piEstimate - Math.PI) < 0.02, `${a.piEstimate}`);
  assert.ok(a.points.length <= 6000 && a.points.length > 1000);
  assert.equal(a.convergence.length, 100);
  assert.equal(a.convergence.at(-1)?.estimate, a.piEstimate);
  assert.notEqual(
    MonteCarlo.estimatePi(1000, new Rng(1)).piEstimate,
    MonteCarlo.estimatePi(1000, new Rng(2)).piEstimate,
  );
  assert.throws(() => MonteCarlo.estimatePi(0, new Rng(1)), /positive integer/);
});

test("integrate: function integrand with a supplied reference value", () => {
  const r = MonteCarlo.integrate((x) => x * x, 0, 3, 200000, new Rng(7), { trueValue: 9 });
  assert.ok(Math.abs(r.estimate - 9) < (4 * r.errorBand) / 1.96 + 0.05, `${r.estimate}`);
  assert.equal(r.trueValue, 9);
  assert.ok((r.absoluteError as number) < 0.3);
  assert.ok(r.convergence[0].errorBand > (r.convergence.at(-1) as { errorBand: number }).errorBand, "band shrinks");
});

test("integrate: expression integrand reports the exact value", () => {
  const r = MonteCarlo.integrate("2*x", 0, 1, 50000, new Rng(3));
  assert.ok(Math.abs((r.trueValue as number) - 1) < 1e-9);
  assert.ok((r.absoluteError as number) < 0.02);
  assert.throws(() => MonteCarlo.integrate("x", 2, 1, 10, new Rng(1)), /Upper bound/);
  assert.throws(() => MonteCarlo.integrate("x", 0, 1, 1.5, new Rng(1)), /positive integer/);
});

test("integrate: deterministic for a constant integrand", () => {
  const r = MonteCarlo.integrate(() => 5, 1, 3, 100, new Rng(1));
  assert.equal(r.estimate, 10);
  assert.equal(r.errorBand, 0);
});

test("histogram bins every value, max lands in the last bin", () => {
  const bins = MonteCarlo.histogram([0, 1, 2, 3, 4, 5, 10], 5);
  assert.deepEqual(
    bins.map((b) => b.count),
    [2, 2, 2, 0, 1],
  );
  assert.equal(bins[0].x0, 0);
  assert.equal(bins[4].x1, 10);
  assert.equal(
    MonteCarlo.histogram([2, 2, 2], 3).reduce((s, b) => s + b.count, 0),
    3,
  );
});

test("centralLimit: means of exponentials concentrate at sd/sqrt(n)", () => {
  const rng = new Rng(5);
  const exp = Distributions.exponential(1, rng.next);
  const r = MonteCarlo.centralLimit(() => exp.sample(), 30, 4000);
  assert.ok(Math.abs(r.mean - 1) < 0.02);
  assert.ok(Math.abs(r.standardDeviation - 1 / Math.sqrt(30)) < 0.01);
  assert.equal(
    r.bins.reduce((s, b) => s + b.count, 0),
    4000,
  );
});

test("randomWalk steps by one along one axis, reproducibly", () => {
  for (const dims of [1, 2, 3]) {
    const w = MonteCarlo.randomWalk(500, new Rng(9), dims);
    assert.equal(w.length, 501);
    assert.deepEqual(w[0], new Array(dims).fill(0));
    for (let i = 1; i < w.length; i++) {
      const l1 = w[i].reduce((s, v, k) => s + Math.abs(v - w[i - 1][k]), 0);
      assert.equal(l1, 1);
    }
  }
  assert.deepEqual(MonteCarlo.randomWalk(50, new Rng(1), 2), MonteCarlo.randomWalk(50, new Rng(1), 2));
  assert.throws(() => MonteCarlo.randomWalk(5, new Rng(1), 4), /dimensions/);
});

test("bootstrap of the mean: standard error and interval bracket the truth", () => {
  const data = Distributions.normal(10, 2, new Rng(21).next).rvs(200);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const r = MonteCarlo.bootstrap(data, mean, new Rng(4), { resamples: 2000 });
  assert.ok(Math.abs(r.estimate - mean(data)) < 1e-12);
  assert.ok(Math.abs(r.standardError - 2 / Math.sqrt(200)) < 0.05);
  assert.ok(r.confidenceInterval[0] < r.estimate && r.estimate < r.confidenceInterval[1]);
  assert.equal(r.replicates.length, 2000);
  assert.deepEqual(r, MonteCarlo.bootstrap(data, mean, new Rng(4), { resamples: 2000 }));
  assert.throws(() => MonteCarlo.bootstrap([], mean, new Rng(1)), /non-empty/);
});
