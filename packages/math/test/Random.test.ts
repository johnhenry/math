import assert from "node:assert/strict";
import { test } from "node:test";
import { Rng } from "../src/Random.ts";

// Reference PCG32 (XSH-RR) in BigInt, as in @johnhenry/math-plus-tensor-core's Rng.
function reference(seed: bigint, sequence = 1n) {
  const MASK = (1n << 64n) - 1n;
  const inc = ((sequence << 1n) | 1n) & MASK;
  let state = 0n;
  const step = () => {
    const old = state;
    state = (old * 6364136223846793005n + inc) & MASK;
    return old;
  };
  step();
  state = (state + seed) & MASK;
  step();
  return () => {
    const old = step();
    const xs = BigInt.asUintN(32, ((old >> 18n) ^ old) >> 27n);
    const rot = Number(old >> 59n);
    return Number(rot === 0 ? xs : BigInt.asUintN(32, (xs >> BigInt(rot)) | (xs << BigInt(32 - rot))));
  };
}

test("Rng matches the reference PCG32 stream bit for bit", () => {
  for (const seed of [0n, 1n, 42n, 2024n, 0xdeadbeefcafen]) {
    const ref = reference(seed);
    const rng = new Rng(seed);
    for (let i = 0; i < 5000; i++) assert.equal(rng.nextUint32(), ref(), `seed ${seed} draw ${i}`);
  }
  const ref = reference(5n, 9n);
  const rng = new Rng(5, 9);
  for (let i = 0; i < 1000; i++) assert.equal(rng.nextUint32(), ref());
});

test("known PCG32 values (seed 42, sequence 1)", () => {
  const rng = new Rng(42);
  assert.deepEqual(
    [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()],
    (() => {
      const ref = reference(42n);
      return [ref(), ref(), ref()];
    })(),
  );
});

test("floats are in [0,1), reproducible, and next is bound", () => {
  const a = new Rng(3);
  const b = new Rng(3);
  const f = a.next;
  for (let i = 0; i < 100; i++) {
    const x = f();
    assert.ok(x >= 0 && x < 1);
    assert.equal(x, b.nextFloat());
  }
});

test("nextBelow is unbiased in range; nextNormal has mean ~0, sd ~1", () => {
  const rng = new Rng(11);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 6000; i++) counts[rng.nextBelow(6)]++;
  for (const c of counts) assert.ok(c > 850 && c < 1150);
  assert.throws(() => rng.nextBelow(0), RangeError);
  const xs = Array.from({ length: 20000 }, () => rng.nextNormal());
  const m = xs.reduce((a, b) => a + b) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  assert.ok(Math.abs(m) < 0.03 && Math.abs(v - 1) < 0.05);
});
