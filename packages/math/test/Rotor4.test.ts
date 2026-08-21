import assert from "node:assert/strict";
import { test } from "node:test";
import { Bivector4 } from "../src/Bivector4.ts";
import { Quaternion } from "../src/Quaternion.ts";
import { Rotor4 } from "../src/Rotor4.ts";
import { Vec4 } from "../src/Vec4.ts";

const XY = new Bivector4(1, 0, 0, 0, 0, 0);
const ZW = new Bivector4(0, 0, 0, 0, 0, 1);

test("Identity rotor leaves every vector unchanged", () => {
  const v = new Vec4(1, 2, 3, 4);
  assert.ok(Rotor4.Identity.apply(v).equals(v, 1e-9));
});

test("fromBivectorAngle rejects a non-simple (compound) plane", () => {
  const compound = new Bivector4(1, 0, 0, 0, 0, 1);
  assert.throws(() => Rotor4.fromBivectorAngle(compound, Math.PI / 2));
});

test("a simple rotor is a unit rotor: |R| = 1", () => {
  const r = Rotor4.fromBivectorAngle(XY, 1.2345);
  assert.ok(Math.abs(r.magnitude - 1) < 1e-9);
});

test("rotation preserves vector magnitude", () => {
  const r = Rotor4.fromBivectorAngle(XY, 0.77);
  const v = new Vec4(3, -1, 2, 5);
  assert.ok(Math.abs(r.apply(v).magnitude - v.magnitude) < 1e-9);
});

test("a rotation in the xy-plane leaves vectors entirely outside that plane fixed", () => {
  const r = Rotor4.fromBivectorAngle(XY, Math.PI / 2);
  assert.ok(r.apply(Vec4.Ez).equals(Vec4.Ez, 1e-9));
  assert.ok(r.apply(Vec4.Ew).equals(Vec4.Ew, 1e-9));
});

test("a rotation in the xy-plane keeps a vector from that plane within the plane (z, w stay zero)", () => {
  const r = Rotor4.fromBivectorAngle(XY, 0.9);
  const rotated = r.apply(Vec4.Ex);
  assert.ok(Math.abs(rotated.z) < 1e-9);
  assert.ok(Math.abs(rotated.w) < 1e-9);
});

test("a full 2*PI rotation returns the rotor to -Identity (double cover), but its ACTION on vectors is the identity", () => {
  const r = Rotor4.fromBivectorAngle(XY, 2 * Math.PI);
  assert.ok(r.equals(Rotor4.Identity.scale(-1), 1e-9));
  const v = new Vec4(1, 2, 3, 4);
  assert.ok(r.apply(v).equals(v, 1e-9));
});

test("R * R~ = Identity for any unit simple rotor (orthogonality)", () => {
  const r = Rotor4.fromBivectorAngle(XY, 0.4321);
  const product = r.multiply(r.reverse());
  assert.ok(product.equals(Rotor4.Identity, 1e-9));
});

test("composition matches sequential application: (r2 . r1).apply(v) == r2.apply(r1.apply(v))", () => {
  const r1 = Rotor4.fromBivectorAngle(XY, 0.5);
  const r2 = Rotor4.fromBivectorAngle(ZW, 1.1);
  const v = new Vec4(1, -2, 3, -4);
  const composed = r2.multiply(r1);
  const sequential = r2.apply(r1.apply(v));
  assert.ok(composed.apply(v).equals(sequential, 1e-9));
});

test("composing two simple rotors in TOTALLY orthogonal planes produces a genuine double rotation (nonzero pseudoscalar)", () => {
  const r1 = Rotor4.fromBivectorAngle(XY, 0.6);
  const r2 = Rotor4.fromBivectorAngle(ZW, 1.3);
  const composed = r2.multiply(r1);
  assert.ok(Math.abs(composed.pseudoscalar) > 1e-6, "expected a nonzero pseudoscalar component");
  assert.ok(Math.abs(composed.magnitude - 1) < 1e-9, "composed rotor should still be a unit rotor");
});

test("toBivectorAngle throws for a compound (double-rotation) rotor", () => {
  const r1 = Rotor4.fromBivectorAngle(XY, 0.6);
  const r2 = Rotor4.fromBivectorAngle(ZW, 1.3);
  const composed = r2.multiply(r1);
  assert.throws(() => composed.toBivectorAngle());
});

test("toBivectorAngle recovers (plane, angle) for a simple rotor round-trip", () => {
  const angle = 1.05;
  const r = Rotor4.fromBivectorAngle(XY, angle);
  const { plane, angle: recovered } = r.toBivectorAngle();
  assert.ok(Math.abs(recovered - angle) < 1e-9);
  assert.ok(plane.equals(XY, 1e-9));
});

test("a double rotation acts independently and simultaneously on its two orthogonal planes", () => {
  // Because the xy-plane and zw-plane share no basis vector, a rotor built by
  // composing a simple xy-rotation and a simple zw-rotation must act on the
  // xy-components of a vector exactly as the xy-rotor alone would (leaving
  // z, w untouched), and independently on the zw-components exactly as the
  // zw-rotor alone would (leaving x, y untouched) -- decoupled, simultaneous
  // rotation in two planes at once, the defining 4D-only phenomenon.
  const r1 = Rotor4.fromBivectorAngle(XY, 0.6);
  const r2 = Rotor4.fromBivectorAngle(ZW, 1.3);
  const composed = r2.multiply(r1);

  const v = new Vec4(1, 2, 3, 4);
  const vXY = new Vec4(v.x, v.y, 0, 0);
  const vZW = new Vec4(0, 0, v.z, v.w);

  const result = composed.apply(v);
  const expectedXY = r1.apply(vXY);
  const expectedZW = r2.apply(vZW);

  assert.ok(Math.abs(result.x - expectedXY.x) < 1e-9);
  assert.ok(Math.abs(result.y - expectedXY.y) < 1e-9);
  assert.ok(Math.abs(result.z - expectedZW.z) < 1e-9);
  assert.ok(Math.abs(result.w - expectedZW.w) < 1e-9);
});

test("a Rotor4 confined to the xy-plane matches Quaternion's z-axis rotation on the shared xyz subspace", () => {
  // Sanity check that 3D is a special case of the 4D math: rotating in the
  // xy-plane (Rotor4) should trace the same circle, at the same angle, as
  // rotating about the z axis (Quaternion) -- both operate on the same
  // (x, y) subspace and leave it untouched.
  //
  // Note on the axis: the bivector e12 <-> vector axis correspondence in 3D
  // goes through the pseudoscalar dual (axis n <-> plane I*n), which is only
  // defined up to the orientation convention of I = e123 vs -e123. Rotor4
  // and Quaternion each independently use the textbook "R = cos(th/2) +
  // sin(th/2)*generator, sandwich R v R~" convention (verified by every other
  // test in this file -- orthogonality, magnitude preservation, in-plane
  // closure, composition, double rotations), so the two classes' rotation
  // directions end up mirror images of each other for the *same-named* axis;
  // comparing against the z=-1 axis is what lines the two conventions up,
  // not a sign fudge on either implementation.
  for (const angle of [0.3, 1.0, 2.1, -0.7]) {
    const rotor = Rotor4.fromBivectorAngle(XY, angle);
    const quat = Quaternion.fromAxisAngle([0, 0, -1], angle);

    const v4 = new Vec4(1, 0, 0, 0);
    const rotated4 = rotor.apply(v4);

    const v3: [number, number, number] = [1, 0, 0];
    const rotated3 = quat.rotateVector(v3);

    assert.ok(Math.abs(rotated4.x - rotated3[0]) < 1e-9, `x mismatch at angle ${angle}`);
    assert.ok(Math.abs(rotated4.y - rotated3[1]) < 1e-9, `y mismatch at angle ${angle}`);
  }
});

test("applyToBivector: a rotor leaves its own rotation plane fixed", () => {
  const r = Rotor4.fromBivectorAngle(XY, 1.7);
  const rotated = r.applyToBivector(XY);
  assert.ok(rotated.equals(XY, 1e-9));
});

test("applyToBivector: a rotor leaves a totally orthogonal plane fixed", () => {
  const r = Rotor4.fromBivectorAngle(XY, 1.7);
  const rotated = r.applyToBivector(ZW);
  assert.ok(rotated.equals(ZW, 1e-9));
});

test("add is component-wise", () => {
  const a = new Rotor4(1, new Bivector4(1, 0, 0, 0, 0, 0), 0);
  const b = new Rotor4(2, new Bivector4(0, 1, 0, 0, 0, 0), 3);
  const sum = a.add(b);
  assert.equal(sum.scalar, 3);
  assert.ok(sum.bivector.equals(new Bivector4(1, 1, 0, 0, 0, 0)));
  assert.equal(sum.pseudoscalar, 3);
});

test("normalize divides every component by the magnitude, and rejects the zero rotor", () => {
  const r = new Rotor4(2, Bivector4.Zero, 0);
  assert.ok(r.normalize().equals(Rotor4.Identity, 1e-9));
  assert.throws(() => new Rotor4(0, Bivector4.Zero, 0).normalize());
});

test("toString renders scalar, bivector, and pseudoscalar parts", () => {
  const r = new Rotor4(1, Bivector4.Zero, 0);
  assert.match(r.toString(), /^1 \+ \(.*\) \+ 0e1234$/);
});

test("exp(B) round-trips with fromBivectorAngle: exp(plane*angle) == fromBivectorAngle(plane, angle)", () => {
  const angle = 1.234;
  const scaled = XY.normalize().scale(angle);
  assert.ok(Rotor4.exp(scaled).equals(Rotor4.fromBivectorAngle(XY, angle), 1e-9));
});

test("exp(zero bivector) is Identity, without throwing", () => {
  assert.ok(Rotor4.exp(Bivector4.Zero).equals(Rotor4.Identity, 1e-9));
});

test("log() inverts exp() for a simple rotor", () => {
  const angle = 0.87;
  const r = Rotor4.fromBivectorAngle(ZW, angle);
  const recovered = r.log();
  assert.ok(Rotor4.exp(recovered).equals(r, 1e-9));
  assert.ok(Math.abs(recovered.magnitude - angle) < 1e-9);
});

test("log() throws for a compound (double-rotation) rotor, same as toBivectorAngle", () => {
  const r1 = Rotor4.fromBivectorAngle(XY, 0.5);
  const r2 = Rotor4.fromBivectorAngle(ZW, 0.9);
  const compound = r2.multiply(r1);
  assert.throws(() => compound.log());
});

test("exp is the identity's own log-exp round trip too: exp(Identity.log()) == Identity", () => {
  assert.ok(Rotor4.exp(Rotor4.Identity.log()).equals(Rotor4.Identity, 1e-9));
});
