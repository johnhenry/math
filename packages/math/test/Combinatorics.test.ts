import assert from "node:assert/strict";
import { test } from "node:test";
import { Cycle } from "../src/Cycle.ts";
import { Permutation } from "../src/Permutation.ts";
import { PolynomialRing, polynomialToString } from "../src/PolynomialRing.ts";
import { Structure } from "../src/Structure.ts";

const R = new PolynomialRing(Structure.realField());

test("Cycle rejects repeats (bug fix)", () => {
  assert.throws(() => new Cycle([1, 2, 1]));
});

test("Cycle apply maps each element to the next, wrapping", () => {
  const c = new Cycle(["a", "b", "c"]);
  assert.equal(c.apply("a"), "b");
  assert.equal(c.apply("c"), "a");
  assert.equal(c.apply("z"), "z", "outside the cycle -> identity");
});

test("Cycle inverse / shift / toString", () => {
  const c = new Cycle([1, 2, 3]);
  assert.equal(c.toString(), "(1,2,3)");
  assert.deepEqual(c.inverse().elements, [3, 2, 1]);
  assert.deepEqual(c.shiftedLeft().elements, [2, 3, 1]);
});

test("Cycle even/odd and length", () => {
  assert.equal(new Cycle([1, 2, 3]).even(), true, "3-cycle is even");
  assert.equal(new Cycle([1, 2]).even(), false, "transposition is odd");
  assert.equal(new Cycle([5]).length, 1);
});

test("Cycle equal up to rotation, disjoint", () => {
  assert.equal(Cycle.equal(new Cycle([1, 2, 3]), new Cycle([2, 3, 1])), true);
  assert.equal(Cycle.equal(new Cycle([1, 2, 3]), new Cycle([1, 3, 2])), false);
  assert.equal(Cycle.disjoint(new Cycle([1, 2]), new Cycle([3, 4])), true);
  assert.equal(Cycle.disjoint(new Cycle([1, 2]), new Cycle([2, 3])), false);
});

test("Permutation apply and inverse", () => {
  const p = new Permutation([1, 2, 3], [2, 3, 1]);
  assert.equal(p.apply(1), 2);
  assert.equal(p.apply(3), 1);
  const inv = p.inverse();
  assert.equal(inv.apply(2), 1);
});

test("Permutation constructor rejects mismatched lengths (bug fix)", () => {
  assert.throws(() => new Permutation([1, 2], [1]));
});

test("Permutation cycle decomposition", () => {
  const p = new Permutation([1, 2, 3, 4], [2, 1, 4, 3]);
  const cycles = p.cycles();
  assert.equal(cycles.length, 2);
  assert.ok(cycles.every((c) => c.length === 2));
});

test("Permutation order via LCM of cycle lengths (bug fix)", () => {
  // (1 2 3)(4 5): order = lcm(3,2) = 6
  const p = new Permutation([1, 2, 3, 4, 5], [2, 3, 1, 5, 4]);
  assert.equal(p.order(), 6);
  assert.equal((Permutation.Identity as Permutation).order(), 1);
});

test("Permutation compose and commute", () => {
  const a = new Permutation([1, 2, 3], [2, 3, 1]);
  const b = new Permutation([1, 2, 3], [2, 1, 3]);
  const ab = Permutation.compose(a, b);
  // (a∘b)(1) = a(b(1)) = a(2) = 3
  assert.equal(ab.apply(1), 3);
  assert.equal(Permutation.commute(a, a.inverse()), true);
});

// ---- issue #40 perf-fix differential/regression tests -----------------------
// Independent "naive" reference implementations mirroring the pre-fix
// algorithms (O(n^2) dedupe + O(n) linear-scan apply for compose; O(p)
// repeated composition for power), used to cross-check the fixed O(n) compose
// and O(log p) power against known-correct-but-slow originals.

function naiveApply<T>(domain: T[], coDomain: T[], element: T): T {
  for (let i = 0; i < domain.length; i++) {
    if (element === domain[i]) return coDomain[i] as T;
  }
  return element;
}

function naiveComposeReference<T>(sigma: Permutation<T>, tao: Permutation<T>): Permutation<T> {
  const newDomain = sigma.domain.concat(tao.domain);
  for (let i = 0; i < newDomain.length; i++) {
    if (newDomain.lastIndexOf(newDomain[i] as T) !== i) {
      newDomain.splice(newDomain.lastIndexOf(newDomain[i] as T), 1);
      i--;
    }
  }
  const newCoDomain = newDomain.map((x) =>
    naiveApply(sigma.domain, sigma.coDomain, naiveApply(tao.domain, tao.coDomain, x)),
  );
  return new Permutation(newDomain, newCoDomain);
}

function naivePowerReference<T>(perm: Permutation<T>, pow: number): Permutation<T> {
  if (pow === 0) return Permutation.Identity as Permutation<T>;
  if (pow === -1) return perm.inverse();
  let base = perm;
  let p = pow;
  if (pow < -1) {
    base = perm.inverse();
    p = -pow;
  }
  let result = base;
  while (p > 1) {
    result = naiveComposeReference(result, base);
    p--;
  }
  return result;
}

test("Permutation.compose differential test against naive O(n^2) reference", () => {
  // Simple deterministic PRNG so failures are reproducible without a fast-check dependency.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let trial = 0; trial < 30; trial++) {
    const n = 3 + Math.floor(rand() * 6);
    const domain = Array.from({ length: n }, (_, i) => i);
    const shuffled1 = [...domain].sort(() => rand() - 0.5);
    const shuffled2 = [...domain].sort(() => rand() - 0.5);
    const sigma = new Permutation(domain, shuffled1);
    const tao = new Permutation(domain, shuffled2);
    const fast = Permutation.compose(sigma, tao);
    const naive = naiveComposeReference(sigma, tao);
    for (const x of domain) assert.equal(fast.apply(x), naive.apply(x), `compose mismatch at x=${x} (trial ${trial})`);
    assert.deepEqual([...fast.domain].sort(), [...naive.domain].sort());
  }
});

test("Permutation.power differential test against naive O(p) reference", () => {
  const n = 7;
  const domain = Array.from({ length: n }, (_, i) => i);
  const coDomain = domain.map((x) => (x + 1) % n); // n-cycle
  const perm = new Permutation(domain, coDomain);
  for (const p of [0, 1, 2, 3, 5, 8, 13, 21, -1, -2, -5, -8]) {
    const fast = perm.power(p);
    const naive = naivePowerReference(perm, p);
    for (const x of domain) assert.equal(fast.apply(x), naive.apply(x), `power(${p}) mismatch at x=${x}`);
  }
});

test("perf regression: Permutation.power(10000) completes near-instantly via binary exponentiation (issue #40)", () => {
  // Guards against reintroducing the O(p) repeated-composition bug: the old
  // algorithm ran p-1 sequential compose() calls, taking multiple seconds for
  // p in the tens of thousands at this permutation size. Binary exponentiation
  // needs only ~log2(p) compose() calls.
  const n = 50;
  const domain = Array.from({ length: n }, (_, i) => i);
  const coDomain = domain.map((x) => (x + 1) % n);
  const perm = new Permutation(domain, coDomain);
  const t0 = performance.now();
  const result = perm.power(10000);
  assert.ok(performance.now() - t0 < 500, "power(10000) should take O(log p) compositions, not O(p)");
  assert.equal(result.apply(0), 10000 % n);
});

test("Cycle transpositions of a length <2 cycle is empty, not garbage (bug fix)", () => {
  assert.deepEqual(new Cycle(["x"]).transpositions(), []);
  assert.deepEqual(new Cycle([]).transpositions(), []);
  assert.deepEqual(new Cycle(["x"]).transpositionsAlt(), []);
  assert.deepEqual(new Cycle([]).transpositionsAlt(), []);
  // sanity check: a real cycle still decomposes normally
  assert.equal(new Cycle([1, 2, 3]).transpositions().length, 2);
});

test("Cycle <-> Permutation round trip", () => {
  const c = new Cycle([1, 2, 3]);
  const p = c.toPermutation();
  assert.equal(p.apply(1), 2);
  assert.equal(p.apply(3), 1);
});

test("PolynomialRing degree / derivative / antiderivative", () => {
  const p = [1, 2, 3]; // 3x^2 + 2x + 1
  assert.equal(R.degree(p), 2);
  assert.deepEqual(R.derivative(p), [2, 6]); // 6x + 2
  assert.deepEqual(R.antiderivative(p), [0, 1, 1, 1]); // x^3 + x^2 + x
});

test("PolynomialRing multiply (bug fix: dimension.value)", () => {
  const a = [1, 1]; // x + 1
  const b = [1, 1]; // x + 1
  // (x+1)^2 = x^2 + 2x + 1
  assert.deepEqual(R.multiply(a, b), [1, 2, 1]);
});

test("polynomialToString", () => {
  const p = [1, 2, 3];
  assert.equal(polynomialToString(p), "3*x^2+2*x+1");
  assert.equal(polynomialToString(p, "x", false), "1+2*x+3*x^2");
});
