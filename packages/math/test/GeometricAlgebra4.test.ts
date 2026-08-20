import assert from "node:assert/strict";
import { test } from "node:test";
import { Bivector4 } from "../src/Bivector4.ts";
import {
  dotProduct,
  dual,
  geometricProductBivectors,
  geometricProductVectors,
  wedgeProduct,
} from "../src/GeometricAlgebra4.ts";
import { Vec4 } from "../src/Vec4.ts";

test("wedgeProduct of orthogonal basis vectors gives the corresponding basis bivector", () => {
  assert.ok(wedgeProduct(Vec4.Ex, Vec4.Ey).equals(new Bivector4(1, 0, 0, 0, 0, 0)));
  assert.ok(wedgeProduct(Vec4.Ex, Vec4.Ez).equals(new Bivector4(0, 1, 0, 0, 0, 0)));
  assert.ok(wedgeProduct(Vec4.Ex, Vec4.Ew).equals(new Bivector4(0, 0, 1, 0, 0, 0)));
  assert.ok(wedgeProduct(Vec4.Ez, Vec4.Ew).equals(new Bivector4(0, 0, 0, 0, 0, 1)));
});

test("wedgeProduct is antisymmetric: a^b = -(b^a)", () => {
  const a = new Vec4(1, 2, 3, 4);
  const b = new Vec4(4, 1, -2, 0);
  assert.ok(wedgeProduct(a, b).equals(wedgeProduct(b, a).negate(), 1e-9));
});

test("wedgeProduct of a vector with itself is zero", () => {
  const a = new Vec4(1, 2, 3, 4);
  assert.ok(wedgeProduct(a, a).equals(Bivector4.Zero, 1e-9));
});

test("dotProduct matches Vec4.dot", () => {
  const a = new Vec4(1, 2, 3, 4);
  const b = new Vec4(4, 3, 2, 1);
  assert.equal(dotProduct(a, b), a.dot(b));
});

test("geometricProductVectors of orthonormal basis vectors is pure bivector, self-product is pure scalar 1", () => {
  const exex = geometricProductVectors(Vec4.Ex, Vec4.Ex);
  assert.equal(exex.scalar, 1);
  assert.ok(exex.bivector.equals(Bivector4.Zero));

  const exey = geometricProductVectors(Vec4.Ex, Vec4.Ey);
  assert.equal(exey.scalar, 0);
  assert.ok(exey.bivector.equals(new Bivector4(1, 0, 0, 0, 0, 0)));
});

test("geometricProductVectors recovers a*b = a.b + a^b", () => {
  const a = new Vec4(1, 2, 3, 4);
  const b = new Vec4(-2, 0, 1, 5);
  const prod = geometricProductVectors(a, b);
  assert.ok(Math.abs(prod.scalar - a.dot(b)) < 1e-9);
  assert.ok(prod.bivector.equals(wedgeProduct(a, b), 1e-9));
});

test("a unit basis bivector squares to -1 under the geometric product (like an imaginary unit)", () => {
  const xy = new Bivector4(1, 0, 0, 0, 0, 0);
  const prod = geometricProductBivectors(xy, xy);
  assert.ok(Math.abs(prod.scalar - -1) < 1e-9);
  assert.ok(prod.bivector.equals(Bivector4.Zero, 1e-9));
  assert.ok(Math.abs(prod.pseudoscalar) < 1e-9);
});

test("totally orthogonal basis bivectors (e12, e34) multiply to the pure pseudoscalar", () => {
  const xy = new Bivector4(1, 0, 0, 0, 0, 0);
  const zw = new Bivector4(0, 0, 0, 0, 0, 1);
  const prod = geometricProductBivectors(xy, zw);
  assert.ok(Math.abs(prod.scalar) < 1e-9);
  assert.ok(prod.bivector.equals(Bivector4.Zero, 1e-9));
  assert.ok(Math.abs(prod.pseudoscalar - 1) < 1e-9, "e12*e34 should equal +e1234");
});

test("basis bivectors sharing one axis (e12, e13) multiply to a pure bivector (no scalar/pseudoscalar part)", () => {
  const xy = new Bivector4(1, 0, 0, 0, 0, 0);
  const xz = new Bivector4(0, 1, 0, 0, 0, 0);
  const prod = geometricProductBivectors(xy, xz);
  assert.ok(Math.abs(prod.scalar) < 1e-9);
  assert.ok(Math.abs(prod.pseudoscalar) < 1e-9);
  assert.ok(prod.bivector.magnitude > 0, "should produce a nonzero bivector term");
});

test("dual is a norm-preserving involution: dual(dual(b)) = b", () => {
  const b = new Bivector4(1, 2, 3, 4, 5, 6);
  const dd = dual(dual(b));
  assert.ok(dd.equals(b, 1e-9));
});

test("dual maps the xy-plane to a pure zw-plane bivector (complementary planes)", () => {
  const xy = new Bivector4(1, 0, 0, 0, 0, 0);
  const d = dual(xy);
  assert.ok(Math.abs(d.xy) < 1e-9);
  assert.ok(Math.abs(d.xz) < 1e-9);
  assert.ok(Math.abs(d.xw) < 1e-9);
  assert.ok(Math.abs(d.yz) < 1e-9);
  assert.ok(Math.abs(d.yw) < 1e-9);
  assert.ok(Math.abs(d.zw) > 0.99);
});

test("dual preserves magnitude", () => {
  const b = new Bivector4(1, -2, 0, 3, 0, 4);
  assert.ok(Math.abs(dual(b).magnitude - b.magnitude) < 1e-9);
});
