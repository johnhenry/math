/**
 * Vec4 — a Euclidean 4D vector `(x, y, z, w)`.
 *
 * This is a genuine fourth *spatial* dimension (not time): all four
 * components are treated symmetrically, exactly like {@link Quaternion}'s
 * imaginary triple but one dimension further. Built to support 4D geometric
 * algebra ({@link Bivector4}, {@link Rotor4}) for applications like simulating
 * or rendering four-dimensional space.
 */
export class Vec4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;

  static readonly Zero = new Vec4(0, 0, 0, 0);
  static readonly Ex = new Vec4(1, 0, 0, 0);
  static readonly Ey = new Vec4(0, 1, 0, 0);
  static readonly Ez = new Vec4(0, 0, 1, 0);
  static readonly Ew = new Vec4(0, 0, 0, 1);

  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  static of(x: number, y: number, z: number, w: number): Vec4 {
    return new Vec4(x, y, z, w);
  }

  add(v: Vec4): Vec4 {
    return new Vec4(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w);
  }

  subtract(v: Vec4): Vec4 {
    return new Vec4(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w);
  }

  scale(s: number): Vec4 {
    return new Vec4(this.x * s, this.y * s, this.z * s, this.w * s);
  }

  negate(): Vec4 {
    return this.scale(-1);
  }

  /** Euclidean inner product. */
  dot(v: Vec4): number {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
  }

  get magnitude(): number {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  get magnitudeSquared(): number {
    return this.dot(this);
  }

  normalize(): Vec4 {
    const m = this.magnitude;
    if (m === 0) throw new Error("Cannot normalize the zero vector.");
    return this.scale(1 / m);
  }

  lerp(v: Vec4, t: number): Vec4 {
    return this.add(v.subtract(this).scale(t));
  }

  equals(v: Vec4, epsilon = 0): boolean {
    if (epsilon === 0) return this.x === v.x && this.y === v.y && this.z === v.z && this.w === v.w;
    return (
      Math.abs(this.x - v.x) <= epsilon &&
      Math.abs(this.y - v.y) <= epsilon &&
      Math.abs(this.z - v.z) <= epsilon &&
      Math.abs(this.w - v.w) <= epsilon
    );
  }

  /** The 3D subvector `(x, y, z)` obtained by dropping the w-axis — useful when reading out the current 3D "slice" of a 4D scene. */
  dropW(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  static fromArray(a: readonly [number, number, number, number]): Vec4 {
    return new Vec4(a[0], a[1], a[2], a[3]);
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
  }
}
