import assert from "node:assert/strict";
import { test } from "node:test";
import { Combinatorics } from "../src/Combinatorics.ts";

test("factorial", () => {
  assert.equal(Combinatorics.factorial(0), 1n);
  assert.equal(Combinatorics.factorial(5), 120n);
  assert.throws(() => Combinatorics.factorial(-1));
});

test("binomial (nCk), including symmetry and out-of-range", () => {
  assert.equal(Combinatorics.binomial(10, 3), 120n);
  assert.equal(Combinatorics.binomial(10, 7), 120n, "symmetry: nCk = nC(n-k)");
  assert.equal(Combinatorics.binomial(5, 0), 1n);
  assert.equal(Combinatorics.binomial(5, 5), 1n);
  assert.equal(Combinatorics.binomial(5, 6), 0n);
  assert.equal(Combinatorics.binomial(5, -1), 0n);
});

test("permutationsCount (nPk)", () => {
  assert.equal(Combinatorics.permutationsCount(5, 3), 60n);
  assert.equal(Combinatorics.permutationsCount(5, 0), 1n);
  assert.equal(Combinatorics.permutationsCount(5, 6), 0n);
});

test("multinomial", () => {
  // 10! / (2! 3! 5!)
  assert.equal(Combinatorics.multinomial(10, [2, 3, 5]), 2520n);
  assert.throws(() => Combinatorics.multinomial(10, [2, 3]));
});

test("catalan", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((n) => Combinatorics.catalan(n)),
    [1n, 1n, 2n, 5n, 14n, 42n],
  );
});

test("stirlingSecond", () => {
  assert.equal(Combinatorics.stirlingSecond(4, 2), 7n);
  assert.equal(Combinatorics.stirlingSecond(0, 0), 1n);
  assert.equal(Combinatorics.stirlingSecond(5, 6), 0n);
});

test("stirlingFirstUnsigned", () => {
  // c(4,2) = 11 (unsigned Stirling numbers of the first kind)
  assert.equal(Combinatorics.stirlingFirstUnsigned(4, 2), 11n);
  assert.equal(Combinatorics.stirlingFirstUnsigned(0, 0), 1n);
});

test("bell", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((n) => Combinatorics.bell(n)),
    [1n, 1n, 2n, 5n, 15n],
  );
});

/** Independent Bell-number reference via the Bell (Aitken's) triangle, unrelated to the Stirling-DP algorithm under test. */
function bellTriangleReference(maxN: number): bigint[] {
  const bells: bigint[] = [1n]; // Bell(0) = 1
  let row: bigint[] = [1n];
  for (let n = 1; n <= maxN; n++) {
    const newRow: bigint[] = [row[row.length - 1] as bigint];
    for (let k = 1; k <= n; k++) {
      newRow.push((newRow[k - 1] as bigint) + (row[k - 1] as bigint));
    }
    row = newRow;
    bells.push(row[0] as bigint);
  }
  return bells;
}

test("bell differential test against independent Bell-triangle reference", () => {
  const reference = bellTriangleReference(15);
  for (let n = 0; n <= 15; n++) {
    assert.equal(Combinatorics.bell(n), reference[n], `bell(${n})`);
  }
});

test("perf regression: bell stays roughly quadratic, not cubic, at scale (issue #40)", () => {
  // Guards against reintroducing the O(n^3) bug where bell(n) re-ran the full
  // Stirling-second-kind DP table from scratch for every k from 0..n, instead
  // of building the table once. At n=500 the cubic algorithm takes seconds;
  // the fixed quadratic algorithm should be near-instant.
  const t0 = performance.now();
  Combinatorics.bell(500);
  assert.ok(performance.now() - t0 < 2000, "bell(500) should be roughly quadratic, not cubic");
});

test("partitionCount", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((n) => Combinatorics.partitionCount(n)),
    [1n, 1n, 2n, 3n, 5n, 7n],
  );
});

test("derangements", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((n) => Combinatorics.derangements(n)),
    [1n, 0n, 1n, 2n, 9n, 44n],
  );
});
