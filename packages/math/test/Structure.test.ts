import assert from "node:assert/strict";
import { test } from "node:test";
import { Structure } from "../src/Structure.ts";
import { Vector } from "../src/Vector.ts";

const v = (...xs: number[]) => Vector.fromArray(xs);
const mat = (rows: number[][]) => Vector.fromArray(rows.map((r) => Vector.fromArray(r)));
const deep = (m: Vector<unknown>) => m.map((r) => (r instanceof Vector ? [...r] : r));

// The real field (Q/R modelled with JS numbers).
const realField = new Structure<number>({
  criteria: [(x) => typeof x === "number"],
  operations: [(a, b) => a + b, (a, b) => a * b],
  inverses: [(x) => -x, (x) => 1 / x],
  identities: [0, 1],
  equality: (a, b) => a === b,
});

// The finite field GF(7).
const P = 7;
const modInverse = (x: number): number => {
  let r = 1;
  for (let i = 0; i < P - 2; i++) r = (r * x) % P; // Fermat: x^(p-2)
  return ((r % P) + P) % P;
};
const gf7 = new Structure<number>({
  operations: [(a, b) => (((a + b) % P) + P) % P, (a, b) => (((a * b) % P) + P) % P],
  inverses: [(x) => (((P - x) % P) + P) % P, (x) => modInverse(x)],
  identities: [0, 1],
  equality: (a, b) => ((a % P) + P) % P === ((b % P) + P) % P,
});

test("isMember checks all criteria", () => {
  assert.equal(realField.isMember(3), true);
  assert.equal(realField.isMember("x"), false);
});

test("scalar ops via structure", () => {
  assert.equal(realField.subtract(5, 3), 2);
  assert.equal(realField.divide(6, 3), 2);
  assert.equal(realField.addPower(2, 3), 6, "2+2+2 via repeated add");
  assert.equal(realField.multiplyPower(2, 3), 8, "2*2*2 via repeated multiply");
  assert.equal(realField.multiplyPower(2, -1), 0.5);
});

test("vector ops over the real field", () => {
  assert.deepEqual([...realField.addVector(v(1, 2), v(3, 4))], [4, 6]);
  assert.deepEqual([...realField.scaleVector(v(1, 2, 3), 2)], [2, 4, 6]);
  assert.equal(realField.dotProduct(v(1, 2, 3), v(4, 5, 6)), 32);
  // cross product bug fix
  assert.deepEqual([...realField.crossProduct(v(1, 0, 0), v(0, 1, 0))], [0, 0, 1]);
});

test("matrix ops over the real field", () => {
  const a = mat([
    [1, 2],
    [3, 4],
  ]);
  const b = mat([
    [5, 6],
    [7, 8],
  ]);
  assert.deepEqual(deep(realField.addMatrix(a, b)), [
    [6, 8],
    [10, 12],
  ]);
  assert.deepEqual(deep(realField.multiplyMatrix(a, b)), [
    [19, 22],
    [43, 50],
  ]);
  assert.equal(realField.determinant(a), -2);
  assert.equal(realField.trace(a), 5);
  assert.deepEqual(
    deep(
      realField.powerMatrix(
        mat([
          [1, 1],
          [0, 1],
        ]),
        3,
      ),
    ),
    [
      [1, 3],
      [0, 1],
    ],
  );
});

test("invertMatrix over the real field", () => {
  const a = mat([
    [4, 7],
    [2, 6],
  ]);
  const inv = realField.invertMatrix(a);
  const prod = realField.multiplyMatrix(a, inv).map((r) => (r as Vector<number>).map((x) => Math.round(x)));
  assert.deepEqual(deep(prod as Vector<unknown>), [
    [1, 0],
    [0, 1],
  ]);
});

test("Structure works over the finite field GF(7)", () => {
  // GF(7) arithmetic
  assert.equal(gf7.add(5, 4), 2); // 9 mod 7
  assert.equal(gf7.multiply(3, 5), 1); // 15 mod 7
  assert.equal(gf7.reciprocal(3), 5, "3*5 = 15 = 1 mod 7");
  // matrix inverse over GF(7): A * A^-1 = I (mod 7)
  const a = mat([
    [2, 3],
    [1, 4],
  ]);
  const inv = gf7.invertMatrix(a);
  const prod = gf7.multiplyMatrix(a, inv);
  assert.equal(gf7.equality((prod[0] as Vector<number>)[0], 1), true);
  assert.equal(gf7.equality((prod[0] as Vector<number>)[1], 0), true);
  assert.equal(gf7.equality((prod[1] as Vector<number>)[1], 1), true);
});

test("vectorSum / vectorProduct return values (bug fix)", () => {
  assert.equal(realField.vectorSum(v(1, 2, 3, 4)), 10);
  assert.equal(realField.vectorProduct(v(1, 2, 3, 4)), 24);
});

// Deterministic pseudo-random matrix generator (no external RNG dependency).
function randMatrix(n: number, seed: number): number[][] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 2000) / 100 - 10;
  };
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(rand());
    rows.push(row);
  }
  return rows;
}

// Reference O(n!) cofactor expansion, used only to cross-check correctness
// of the O(n^3) Gaussian-elimination determinant on larger matrices than
// the hand-written 2x2 fixture above covers.
function naiveDet(m: number[][]): number {
  const n = m.length;
  if (n === 1) return m[0][0] as number;
  let det = 0;
  for (let i = 0; i < n; i++) {
    const sub = m.slice(1).map((row) => row.filter((_, j) => j !== i));
    det += (i % 2 === 0 ? 1 : -1) * (m[0][i] as number) * naiveDet(sub);
  }
  return det;
}

test("determinant matches O(n!) cofactor expansion for n up to 7", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const rows = randMatrix(n, 42 + n);
    const expected = naiveDet(rows);
    const got = realField.determinant(mat(rows));
    assert.ok(
      Math.abs(expected - (got as number)) < 1e-6 * Math.max(1, Math.abs(expected)),
      `n=${n}: expected ${expected}, got ${got}`,
    );
  }
});

test("determinant of a singular matrix is 0", () => {
  const singular = mat([
    [1, 2, 3],
    [2, 4, 6],
    [7, 8, 9],
  ]);
  assert.equal(realField.determinant(singular), 0);
});

// Regression test for the O(n!) -> O(n^3) determinant fix (issue #42): the
// old cofactor-expansion implementation was measured at ~4360x slower than
// a proper O(n^3) algorithm at n=8 (2048ms vs 0.47ms), and would be
// completely impractical at n=10-12 (12! ≈ 479 million terms). This asserts
// determinant AND invertMatrix's default (checkDeterminant=true, which
// calls determinant internally) both complete quickly at n=10-12 -- not
// exact timings (too flaky across machines/CI), just "well under a second,
// not minutes/hours".
test("determinant and invertMatrix stay fast at n=10-12 (O(n^3) regression guard)", () => {
  for (const n of [10, 11, 12]) {
    const rows = randMatrix(n, 7 + n);
    const m = mat(rows);

    const t0 = performance.now();
    const det = realField.determinant(m);
    const detMs = performance.now() - t0;
    assert.ok(typeof det === "number" && Number.isFinite(det));
    assert.ok(detMs < 500, `determinant at n=${n} took ${detMs}ms, expected well under 500ms`);

    const t1 = performance.now();
    const inv = realField.invertMatrix(m); // default checkDeterminant=true
    const invMs = performance.now() - t1;
    assert.ok(invMs < 500, `invertMatrix (checkDeterminant=true) at n=${n} took ${invMs}ms, expected well under 500ms`);

    // Sanity: A * A^-1 ≈ I (skip if determinant came out ~0, i.e. singular).
    if (Math.abs(det as number) > 1e-6) {
      const prod = deep(realField.multiplyMatrix(m, inv) as Vector<unknown>) as number[][];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const expected = i === j ? 1 : 0;
          assert.ok(Math.abs((prod[i][j] as number) - expected) < 1e-6, `A*A^-1 at [${i}][${j}] for n=${n}`);
        }
      }
    }
  }
});
