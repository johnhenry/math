import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findCrossings,
  findDiscontinuities,
  findIntersections,
  findRoots,
  runsOf,
  SampleCancelledError,
  sampleAdaptive,
  sampleUniform,
  toPoints,
} from "../src/index.ts";

const dom = { min: -2, max: 2 };

test("sampleUniform returns Float64Arrays on an even grid including both endpoints", () => {
  const s = sampleUniform((x) => x * x, dom, 5);
  assert.ok(s.x instanceof Float64Array && s.y instanceof Float64Array);
  assert.deepEqual([...s.x], [-2, -1, 0, 1, 2]);
  assert.deepEqual([...s.y], [4, 1, 0, 1, 4]);
});

test("sampleUniform rejects bad domains and resolutions", () => {
  assert.throws(() => sampleUniform((x) => x, { min: 1, max: 1 }, 10), RangeError);
  assert.throws(() => sampleUniform((x) => x, { min: 0, max: Number.NaN }, 10), RangeError);
  assert.throws(() => sampleUniform((x) => x, dom, 1), RangeError);
  assert.throws(() => sampleUniform((x) => x, dom, 2.5), RangeError);
});

test("NaN / Infinity samples become a single NaN gap row, never connected", () => {
  const s = sampleUniform((x) => (x === 0 ? Number.NaN : 1 / x), { min: -1, max: 1 }, 5);
  // x = -1, -0.5, [0 -> gap], 0.5, 1
  assert.deepEqual([...s.x], [-1, -0.5, 0, 0.5, 1]);
  assert.ok(Number.isNaN(s.y[2]));
  assert.equal(runsOf(s).length, 2);
});

test("consecutive invalid samples collapse to one gap; leading/trailing gaps are trimmed", () => {
  const f = (x: number) => (x < 1 || x > 3 ? Number.NaN : x);
  const s = sampleUniform(f, { min: 0, max: 4 }, 9);
  assert.ok(Number.isFinite(s.y[0]), "first row is data");
  assert.ok(Number.isFinite(s.y[s.y.length - 1]), "last row is data");
  assert.equal(runsOf(s).length, 1);
  assert.equal(s.x[0], 1);
  assert.equal(s.x[s.x.length - 1], 3);
});

test("all-invalid input yields an empty result", () => {
  const s = sampleUniform(() => Number.NaN, dom, 10);
  assert.equal(s.x.length, 0);
  assert.equal(s.y.length, 0);
});

test("visibleYRange turns a pole's huge shoulders into a gap and bounds what remains", () => {
  const view = { min: -5, max: 5 };
  const s = sampleUniform(Math.tan, { min: -2, max: 2 }, 400, { visibleYRange: view });
  for (const y of s.y) if (!Number.isNaN(y)) assert.ok(Math.abs(y) <= 60, `y=${y}`);
  assert.equal(runsOf(s).length, 3, "the poles at +-pi/2 split the curve in three");
  const s2 = sampleUniform((x) => 1 / (x - 0.013), { min: -1, max: 1 }, 101, { visibleYRange: view });
  assert.equal(runsOf(s2).length, 2);
});

test("a curve leaving the view is capped with a point on the visible edge", () => {
  const view = { min: -1, max: 1 };
  // grid 0, 1, 2 gives y = 0.5, 90, 180; the exit crossing sits at 1 - 0.03 * 2
  const s = sampleUniform((x) => (x < 1 ? 0.5 * (1 - x) : 90 * x), { min: 0, max: 2 }, 3, { visibleYRange: view });
  assert.equal(s.x.length, 2, "the off-view tail is dropped; the exit is capped at the inset edge");
  assert.equal(s.y[0], 0.5);
  assert.ok(Math.abs(s.y[1] - 0.94) < 1e-12);
});

test("sampleAdaptive adds points only where the curve bends", () => {
  const flat = sampleAdaptive((x) => 2 * x + 1, dom, 20);
  assert.equal(flat.x.length, 20, "a line is never refined");
  const bent = sampleAdaptive((x) => Math.sin(10 * x), dom, 20);
  assert.ok(bent.x.length > 60);
  for (let i = 1; i < bent.x.length; i++) assert.ok(bent.x[i] > bent.x[i - 1], "x strictly increasing");
});

test("sampleAdaptive resolves a narrow spike a uniform grid straddles", () => {
  const spike = (x: number) => Math.exp(-((x - 0.15) ** 2) / 2e-3);
  const uni = sampleUniform(spike, { min: -1, max: 1 }, 21);
  const ada = sampleAdaptive(spike, { min: -1, max: 1 }, 21, { maxDepth: 6, tolerance: 1e-3 });
  assert.ok(Math.max(...uni.y) < 0.4);
  assert.ok(Math.max(...ada.y) > 0.9);
});

test("tolerance scales with the visible y-range by default", () => {
  const f = (x: number) => Math.sin(3 * x);
  const tight = sampleAdaptive(f, dom, 20, { visibleYRange: { min: -1, max: 1 } });
  const loose = sampleAdaptive(f, dom, 20, { visibleYRange: { min: -1e5, max: 1e5 } });
  assert.ok(tight.x.length > loose.x.length);
  assert.equal(loose.x.length, 20);
});

test("jump discontinuities (steps) break the curve instead of drawing a vertical line", () => {
  const step = (x: number) => (x < 0.3 ? 0 : 1);
  const s = sampleAdaptive(step, dom, 41, { visibleYRange: { min: -0.25, max: 1.25 } });
  const gaps = findDiscontinuities(s);
  assert.equal(gaps.length, 1);
  assert.ok(gaps[0].before.x <= 0.3 && gaps[0].after.x >= 0.3 - 1e-9);
  assert.ok(gaps[0].after.x - gaps[0].before.x < 0.2 / 8);
  // a smooth steep curve is NOT broken
  const steep = sampleAdaptive((x) => Math.tanh(20 * x), dom, 41, { visibleYRange: { min: -1.5, max: 1.5 } });
  assert.equal(findDiscontinuities(steep).length, 0);
});

test("findDiscontinuities reports both edges of each gap", () => {
  const s = sampleUniform((x) => (x === 0 ? Number.NaN : x), { min: -1, max: 1 }, 5);
  assert.deepEqual(findDiscontinuities(s), [{ before: { x: -0.5, y: -0.5 }, after: { x: 0.5, y: 0.5 } }]);
});

test("cancellation: AbortSignal-shaped and callback forms throw SampleCancelledError", () => {
  assert.throws(() => sampleUniform((x) => x, dom, 10_000, { signal: { aborted: true } }), SampleCancelledError);
  let calls = 0;
  assert.throws(
    () =>
      sampleAdaptive(Math.sin, dom, 10_000, {
        isCancelled: () => ++calls > 2,
      }),
    SampleCancelledError,
  );
  // a not-cancelled run is unaffected
  const ok = sampleUniform((x) => x, dom, 5000, { signal: { aborted: false }, isCancelled: () => false });
  assert.equal(ok.x.length, 5000);
});

test("findCrossings interpolates signed-distance sign changes, skipping gaps", () => {
  const s = sampleUniform((x) => x - 0.25, { min: -1, max: 1 }, 5);
  const c = findCrossings(s, (y) => y - 0.5);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0].x - 0.75) < 1e-12);
  const g = sampleUniform((x) => (x === 0 ? Number.NaN : x < 0 ? -1 : 1), { min: -1, max: 1 }, 5);
  assert.equal(findCrossings(g, (y) => y).length, 0, "a sign change across a gap is not a crossing");
});

test("findRoots polishes sign changes by bisection", () => {
  const r = findRoots((x) => x * x - 2, { min: -3, max: 3 });
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r[0] + Math.SQRT2) < 1e-10);
  assert.ok(Math.abs(r[1] - Math.SQRT2) < 1e-10);
  assert.equal(findRoots((x) => 1 / x, { min: -1, max: 1 }).length, 0, "a pole is not a root");
});

test("findIntersections finds crossings of two curves", () => {
  const p = findIntersections(
    (x) => x * x,
    (x) => 2 * x + 1,
    { min: -3, max: 4 },
  );
  assert.equal(p.length, 2);
  assert.ok(Math.abs(p[0].x - (1 - Math.SQRT2)) < 1e-10);
  assert.ok(Math.abs(p[1].y - (1 + Math.SQRT2) ** 2) < 1e-9);
});

test("toPoints converts to plain pairs with null y at gaps", () => {
  const s = sampleUniform((x) => (x === 0 ? Number.NaN : x), { min: -1, max: 1 }, 3);
  assert.deepEqual(toPoints(s), [
    [-1, -1],
    [0, null],
    [1, 1],
  ]);
});
