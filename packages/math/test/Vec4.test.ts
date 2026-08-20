import assert from "node:assert/strict";
import { test } from "node:test";
import { Vec4 } from "../src/Vec4.ts";

test("basis vectors and zero", () => {
  assert.equal(Vec4.Zero.magnitude, 0);
  assert.equal(Vec4.Ex.x, 1);
  assert.equal(Vec4.Ew.w, 1);
});

test("add / subtract / scale / negate", () => {
  const a = new Vec4(1, 2, 3, 4);
  const b = new Vec4(4, 3, 2, 1);
  assert.ok(a.add(b).equals(new Vec4(5, 5, 5, 5)));
  assert.ok(a.subtract(b).equals(new Vec4(-3, -1, 1, 3)));
  assert.ok(a.scale(2).equals(new Vec4(2, 4, 6, 8)));
  assert.ok(a.negate().equals(new Vec4(-1, -2, -3, -4)));
});

test("dot product: orthogonal basis vectors are zero, self dot is magnitude squared", () => {
  assert.equal(Vec4.Ex.dot(Vec4.Ey), 0);
  assert.equal(Vec4.Ex.dot(Vec4.Ez), 0);
  assert.equal(Vec4.Ex.dot(Vec4.Ew), 0);
  const v = new Vec4(1, 2, 3, 4);
  assert.equal(v.dot(v), v.magnitudeSquared);
});

test("magnitude and normalize", () => {
  const v = new Vec4(2, 0, 0, 0);
  assert.equal(v.magnitude, 2);
  assert.ok(v.normalize().equals(Vec4.Ex));
  assert.throws(() => Vec4.Zero.normalize());
});

test("normalize produces a unit vector for an arbitrary vector", () => {
  const v = new Vec4(1, 2, -3, 4);
  const n = v.normalize();
  assert.ok(Math.abs(n.magnitude - 1) < 1e-12);
});

test("lerp interpolates linearly, t=0 and t=1 are endpoints", () => {
  const a = new Vec4(0, 0, 0, 0);
  const b = new Vec4(4, 4, 4, 4);
  assert.ok(a.lerp(b, 0).equals(a));
  assert.ok(a.lerp(b, 1).equals(b));
  assert.ok(a.lerp(b, 0.5).equals(new Vec4(2, 2, 2, 2)));
});

test("equals with epsilon tolerance", () => {
  const a = new Vec4(1, 1, 1, 1);
  const b = new Vec4(1.0000001, 1, 1, 1);
  assert.ok(!a.equals(b));
  assert.ok(a.equals(b, 1e-6));
});

test("dropW returns the (x,y,z) 3D subvector", () => {
  const v = new Vec4(1, 2, 3, 4);
  assert.deepEqual(v.dropW(), [1, 2, 3]);
});

test("toArray / fromArray round-trip", () => {
  const v = new Vec4(1, 2, 3, 4);
  assert.ok(Vec4.fromArray(v.toArray()).equals(v));
});

test("zero-vector edge cases", () => {
  assert.ok(Vec4.Zero.add(Vec4.Zero).equals(Vec4.Zero));
  assert.equal(Vec4.Zero.dot(Vec4.Ex), 0);
});

test("Vec4.of is equivalent to the constructor", () => {
  assert.ok(Vec4.of(1, 2, 3, 4).equals(new Vec4(1, 2, 3, 4)));
});

test("toString renders all four components", () => {
  assert.equal(new Vec4(1, 2, 3, 4).toString(), "(1, 2, 3, 4)");
});
