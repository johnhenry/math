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
 * **Normalization caveat.** {@link Rotor4.normalize} performs the naive
 * quaternion-style renormalization (divide by magnitude). This is only
 * exactly correct for *simple* rotors (single rotation plane) — for a
 * genuine double rotation it does not lie on the same manifold as a simple
 * rotor, so naive renormalization after numerical drift can silently produce
 * an invalid rotor. {@link Rotor4.factor} and {@link Rotor4.renormalize} are
 * the proper fix (Perwass-style rotor factorization): decompose into two
 * simple rotors in orthogonal planes, each renormalizable exactly, then
 * recompose — see the `N-Dimensional Rigid Body Dynamics` (SIGGRAPH 2020)
 * paper §3.3 for why this matters for repeated physics integration.
 */
import { Bivector4 } from "./Bivector4.ts";
import { E1, E2, E3, E4, geometricProductMV, type Multivector4, mvZero, PSEUDOSCALAR4 } from "./Clifford4Internal.ts";
import { bivectorFromMV, bivectorToMV, wedgeProduct } from "./GeometricAlgebra4.ts";
import { MatrixMath } from "./MatrixMath.ts";
import { Vec4 } from "./Vec4.ts";
import { Vector } from "./Vector.ts";

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
   * Perwass-style rotor factorization: decompose this rotor into two simple
   * rotors `[R1, R2]` in mutually orthogonal planes such that `R2.multiply(R1)`
   * has the same *action* as this rotor (equal up to the usual rotor
   * double-cover sign, like any rotor comparison) — the proper fix for
   * {@link normalize}'s documented limitation on double rotations. Works
   * even when this rotor has drifted away from being a valid unit rotor
   * (the intended use case: repeated physics integration).
   *
   * Method: find this rotor's two invariant 2-planes as eigenspaces of the
   * *symmetric* part `S = M + Mᵀ` of its 4x4 matrix representation `M`
   * (restricted to an invariant plane with rotation angle `θ`, `M + Mᵀ` is
   * `2cos(θ)` times the identity on that plane — so same-angle-magnitude
   * planes share an eigenvalue, and a repeated eigenvalue of `S` signals an
   * isoclinic-type degeneracy where *any* orthonormal basis of that
   * eigenspace is a genuinely valid invariant-plane choice, not just an
   * approximation). `eigenSymmetric`'s eigenvector order isn't guaranteed to
   * group same-plane pairs together when eigenvalues coincide (or are
   * numerically indistinguishable), so the 3 possible pairings of the 4
   * eigenvectors into 2 pairs are explicitly checked for genuine
   * `M`-invariance (zero "leakage" into the other pair) before use, rather
   * than assumed from sort order. Once a valid pair `(u, v)` spanning an
   * invariant plane is known, the angle and correctly-oriented plane come
   * directly from how `M` actually acts on `u` within that plane —
   * `atan2(v·(Mu), u·(Mu))` — not from this rotor's own (possibly drifted)
   * scalar/bivector/pseudoscalar components.
   */
  factor(): [Rotor4, Rotor4] {
    const basis = [Vec4.Ex, Vec4.Ey, Vec4.Ez, Vec4.Ew];
    const columns = basis.map((e) => this.apply(e).toArray());
    const M = (i: number, j: number): number => columns[j]?.[i] as number;
    const S = Vector.fromArray([0, 1, 2, 3].map((i) => Vector.fromArray([0, 1, 2, 3].map((j) => M(i, j) + M(j, i)))));
    const { vectors } = MatrixMath.eigenSymmetric(S);
    const eig = [0, 1, 2, 3].map(
      (i) =>
        new Vec4(
          vectors[0]?.[i] as number,
          vectors[1]?.[i] as number,
          vectors[2]?.[i] as number,
          vectors[3]?.[i] as number,
        ),
    );

    const pairings: [[number, number], [number, number]][] = [
      [
        [0, 1],
        [2, 3],
      ],
      [
        [0, 2],
        [1, 3],
      ],
      [
        [0, 3],
        [1, 2],
      ],
    ];
    let bestLeak = Number.POSITIVE_INFINITY;
    let best: [[number, number], [number, number]] = pairings[0] as [[number, number], [number, number]];
    for (const [[i, j], [k, l]] of pairings) {
      const ei = eig[i] as Vec4;
      const ej = eig[j] as Vec4;
      const ek = eig[k] as Vec4;
      const el = eig[l] as Vec4;
      const mi = this.apply(ei);
      const mj = this.apply(ej);
      const leak = Math.abs(mi.dot(ek)) + Math.abs(mi.dot(el)) + Math.abs(mj.dot(ek)) + Math.abs(mj.dot(el));
      if (leak < bestLeak) {
        bestLeak = leak;
        best = [
          [i, j],
          [k, l],
        ];
      }
    }

    const planeAndAngle = (u: Vec4, v: Vec4): Rotor4 => {
      const mu = this.apply(u);
      const angle = Math.atan2(v.dot(mu), u.dot(mu));
      const plane = wedgeProduct(v, u).normalize();
      return Rotor4.fromBivectorAngle(plane, angle);
    };
    const [[a, b], [c, d]] = best;
    return [planeAndAngle(eig[a] as Vec4, eig[b] as Vec4), planeAndAngle(eig[c] as Vec4, eig[d] as Vec4)];
  }

  /**
   * The proper (Perwass-style) fix for numerical drift: {@link factor} this
   * rotor into two simple rotors — each exactly renormalizable, unlike a
   * compound rotor — and recompose. Prefer this over {@link normalize} once
   * a rotor may have accumulated drift through repeated integration and
   * could be a genuine double rotation; `normalize` remains correct (and
   * cheaper) for rotors known to be simple.
   */
  renormalize(): Rotor4 {
    // factor() reads this rotor's action via apply() (the sandwich product
    // R v R~), which scales vectors by |R|^2 for a non-unit R -- corrupting
    // the "M is a pure rotation matrix" assumption factor()'s eigenstructure
    // analysis depends on. A cheap magnitude normalize first removes that
    // radial drift; the exact plane/angle recovery in factor() then handles
    // the part naive normalize alone gets wrong (the double-rotation
    // manifold), on an already magnitude-correct input.
    const [r1, r2] = this.normalize().factor();
    return r2.multiply(r1);
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
   * `exp(B)`: the rotor for a rotation of `|B|` radians in `B`'s plane --
   * a convenience over {@link fromBivectorAngle} for the common case of an
   * already-scaled generator (e.g. `angularVelocity * dt` in a physics
   * integrator, where the bivector's magnitude *is* the rotation angle and
   * its direction *is* the plane). Returns {@link Identity} for the zero
   * bivector rather than throwing (unlike `fromBivectorAngle`, whose
   * `plane.normalize()` would throw on a zero plane).
   */
  static exp(bivector: Bivector4): Rotor4 {
    const angle = bivector.magnitude;
    if (angle === 0) return Rotor4.Identity;
    return Rotor4.fromBivectorAngle(bivector, angle);
  }

  /**
   * `log()`: the bivector `B` such that `exp(B) = this`, for a *simple*
   * rotor -- the inverse of {@link exp}. Throws for a compound
   * (double-rotation) rotor, same as {@link toBivectorAngle} (which this is
   * built on): decomposing a general rotor's log is the Perwass-factorization
   * work deferred to the physics layer.
   */
  log(epsilon = 1e-9): Bivector4 {
    const { plane, angle } = this.toBivectorAngle(epsilon);
    return plane.scale(angle);
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
