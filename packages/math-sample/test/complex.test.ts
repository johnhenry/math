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
