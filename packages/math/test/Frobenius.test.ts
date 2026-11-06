import assert from "node:assert/strict";
import { test } from "node:test";
import { frobeniusNormalForm, rationalCanonicalForm } from "../src/Frobenius.ts";
import { Rational } from "../src/Rational.ts";

const matmul = (a: number[][], b: number[][]) =>
  a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const transpose = (a: number[][]) => a[0].map((_, j) => a.map((r) => r[j]));

test("frobeniusNormalForm: block upper triangular, P^T A P === permuted", () => {
  // components {0,2}, {1}, {3}: 0<->2 cycle, 1 -> 0, 3 -> 1
  const A = [
    [1, 0, 2, 0],
    [4, 5, 0, 0],
    [3, 0, 0, 0],
    [0, 6, 0, 7],
  ];
  const r = frobeniusNormalForm(A);
  assert.deepEqual(matmul(matmul(transpose(r.P), A), r.P), r.permuted);
  assert.equal(r.irreducible, false);
  assert.equal(r.blocks.length, 3);
  // below-diagonal region outside the diagonal blocks is zero
  for (const b of r.blocks) {
    for (let i = b.start; i < b.end; i++)
      for (let j = 0; j < b.start; j++) assert.equal(r.permuted[i][j], 0, `entry (${i},${j})`);
  }
  assert.deepEqual([...r.order].sort(), [0, 1, 2, 3]);
  // source component first: 3 only reaches others, nothing reaches it
  assert.equal(r.order[0], 3);
});

test("frobeniusNormalForm: irreducible and trivial cases; rejects non-square", () => {
  const cyc = [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ];
  const r = frobeniusNormalForm(cyc);
  assert.equal(r.irreducible, true);
  assert.deepEqual(r.permuted, cyc);
  assert.deepEqual(frobeniusNormalForm([[5]]).permuted, [[5]]);
  assert.deepEqual(frobeniusNormalForm([]).order, []);
  assert.throws(() => frobeniusNormalForm([[1, 2], [3]]), /square/);
  // diagonal matrix: n singleton components
  assert.equal(
    frobeniusNormalForm([
      [1, 0],
      [0, 2],
    ]).blocks.length,
    2,
  );
});

const polyStr = (p: Rational[]) => p.map((c) => c.toString()).join(",");
const P = (...c: number[]) => c.map((x) => new Rational(x)); // low -> high

/** det(xI - A) by exact Faddeev-LeVerrier over Q; coefficients low -> high. */
function charPoly(A: number[][]): Rational[] {
  const n = A.length;
  const mat = A.map((r) => r.map((v) => new Rational(v)));
  const id = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? Rational.One : Rational.Zero)),
  );
  const mul = (x: Rational[][], y: Rational[][]) =>
    x.map((r) => y[0].map((_, j) => r.reduce((s, v, k) => s.add(v.multiply(y[k][j])), Rational.Zero)));
  let M = id.map((r) => r.map(() => Rational.Zero));
  const coeffs: Rational[] = [Rational.One];
  for (let k = 1; k <= n; k++) {
    M = mul(mat, M).map((r, i) => r.map((v, j) => v.add(id[i][j].multiply(coeffs[k - 1]))));
    const AM = mul(mat, M);
    const tr = AM.reduce((s, r, i) => s.add(r[i]), Rational.Zero);
    coeffs.push(tr.multiply(new Rational(-1, k)));
  }
  return coeffs.reverse(); // low -> high
}
const polyMul = (a: Rational[], b: Rational[]) => {
  const out = Array.from({ length: a.length + b.length - 1 }, () => Rational.Zero);
  for (const [i, x] of a.entries()) for (const [j, y] of b.entries()) out[i + j] = out[i + j].add(x.multiply(y));
  return out;
};

test("rationalCanonicalForm: derogatory diagonal matrix diag(2,2,3)", () => {
  const r = rationalCanonicalForm([
    [2, 0, 0],
    [0, 2, 0],
    [0, 0, 3],
  ]);
  assert.deepEqual(r.invariantFactors.map(polyStr), [polyStr(P(-2, 1)), polyStr(P(6, -5, 1))]); // (x-2), (x-2)(x-3)
  assert.deepEqual(r.blockSizes, [1, 2]);
});

test("rationalCanonicalForm: Jordan blocks J2(2) + J1(2)", () => {
  const r = rationalCanonicalForm([
    [2, 1, 0],
    [0, 2, 0],
    [0, 0, 2],
  ]);
  assert.deepEqual(r.invariantFactors.map(polyStr), [polyStr(P(-2, 1)), polyStr(P(4, -4, 1))]); // (x-2), (x-2)^2
});

test("rationalCanonicalForm: scalar matrix gives n copies of (x - c)", () => {
  const r = rationalCanonicalForm([
    [5, 0, 0],
    [0, 5, 0],
    [0, 0, 5],
  ]);
  assert.equal(r.invariantFactors.length, 3);
  assert.ok(r.invariantFactors.every((f) => polyStr(f) === polyStr(P(-5, 1))));
});

test("rationalCanonicalForm: a companion matrix is its own form", () => {
  // companion of x^3 - 2x^2 + 5 : subdiagonal ones, last column -c_i
  const C = [
    [0, 0, -5],
    [1, 0, 0],
    [0, 1, 2],
  ];
  const r = rationalCanonicalForm(C);
  assert.deepEqual(r.invariantFactors.map(polyStr), [polyStr(P(5, 0, -2, 1))]);
  assert.deepEqual(
    r.form.map((row) => row.map((v) => v.toNumber())),
    C,
  );
});

test("rationalCanonicalForm: factors divide in chain, multiply to the characteristic polynomial", () => {
  const cases = [
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ],
    [
      [3, 1, 0, 0],
      [0, 3, 0, 0],
      [0, 0, 3, 1],
      [0, 0, 0, 3],
    ],
    [
      [0, 1, 0, 0],
      [-1, 0, 0, 0],
      [0, 0, 2, 0],
      [0, 0, 0, 2],
    ],
    [
      [2, -1, 0],
      [1, 4, 0],
      [5, 5, 3],
    ],
    [
      [1, 1],
      [0, 1],
    ],
  ];
  for (const A of cases) {
    const r = rationalCanonicalForm(A);
    const prod = r.invariantFactors.reduce((acc, f) => polyMul(acc, f), P(1));
    assert.equal(polyStr(prod), polyStr(charPoly(A)), `charpoly of ${JSON.stringify(A)}`);
    assert.equal(
      r.blockSizes.reduce((s, v) => s + v, 0),
      A.length,
    );
    // each block's companion form has the same characteristic polynomial as the whole
    const form = r.form.map((row) => row.map((v) => v.toNumber()));
    assert.equal(polyStr(charPoly(form)), polyStr(charPoly(A)));
  }
});

test("rationalCanonicalForm: exact over rationals; rejects non-square", () => {
  const r = rationalCanonicalForm([
    [new Rational(1, 2), new Rational(1, 3)],
    [0, new Rational(1, 2)],
  ]);
  assert.equal(polyStr(r.invariantFactors[0]), polyStr([new Rational(1, 4), new Rational(-1), Rational.One]));
  assert.throws(() => rationalCanonicalForm([[1, 2], [3]]), /square/);
});
