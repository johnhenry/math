/**
 * Rng — a seeded, reproducible pseudo-random generator (PCG32, XSH-RR variant;
 * see https://www.pcg-random.org/). The same seed always yields the same
 * stream, which is the point: reproducible Monte Carlo runs and deterministic
 * tests. There is no shared global state — every consumer takes an explicit
 * generator, so nothing interferes across tests.
 *
 * The stream is bit-identical to `Rng` in `@johnhenry/math-plus-tensor-core`
 * (same constants, same seeding), so existing seeds keep their results.
 *
 * `rng.next` is a bound `() => number` returning floats in `[0, 1)`, which is
 * the `rng` hook {@link Distributions} factories and the Monte Carlo helpers
 * accept.
 */

// 64-bit LCG state held as two uint32 limbs (hi, lo) so no BigInt is needed on the hot path.
const MULT_HI = 0x5851f42d;
const MULT_LO = 0x4c957f2d;
const TWO32 = 4294967296;

/** Full 32x32 -> 64-bit unsigned product as [hi, lo], exact in doubles via 16-bit limbs. */
function mul32(a: number, b: number): [number, number] {
  const a0 = a & 0xffff;
  const a1 = a >>> 16;
  const b0 = b & 0xffff;
  const b1 = b >>> 16;
  const mid = a0 * b1 + a1 * b0;
  const lo64 = a0 * b0 + (mid % 65536) * 65536;
  const carry = Math.floor(lo64 / TWO32);
  return [a1 * b1 + Math.floor(mid / 65536) + carry, lo64 % TWO32];
}

export class Rng {
  #hi = 0;
  #lo = 0;
  readonly #incHi: number;
  readonly #incLo: number;

  constructor(seedValue: number | bigint = 0n, sequence: number | bigint = 1n) {
    const inc = ((BigInt(sequence) << 1n) | 1n) & 0xffffffffffffffffn;
    this.#incHi = Number(inc >> 32n);
    this.#incLo = Number(inc & 0xffffffffn);
    this.#step();
    const s = BigInt(seedValue) & 0xffffffffffffffffn;
    const lo = this.#lo + Number(s & 0xffffffffn);
    this.#lo = lo % TWO32;
    this.#hi = (this.#hi + Number(s >> 32n) + Math.floor(lo / TWO32)) % TWO32;
    this.#step();
  }

  /** Advance the LCG; returns the previous state as [hi, lo]. */
  #step(): void {
    const [ph, pl] = mul32(this.#lo, MULT_LO);
    const cross = (Math.imul(this.#hi, MULT_LO) + Math.imul(this.#lo, MULT_HI)) >>> 0;
    const lo = pl + this.#incLo;
    this.#lo = lo % TWO32;
    this.#hi = (ph + cross + this.#incHi + Math.floor(lo / TWO32)) % TWO32;
  }

  /** Next integer in `[0, 2^32)`. */
  nextUint32(): number {
    const hi = this.#hi;
    const lo = this.#lo;
    this.#step();
    const xh = (hi ^ (hi >>> 18)) >>> 0;
    const xl = (lo ^ (((hi << 14) | (lo >>> 18)) >>> 0)) >>> 0;
    const v = ((xl >>> 27) | (xh << 5)) >>> 0;
    const rot = hi >>> 27;
    return ((v >>> rot) | (v << (-rot & 31))) >>> 0;
  }

  /** Uniform float in `[0, 1)`. */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Bound alias of {@link nextFloat}, usable directly as a `() => number` rng hook. */
  readonly next = (): number => this.nextFloat();

  /** Uniform integer in `[0, bound)` without modulo bias. */
  nextBelow(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0)
      throw new RangeError(`nextBelow: bound must be a positive integer, got ${bound}`);
    const limit = Math.floor(4294967296 / bound) * bound;
    let x: number;
    do {
      x = this.nextUint32();
    } while (x >= limit);
    return x % bound;
  }

  /** Standard-normal draw (Box-Muller, two uniforms per call). */
  nextNormal(mean = 0, sd = 1): number {
    let u1 = this.nextFloat();
    if (u1 === 0) u1 = Number.MIN_VALUE;
    const u2 = this.nextFloat();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/** A fresh seeded generator. */
export function seed(value: number | bigint): Rng {
  return new Rng(value);
}
