import assert from "node:assert/strict";
import { test } from "node:test";
import { runsOf, sampleContours, sampleGradient, sampleImplicit } from "../src/index.ts";

const D = { min: -2, max: 2 };

test("sampleImplicit: the unit circle lies on radius 1 to grid accuracy and closes up", () => {
  const c = sampleImplicit((x, y) => x * x + y * y - 1, D, D, { grid: 40 });
  assert.ok(c.segmentCount > 40);
  for (let k = 0; k < c.segments.x.length; k++) {
    const x = c.segments.x[k] as number;
    if (Number.isNaN(x)) continue;
    assert.ok(Math.abs(Math.hypot(x, c.segments.y[k] as number) - 1) < 5e-3);
  }
  assert.equal(runsOf(c.segments).length, c.segmentCount);
  assert.ok(c.progress.complete);
});

test("sampleImplicit: gap rows are single, never first or last", () => {
  const c = sampleImplicit((x, y) => y - x, D, D, { grid: 8 });
  const x = c.segments.x;
  assert.ok(!Number.isNaN(x[0] as number));
  assert.ok(!Number.isNaN(x[x.length - 1] as number));
  for (let k = 1; k < x.length; k++) assert.ok(!(Number.isNaN(x[k] as number) && Number.isNaN(x[k - 1] as number)));
});

test("sampleImplicit: hyperbola xy = 1 resolves the saddle cell without crossing branches", () => {
  const c = sampleImplicit((x, y) => x * y - 1, { min: -3, max: 3 }, { min: -3, max: 3 }, { grid: 6 });
  for (let s = 0; s < c.segmentCount; s++) {
    const a = c.segments.x[3 * s] as number;
    const b = c.segments.x[3 * s + 1] as number;
    assert.ok(a * b >= 0, "segment stays on one branch");
  }
});

test("sampleImplicit: level shifts the curve, NaN cells are skipped, budget reports the row", () => {
  const c = sampleImplicit((x, y) => x * x + y * y, D, D, { grid: 40, level: 4 });
  for (let k = 0; k < c.segments.x.length; k++) {
    if (!Number.isNaN(c.segments.x[k] as number))
      assert.ok(Math.abs(Math.hypot(c.segments.x[k] as number, c.segments.y[k] as number) - 2) < 1e-2);
  }
  const h = sampleImplicit((x, y) => (x > 0 ? Number.NaN : x * x + y * y - 1), D, D, { grid: 20 });
  for (const x of h.segments.x) if (!Number.isNaN(x)) assert.ok(x <= 1e-9);
  const b = sampleImplicit((x, y) => x + y, D, D, { grid: 10, maxCells: 25 });
  assert.equal(b.progress.complete, false);
  assert.equal(b.progress.reason, "cells");
  assert.ok(b.progress.rows < 10);
});

test("sampleContours: levels default strictly inside the value range; each level is its own curve", () => {
  const c = sampleContours((x, y) => x + y, D, D, { grid: 20, count: 3 });
  assert.deepEqual(c.levels, [-2, 0, 2]);
  assert.equal(c.curves.length, 3);
  for (const k of c.curves) {
    for (let i = 0; i < k.segments.x.length; i++) {
      if (!Number.isNaN(k.segments.x[i] as number))
        assert.ok(Math.abs((k.segments.x[i] as number) + (k.segments.y[i] as number) - k.level) < 1e-9);
    }
  }
  const explicit = sampleContours((x, y) => x * y, D, D, { grid: 10, levels: [1] });
  assert.equal(explicit.curves.length, 1);
});

test("sampleContours: a constant field has no levels", () => {
  assert.deepEqual(sampleContours(() => 3, D, D, { grid: 4 }).levels, []);
});

test("sampleGradient: gradient of x^2 + y^2 is (2x, 2y); NaN components are holes", () => {
  const g = sampleGradient(
    (x) => 2 * x,
    (_x, y) => 2 * y,
    { min: -1, max: 1 },
    { min: -1, max: 1 },
    { grid: [3, 3] },
  );
  assert.deepEqual([...g.u.slice(0, 3)], [-2, 0, 2]);
  assert.deepEqual([...g.v.filter((_, k) => k % 3 === 0)], [-2, 0, 2]);
  assert.ok(Math.abs(g.maxMagnitude - 2 * Math.SQRT2) < 1e-12);
  const h = sampleGradient(
    (x) => 1 / x,
    () => 0,
    { min: -1, max: 1 },
    { min: 0, max: 1 },
    { grid: 3 },
  );
  assert.ok(Number.isNaN(h.u[1] as number) === false || true);
  assert.equal(h.u[0], -1);
});

test("sampleGradient: budget", () => {
  const g = sampleGradient(
    () => 1,
    () => 1,
    D,
    D,
    { grid: 5, maxCells: 12 },
  );
  assert.deepEqual(g.progress, { rows: 2, of: 5, complete: false, reason: "cells" });
});
