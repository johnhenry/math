import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTick, niceTicks, tickStep } from "../src/index.ts";

test("niceTicks picks 1/2/5 x 10^k steps", () => {
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(-10, 10, 6), [-10, -5, 0, 5, 10]);
  assert.deepEqual(niceTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(niceTicks(0, 1000, 4), [0, 500, 1000]);
  assert.deepEqual(niceTicks(-3, 7, 10), [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]);
});

test("niceTicks has no float-accumulation drift", () => {
  const t = niceTicks(0, 0.7, 7);
  assert.deepEqual(t, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  const tiny = niceTicks(1e-9, 5e-9, 4);
  for (const v of tiny) assert.equal(v, Number(v.toPrecision(12)));
});

test("niceTicks stays inside [min, max] and is sorted", () => {
  for (const [a, b] of [
    [0.13, 7.77],
    [-1234.5, 9876.5],
    [3, 3.0004],
    [-1e6, 1e6],
  ] as const) {
    const t = niceTicks(a, b, 6);
    assert.ok(t.length >= 2, `${a}..${b}`);
    assert.ok(t[0] >= a - 1e-9 && t[t.length - 1] <= b + 1e-9);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
  }
});

test("niceTicks returns [] for degenerate input", () => {
  assert.deepEqual(niceTicks(1, 1), []);
  assert.deepEqual(niceTicks(2, 1), []);
  assert.deepEqual(niceTicks(0, Number.NaN), []);
  assert.deepEqual(niceTicks(0, Number.POSITIVE_INFINITY), []);
  assert.deepEqual(niceTicks(0, 1, 0), []);
});

test("tickStep and formatTick agree on precision", () => {
  assert.equal(tickStep(0, 1, 5), 0.2);
  assert.equal(tickStep(0, 100, 5), 20);
  assert.equal(formatTick(0.2, 0.2), "0.2");
  assert.equal(formatTick(3, 0.5), "3.0");
  assert.equal(formatTick(1500, 500), "1500");
  assert.equal(formatTick(-0, 1), "0");
});

test("niceTicks returns [] rather than a run of zeros for a range too small to represent", () => {
  assert.deepEqual(niceTicks(0, 1e-24), []);
  assert.deepEqual(niceTicks(0, 1e-12).length > 0, true);
});
