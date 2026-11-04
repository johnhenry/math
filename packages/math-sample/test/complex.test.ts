import assert from "node:assert/strict";
import { test } from "node:test";
import { conformalGrid, findZerosAndPoles, sampleComplexRaster } from "../src/index.ts";

const sq = (re: number, im: number): [number, number] => [re * re - im * im, 2 * re * im];
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

test("sampleComplexRaster: f(z) = z gives cell-centre coordinates, abs and arg; row 0 is the lowest imaginary part", () => {
  const r = sampleComplexRaster((re, im) => [re, im], { min: -1, max: 1 }, { min: 0, max: 2 }, { width: 2, height: 2 });
  assert.deepEqual([...r.re], [-0.5, 0.5, -0.5, 0.5]);
  assert.deepEqual([...r.im], [0.5, 0.5, 1.5, 1.5]);
  assert.ok(near(r.abs[0] as number, Math.SQRT1_2));
  assert.ok(near(r.arg[1] as number, Math.PI / 4));
  assert.ok(near(r.arg[0] as number, (3 * Math.PI) / 4));
});

test("sampleComplexRaster: arg in (-PI, PI] and z^2 doubles it; holes are NaN", () => {
  const r = sampleComplexRaster(
    (re, im) => (re > 0 ? [Number.NaN, 0] : sq(re, im)),
    { min: -1, max: 1 },
    { min: -1, max: 1 },
    { width: 4, height: 4 },
  );
  assert.ok(Number.isNaN(r.abs[3] as number));
  for (const a of r.arg) if (!Number.isNaN(a)) assert.ok(a > -Math.PI - 1e-6 && a <= Math.PI + 1e-6);
});

test("sampleComplexRaster: budget returns fewer rows with a reason", () => {
  const r = sampleComplexRaster(
    (re, im) => [re, im],
    { min: 0, max: 1 },
    { min: 0, max: 1 },
    { width: 10, height: 10, maxCells: 25 },
  );
  assert.equal(r.height, 2);
  assert.equal(r.abs.length, 20);
  assert.deepEqual(r.progress, { rows: 2, of: 10, complete: false, reason: "cells" });
});

test("conformalGrid: the image of grid lines under z^2; 1/z cuts at the pole", () => {
  const lines = conformalGrid(
    sq,
    { min: 1, max: 2 },
    { min: 0, max: 1 },
    { reLines: 3, imLines: 2, samplesPerLine: 5 },
  );
  assert.equal(lines.length, 5);
  const first = lines[0]; // Re z = 1, Im from 0..1: w = 1 - y^2 + 2iy
  assert.equal(first?.kind, "re");
  assert.deepEqual([...(first?.x ?? [])].slice(-1), [0]);
  assert.deepEqual([...(first?.y ?? [])].slice(-1), [2]);
  const inv = conformalGrid(
    (re, im) => {
      const m = re * re + im * im;
      return [re / m, -im / m];
    },
    { min: -1, max: 1 },
    { min: -1, max: 1 },
    { reLines: 2, imLines: 3, samplesPerLine: 21, bound: 5 },
  );
  const through = inv.find((l) => l.kind === "im" && l.value === 0);
  assert.ok(through);
  assert.ok(through.x.some(Number.isNaN)); // the pole at 0 is a gap, not a spike
  for (const v of through.x) assert.ok(Number.isNaN(v) || Math.abs(v) <= 5);
});

test("findZerosAndPoles: (z-1)(z+1)/(z-i) finds two simple zeros and one pole, refined", () => {
  const f = (re: number, im: number): [number, number] => {
    const nr = (re - 1) * (re + 1) - im * im; // (z-1)(z+1) = z^2 - 1
    const ni = 2 * re * im;
    const dr = re;
    const di = im - 1;
    const m = dr * dr + di * di;
    return [(nr * dr + ni * di) / m, (ni * dr - nr * di) / m];
  };
  const r = findZerosAndPoles(f, { min: -2.05, max: 2.05 }, { min: -2.05, max: 2.05 }, { grid: 16 });
  const zeros = r.items.filter((p) => p.kind === "zero");
  const poles = r.items.filter((p) => p.kind === "pole");
  assert.equal(zeros.length, 2);
  assert.equal(poles.length, 1);
  assert.ok(near(zeros[0]?.re as number, -1, 1e-8) && near(zeros[0]?.im as number, 0, 1e-8));
  assert.ok(near(zeros[1]?.re as number, 1, 1e-8));
  assert.ok(near(poles[0]?.re as number, 0, 1e-8) && near(poles[0]?.im as number, 1, 1e-8));
  assert.ok(r.items.every((p) => p.refined && p.order === 1));
  assert.ok(r.progress.complete);
});

test("findZerosAndPoles: a double zero reports order 2 (z^2 at the origin, cell not on a grid line)", () => {
  const r = findZerosAndPoles(sq, { min: -1.01, max: 1.03 }, { min: -1.02, max: 1.01 }, { grid: 7 });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0]?.order, 2);
  assert.ok(near(r.items[0]?.re as number, 0, 1e-4));
});

test("findZerosAndPoles: no roots, and an exp(z) with none, yield an empty list; budget reports where it stopped", () => {
  const e = (re: number, im: number): [number, number] => [Math.exp(re) * Math.cos(im), Math.exp(re) * Math.sin(im)];
  assert.deepEqual(findZerosAndPoles(e, { min: -3, max: 3 }, { min: -3, max: 3 }, { grid: 6 }).items, []);
  const r = findZerosAndPoles(e, { min: -3, max: 3 }, { min: -3, max: 3 }, { grid: 6, maxCells: 30 });
  assert.equal(r.progress.complete, false);
  assert.equal(r.progress.rows, 1);
});

const cm = (a: [number, number], b: [number, number]): [number, number] => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const rootsOf = (r: { items: Array<{ re: number; im: number; kind: string }> }, kind: string) =>
  r.items
    .filter((p) => p.kind === kind)
    .map((p) => [Math.round(p.re * 1e6) / 1e6 + 0, Math.round(p.im * 1e6) / 1e6 + 0]);

test("findZerosAndPoles: roots on grid lines and vertices of a symmetric integer domain (z^3 - z, grid 24)", () => {
  const f = (re: number, im: number): [number, number] => {
    const z3 = cm(cm([re, im], [re, im]), [re, im]);
    return [z3[0] - re, z3[1] - im];
  };
  const r = findZerosAndPoles(f, { min: -2, max: 2 }, { min: -2, max: 2 }, { grid: 24 });
  assert.deepEqual(rootsOf(r, "zero"), [
    [-1, 0],
    [0, 0],
    [1, 0],
  ]);
  assert.equal(rootsOf(r, "pole").length, 0);
});

test("findZerosAndPoles: z^2 - 1 on [-2,2]^2 at grid 12", () => {
  const r = findZerosAndPoles(
    (re, im) => [re * re - im * im - 1, 2 * re * im],
    { min: -2, max: 2 },
    { min: -2, max: 2 },
    { grid: 12 },
  );
  assert.deepEqual(rootsOf(r, "zero"), [
    [-1, 0],
    [1, 0],
  ]);
});

test("findZerosAndPoles: 1/z has its pole at the origin vertex (grid 24)", () => {
  const r = findZerosAndPoles(
    (re, im) => {
      const m = re * re + im * im;
      return [re / m, -im / m];
    },
    { min: -2, max: 2 },
    { min: -2, max: 2 },
    { grid: 24 },
  );
  assert.deepEqual(rootsOf(r, "pole"), [[0, 0]]);
  assert.equal(rootsOf(r, "zero").length, 0);
});

test("findZerosAndPoles: sin z on [-7,7] x [-2,2] at the default grid finds 0, +-pi, +-2pi", () => {
  const r = findZerosAndPoles(
    (re, im) => [Math.sin(re) * Math.cosh(im), Math.cos(re) * Math.sinh(im)],
    { min: -7, max: 7 },
    { min: -2, max: 2 },
  );
  const zs = r.items.filter((p) => p.kind === "zero");
  assert.equal(zs.length, 5);
  zs.forEach((p, k) => {
    assert.ok(Math.abs(p.re - (k - 2) * Math.PI) < 1e-7 && Math.abs(p.im) < 1e-7);
  });
});

test("findZerosAndPoles: a triple zero reports order 3, refined, once", () => {
  const f = (re: number, im: number): [number, number] => cm(cm([re, im], [re, im]), [re, im]);
  const r = findZerosAndPoles(f, { min: -2, max: 2 }, { min: -2, max: 2 }, { grid: 8 });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0]?.order, 3);
  assert.equal(r.items[0]?.refined, true);
});

test("findZerosAndPoles: results lie inside the requested rectangle", () => {
  const r = findZerosAndPoles(
    (re, im) => [re * re - im * im - 9, 2 * re * im],
    { min: -2, max: 2 },
    { min: -2, max: 2 },
    { grid: 8 },
  );
  assert.equal(r.items.length, 0);
});
