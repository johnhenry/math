/**
 * Bivector4 — an oriented 2-plane in 4D space, i.e. an element of grade 2 in
 * Cl(4,0). Basis: `e12, e13, e14, e23, e24, e34` (6 components — in general nD
 * there are `n(n-1)/2` independent 2-planes: 1 in 2D, 3 in 3D, 6 in 4D).
 *
 * In 3D, angular velocity/momentum/torque are conventionally written as
 * *vectors* via the cross product, but that only works because 3D vectors
 * happen to have the same dimension (3) as 3D bivectors — a coincidence
 * unique to 3D. In 4D (and in general) these quantities are properly
 * bivectors, not vectors: see {@link Rotor4} for how a bivector generates a
 * rotation, and the physics package for angular velocity/momentum as
 * Bivector4.
 */
export class Bivector4 {
  /** e12 component — the xy rotation plane. */
  readonly xy: number;
  /** e13 component — the xz rotation plane. */
  readonly xz: number;
  /** e14 component — the xw rotation plane. */
  readonly xw: number;
  /** e23 component — the yz rotation plane. */
  readonly yz: number;
  /** e24 component — the yw rotation plane. */
  readonly yw: number;
  /** e34 component — the zw rotation plane. */
  readonly zw: number;

  static readonly Zero = new Bivector4(0, 0, 0, 0, 0, 0);

  constructor(xy = 0, xz = 0, xw = 0, yz = 0, yw = 0, zw = 0) {
    this.xy = xy;
    this.xz = xz;
    this.xw = xw;
    this.yz = yz;
    this.yw = yw;
    this.zw = zw;
  }

  add(b: Bivector4): Bivector4 {
    return new Bivector4(
      this.xy + b.xy,
      this.xz + b.xz,
      this.xw + b.xw,
      this.yz + b.yz,
      this.yw + b.yw,
      this.zw + b.zw,
    );
  }

  subtract(b: Bivector4): Bivector4 {
    return new Bivector4(
      this.xy - b.xy,
      this.xz - b.xz,
      this.xw - b.xw,
      this.yz - b.yz,
      this.yw - b.yw,
      this.zw - b.zw,
    );
  }

  scale(s: number): Bivector4 {
    return new Bivector4(this.xy * s, this.xz * s, this.xw * s, this.yz * s, this.yw * s, this.zw * s);
  }

  negate(): Bivector4 {
    return this.scale(-1);
  }

  /** Component-wise inner product (the basis bivectors e12..e34 are mutually orthonormal, so this is just the Euclidean dot product of components). */
  dot(b: Bivector4): number {
    return this.xy * b.xy + this.xz * b.xz + this.xw * b.xw + this.yz * b.yz + this.yw * b.yw + this.zw * b.zw;
  }

  get magnitude(): number {
    return Math.sqrt(this.dot(this));
  }

  get magnitudeSquared(): number {
    return this.dot(this);
  }

  normalize(): Bivector4 {
    const m = this.magnitude;
    if (m === 0) throw new Error("Cannot normalize the zero bivector.");
    return this.scale(1 / m);
  }

  /**
   * True when this bivector is *simple* (a.k.a. a blade): it represents
   * rotation in a single 2-plane, like every 3D bivector always does. A 4D
   * bivector is simple iff its self-wedge `B ∧ B` vanishes (equivalently,
   * `B * B` — the geometric product with itself — has no pseudoscalar part).
   * Non-simple ("compound") bivectors are the ones responsible for 4D's
   * double rotations — see {@link Rotor4}.
   */
  isSimple(epsilon = 1e-9): boolean {
    // B ∧ B for a bivector reduces to twice the Pfaffian-like pairing of
    // opposite basis planes: (xy*zw - xz*yw + xw*yz), matching the
    // pseudoscalar component produced by the geometric product B*B.
    const pfaffian = this.xy * this.zw - this.xz * this.yw + this.xw * this.yz;
    return Math.abs(pfaffian) <= epsilon;
  }

  equals(b: Bivector4, epsilon = 0): boolean {
    if (epsilon === 0) {
      return (
        this.xy === b.xy &&
        this.xz === b.xz &&
        this.xw === b.xw &&
        this.yz === b.yz &&
        this.yw === b.yw &&
        this.zw === b.zw
      );
    }
    return (
      Math.abs(this.xy - b.xy) <= epsilon &&
      Math.abs(this.xz - b.xz) <= epsilon &&
      Math.abs(this.xw - b.xw) <= epsilon &&
      Math.abs(this.yz - b.yz) <= epsilon &&
      Math.abs(this.yw - b.yw) <= epsilon &&
      Math.abs(this.zw - b.zw) <= epsilon
    );
  }

  toArray(): [number, number, number, number, number, number] {
    return [this.xy, this.xz, this.xw, this.yz, this.yw, this.zw];
  }

  static fromArray(a: readonly [number, number, number, number, number, number]): Bivector4 {
    return new Bivector4(a[0], a[1], a[2], a[3], a[4], a[5]);
  }

  toString(): string {
    return `${this.xy}e12 + ${this.xz}e13 + ${this.xw}e14 + ${this.yz}e23 + ${this.yw}e24 + ${this.zw}e34`;
  }
}
