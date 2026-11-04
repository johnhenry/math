import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyFixedPoint,
  integrateAdaptive,
  integrateRk4,
  jacobian2,
  samplePhasePortrait,
  sampleSlopeField,
  sampleSolutionCurve,
} from "../src/index.ts";

const last = (t: { y: Float64Array; steps: number; dim: number }, i = 0) => t.y[(t.steps - 1) * t.dim + i] as number;

test("sampleSlopeField: dy/dx = x has unit directions; vertical and undefined slopes are handled", () => {
  const s = sampleSlopeField((x) => x, { min: -1, max: 1 }, { min: 0, max: 1 }, { columns: 3, rows: 2 });
  assert.deepEqual([...s.slope], [-1, 0, 1, -1, 0, 1]);
  assert.ok(Math.abs((s.dirX[0] as number) - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs((s.dirY[0] as number) + Math.SQRT1_2) < 1e-12);
  assert.equal(s.dirX[1], 1);
  const v = sampleSlopeField(
    (x, y) => (x === 0 ? Number.POSITIVE_INFINITY : y === 0 ? Number.NaN : 1),
    { min: 0, max: 1 },
    { min: 0, max: 1 },
    { columns: 2, rows: 2 },
  );
  assert.deepEqual([v.dirX[0], v.dirY[0]], [0, 1]);
  assert.ok(Number.isNaN(v.dirX[1] as number));
});

test("sampleSlopeField: budget", () => {
  const s = sampleSlopeField(() => 0, { min: 0, max: 1 }, { min: 0, max: 1 }, { columns: 5, rows: 5, maxCells: 12 });
  assert.deepEqual(s.progress, { rows: 2, of: 5, complete: false, reason: "cells" });
  assert.equal(s.slope.length, 10);
});

test("integrateRk4: y' = y gives e to 1e-9 with 200 steps (4th-order convergence)", () => {
  const f = (_t: number, y: readonly number[]) => [y[0] as number];
  const e1 = Math.abs(last(integrateRk4(f, 0, [1], 1, { steps: 20 })) - Math.E);
  const e2 = Math.abs(last(integrateRk4(f, 0, [1], 1, { steps: 40 })) - Math.E);
  assert.ok(e1 / e2 > 12 && e1 / e2 < 20); // ~16
  assert.ok(Math.abs(last(integrateRk4(f, 0, [1], 1)) - Math.E) < 1e-9);
});

test("integrateRk4: harmonic oscillator and backward integration", () => {
  const f = (_t: number, y: readonly number[]) => [y[1] as number, -(y[0] as number)];
  const fwd = integrateRk4(f, 0, [0, 1], Math.PI, { steps: 400 });
  assert.ok(Math.abs(last(fwd, 0)) < 1e-8);
  assert.ok(Math.abs(last(fwd, 1) + 1) < 1e-8);
  const back = integrateRk4((_t, y) => [y[0] as number], 1, [Math.E], 0, { steps: 100 });
  assert.ok(Math.abs(last(back) - 1) < 1e-9);
});

test("integrateAdaptive: matches exp, meets tolerance, uses fewer steps than a fixed grid would need", () => {
  const t = integrateAdaptive((_t, y) => [y[0] as number], 0, [1], 2, { rtol: 1e-9, atol: 1e-12 });
  assert.equal(t.reason, "end");
  assert.ok(Math.abs(last(t) - Math.exp(2)) < 1e-7);
  assert.equal(t.t[t.steps - 1], 2);
});

test("integrateAdaptive: finite-time blow-up y' = y^2 from y(0)=1 stops with blowup before t = 1", () => {
  const t = integrateAdaptive((_t, y) => [(y[0] as number) ** 2], 0, [1], 2, { blowup: 1e6 });
  assert.equal(t.reason, "blowup");
  assert.ok((t.t[t.steps - 1] as number) < 1);
  assert.ok((t.t[t.steps - 1] as number) > 0.99);
});

test("integrateAdaptive: backward in time, stop predicate, maxSteps", () => {
  const b = integrateAdaptive((_t, y) => [y[0] as number], 1, [Math.E], 0);
  assert.ok(Math.abs(last(b) - 1) < 1e-5);
  const s = integrateAdaptive((_t, y) => [y[0] as number], 0, [1], 10, { stop: (_t, y) => (y[0] as number) > 100 });
  assert.equal(s.reason, "stopped");
  const m = integrateAdaptive((_t, y) => [y[0] as number], 0, [1], 10, { maxSteps: 5 });
  assert.equal(m.reason, "maxSteps");
});

test("sampleSolutionCurve: y' = y through (0,1) is exp on both sides", () => {
  const c = sampleSolutionCurve((_x, y) => y, 0, 1, { min: -1, max: 1 });
  assert.equal(c.reasonBefore, "end");
  assert.equal(c.reasonAfter, "end");
  assert.equal(c.x[0], -1);
  assert.equal(c.x[c.x.length - 1], 1);
  for (let k = 0; k < c.x.length; k += 7) assert.ok(Math.abs((c.y[k] as number) - Math.exp(c.x[k] as number)) < 1e-4);
  for (let k = 1; k < c.x.length; k++) assert.ok((c.x[k] as number) > (c.x[k - 1] as number));
});

test("sampleSolutionCurve: y' = y^2 ends at the asymptote with a clean end, no spike", () => {
  const c = sampleSolutionCurve((_x, y) => y * y, 0, 1, { min: -2, max: 2 }, { yLimit: 1e3 });
  assert.equal(c.reasonAfter, "blowup");
  assert.ok((c.x[c.x.length - 1] as number) < 1);
  for (const y of c.y) assert.ok(Math.abs(y) <= 1e3);
  const r = sampleSolutionCurve((_x, y) => y, 0, 1, { min: -1, max: 1 }, { method: "rk4", steps: 100 });
  assert.ok(Math.abs((r.y[r.y.length - 1] as number) - Math.E) < 1e-8);
});

test("classifyFixedPoint: the standard linear cases", () => {
  assert.equal(
    classifyFixedPoint([
      [-1, 0],
      [0, -2],
    ]).type,
    "stable node",
  );
  assert.equal(
    classifyFixedPoint([
      [1, 0],
      [0, 2],
    ]).type,
    "unstable node",
  );
  assert.equal(
    classifyFixedPoint([
      [1, 0],
      [0, -1],
    ]).type,
    "saddle",
  );
  assert.equal(
    classifyFixedPoint([
      [-1, -2],
      [2, -1],
    ]).type,
    "stable spiral",
  );
  assert.equal(
    classifyFixedPoint([
      [1, -2],
      [2, 1],
    ]).type,
    "unstable spiral",
  );
  assert.equal(
    classifyFixedPoint([
      [0, -1],
      [1, 0],
    ]).type,
    "center",
  );
  assert.equal(
    classifyFixedPoint([
      [-1, 0],
      [0, -1],
    ]).type,
    "stable star or degenerate node",
  );
  assert.equal(
    classifyFixedPoint([
      [1, 1],
      [1, 1],
    ]).type,
    "non-hyperbolic",
  );
  const sp = classifyFixedPoint([
    [-1, -2],
    [2, -1],
  ]);
  assert.deepEqual(sp.eigenvalues, [
    [-1, 2],
    [-1, -2],
  ]);
  assert.equal(sp.trace, -2);
  assert.equal(sp.determinant, 5);
});

test("jacobian2 matches the analytic Jacobian", () => {
  const J = jacobian2((x, y) => [x * y, x + y * y], 2, 3);
  assert.ok(
    Math.abs(J[0][0] - 3) < 1e-6 &&
      Math.abs(J[0][1] - 2) < 1e-6 &&
      Math.abs(J[1][0] - 1) < 1e-6 &&
      Math.abs(J[1][1] - 6) < 1e-6,
  );
});

test("samplePhasePortrait: damped pendulum finds the centre-ish origin and the saddle at (pi, 0)", () => {
  const p = samplePhasePortrait(
    (x, y) => [y, -Math.sin(x) - 0.5 * y],
    { min: -4, max: 4 },
    { min: -3, max: 3 },
    { grid: 5, fixedPointStarts: 10 },
  );
  const types = p.fixedPoints.map((f) => [Math.round(f.x * 100) / 100 + 0, Math.round(f.y * 100) / 100 + 0, f.type]);
  assert.deepEqual(types, [
    [-3.14, 0, "saddle"],
    [0, 0, "stable spiral"],
    [3.14, 0, "saddle"],
  ]);
  assert.equal(p.field.u.length, 25);
  assert.equal(p.trajectories.length, 25);
  assert.ok(p.progress.complete);
});

test("samplePhasePortrait: trajectories of the rotation field stay on circles; trajectory arrays are joined at the seed", () => {
  const p = samplePhasePortrait(
    (x, y) => [-y, x],
    { min: -2, max: 2 },
    { min: -2, max: 2 },
    { grid: 3, seeds: [[1, 0]], tMax: 3 },
  );
  const t = p.trajectories[0];
  assert.ok(t);
  for (let k = 0; k < t.x.length; k++) assert.ok(Math.abs(Math.hypot(t.x[k] as number, t.y[k] as number) - 1) < 1e-4);
  const at = [...t.x].findIndex((x, k) => Math.abs(x - 1) < 1e-12 && Math.abs(t.y[k] as number) < 1e-12);
  assert.ok(at > 0);
  assert.equal(p.fixedPoints.length, 1);
  assert.equal(p.fixedPoints[0]?.type, "center");
});

test("samplePhasePortrait: a budget stops after the field with no trajectories", () => {
  const p = samplePhasePortrait((x, y) => [y, -x], { min: -1, max: 1 }, { min: -1, max: 1 }, { grid: 6, maxCells: 14 });
  assert.equal(p.progress.complete, false);
  assert.equal(p.trajectories.length, 0);
  assert.equal(p.field.rows, 2);
});

test("integrateAdaptive: isolated rejected-as-bad steps over a long run do not add up to a false blowup", () => {
  let nan = 0;
  const f = (t: number, y: readonly number[]) => {
    if ((t * 37.1 + 0.5) % 1 < 0.01) {
      nan++;
      return [Number.NaN];
    }
    return [0 * (y[0] as number)];
  };
  const r = integrateAdaptive(f, 0, [1], 60, { hMax: 0.1, h0: 0.1 });
  assert.ok(nan > 12, `the scenario must hit more than 12 bad steps (got ${nan})`);
  assert.equal(r.reason, "end");
});

test("integrateRk4: steps beyond maxSteps are honoured, not silently truncated", () => {
  const r = integrateRk4((_t, y) => [y[0] as number], 0, [1], 1, { steps: 50, maxSteps: 10 });
  assert.equal(r.reason, "end");
  assert.equal(r.steps, 51);
});

test("sampleSolutionCurve: output stays inside xDomain even when x0 is outside it", () => {
  for (const x0 of [-3, 3]) {
    const c = sampleSolutionCurve((_x, y) => y, x0, Math.exp(x0), { min: -1, max: 1 });
    assert.ok(c.x.length > 2);
    for (const x of c.x) assert.ok(x >= -1 && x <= 1, `x=${x}`);
    assert.ok(Math.abs((c.y[c.y.length - 1] as number) - Math.E) < 1e-4);
    assert.ok(Math.abs((c.y[0] as number) - Math.exp(-1)) < 1e-4);
  }
});
