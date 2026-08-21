/**
 * GeometricAlgebra4 — the products that combine {@link Vec4} and
 * {@link Bivector4} objects, mirroring how {@link ComplexMath} and
 * {@link RealMath} hold the free-function operations for their respective
 * types. {@link Rotor4} is built on top of these.
 *
 * Scope note: this module only implements the specific products the physics
 * and rendering layers of a 4D engine actually need (vector·vector,
 * vector∧vector, bivector*bivector, and the Hodge dual of a bivector) rather
 * than a fully generic arbitrary-grade multivector type — Cl(4,0) has 16
 * basis blades across grades 0–4, but rotors only ever touch grades 0, 2, 4,
 * and nothing in this package needs grade-1 (vector) or grade-3 (trivector)
 * results from a product.
 */
import { Bivector4 } from "./Bivector4.ts";
import {
  E1,
  E2,
  E3,
  E4,
  E12,
  E13,
  E14,
  E23,
  E24,
  E34,
  geometricProductMV,
  type Multivector4,
  mvZero,
  PSEUDOSCALAR4,
  wedgeProductMV,
} from "./Clifford4Internal.ts";
import { Vec4 } from "./Vec4.ts";

function vecToMV(v: Vec4): Multivector4 {
  const mv = mvZero();
  mv[E1] = v.x;
  mv[E2] = v.y;
  mv[E3] = v.z;
  mv[E4] = v.w;
  return mv;
}

export function bivectorToMV(b: Bivector4): Multivector4 {
  const mv = mvZero();
  mv[E12] = b.xy;
  mv[E13] = b.xz;
  mv[E14] = b.xw;
  mv[E23] = b.yz;
  mv[E24] = b.yw;
  mv[E34] = b.zw;
  return mv;
}

export function bivectorFromMV(mv: Multivector4): Bivector4 {
  return new Bivector4(
    mv[E12] as number,
    mv[E13] as number,
    mv[E14] as number,
    mv[E23] as number,
    mv[E24] as number,
    mv[E34] as number,
  );
}

/** The Euclidean inner product `a · b` (a scalar). Equivalent to `a.dot(b)`. */
export function dotProduct(a: Vec4, b: Vec4): number {
  return a.dot(b);
}

/** The outer (wedge) product `a ∧ b` — the oriented 2-plane spanned by `a` and `b`. */
export function wedgeProduct(a: Vec4, b: Vec4): Bivector4 {
  return bivectorFromMV(wedgeProductMV(vecToMV(a), vecToMV(b)));
}

export interface VectorGeometricProduct {
  readonly scalar: number;
  readonly bivector: Bivector4;
}

/** The full geometric product `a * b = a·b + a∧b` of two vectors. */
export function geometricProductVectors(a: Vec4, b: Vec4): VectorGeometricProduct {
  const mv = geometricProductMV(vecToMV(a), vecToMV(b));
  return { scalar: mv[0] as number, bivector: bivectorFromMV(mv) };
}

export interface BivectorGeometricProduct {
  readonly scalar: number;
  readonly bivector: Bivector4;
  readonly pseudoscalar: number;
}

/**
 * The full geometric product `A * B` of two bivectors: `⟨AB⟩₀ + ⟨AB⟩₂ + ⟨AB⟩₄`.
 * This is the operation that makes 4D rotors an 8-component (1 + 6 + 1)
 * object — the grade-4 (pseudoscalar) term has no 3D analogue, since in 3D
 * the product of two bivectors never produces a grade-4 term (3D has no
 * grade above 3). It's exactly this term that lets a 4D rotor encode a
 * *double rotation*: simultaneous rotation in two independent orthogonal
 * planes at once.
 */
export function geometricProductBivectors(a: Bivector4, b: Bivector4): BivectorGeometricProduct {
  const mv = geometricProductMV(bivectorToMV(a), bivectorToMV(b));
  return {
    scalar: mv[0] as number,
    bivector: bivectorFromMV(mv),
    pseudoscalar: mv[PSEUDOSCALAR4] as number,
  };
}

/**
 * Hodge dual of a bivector in 4D: maps each basis 2-plane to its orthogonal
 * complement 2-plane (e.g. `dual(e12) = ±e34`), scaled by the pseudoscalar.
 * Unlike 3D (where the dual of a bivector is a vector), the 4D dual of a
 * bivector is again a bivector — this is a 4D-specific fact worth remembering
 * when porting 3D geometric intuition.
 */
export function dual(b: Bivector4): Bivector4 {
  // Multiplying by the inverse pseudoscalar (I⁻¹ = -I in Cl(4,0), since
  // I*I = +1... actually for Cl(4,0), I^2 = (e1e2e3e4)^2 = +1, so I⁻¹ = I)
  // implements the Hodge dual via the geometric product with I.
  const I = mvZero();
  I[PSEUDOSCALAR4] = 1;
  const mv = geometricProductMV(bivectorToMV(b), I);
  return bivectorFromMV(mv);
}

/**
 * The commutator product `A × B = ½(AB − BA)` of two bivectors -- distinct
 * from {@link geometricProductBivectors}'s full `AB`. This is the operation
 * n-dimensional rigid body dynamics needs for the generalized Euler's
 * equation `L_t(ω) = I(ω_t) − ω × I(ω) = τ` (angular momentum, inertia
 * tensor, and torque are all bivectors in 4D; this `×` is the commutator,
 * not the 3D cross product it specializes to in 3D).
 */
export function commutatorProduct(a: Bivector4, b: Bivector4): Bivector4 {
  const ab = geometricProductMV(bivectorToMV(a), bivectorToMV(b));
  const ba = geometricProductMV(bivectorToMV(b), bivectorToMV(a));
  const commutator = mvZero();
  for (let i = 0; i < commutator.length; i++) commutator[i] = ((ab[i] as number) - (ba[i] as number)) / 2;
  return bivectorFromMV(commutator);
}

/**
 * The left contraction `v⌋B` of a vector into a bivector, producing a
 * vector -- the grade-1 part of the geometric product `vB` (the geometric
 * product of a grade-1 and a grade-2 element splits into grade 1 [this] and
 * grade 3, and this package doesn't otherwise need grade-3/trivector
 * results, so only the grade-1 part is extracted here). Needed for a rigid
 * body's point velocity: `v_point = v + r⌋ω`, where `v` is linear velocity
 * (Vec4), `ω` is angular velocity (Bivector4), and `r` is the point's offset
 * from the body's center of mass.
 */
export function leftContraction(v: Vec4, b: Bivector4): Vec4 {
  const mv = geometricProductMV(vecToMV(v), bivectorToMV(b));
  return new Vec4(mv[E1] as number, mv[E2] as number, mv[E3] as number, mv[E4] as number);
}
