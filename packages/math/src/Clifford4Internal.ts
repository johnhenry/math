/**
 * Internal Cl(4,0) geometric-algebra engine, used by {@link Vec4}, {@link Bivector4}
 * and {@link Rotor4} to implement the geometric product, sandwich product, and
 * exponential/logarithm maps correctly.
 *
 * Not exported from the package index — it is an implementation detail. Basis
 * vectors e1..e4 are represented as bits 0..3 of a "blade" bitmask (0..15),
 * e.g. blade 0b0011 = e1^e2, blade 0b1111 = e1^e2^e3^e4 (the pseudoscalar).
 * Because the metric is Euclidean (e_i * e_i = +1 for every i — no negative or
 * null basis vectors), the geometric product of two basis blades only needs a
 * *reordering sign* (how many transpositions sort the concatenated index list
 * into canonical order); there is no metric-signature contribution. This is
 * the standard bitmask/blade technique used by geometric-algebra libraries
 * (e.g. ganja.js), and is far less error-prone than hand-deriving each
 * product formula term by term.
 */

export const BLADE_COUNT = 16; // 2^4 basis blades in Cl(4,0)

function popcount(n: number): number {
  let count = 0;
  let x = n;
  while (x !== 0) {
    count += x & 1;
    x >>= 1;
  }
  return count;
}

/** Sign picked up reordering the concatenation of blade `a` then blade `b` into canonical order. */
function reorderingSign(a: number, b: number): number {
  let aShifted = a >> 1;
  let swaps = 0;
  while (aShifted !== 0) {
    swaps += popcount(aShifted & b);
    aShifted >>= 1;
  }
  return swaps % 2 === 0 ? 1 : -1;
}

export type Multivector4 = Float64Array; // length BLADE_COUNT, indexed by blade bitmask

export function mvZero(): Multivector4 {
  return new Float64Array(BLADE_COUNT);
}

/** Full geometric product of two multivectors: a * b. */
export function geometricProductMV(a: Multivector4, b: Multivector4): Multivector4 {
  const out = mvZero();
  for (let i = 0; i < BLADE_COUNT; i++) {
    const ai = a[i];
    if (!ai) continue;
    for (let j = 0; j < BLADE_COUNT; j++) {
      const bj = b[j];
      if (!bj) continue;
      const blade = i ^ j;
      out[blade] += reorderingSign(i, j) * ai * bj;
    }
  }
  return out;
}

/** Outer (wedge) product: nonzero only for blade pairs that share no basis vector. */
export function wedgeProductMV(a: Multivector4, b: Multivector4): Multivector4 {
  const out = mvZero();
  for (let i = 0; i < BLADE_COUNT; i++) {
    const ai = a[i];
    if (!ai) continue;
    for (let j = 0; j < BLADE_COUNT; j++) {
      const bj = b[j];
      if (!bj || (i & j) !== 0) continue;
      const blade = i ^ j;
      out[blade] += reorderingSign(i, j) * ai * bj;
    }
  }
  return out;
}

// Basis-vector and basis-bivector blade indices.
export const E1 = 1 << 0;
export const E2 = 1 << 1;
export const E3 = 1 << 2;
export const E4 = 1 << 3;
export const E12 = E1 | E2;
export const E13 = E1 | E3;
export const E14 = E1 | E4;
export const E23 = E2 | E3;
export const E24 = E2 | E4;
export const E34 = E3 | E4;
export const PSEUDOSCALAR4 = E1 | E2 | E3 | E4;
