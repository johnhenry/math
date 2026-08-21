const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

/** The next representable double strictly greater than `value` (IEEE-754 nextafter toward +Infinity) -- JS has no built-in `Math.nextafter`, so this steps the raw 64-bit pattern by one ULP via a shared scratch buffer. */
function nextUp(value: number): number {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  F64[0] = value;
  U64[0] = (U64[0] as bigint) + (value > 0 ? 1n : -1n);
  return F64[0] as number;
}

/** The next representable double strictly less than `value` -- `-nextUp(-value)`, since stepping toward -Infinity from `x` is the mirror of stepping toward +Infinity from `-x`. */
function nextDown(value: number): number {
  return -nextUp(-value);
}

/**
 * Widens `x` by one ULP on each side -- the outward-rounding every non-exact
 * `Interval` operation below applies to its result. `Math.*` computes to
 * the *nearest* representable double (`Math.sqrt` is correctly rounded to
 * 0.5 ULP per IEEE-754; the other transcendentals/arithmetic are within
 * ~1 ULP on every mainstream engine), which breaks the containment
 * guarantee interval arithmetic exists to provide: `Interval.point(2).sqrt()`
 * would otherwise return a degenerate `[s, s]` that provably does NOT
 * contain the irrational `sqrt(2)`. One ULP of outward slack restores
 * rigor, at the cost of a deliberately loose bound when a result happens
 * to be exactly representable (e.g. `sqrt(4)` reports a width-2-ULP
 * interval around 2 instead of the point `[2, 2]`).
 */
function outward(x: Interval): Interval {
  return new Interval(nextDown(x.lo), nextUp(x.hi));
}

/**
 * Interval — rigorous interval arithmetic `[lo, hi]`. Operations return an
 * interval guaranteed to contain every result of the corresponding operation on
 * any pair of members, so a final interval bounds the true answer despite
 * rounding — useful for reliable numerics and error tracking. Every
 * operation that isn't provably exact (`negate`/`abs`/`hull`/`intersect`
 * only move or compare existing endpoints) outward-rounds its result by
 * one ULP per side via `outward()` above.
 */
export class Interval {
  readonly lo: number;
  readonly hi: number;

  constructor(lo: number, hi: number = lo) {
    if (lo > hi) throw new Error(`Invalid interval: [${lo}, ${hi}]`);
    this.lo = lo;
    this.hi = hi;
  }

  static of(lo: number, hi: number): Interval {
    return new Interval(lo, hi);
  }

  /** A degenerate interval `[x, x]`. */
  static point(x: number): Interval {
    return new Interval(x, x);
  }

  get width(): number {
    return this.hi - this.lo;
  }
  get midpoint(): number {
    return (this.lo + this.hi) / 2;
  }
  get radius(): number {
    return this.width / 2;
  }

  contains(x: number): boolean {
    return this.lo <= x && x <= this.hi;
  }
  overlaps(o: Interval): boolean {
    return this.lo <= o.hi && o.lo <= this.hi;
  }

  add(o: Interval): Interval {
    return outward(new Interval(this.lo + o.lo, this.hi + o.hi));
  }
  subtract(o: Interval): Interval {
    return outward(new Interval(this.lo - o.hi, this.hi - o.lo));
  }
  /** Exact: IEEE-754 negation only flips the sign bit, no rounding. */
  negate(): Interval {
    return new Interval(-this.hi, -this.lo);
  }

  multiply(o: Interval): Interval {
    const p = [this.lo * o.lo, this.lo * o.hi, this.hi * o.lo, this.hi * o.hi];
    return outward(new Interval(Math.min(...p), Math.max(...p)));
  }

  divide(o: Interval): Interval {
    if (o.contains(0)) throw new Error("Interval division by an interval containing zero.");
    // The reciprocal bounds are themselves a rounded operation -- outward
    // it before feeding into `multiply` (which outward-rounds its own
    // result too), so neither step's rounding can silently eat the other's
    // slack.
    const reciprocal = outward(new Interval(1 / o.hi, 1 / o.lo));
    return this.multiply(reciprocal);
  }

  /** The tightest interval containing both (the convex hull / union). */
  hull(o: Interval): Interval {
    return new Interval(Math.min(this.lo, o.lo), Math.max(this.hi, o.hi));
  }

  /** The overlap of two intervals, or `null` if they are disjoint. */
  intersect(o: Interval): Interval | null {
    const lo = Math.max(this.lo, o.lo);
    const hi = Math.min(this.hi, o.hi);
    return lo <= hi ? new Interval(lo, hi) : null;
  }

  abs(): Interval {
    if (this.lo >= 0) return this;
    if (this.hi <= 0) return this.negate();
    return new Interval(0, Math.max(-this.lo, this.hi));
  }

  sqrt(): Interval {
    if (this.lo < 0) throw new Error("sqrt of an interval with negative values.");
    return outward(new Interval(Math.sqrt(this.lo), Math.sqrt(this.hi)));
  }
  exp(): Interval {
    return outward(new Interval(Math.exp(this.lo), Math.exp(this.hi)));
  }
  log(): Interval {
    if (this.lo <= 0) throw new Error("log of an interval with non-positive values.");
    return outward(new Interval(Math.log(this.lo), Math.log(this.hi)));
  }

  /** Integer power (handles even powers of intervals straddling zero). Exact when `n === 0` (every interval to the 0th power is the exact point 1). */
  pow(n: number): Interval {
    if (!Number.isInteger(n) || n < 0) throw new Error("Interval.pow requires a non-negative integer.");
    if (n === 0) return Interval.point(1);
    const a = this.lo ** n;
    const b = this.hi ** n;
    if (n % 2 === 0 && this.contains(0)) return outward(new Interval(0, Math.max(a, b)));
    return outward(new Interval(Math.min(a, b), Math.max(a, b)));
  }

  private extrema(f: (x: number) => number, criticalPeriodStart: number, period: number): Interval {
    const candidates = [f(this.lo), f(this.hi)];
    // include critical points of the form `criticalPeriodStart + k·period` in range
    const kStart = Math.ceil((this.lo - criticalPeriodStart) / period);
    const kEnd = Math.floor((this.hi - criticalPeriodStart) / period);
    for (let k = kStart; k <= kEnd; k++) candidates.push(f(criticalPeriodStart + k * period));
    return outward(new Interval(Math.min(...candidates), Math.max(...candidates)));
  }

  sin(): Interval {
    if (this.width >= 2 * Math.PI) return new Interval(-1, 1);
    return this.extrema(Math.sin, Math.PI / 2, Math.PI);
  }
  cos(): Interval {
    if (this.width >= 2 * Math.PI) return new Interval(-1, 1);
    return this.extrema(Math.cos, 0, Math.PI);
  }

  equals(o: Interval): boolean {
    return this.lo === o.lo && this.hi === o.hi;
  }

  toString(): string {
    return `[${this.lo}, ${this.hi}]`;
  }
}
