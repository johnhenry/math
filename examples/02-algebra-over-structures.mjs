// Linear algebra over an arbitrary algebraic structure — the family's
// signature idea. The same Gauss-Jordan code runs over the reals, the
// complexes, exact rationals, quaternions, dual numbers... or a finite
// field, as here: matrix inversion over GF(7).
//
// Run: npm install && node examples/02-algebra-over-structures.mjs
import { Structure, Vector } from "@johnhenry/math";

const gf7 = Structure.integersModulo(7); // GF(7), a finite field

// Field arithmetic mod 7
console.log(gf7.reciprocal(3)); // 5   (3*5 = 15 = 1 mod 7)

// Invert a matrix over GF(7) — no floating point anywhere
const a = Vector.fromArray([Vector.fromArray([2, 3]), Vector.fromArray([1, 4])]);
const inv = gf7.invertMatrix(a);
console.log(String(inv)); // [[5, 5], [4, 6]]

// Check: a * a^-1 = identity, entries mod 7
console.log(String(gf7.multiplyMatrix(a, inv))); // [[1, 0], [0, 1]]

// Swap the structure, keep the algorithm:
//   Structure.realField(), complexField(), rationalField(),
//   quaternionRing(), dualNumbers(), decimalField(), booleanRing()
