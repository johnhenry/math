import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backingStoreSize,
  fitViewport,
  panViewport,
  pinchZoomFactor,
  toDataX,
  toDataY,
  toScreenX,
  toScreenY,
  type Viewport,
  viewportFromAnchor,
  wheelZoomFactor,
  zoomViewport,
} from "../src/index.ts";

const V: Viewport = { xMin: -10, xMax: 10, yMin: -5, yMax: 5 };

test("screen/data mapping is an affine inverse pair, y flipped", () => {
  assert.equal(toScreenX(-10, V, 400), 0);
  assert.equal(toScreenX(10, V, 400), 400);
  assert.equal(toScreenY(5, V, 200), 0);
  assert.equal(toScreenY(-5, V, 200), 200);
  for (const x of [-7.5, 0, 3.25]) assert.ok(Math.abs(toDataX(toScreenX(x, V, 400), V, 400) - x) < 1e-12);
  for (const y of [-4, 0, 2.5]) assert.ok(Math.abs(toDataY(toScreenY(y, V, 200), V, 200) - y) < 1e-12);
});

test("viewportFromAnchor keeps the anchor under the screen point", () => {
  const v = viewportFromAnchor(3, 1, 100, 50, 8, 4, 400, 200);
  assert.ok(Math.abs(toScreenX(3, v, 400) - 100) < 1e-12);
  assert.ok(Math.abs(toScreenY(1, v, 200) - 50) < 1e-12);
  assert.ok(Math.abs(v.xMax - v.xMin - 8) < 1e-12);
});

test("panViewport: dragging right/down shifts the window left/up", () => {
  const p = panViewport(V, 40, 20, 400, 200);
  assert.ok(Math.abs(p.xMin - -12) < 1e-12 && Math.abs(p.xMax - 8) < 1e-12);
  assert.ok(Math.abs(p.yMin - -4) < 1e-12 && Math.abs(p.yMax - 6) < 1e-12);
  // the data point that was under (0,0) is still under (40,20)
  assert.ok(Math.abs(toScreenX(-10, p, 400) - 40) < 1e-12);
  assert.ok(Math.abs(toScreenY(5, p, 200) - 20) < 1e-12);
});

test("zoomViewport pins the cursor's data point and scales the span", () => {
  const z = zoomViewport(V, 0.5, 300, 50, 400, 200);
  const ax = toDataX(300, V, 400);
  const ay = toDataY(50, V, 200);
  assert.ok(Math.abs(toScreenX(ax, z, 400) - 300) < 1e-9);
  assert.ok(Math.abs(toScreenY(ay, z, 200) - 50) < 1e-9);
  assert.ok(Math.abs(z.xMax - z.xMin - 10) < 1e-9);
  assert.ok(Math.abs(z.yMax - z.yMin - 5) < 1e-9);
});

test("wheel and pinch factors follow the scroll-down-zooms-out convention", () => {
  assert.ok(wheelZoomFactor(100) > 1);
  assert.ok(wheelZoomFactor(-100) < 1);
  assert.equal(wheelZoomFactor(0), 1 / 1.1);
  assert.ok(pinchZoomFactor(100, 200) < 1);
  assert.equal(pinchZoomFactor(100, 50), 2);
});

test("fitViewport pads the data extent and ignores non-finite samples", () => {
  const v = fitViewport(Float64Array.of(0, 1, 2, 3), Float64Array.of(1, Number.NaN, 3, Number.POSITIVE_INFINITY), 0.1);
  assert.ok(Math.abs(v.xMin - -0.2) < 1e-12 && Math.abs(v.xMax - 2.2) < 1e-12, "x of rows 1 and 3 ignored too");
  assert.ok(Math.abs(v.yMin - 0.8) < 1e-12 && Math.abs(v.yMax - 3.2) < 1e-12);
  const flat = fitViewport([0, 1], [2, 2]);
  assert.ok(flat.yMax > flat.yMin);
});

test("backingStoreSize is DPR-aware and keeps CSS-pixel geometry", () => {
  assert.deepEqual(backingStoreSize(520, 300, 2), { width: 1040, height: 600, scale: 2 });
  assert.deepEqual(backingStoreSize(521, 300.4, 1.5), { width: 782, height: 451, scale: 1.5 });
  assert.deepEqual(backingStoreSize(100, 100, 0), { width: 100, height: 100, scale: 1 });
  assert.deepEqual(backingStoreSize(100, 100, Number.NaN), { width: 100, height: 100, scale: 1 });
});
