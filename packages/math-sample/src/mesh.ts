import { assertCount, assertRange, type Budget, type Cancellable, Meter, type Progress, progress } from "./budget.ts";
import type { Domain } from "./sample.ts";

/**
 * Triangle mesh as typed arrays, ready for a GPU buffer.
 *
 * - `positions` and `normals` hold `vertexCount * 3` floats (x, y, z per vertex).
 * - `indices` holds triangles (3 per triangle), counter-clockwise seen from the side the normals point to.
 * - A grid vertex whose position is not finite (or is outside `zRange`) is a hole: its position is `NaN`, its normal
 *   is `0, 0, 0`, `valid[v]` is 0, and no triangle references it, so a hole never produces a spike.
 * - `bounds` covers the valid vertices only (`NaN`s if there are none).
 * - `columns` x `rows` is the vertex grid (vertex `(i, j)` is `j * columns + i`), for callers that want to build wireframes.
 */
export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  valid: Uint8Array;
  vertexCount: number;
  columns: number;
  rows: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  progress: Progress;
}

export interface MeshOptions extends Budget, Cancellable {
  /** Vertices along the first parameter (x or u). Default 64. */
  columns?: number;
  /** Vertices along the second parameter (y or v). Default 64. */
  rows?: number;
  /** Vertices with z outside this range are holes (a pole's huge finite shoulders). `z = f(x, y)` only. */
  zRange?: { min: number; max: number };
}

export type Fn2 = (x: number, y: number) => number;
export type ParametricSurfaceFn = (u: number, v: number) => readonly [number, number, number];
export type CurveFn3 = (t: number) => readonly [number, number, number];
export type VectorFn3 = (x: number, y: number, z: number) => readonly [number, number, number];

const fin = (a: number, b: number, c: number) => Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c);

function build(
  evalAt: (u: number, v: number) => readonly [number, number, number],
  uDom: Domain,
  vDom: Domain,
  options: MeshOptions,
  rangeZ: MeshOptions["zRange"],
  flip: boolean,
): Mesh {
  const columns = options.columns ?? 64;
  const rows = options.rows ?? 64;
  assertCount("columns", columns);
  assertCount("rows", rows);
  assertRange("u domain", uDom);
  assertRange("v domain", vDom);
  const meter = new Meter(options, options);
  const pos = new Float64Array(columns * rows * 3).fill(Number.NaN);
  const ok = new Uint8Array(columns * rows);
  let done = 0;
  let reason: "cells" | "time" | undefined;
  for (let j = 0; j < rows; j++) {
    reason = meter.check(columns);
    if (reason) break;
    const v = j === rows - 1 ? vDom.max : vDom.min + ((vDom.max - vDom.min) * j) / (rows - 1);
    for (let i = 0; i < columns; i++) {
      const u = i === columns - 1 ? uDom.max : uDom.min + ((uDom.max - uDom.min) * i) / (columns - 1);
      const p = evalAt(u, v);
      const k = j * columns + i;
      if (fin(p[0], p[1], p[2]) && !(rangeZ && (p[2] < rangeZ.min || p[2] > rangeZ.max))) {
        pos[3 * k] = p[0];
        pos[3 * k + 1] = p[1];
        pos[3 * k + 2] = p[2];
        ok[k] = 1;
      }
    }
    meter.spend(columns);
    done++;
  }
  const usedRows = done;
  const vertexCount = columns * usedRows;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const valid = ok.slice(0, vertexCount);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < vertexCount; k++) {
    for (let c = 0; c < 3; c++) {
      const val = pos[3 * k + c] as number;
      positions[3 * k + c] = val;
      if (valid[k]) {
        if (val < (min[c] as number)) min[c] = val;
        if (val > (max[c] as number)) max[c] = val;
      }
    }
  }
  // normals: cross of central/one-sided differences over valid neighbours
  const at = (i: number, j: number) => 3 * (j * columns + i);
  const isOk = (i: number, j: number) =>
    i >= 0 && i < columns && j >= 0 && j < usedRows && valid[j * columns + i] === 1;
  for (let j = 0; j < usedRows; j++) {
    for (let i = 0; i < columns; i++) {
      if (!isOk(i, j)) continue;
      const iA = isOk(i - 1, j) ? i - 1 : i;
      const iB = isOk(i + 1, j) ? i + 1 : i;
      const jA = isOk(i, j - 1) ? j - 1 : j;
      const jB = isOk(i, j + 1) ? j + 1 : j;
      const du = [0, 1, 2].map((c) => (pos[at(iB, j) + c] as number) - (pos[at(iA, j) + c] as number));
      const dv = [0, 1, 2].map((c) => (pos[at(i, jB) + c] as number) - (pos[at(i, jA) + c] as number));
      let nx = (du[1] as number) * (dv[2] as number) - (du[2] as number) * (dv[1] as number);
      let ny = (du[2] as number) * (dv[0] as number) - (du[0] as number) * (dv[2] as number);
      let nz = (du[0] as number) * (dv[1] as number) - (du[1] as number) * (dv[0] as number);
      const len = Math.hypot(nx, ny, nz);
      if (len > 0 && Number.isFinite(len)) {
        const s = (flip ? -1 : 1) / len;
        nx *= s;
        ny *= s;
        nz *= s;
        const o = at(i, j);
        normals[o] = nx;
        normals[o + 1] = ny;
        normals[o + 2] = nz;
      }
    }
  }
  // valid vertices with a degenerate normal (the poles of a sphere parameterisation): borrow from a neighbour
  for (let j = 0; j < usedRows; j++) {
    for (let i = 0; i < columns; i++) {
      const o = at(i, j);
      if (!isOk(i, j) || normals[o] !== 0 || normals[o + 1] !== 0 || normals[o + 2] !== 0) continue;
      for (const [di, dj] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
        [0, 2],
        [0, -2],
      ] as const) {
        if (!isOk(i + di, j + dj)) continue;
        const q = at(i + di, j + dj);
        if (normals[q] !== 0 || normals[q + 1] !== 0 || normals[q + 2] !== 0) {
          normals[o] = normals[q] as number;
          normals[o + 1] = normals[q + 1] as number;
          normals[o + 2] = normals[q + 2] as number;
          break;
        }
      }
    }
  }
  if (!valid.some((x) => x === 1)) {
    for (let c = 0; c < 3; c++) {
      min[c] = Number.NaN;
      max[c] = Number.NaN;
    }
  }
  const tri: number[] = [];
  for (let j = 0; j + 1 < usedRows; j++) {
    for (let i = 0; i + 1 < columns; i++) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      const [va, vb, vc, vd] = [valid[a], valid[b], valid[c], valid[d]];
      // counter-clockwise in (u, v): a, b, d and a, d, c
      if (va && vb && vd) tri.push(a, b, d);
      if (va && vd && vc) tri.push(a, d, c);
      // a quad with exactly one hole corner still yields its one good triangle via the complementary split
      if (!(va && vb && vd) && !(va && vd && vc)) {
        if (va && vb && vc) tri.push(a, b, c);
        else if (vb && vd && vc) tri.push(b, d, c);
      }
    }
  }
  return {
    positions,
    normals,
    indices: Uint32Array.from(tri),
    valid,
    vertexCount,
    columns,
    rows: usedRows,
    bounds: { min, max },
    progress: progress(usedRows, rows, reason),
  };
}

/**
 * Sample the surface `z = f(x, y)` on a regular grid. Normals point up (`+z` side). Non-finite values, and
 * values outside `options.zRange`, become holes. When the budget ends early, `rows` is the number of grid
 * rows built and `progress` says why.
 */
export function sampleSurface(f: Fn2, xDomain: Domain, yDomain: Domain, options: MeshOptions = {}): Mesh {
  return build((x, y) => [x, y, f(x, y)], xDomain, yDomain, options, options.zRange, false);
}

/**
 * Sample a parametric surface `(u, v) -> [x, y, z]`. Normals are `dP/du x dP/dv`, so swap the parameters (or
 * negate a component) to flip them. Any non-finite coordinate makes the vertex a hole.
 */
export function sampleParametricSurface(
  f: ParametricSurfaceFn,
  uDomain: Domain,
  vDomain: Domain,
  options: MeshOptions = {},
): Mesh {
  return build(f, uDomain, vDomain, { ...options, zRange: undefined }, undefined, false);
}

export interface Curve3 {
  /** `count * 3` doubles. A gap row is `NaN, NaN, NaN`; gaps are never first, last or adjacent to another gap. */
  positions: Float64Array;
  /** The parameter value of each row. */
  t: Float64Array;
  count: number;
  progress: Progress;
}

export interface CurveOptions extends Budget, Cancellable {
  /** Samples. Default 512. */
  samples?: number;
  /** Segments longer than this (Euclidean) become gaps, which cuts a curve at a jump. Default: no limit. */
  maxStep?: number;
}

/** Sample a space curve `t -> [x, y, z]`; non-finite points become gaps rather than spikes. */
export function sampleSpaceCurve(f: CurveFn3, tDomain: Domain, options: CurveOptions = {}): Curve3 {
  const n = options.samples ?? 512;
  assertCount("samples", n);
  assertRange("t domain", tDomain);
  const meter = new Meter(options, options);
  const rows: number[] = [];
  const ts: number[] = [];
  let done = 0;
  let reason: "cells" | "time" | undefined;
  const CHUNK = 256;
  for (let k = 0; k < n; k++) {
    if (k % CHUNK === 0) {
      reason = meter.check(Math.min(CHUNK, n - k));
      if (reason) break;
    }
    const t = k === n - 1 ? tDomain.max : tDomain.min + ((tDomain.max - tDomain.min) * k) / (n - 1);
    const p = f(t);
    ts.push(t);
    rows.push(fin(p[0], p[1], p[2]) ? p[0] : Number.NaN, p[1], p[2]);
    meter.spend(1);
    done++;
  }
  // gap rule: NaN rows, with maxStep cuts, no leading/trailing/adjacent gaps
  const outP: number[] = [];
  const outT: number[] = [];
  let prev: number | undefined; // index into rows of previous valid row
  let pendingGap = false;
  for (let k = 0; k < done; k++) {
    const x = rows[3 * k] as number;
    if (Number.isNaN(x)) {
      pendingGap = outP.length > 0;
      prev = undefined;
      continue;
    }
    const y = rows[3 * k + 1] as number;
    const z = rows[3 * k + 2] as number;
    let gap = pendingGap;
    if (prev !== undefined && options.maxStep !== undefined) {
      const d = Math.hypot(
        x - (rows[3 * prev] as number),
        y - (rows[3 * prev + 1] as number),
        z - (rows[3 * prev + 2] as number),
      );
      if (d > options.maxStep) gap = true;
    }
    if (gap && outP.length > 0) {
      outP.push(Number.NaN, Number.NaN, Number.NaN);
      outT.push(Number.NaN);
    }
    outP.push(x, y, z);
    outT.push(ts[k] as number);
    prev = k;
    pendingGap = false;
  }
  return {
    positions: Float64Array.from(outP),
    t: Float64Array.from(outT),
    count: outT.length,
    progress: progress(done, n, reason),
  };
}

/** Index ranges `[start, end)` of consecutive data rows in a {@link Curve3}. */
export function curve3Runs(c: Curve3): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let k = 0; k < c.count; k++) {
    if (Number.isNaN(c.positions[3 * k] as number)) {
      if (start >= 0) runs.push([start, k]);
      start = -1;
    } else if (start < 0) start = k;
  }
  if (start >= 0) runs.push([start, c.count]);
  return runs;
}

export interface VectorField3 {
  /** `count * 3` floats: arrow tails. */
  origins: Float32Array;
  /** `count * 3` floats: the vector at each tail. */
  vectors: Float32Array;
  magnitudes: Float32Array;
  maxMagnitude: number;
  /** Arrows kept: grid points where the field was finite. */
  count: number;
  /** Grid points skipped because the field was non-finite there. */
  skipped: number;
  progress: Progress;
}

export interface VectorField3Options extends Budget, Cancellable {
  /** Points per axis, `[nx, ny, nz]` or one number for all. Default 8. */
  grid?: number | [number, number, number];
}

/** Sample a 3D vector field on a regular grid of the box `x` by `y` by `z`. `progress.rows` counts z-slabs. */
export function sampleVectorField3(
  f: VectorFn3,
  xDomain: Domain,
  yDomain: Domain,
  zDomain: Domain,
  options: VectorField3Options = {},
): VectorField3 {
  const g = options.grid ?? 8;
  const [nx, ny, nz] = typeof g === "number" ? [g, g, g] : g;
  assertCount("grid", nx);
  assertCount("grid", ny);
  assertCount("grid", nz);
  assertRange("x domain", xDomain);
  assertRange("y domain", yDomain);
  assertRange("z domain", zDomain);
  const meter = new Meter(options, options);
  const o: number[] = [];
  const vs: number[] = [];
  const mags: number[] = [];
  let skipped = 0;
  let slabs = 0;
  let reason: "cells" | "time" | undefined;
  const lerp = (d: Domain, k: number, n: number) => (k === n - 1 ? d.max : d.min + ((d.max - d.min) * k) / (n - 1));
  for (let kz = 0; kz < nz; kz++) {
    reason = meter.check(nx * ny);
    if (reason) break;
    for (let jy = 0; jy < ny; jy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = lerp(xDomain, ix, nx);
        const y = lerp(yDomain, jy, ny);
        const z = lerp(zDomain, kz, nz);
        const v = f(x, y, z);
        if (!fin(v[0], v[1], v[2])) {
          skipped++;
          continue;
        }
        o.push(x, y, z);
        vs.push(v[0], v[1], v[2]);
        mags.push(Math.hypot(v[0], v[1], v[2]));
      }
    }
    meter.spend(nx * ny);
    slabs++;
  }
  let maxMagnitude = 0;
  for (const m of mags) if (m > maxMagnitude) maxMagnitude = m;
  return {
    origins: Float32Array.from(o),
    vectors: Float32Array.from(vs),
    magnitudes: Float32Array.from(mags),
    maxMagnitude,
    count: mags.length,
    skipped,
    progress: progress(slabs, nz, reason),
  };
}
