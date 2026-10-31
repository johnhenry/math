// Oracle goldens: values computed by NumPy / SciPy / SymPy (see
// scripts/generate-goldens.py) and committed as JSON. No Python at test time.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileExpression } from "../src/expr.ts";
import { findDiscontinuities, findIntersections, findRoots, sampleAdaptive, sampleUniform } from "../src/index.ts";

interface Goldens {
  values: { expr: string; min: number; max: number; n: number; y: number[] }[];
  roots: { expr: string; min: number; max: number; roots: number[] }[];
  intersections: { a: string; b: string; min: number; max: number; x: number[]; y: number[] }[];
  poles: { expr: string; min: number; max: number; poles: number[] }[];
  dense: { expr: string; min: number; max: number; y_min: number; y_max: number }[];
}
const G = JSON.parse(readFileSync(new URL("./fixtures/goldens.json", import.meta.url), "utf8")) as Goldens;

test("sampleUniform matches numpy values on the same grid", () => {
  for (const c of G.values) {
    const s = sampleUniform(compileExpression(c.expr), c, c.n);
    assert.equal(s.y.length, c.n, c.expr);
    for (let i = 0; i < c.n; i++) {
      const tol = 1e-12 * Math.max(1, Math.abs(c.y[i]));
      assert.ok(Math.abs(s.y[i] - c.y[i]) <= tol, `${c.expr}[${i}]: ${s.y[i]} vs ${c.y[i]}`);
    }
  }
});

test("findRoots matches scipy.optimize.brentq", () => {
  for (const c of G.roots) {
    const got = findRoots(compileExpression(c.expr), c, { resolution: 4000 });
    assert.equal(got.length, c.roots.length, c.expr);
    got.forEach((r, i) => {
      assert.ok(Math.abs(r - c.roots[i]) < 1e-9, `${c.expr}: ${r} vs ${c.roots[i]}`);
    });
  }
});

test("findIntersections matches scipy.optimize.brentq on f - g", () => {
  for (const c of G.intersections) {
    const got = findIntersections(compileExpression(c.a), compileExpression(c.b), c, { resolution: 4000 });
    assert.equal(got.length, c.x.length, `${c.a} vs ${c.b}`);
    got.forEach((p, i) => {
      assert.ok(Math.abs(p.x - c.x[i]) < 1e-9, `x ${p.x} vs ${c.x[i]}`);
      assert.ok(Math.abs(p.y - c.y[i]) < 1e-8, `y ${p.y} vs ${c.y[i]}`);
    });
  }
});

test("gap detection brackets every SymPy-reported pole (and invents none)", () => {
  for (const c of G.poles) {
    const view = { min: -10, max: 10 };
    const s = sampleAdaptive(compileExpression(c.expr), c, 301, { visibleYRange: view });
    const gaps = findDiscontinuities(s);
    // 1/x^2 blows up on both sides of the pole with the same sign, tan flips sign; both must gap.
    assert.equal(gaps.length, c.poles.length, `${c.expr}: ${JSON.stringify(gaps)}`);
    c.poles.forEach((p, i) => {
      const w = (c.max - c.min) / 300;
      assert.ok(
        gaps[i].before.x <= p + 1e-9 && gaps[i].after.x >= p - 1e-9,
        `${c.expr}: pole ${p} not inside ${JSON.stringify(gaps[i])}`,
      );
      assert.ok(
        gaps[i].after.x - gaps[i].before.x <= 10 * w,
        `${c.expr}: gap around ${p} too wide (shoulders beyond the cap are dropped, so allow 10 cells)`,
      );
    });
  }
});

test("adaptive samples stay inside the dense numpy y-extent and reach it", () => {
  for (const c of G.dense) {
    const s = sampleAdaptive(compileExpression(c.expr), c, 100, { maxDepth: 8, tolerance: 1e-3 });
    const lo = Math.min(...s.y);
    const hi = Math.max(...s.y);
    const span = c.y_max - c.y_min;
    assert.ok(lo >= c.y_min - 1e-9 && hi <= c.y_max + 1e-9, c.expr);
    assert.ok(
      lo - c.y_min < 0.02 * span && c.y_max - hi < 0.02 * span,
      `${c.expr}: extent ${lo}..${hi} vs ${c.y_min}..${c.y_max}`,
    );
  }
});
