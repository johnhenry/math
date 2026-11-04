import assert from "node:assert/strict";
import { test } from "node:test";
import {
  curve3Runs,
  sampleParametricSurface,
  sampleSpaceCurve,
  sampleSurface,
  sampleVectorField3,
} from "../src/index.ts";
import { SampleCancelledError } from "../src/sample.ts";

const D = { min: -1, max: 1 };

test("sampleSurface: plane z = x + y has exact positions, constant up normals, full triangulation", () => {
  const m = sampleSurface((x, y) => x + y, D, D, { columns: 5, rows: 4 });
  assert.equal(m.vertexCount, 20);
  assert.equal(m.indices.length, 4 * 3 * 2 * 3);
  assert.equal(m.positions[0], -1);
  assert.equal(m.positions[1], -1);
  assert.equal(m.positions[2], -2);
  const n = 1 / Math.sqrt(3);
  for (let v = 0; v < 20; v++) {
    assert.ok(Math.abs((m.normals[3 * v] as number) + n) < 1e-6);
    assert.ok(Math.abs((m.normals[3 * v + 1] as number) + n) < 1e-6);
    assert.ok(Math.abs((m.normals[3 * v + 2] as number) - n) < 1e-6);
  }
  assert.deepEqual(m.bounds, { min: [-1, -1, -2], max: [1, 1, 2] });
  assert.equal(m.progress.complete, true);
});

test("sampleSurface: triangles wind counter-clockwise seen from +z", () => {
  const m = sampleSurface(() => 0, D, D, { columns: 3, rows: 3 });
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]] as number[];
    const p = (i: number) => [m.positions[3 * i], m.positions[3 * i + 1]] as number[];
    const cross =
      ((p(b)[0] as number) - (p(a)[0] as number)) * ((p(c)[1] as number) - (p(a)[1] as number)) -
      ((p(b)[1] as number) - (p(a)[1] as number)) * ((p(c)[0] as number) - (p(a)[0] as number));
    assert.ok(cross > 0);
  }
});

test("sampleSurface: NaN/Infinity make holes, never spikes", () => {
  const m = sampleSurface((x, y) => 1 / (x * x + y * y), D, D, { columns: 5, rows: 5 }); // pole at the centre vertex
  const centre = 2 * 5 + 2;
  assert.equal(m.valid[centre], 0);
  assert.ok(Number.isNaN(m.positions[3 * centre + 2] as number));
  for (const i of m.indices) assert.notEqual(i, centre);
  for (const i of m.indices) assert.equal(m.valid[i], 1);
  for (const i of m.indices) assert.ok(Number.isFinite(m.positions[3 * i + 2] as number));
  // 8 triangles around the centre are gone or reduced, but the mesh is not empty
  assert.ok(m.indices.length > 0);
  assert.ok(m.indices.length < 4 * 4 * 2 * 3);
});

test("sampleSurface: zRange drops the huge finite shoulders of a pole", () => {
  const m = sampleSurface((x, y) => 1 / (x * x + y * y), D, D, { columns: 5, rows: 5, zRange: { min: -10, max: 10 } });
  assert.equal(m.valid[12], 0);
  for (const i of m.indices) assert.ok(Math.abs(m.positions[3 * i + 2] as number) <= 10);
});

test("sampleSurface: a single hole corner still keeps the other triangle of its quad", () => {
  const m = sampleSurface((x, y) => (x === -1 && y === -1 ? Number.NaN : 0), D, D, { columns: 2, rows: 2 });
  assert.equal(m.indices.length, 3);
  assert.deepEqual([...m.indices].sort(), [1, 2, 3]);
});

test("sampleSurface: cell budget stops at a row boundary and says where", () => {
  const m = sampleSurface((x, y) => x * y, D, D, { columns: 10, rows: 10, maxCells: 35 });
  assert.equal(m.rows, 3);
  assert.equal(m.vertexCount, 30);
  assert.deepEqual(m.progress, { rows: 3, of: 10, complete: false, reason: "cells" });
  assert.equal(m.indices.length, 2 * 9 * 2 * 3);
});

test("sampleSurface: time budget uses the injected clock", () => {
  let t = 0;
  const m = sampleSurface((x, y) => x + y, D, D, { columns: 4, rows: 8, maxMillis: 10, now: () => (t += 4) });
  assert.equal(m.progress.complete, false);
  assert.equal(m.progress.reason, "time");
  assert.ok(m.rows >= 1 && m.rows < 8);
});

test("sampleSurface: cancellation throws SampleCancelledError; bad input throws RangeError", () => {
  assert.throws(() => sampleSurface(() => 0, D, D, { isCancelled: () => true }), SampleCancelledError);
  assert.throws(() => sampleSurface(() => 0, { min: 1, max: 0 }, D), RangeError);
  assert.throws(() => sampleSurface(() => 0, D, D, { columns: 1 }), RangeError);
});

test("sampleParametricSurface: unit sphere has unit radius and outward-or-inward unit normals; poles stay finite", () => {
  const m = sampleParametricSurface(
    (u, v) => [Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)],
    { min: 0, max: 2 * Math.PI },
    { min: 0.2, max: Math.PI - 0.2 },
    { columns: 33, rows: 17 },
  );
  for (let k = 0; k < m.vertexCount; k++) {
    const [x, y, z] = [m.positions[3 * k], m.positions[3 * k + 1], m.positions[3 * k + 2]] as number[];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-6);
    const [nx, ny, nz] = [m.normals[3 * k], m.normals[3 * k + 1], m.normals[3 * k + 2]] as number[];
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-5);
    // parallel to the position (n = +-p)
    assert.ok(Math.abs(Math.abs(nx * x + ny * y + nz * z) - 1) < 2e-2); // coarse grid: central difference tilt
  }
});

test("sampleParametricSurface: a hole in any coordinate removes the vertex", () => {
  const m = sampleParametricSurface((u, v) => [u, v, u === 0 ? Number.POSITIVE_INFINITY : 0], D, D, {
    columns: 3,
    rows: 3,
  });
  for (let j = 0; j < 3; j++) assert.equal(m.valid[j * 3 + 1], 0);
});

test("sampleSpaceCurve: helix samples are exact and ordered", () => {
  const c = sampleSpaceCurve((t) => [Math.cos(t), Math.sin(t), t], { min: 0, max: 2 * Math.PI }, { samples: 101 });
  assert.equal(c.count, 101);
  assert.equal(c.positions[3 * 100 + 2], 2 * Math.PI);
  assert.deepEqual(curve3Runs(c), [[0, 101]]);
  assert.ok(c.progress.complete);
});

test("sampleSpaceCurve: non-finite points become single gaps; no leading, trailing or doubled gaps", () => {
  const c = sampleSpaceCurve(
    (t) => [t, 0, t < 0.2 || (t > 0.4 && t < 0.5) || t > 0.9 ? Number.NaN : 0],
    { min: 0, max: 1 },
    { samples: 11 },
  );
  const runs = curve3Runs(c);
  assert.ok(runs.length >= 1);
  assert.ok(!Number.isNaN(c.positions[0] as number));
  assert.ok(!Number.isNaN(c.positions[3 * (c.count - 1)] as number));
  for (let k = 1; k < c.count; k++)
    assert.ok(!(Number.isNaN(c.positions[3 * k] as number) && Number.isNaN(c.positions[3 * k - 3] as number)));
});

test("sampleSpaceCurve: maxStep cuts a jump", () => {
  const c = sampleSpaceCurve((t) => [t < 0.5 ? 0 : 100, 0, 0], { min: 0, max: 1 }, { samples: 10, maxStep: 5 });
  assert.equal(curve3Runs(c).length, 2);
});

test("sampleSpaceCurve: budget stops early", () => {
  const c = sampleSpaceCurve((t) => [t, t, t], { min: 0, max: 1 }, { samples: 1000, maxCells: 300 });
  assert.equal(c.progress.complete, false);
  assert.equal(c.progress.rows, 256);
});

test("sampleVectorField3: rotation field has exact vectors; non-finite points are skipped and counted", () => {
  const f = sampleVectorField3(
    (x, y, z) => [-y, x, z === 0 ? Number.NaN : 0],
    D,
    D,
    { min: 0, max: 1 },
    { grid: [3, 3, 2] },
  );
  assert.equal(f.count + f.skipped, 18);
  assert.equal(f.skipped, 9);
  assert.equal(f.count, 9);
  assert.equal(f.maxMagnitude, Math.SQRT2);
  // origin of first kept point is z = 1
  assert.deepEqual([...f.origins.slice(0, 3)], [-1, -1, 1]);
  assert.deepEqual([...f.vectors.slice(0, 3)], [1, -1, 0]);
  assert.ok(f.progress.complete);
});

test("sampleVectorField3: slab budget", () => {
  const f = sampleVectorField3(() => [1, 0, 0], D, D, D, { grid: 4, maxCells: 40 });
  assert.deepEqual(f.progress, { rows: 2, of: 4, complete: false, reason: "cells" });
  assert.equal(f.count, 32);
});

test("sampleParametricSurface: pole vertices that are valid still get a unit normal from a neighbouring row", () => {
  const m = sampleParametricSurface(
    (u, v) => [Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)],
    { min: 0, max: 2 * Math.PI },
    { min: 0, max: Math.PI },
    { columns: 9, rows: 5 },
  );
  for (let k = 0; k < m.vertexCount; k++) {
    assert.equal(m.valid[k], 1);
    assert.ok(
      Math.abs(
        Math.hypot(m.normals[3 * k] as number, m.normals[3 * k + 1] as number, m.normals[3 * k + 2] as number) - 1,
      ) < 1e-5,
      `vertex ${k}`,
    );
  }
});

test("sampleSurface: bounds are NaN when no vertex is valid", () => {
  const m = sampleSurface(() => Number.NaN, D, D, { columns: 3, rows: 3 });
  assert.ok(m.bounds.min.every(Number.isNaN));
  assert.ok(m.bounds.max.every(Number.isNaN));
});
