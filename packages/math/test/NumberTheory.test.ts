import assert from "node:assert/strict";
import { test } from "node:test";
import { GroupTheory } from "../src/GroupTheory.ts";
import { NumberTheory as NT } from "../src/NumberTheory.ts";
import { Permutation } from "../src/Permutation.ts";
import { Structure } from "../src/Structure.ts";

// --- NumberTheory ---

test("modPow", () => {
  assert.equal(NT.modPow(2, 10, 1000), 24n); // 1024 mod 1000
  assert.equal(NT.modPow(3, 100, 7n), NT.modPow(3n, 100n, 7n));
  // Fermat: a^(p-1) = 1 mod p
  assert.equal(NT.modPow(2, 12, 13), 1n);
});

test("extendedGcd and modInverse", () => {
  const { g, x, y } = NT.extendedGcd(240, 46);
  assert.equal(g, 2n);
  assert.equal(240n * x + 46n * y, 2n);
  assert.equal(NT.modInverse(3, 11), 4n); // 3*4 = 12 = 1 mod 11
  assert.equal(NT.modInverse(2, 4), null); // no inverse
});

test("Chinese Remainder Theorem", () => {
  // x ≡ 2 (mod 3), x ≡ 3 (mod 5), x ≡ 2 (mod 7) -> 23
  const res = NT.crt([2, 3, 2], [3, 5, 7]);
  assert.ok(res);
  assert.equal(res.x, 23n);
  assert.equal(res.modulus, 105n);
});

test("Miller-Rabin primality", () => {
  assert.equal(NT.isProbablePrime(2), true);
  assert.equal(NT.isProbablePrime(97), true);
  assert.equal(NT.isProbablePrime(561), false); // Carmichael number
  assert.equal(NT.isProbablePrime(1), false);
  // a big prime (2^61 - 1, a Mersenne prime)
  assert.equal(NT.isProbablePrime(2n ** 61n - 1n), true);
  assert.equal(NT.nextPrime(100), 101n);
});

test("factorize (Pollard rho) and eulerPhi", () => {
  assert.deepEqual(NT.factorize(360), [
    [2n, 3],
    [3n, 2],
    [5n, 1],
  ]);
  // a semiprime of two largish primes
  const p = 1000003n;
  const q = 1000033n;
  assert.deepEqual(NT.factorize(p * q), [
    [p, 1],
    [q, 1],
  ]);
  assert.equal(NT.eulerPhi(36), 12n);
});

test("factorize/pollardRho on degenerate inputs terminate (regression for #36)", () => {
  // 1's factorization is the empty product -- no factors, not a hang.
  assert.deepEqual(NT.factorize(1), []);
  assert.deepEqual(NT.factorize(1n), []);
  // 0 has no well-defined prime factorization: every prime "divides" it with
  // no finite exponent. Previously this hung forever (0n % p === 0n and
  // 0n / p === 0n loop endlessly); it must now throw instead of hanging.
  assert.throws(() => NT.factorize(0), RangeError);
  assert.throws(() => NT.factorize(0n), RangeError);
  // Negative numbers factor by absolute value.
  assert.deepEqual(NT.factorize(-1), []);
  assert.deepEqual(NT.factorize(-12), [
    [2n, 2],
    [3n, 1],
  ]);
  // A lone prime factor.
  assert.deepEqual(NT.factorize(2), [[2n, 1]]);
  assert.deepEqual(NT.factorize(17), [[17n, 1]]);

  // pollardRho has no non-trivial factor to find for n <= 1 -- previously
  // pollardRho(1n) hung forever (gcd collapses to 1 for every c); it must
  // now throw instead of hanging.
  assert.throws(() => NT.pollardRho(1n), RangeError);
  assert.throws(() => NT.pollardRho(0n), RangeError);
  assert.throws(() => NT.pollardRho(-5n), RangeError);
  // Normal composite input still works.
  assert.equal(NT.pollardRho(91n) === 7n || NT.pollardRho(91n) === 13n, true);

  // eulerPhi(0) shares factorize's root cause and must also throw, not hang.
  assert.throws(() => NT.eulerPhi(0), RangeError);
});

test("Legendre and Jacobi symbols", () => {
  assert.equal(NT.legendreSymbol(2, 7), 1); // 2 is a QR mod 7 (3^2=2)
  assert.equal(NT.legendreSymbol(3, 7), -1);
  assert.equal(NT.jacobiSymbol(1001, 9907), -1);
  assert.equal(NT.jacobiSymbol(3, 9), 0); // gcd != 1
});

// --- GroupTheory ---

test("isGroup: Z4 under addition is a group", () => {
  const { elements, op } = GroupTheory.cyclicGroup(4);
  const eq = (a: number, b: number) => a === b;
  assert.equal(GroupTheory.isGroup(elements, op, eq), true);
  assert.equal(GroupTheory.isAbelian(elements, op, eq), true);
  assert.equal(GroupTheory.findIdentity(elements, op, eq), 0);
  assert.equal(GroupTheory.elementOrder(1, op, eq, 0), 4);
});

test("non-group is rejected", () => {
  // {0,1,2} under addition mod 4 is not closed
  const eq = (a: number, b: number) => a === b;
  assert.equal(
    GroupTheory.isGroup([0, 1, 2], (a, b) => (a + b) % 4, eq),
    false,
  );
});

test("subgroup, cosets and Lagrange index", () => {
  const { elements, op } = GroupTheory.cyclicGroup(6);
  const eq = (a: number, b: number) => a === b;
  const sub = GroupTheory.closure([2], op, eq); // {0,2,4}
  assert.deepEqual(
    [...sub].sort((a, b) => a - b),
    [0, 2, 4],
  );
  assert.equal(GroupTheory.isSubgroup(sub, elements, op, eq), true);
  const cosets = GroupTheory.leftCosets(sub, elements, op, eq);
  assert.equal(cosets.length, 2);
  assert.equal(GroupTheory.index(elements, sub), 2);
});

test("symmetric group S3 is a non-abelian group of order 6", () => {
  const s3 = GroupTheory.symmetricGroup(3);
  assert.equal(s3.length, 6);
  const op = (a: Permutation<number>, b: Permutation<number>) => Permutation.compose(a, b);
  const eq = (a: Permutation<number>, b: Permutation<number>) => Permutation.equal(a, b);
  assert.equal(GroupTheory.isGroup(s3, op, eq), true);
  assert.equal(GroupTheory.isAbelian(s3, op, eq), false);
});

test("dihedral group D4 is a non-abelian group of order 8; D3 coincides element-for-element with S3", () => {
  const d4 = GroupTheory.dihedralGroup(4);
  assert.equal(d4.length, 8);
  const op = (a: Permutation<number>, b: Permutation<number>) => Permutation.compose(a, b);
  const eq = (a: Permutation<number>, b: Permutation<number>) => Permutation.equal(a, b);
  assert.equal(GroupTheory.isGroup(d4, op, eq), true);
  assert.equal(GroupTheory.isAbelian(d4, op, eq), false);

  const d3 = GroupTheory.dihedralGroup(3);
  const s3 = GroupTheory.symmetricGroup(3);
  assert.equal(d3.length, 6);
  assert.equal(s3.length, 6);
  // Same set of permutations, not just isomorphic -- S3 has only 6
  // permutations of {0,1,2} total, and D3's rotations+reflections produce
  // exactly those 6 (verified via a standalone script before writing this).
  assert.ok(d3.every((d) => s3.some((s) => eq(d, s))));
  assert.ok(s3.every((s) => d3.some((d) => eq(d, s))));
});

test("orbit-stabilizer theorem holds for D4 acting on the 4 vertices of a square", () => {
  const d4 = GroupTheory.dihedralGroup(4);
  const action = (g: Permutation<number>, x: number) => g.apply(x);
  const eqX = (a: number, b: number) => a === b;
  const orbit = GroupTheory.orbit(0, d4, action, eqX);
  // D4 is vertex-transitive: every vertex reachable from vertex 0.
  assert.deepEqual([...orbit].sort(), [0, 1, 2, 3]);
  const stab = GroupTheory.stabilizer(0, d4, action, eqX);
  // |orbit(x)| * |stabilizer(x)| = |G|
  assert.equal(orbit.length * stab.length, d4.length);
  assert.equal(stab.length, 2, "identity + the reflection fixing vertex 0");
});

test("closure of the empty generating set is the trivial subgroup [identity] (bug fix)", () => {
  const eq = (a: number, b: number) => a === b;
  // Without an identity to seed from, there's nothing to recover it from.
  assert.deepEqual(
    GroupTheory.closure([], (a: number, b: number) => a + b, eq),
    [],
  );
  // Supplying identity explicitly yields the trivial subgroup.
  assert.deepEqual(
    GroupTheory.closure([], (a: number, b: number) => a + b, eq, 0),
    [0],
  );
});

test("GroupTheory composes with a Structure (units of Z/7)", () => {
  const gf7 = Structure.integersModulo(7);
  const units = [1, 2, 3, 4, 5, 6];
  const op = (a: number, b: number) => gf7.multiply(a, b);
  const eq = (a: number, b: number) => gf7.equality(a, b);
  assert.equal(GroupTheory.isGroup(units, op, eq), true, "multiplicative group of GF(7)");
});
