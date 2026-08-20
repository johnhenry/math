/**
 * Rotor4 — a rotation operator in 4D space: `scalar + bivector (6) + pseudoscalar (1)`,
 * 8 components total. This is the 4D generalization of {@link Quaternion}
 * (which is really the 3D rotor, `scalar + bivector (3)`, that happens to
 * have the same component count as a 3D vector — a coincidence unique to 3D
 * that doesn't hold in 4D or any other dimension).
 *
 * **Double rotations.** A general 3D rotor always describes rotation in a
 * single 2-plane. A general 4D rotor can describe a *double rotation*:
 * simultaneous, independent rotation in two mutually orthogonal 2-planes at
 * once — this is the origin of the nonzero pseudoscalar component, and it
 * has no 3D analogue. See {@link Rotor4.multiply} composing two
 * single-plane rotors in orthogonal planes for how a double rotation arises.
 *
 * **Normalization caveat.** {@link Rotor4.normalize} in this module performs
 * the naive quaternion-style renormalization (divide by magnitude). This is
 * only exactly correct for *simple* rotors (single rotation plane) — for a
 * genuine double rotation it does not lie on the same manifold as a simple
 * rotor, so naive renormalization after numerical drift can silently produce
 * an invalid rotor. A full fix (Perwass 2009 rotor factorization) belongs in
 * the physics layer where repeated integration actually accumulates drift;
 * this module intentionally does not attempt it — see the
 * `N-Dimensional Rigid Body Dynamics` (SIGGRAPH 2020) paper §3.3.
 */
import { Bivector4 } from "./Bivector4.ts";
import { E1, E2, E3, E4, geometricProductMV, type Multivector4, mvZero, PSEUDOSCALAR4 } from "./Clifford4Internal.ts";
import { bivectorFromMV, bivectorToMV } from "./GeometricAlgebra4.ts";
import { Vec4 } from "./Vec4.ts";

export class Rotor4 {
  readonly scalar: number;
  readonly bivector: Bivector4;
  readonly pseudoscalar: number;

  static readonly Identity = new Rotor4(1, Bivector4.Zero, 0);

  constructor(scalar = 1, bivector: Bivector4 = Bivector4.Zero, pseudoscalar = 0) {
    this.scalar = scalar;
    this.bivector = bivector;
    this.pseudoscalar = pseudoscalar;
  }

  private toMV(): Multivector4 {
    const mv = mvZero();
    mv[0] = this.scalar;
    const bmv = bivectorToMV(this.bivector);
    for (let i = 0; i < bmv.length; i++) mv[i] += bmv[i] as number;
    mv[PSEUDOSCALAR4] = this.pseudoscalar;
    return mv;
  }

  private static fromMV(mv: Multivector4): Rotor4 {
    return new Rotor4(mv[0] as number, bivectorFromMV(mv), mv[PSEUDOSCALAR4] as number);
  }

  add(r: Rotor4): Rotor4 {
    return new Rotor4(this.scalar + r.scalar, this.bivector.add(r.bivector), this.pseudoscalar + r.pseudoscalar);
  }

  scale(s: number): Rotor4 {
    return new Rotor4(this.scalar * s, this.bivector.scale(s), this.pseudoscalar * s);
  }

  /** The geometric product `this * r` — composes two rotations (apply `r` first, then `this`). */
  multiply(r: Rotor4): Rotor4 {
    return Rotor4.fromMV(geometricProductMV(this.toMV(), r.toMV()));
  }

  /**
   * The reverse `R~`: reverses the order of vector factors, which negates the
   * bivector (grade 2, picks up (-1)^1) but leaves the scalar (grade 0) and
   * pseudoscalar (grade 4, picks up (-1)^6 = +1) unchanged. For a unit rotor,
   * this is also the inverse — the 4D analogue of a quaternion's conjugate.
   */
  reverse(): Rotor4 {
    return new Rotor4(this.scalar, this.bivector.negate(), this.pseudoscalar);
  }

  get magnitudeSquared(): number {
    return this.scalar * this.scalar + this.bivector.magnitudeSquared + this.pseudoscalar * this.pseudoscalar;
  }

  get magnitude(): number {
    return Math.sqrt(this.magnitudeSquared);
  }

  /**
   * Naive renormalization (divide by magnitude). Exact for simple rotors;
   * see the class-level doc comment for why this is *not* generally correct
   * for double rotations, and where the real fix belongs.
   */
  normalize(): Rotor4 {
    const m = this.magnitude;
    if (m === 0) throw new Error("Cannot normalize the zero rotor.");
    return this.scale(1 / m);
  }

  /** Apply this rotor to a vector via the sandwich product `R v R~`. Rotates `v`. */
  apply(v: Vec4): Vec4 {
    const vmv = mvZero();
    vmv[E1] = v.x;
    vmv[E2] = v.y;
    vmv[E3] = v.z;
    vmv[E4] = v.w;
    const mv = geometricProductMV(geometricProductMV(this.toMV(), vmv), this.reverse().toMV());
    return new Vec4(mv[E1] as number, mv[E2] as number, mv[E3] as number, mv[E4] as number);
  }

  /** Apply this rotor to a bivector via the sandwich product `R B R~`. Rotates the 2-plane `B`. */
  applyToBivector(b: Bivector4): Bivector4 {
    const mv = geometricProductMV(geometricProductMV(this.toMV(), bivectorToMV(b)), this.reverse().toMV());
    return bivectorFromMV(mv);
  }

  /**
   * Build the rotor for a rotation of `angle` radians in the 2-plane `plane`
   * (analogous to {@link Quaternion.fromAxisAngle}, but a *plane* rather than
   * an *axis* — axes only work as rotation generators in 3D). `plane` must be
   * simple (see {@link Bivector4.isSimple}); to build a double rotation,
   * construct two simple rotors in orthogonal planes and {@link multiply}
   * them together.
   */
  static fromBivectorAngle(plane: Bivector4, angle: number): Rotor4 {
    if (!plane.isSimple()) {
      throw new Error(
        "Rotor4.fromBivectorAngle requires a simple (single-plane) bivector. " +
          "To build a double rotation, multiply() two simple rotors in orthogonal planes instead.",
      );
    }
    const unitPlane = plane.normalize();
    const half = angle / 2;
    return new Rotor4(Math.cos(half), unitPlane.scale(Math.sin(half)), 0);
  }

  /**
   * Recover `(plane, angle)` for a *simple* rotor (pseudoscalar ≈ 0). Throws
   * for a compound (double-rotation) rotor — see the class-level doc comment;
   * decomposing a general rotor's log is the Perwass-factorization work
   * deferred to the physics layer.
   */
  toBivectorAngle(epsilon = 1e-9): { plane: Bivector4; angle: number } {
    if (Math.abs(this.pseudoscalar) > epsilon) {
      throw new Error(
        "Rotor4.toBivectorAngle only supports simple rotors (pseudoscalar ≈ 0); " +
          "this rotor is a compound double rotation.",
      );
    }
    const bMag = this.bivector.magnitude;
    const angle = 2 * Math.atan2(bMag, this.scalar);
    if (bMag === 0) return { plane: Bivector4.Zero, angle: 0 };
    return { plane: this.bivector.normalize(), angle };
  }

  equals(r: Rotor4, epsilon = 0): boolean {
    return (
      (epsilon === 0 ? this.scalar === r.scalar : Math.abs(this.scalar - r.scalar) <= epsilon) &&
      this.bivector.equals(r.bivector, epsilon) &&
      (epsilon === 0 ? this.pseudoscalar === r.pseudoscalar : Math.abs(this.pseudoscalar - r.pseudoscalar) <= epsilon)
    );
  }

  toString(): string {
    return `${this.scalar} + (${this.bivector.toString()}) + ${this.pseudoscalar}e1234`;
  }
}
