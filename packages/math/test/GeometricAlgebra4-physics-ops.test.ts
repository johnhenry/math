import assert from "node:assert/strict";
import { test } from "node:test";
import { Bivector4 } from "../src/Bivector4.ts";
import { commutatorProduct, geometricProductBivectors, leftContraction } from "../src/GeometricAlgebra4.ts";
import { Vec4 } from "../src/Vec4.ts";

const XY = new Bivector4(1, 0, 0, 0, 0, 0);
const XZ = new Bivector4(0, 1, 0, 0, 0, 0);
const ZW = new Bivector4(0, 0, 0, 0, 0, 1);

test("commutatorProduct is antisymmetric: A x B = -(B x A)", () => {
  const a = new Bivector4(1, 2, 3, 4, 5, 6);
  const b = new Bivector4(-2, 0, 1, 5, -3, 2);
  const ab = commutatorProduct(a, b);
  const ba = commutatorProduct(b, a);
  assert.ok(ab.equals(ba.negate(), 1e-9));
});

test("commutatorProduct(A, A) is the zero bivector", () => {
  const a = new Bivector4(1, -2, 3, 0, 4, -1);
  assert.ok(commutatorProduct(a, a).equals(Bivector4.Zero, 1e-9));
});

test("commutatorProduct of totally orthogonal planes (e12, e34) is zero -- they commute", () => {
  assert.ok(commutatorProduct(XY, ZW).equals(Bivector4.Zero, 1e-9));
});

test("commutatorProduct of planes sharing an axis (e12, e13) is nonzero -- they don't commute", () => {
  const c = commutatorProduct(XY, XZ);
  assert.ok(c.magnitude > 1e-9);
});

test("commutatorProduct's bivector part equals the antisymmetric part of the full geometric product", () => {
  const a = new Bivector4(1, 0, 2, 0, -1, 3);
  const b = new Bivector4(0, 2, 1, -1, 0, 1);
  const ab = geometricProductBivectors(a, b).bivector;
  const ba = geometricProductBivectors(b, a).bivector;
  const expected = ab.subtract(ba).scale(0.5);
  assert.ok(commutatorProduct(a, b).equals(expected, 1e-9));
});

test("leftContraction of a vector into its own plane (Ex into e12) gives the other basis vector (Ey)", () => {
  // Standard GA identity: e1 J (e1^e2) = e2, since v already lies in B's
  // plane, the wedge part v^B is zero and the full geometric product vB is
  // purely the grade-1 contraction.
  const result = leftContraction(Vec4.Ex, XY);
  assert.ok(result.equals(Vec4.Ey, 1e-9));
});

test("leftContraction of a vector orthogonal to the bivector's plane is zero (Ez into e12)", () => {
  const result = leftContraction(Vec4.Ez, XY);
  assert.ok(result.equals(Vec4.Zero, 1e-9));
});

test("leftContraction of the zero vector or zero bivector is zero", () => {
  assert.ok(leftContraction(Vec4.Zero, XY).equals(Vec4.Zero, 1e-9));
  assert.ok(leftContraction(Vec4.Ex, Bivector4.Zero).equals(Vec4.Zero, 1e-9));
});

test("leftContraction is linear in the vector argument", () => {
  const v1 = new Vec4(1, 2, 0, 0);
  const v2 = new Vec4(0, -1, 3, 1);
  const sum = leftContraction(v1.add(v2), XY);
  const separateSum = leftContraction(v1, XY).add(leftContraction(v2, XY));
  assert.ok(sum.equals(separateSum, 1e-9));
});
