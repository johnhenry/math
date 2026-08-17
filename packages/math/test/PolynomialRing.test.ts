import assert from "node:assert/strict";
import { test } from "node:test";
import { PolynomialRing } from "../src/PolynomialRing.ts";
import { Rational } from "../src/Rational.ts";
import { Structure } from "../src/Structure.ts";

test("PolynomialRing over the reals: degree/add/subtract/multiply/evaluate", () => {
  const R = new PolynomialRing(Structure.realField());
  const p = [1, 2, 3]; // 3x^2 + 2x + 1
  const q = [0, 1]; // x
  assert.equal(R.degree(p), 2);
  assert.equal(R.degree([]), -1);
  assert.equal(R.degree([0, 0, 0]), -1, "trailing zeros are trimmed");
  assert.deepEqual(R.add(p, q), [1, 3, 3]);
  assert.deepEqual(R.subtract(p, q), [1, 1, 3]);
  assert.deepEqual(R.multiply(q, q), [0, 0, 1]); // x * x = x^2
  assert.equal(R.evaluate(p, 3), 34); // 3*9 + 2*3 + 1
  assert.equal(R.toString(p), "3*x^2+2*x+1");
});

test("PolynomialRing.divmod over the reals: (x^2 - 1) / (x - 1) = x + 1 remainder 0", () => {
  const R = new PolynomialRing(Structure.realField());
  const dividend = [-1, 0, 1]; // x^2 - 1
  const divisor = [-1, 1]; // x - 1
  const { quotient, remainder } = R.divmod(dividend, divisor);
  assert.deepEqual(quotient, [1, 1]); // x + 1
  assert.deepEqual(remainder, []);
  assert.ok(R.equal(R.add(R.multiply(quotient, divisor), remainder), dividend));
});

test("PolynomialRing.divmod is exact over the rationals: x^3 - 1 by x - 1", () => {
  const field = Structure.rationalField();
  const R = new PolynomialRing(field);
  const one = Rational.from(1);
  const dividend = [one.negate(), Rational.Zero, Rational.Zero, one]; // x^3 - 1
  const divisor = [one.negate(), one]; // x - 1
  const { quotient, remainder } = R.divmod(dividend, divisor);
  assert.equal(R.toString(quotient), "1*x^2+1*x+1");
  assert.equal(remainder.length, 0);
});

test("PolynomialRing.gcd over GF(7) is monic", () => {
  const gf7 = Structure.integersModulo(7);
  const R = new PolynomialRing(gf7);
  // (x-1)(x-2) = x^2 - 3x + 2  ->  mod 7: [2, 4, 1]
  const p1 = [2, 4, 1];
  // (x-1)(x-3) = x^2 - 4x + 3  ->  mod 7: [3, 3, 1]
  const p2 = [3, 3, 1];
  const gcd = R.gcd(p1, p2);
  // shared root x = 1  ->  monic (x - 1) = [-1 mod 7, 1] = [6, 1]
  assert.deepEqual(gcd, [6, 1]);
});

test("PolynomialRing.equal ignores trailing zero padding", () => {
  const R = new PolynomialRing(Structure.realField());
  assert.ok(R.equal([1, 2], [1, 2, 0, 0]));
  assert.ok(!R.equal([1, 2], [1, 3]));
});

test("derivative/antiderivative stay linear-time on large degree (perf regression)", () => {
  // Regression test for issue #41: derivative/antiderivative used to compute
  // each coefficient's `i` factor via a fresh repeated-addition loop from
  // scratch (O(i) work per coefficient => O(n^2) total for a degree-n
  // polynomial) instead of an O(1)-per-coefficient running accumulator.
  //
  // Measured locally: degree 30000 took ~650-800ms pre-fix (quadratic) vs.
  // a few ms post-fix (linear). The 300ms bound below has generous headroom
  // over the fixed implementation even on much slower CI hardware, while
  // still being far below what the quadratic implementation would take.
  const R = new PolynomialRing(Structure.realField());
  const degree = 30000;
  const p = Array.from({ length: degree + 1 }, (_, i) => i + 1);

  const t0 = performance.now();
  const d = R.derivative(p);
  const derivativeMs = performance.now() - t0;
  assert.ok(derivativeMs < 300, `derivative(degree ${degree}) took ${derivativeMs.toFixed(1)}ms, expected < 300ms`);
  assert.equal(d.length, degree);
  assert.equal(d[0], 2); // d/dx of c0 + c1 x + ... at x^0 term is 1*c1 = 1*2 = 2

  const t1 = performance.now();
  const a = R.antiderivative(p);
  const antiderivativeMs = performance.now() - t1;
  assert.ok(
    antiderivativeMs < 300,
    `antiderivative(degree ${degree}) took ${antiderivativeMs.toFixed(1)}ms, expected < 300ms`,
  );
  assert.equal(a.length, degree + 2);
  assert.equal(a[0], 0); // zero constant of integration
  assert.equal(a[1], p[0]); // c0 / 1 = c0
});
