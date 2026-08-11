import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Combinatorics,
  combinations,
  combinationsWithReplacement,
  permutations,
  product,
} from "../src/index.ts";

test("product", () => {
  assert.deepStrictEqual(
    [...product([1, 2], [3, 4])],
    [
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
    ],
    "should yield the cartesian product, last iterable varying fastest"
  );
  assert.deepStrictEqual(
    [...product()],
    [[]],
    "product of zero iterables should yield one empty tuple"
  );
});

test("permutations", () => {
  assert.deepStrictEqual(
    [...permutations([1, 2, 3])],
    [
      [1, 2, 3],
      [1, 3, 2],
      [2, 1, 3],
      [2, 3, 1],
      [3, 1, 2],
      [3, 2, 1],
    ],
    "should yield all full-length permutations"
  );
  assert.deepStrictEqual(
    [...permutations([1, 2, 3], 2)],
    [
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 3],
      [3, 1],
      [3, 2],
    ],
    "should yield all r-length permutations"
  );
  assert.deepStrictEqual([...permutations([1, 2, 3], 0)], [[]], "r=0 should yield one empty tuple");
});

test("combinations", () => {
  assert.deepStrictEqual(
    [...combinations([1, 2, 3], 2)],
    [
      [1, 2],
      [1, 3],
      [2, 3],
    ],
    "should yield all r-length combinations without replacement"
  );
  assert.deepStrictEqual([...combinations([1, 2], 5)], [], "r > n should yield nothing");
  assert.deepStrictEqual([...combinations([1, 2, 3], 0)], [[]], "r=0 should yield one empty tuple");
});

test("combinationsWithReplacement", () => {
  assert.deepStrictEqual(
    [...combinationsWithReplacement([1, 2], 2)],
    [
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    "should yield all r-length combinations, allowing repeats"
  );
});

// The point of housing enumeration alongside counting: the two must agree.
// These cross-checks are only expressible now that both live in mallory-math.

test("binomial counts exactly what combinations enumerates", () => {
  const pool = [1, 2, 3, 4, 5, 6];
  for (let r = 0; r <= pool.length; r++) {
    const enumerated = [...Combinatorics.combinations(pool, r)].length;
    assert.equal(
      BigInt(enumerated),
      Combinatorics.binomial(pool.length, r),
      `binomial(${pool.length}, ${r})`,
    );
  }
});

test("permutationsCount counts exactly what permutations enumerates", () => {
  const pool = ["a", "b", "c", "d", "e"];
  for (let r = 0; r <= pool.length; r++) {
    const enumerated = [...Combinatorics.permutations(pool, r)].length;
    assert.equal(
      BigInt(enumerated),
      Combinatorics.permutationsCount(pool.length, r),
      `permutationsCount(${pool.length}, ${r})`,
    );
  }
});

test("combinationsWithReplacement matches binomial(n + r - 1, r)", () => {
  const pool = [1, 2, 3, 4];
  for (let r = 1; r <= 4; r++) {
    const enumerated = [
      ...Combinatorics.combinationsWithReplacement(pool, r),
    ].length;
    assert.equal(
      BigInt(enumerated),
      Combinatorics.binomial(pool.length + r - 1, r),
      `multiset coefficient (${pool.length}, ${r})`,
    );
  }
});

test("product size is the product of pool sizes", () => {
  const size = [...Combinatorics.product([1, 2, 3], ["a", "b"], [true])].length;
  assert.equal(size, 3 * 2 * 1);
});
