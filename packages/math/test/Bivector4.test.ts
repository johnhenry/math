import assert from "node:assert/strict";
import { test } from "node:test";
import { Bivector4 } from "../src/Bivector4.ts";

test("add / subtract / scale / negate", () => {
  const a = new Bivector4(1, 2, 3, 4, 5, 6);
  const b = new Bivector4(6, 5, 4, 3, 2, 1);
  assert.ok(a.add(b).equals(new Bivector4(7, 7, 7, 7, 7, 7)));
  assert.ok(a.subtract(a).equals(Bivector4.Zero));
  assert.ok(a.scale(2).equals(new Bivector4(2, 4, 6, 8, 10, 12)));
  assert.ok(a.negate().equals(new Bivector4(-1, -2, -3, -4, -5, -6)));
});

test("dot / magnitude on a basis bivector", () => {
  const xy = new Bivector4(1, 0, 0, 0, 0, 0);
  assert.equal(xy.magnitude, 1);
  assert.equal(xy.dot(xy), 1);
  const zw = new Bivector4(0, 0, 0, 0, 0, 1);
  assert.equal(xy.dot(zw), 0, "orthogonal basis planes have zero inner product");
});

test("normalize produces a unit bivector", () => {
  const b = new Bivector4(3, 0, 0, 4, 0, 0);
  const n = b.normalize();
  assert.ok(Math.abs(n.magnitude - 1) < 1e-12);
  assert.throws(() => Bivector4.Zero.normalize());
});

test("a single basis plane is simple", () => {
  assert.ok(new Bivector4(1, 0, 0, 0, 0, 0).isSimple());
  assert.ok(new Bivector4(0, 0, 0, 0, 0, 1).isSimple());
  assert.ok(Bivector4.Zero.isSimple());
});

test("two totally-orthogonal planes summed together are NOT simple (this is the double-rotation case)", () => {
  // xy and zw share no basis vector at all -- summing them is the textbook
  // example of a compound (non-simple) 4D bivector.
  const compound = new Bivector4(1, 0, 0, 0, 0, 1);
  assert.ok(!compound.isSimple());
});

test("a scaled multiple of a simple plane is still simple", () => {
  const xy = new Bivector4(1, 0, 0, 0, 0, 0);
  assert.ok(xy.scale(5).isSimple());
});

test("a linear combination of planes sharing a common axis (xy + xz) is still simple", () => {
  // xy and xz both contain e1 -- their sum spans a single 2-plane through
  // the origin in the (x, y, z) subspace, so it should still be simple.
  const combo = new Bivector4(1, 1, 0, 0, 0, 0);
  assert.ok(combo.isSimple());
});

test("equals with epsilon tolerance", () => {
  const a = new Bivector4(1, 1, 1, 1, 1, 1);
  const b = new Bivector4(1.0000001, 1, 1, 1, 1, 1);
  assert.ok(!a.equals(b));
  assert.ok(a.equals(b, 1e-6));
});

test("toArray / fromArray round-trip", () => {
  const b = new Bivector4(1, 2, 3, 4, 5, 6);
  assert.ok(Bivector4.fromArray(b.toArray()).equals(b));
});

test("toString renders all six components", () => {
  assert.equal(new Bivector4(1, 2, 3, 4, 5, 6).toString(), "1e12 + 2e13 + 3e14 + 4e23 + 5e24 + 6e34");
});
