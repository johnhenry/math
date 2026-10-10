import assert from "node:assert/strict";
import { test } from "node:test";
import { zipAsync, zipLongestAsync, zipLongestSync, zipSync } from "../src/index.ts";
import { asyncFromArray, controlled, eventualEqual, flush } from "./helpers.ts";

// Regression: zipAsync was the missing dual of zipSync -- there was no way
// to zip async iterables at all before this.
test("zipAsync mirrors zipSync (regression: zipAsync did not exist)", async () => {
  assert.deepStrictEqual(
    [...zipSync<number | string>([1, 2, 3], ["a", "b", "c"])],
    [
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ],
    "zipSync baseline behavior",
  );
  await eventualEqual(zipAsync<number | string>(asyncFromArray([1, 2, 3]), ["a", "b", "c"]), [
    [1, "a"],
    [2, "b"],
    [3, "c"],
  ]);
});

test("zipAsync stops at the shortest input", async () => {
  await eventualEqual(zipAsync<number | string>(asyncFromArray([1, 2, 3]), ["a", "b"]), [
    [1, "a"],
    [2, "b"],
  ]);
});

test("zipAsync accepts a mix of sync and async iterables", async () => {
  await eventualEqual(zipAsync<number | string>([1, 2], asyncFromArray(["a", "b"])), [
    [1, "a"],
    [2, "b"],
  ]);
});

/** A sync iterable over `items` that counts return() calls. */
const trackedSync = <T>(items: T[], { throwAt }: { throwAt?: number } = {}) => {
  const state = { returned: 0 };
  let i = 0;
  const iterable: Iterable<T> = {
    [Symbol.iterator]: () => ({
      next: () => {
        if (i === throwAt) throw new Error("boom");
        return i < items.length ? { value: items[i++] as T, done: false } : { value: undefined, done: true };
      },
      return: (value?: unknown) => {
        state.returned++;
        return { value, done: true } as IteratorResult<T>;
      },
    }),
  };
  return { iterable, state };
};

// Regression (#83): zipSync stopped at the shortest input but left the
// longer inputs open -- their return() was never called, so whatever they
// held (a file handle, a socket, a generator's finally block) leaked.
test("zipSync closes the longer inputs when the shortest ends (regression #83)", () => {
  const short = trackedSync([1, 2]);
  const long = trackedSync(["a", "b", "c", "d"]);
  assert.deepStrictEqual(
    [...zipSync<number | string>(short.iterable, long.iterable)],
    [
      [1, "a"],
      [2, "b"],
    ],
  );
  assert.strictEqual(long.state.returned, 1, "the longer input must be closed");
  assert.strictEqual(short.state.returned, 0, "the input that ended is not closed again");
});

test("zipSync closes every input when the consumer exits early (regression #83)", () => {
  const a = trackedSync([1, 2, 3]);
  const b = trackedSync([4, 5, 6]);
  for (const _ of zipSync(a.iterable, b.iterable)) break;
  assert.deepStrictEqual([a.state.returned, b.state.returned], [1, 1]);
});

test("zipSync closes the other inputs when one throws (regression #83)", () => {
  const a = trackedSync([1, 2, 3]);
  const b = trackedSync([4, 5, 6], { throwAt: 1 });
  const c = trackedSync([7, 8, 9]);
  assert.throws(() => [...zipSync(a.iterable, b.iterable, c.iterable)], /boom/);
  assert.strictEqual(a.state.returned, 1, "inputs before the thrower are closed");
  assert.strictEqual(c.state.returned, 1, "inputs after the thrower are closed");
  assert.strictEqual(b.state.returned, 0, "the input that threw is not closed");
});

test("zipSync runs a generator input's finally block on early exit (regression #83)", () => {
  let cleaned = false;
  const gen = (function* () {
    try {
      yield* [1, 2, 3];
    } finally {
      cleaned = true;
    }
  })();
  for (const _ of zipSync(gen, [4, 5, 6])) break;
  assert.strictEqual(cleaned, true);
});

test("zipAsync closes the longer inputs when the shortest ends (regression #83)", async () => {
  const short = controlled<number>();
  const long = controlled<string>();
  const zipped = zipAsync<number | string>(short.iterable, long.iterable);
  short.push(1);
  long.push("a");
  assert.deepStrictEqual((await zipped.next()).value, [1, "a"]);
  short.end();
  long.push("b");
  assert.strictEqual((await zipped.next()).done, true);
  assert.strictEqual(long.returned, 1, "the longer input must be closed");
  assert.strictEqual(short.returned, 0, "the input that ended is not closed again");
});

test("zipAsync closes every input when the consumer exits early (regression #83)", async () => {
  let cleaned = false;
  const gen = (async function* () {
    try {
      yield* [1, 2, 3];
    } finally {
      cleaned = true;
    }
  })();
  const other = controlled<number>();
  other.push(4);
  for await (const _ of zipAsync<number>(gen, other.iterable)) break;
  assert.strictEqual(cleaned, true, "an async generator input's finally must run");
  assert.strictEqual(other.returned, 1);
});

test("zipAsync closes the other inputs when one rejects (regression #83)", async () => {
  const a = controlled<number>();
  const b = controlled<number>();
  const zipped = zipAsync<number>(a.iterable, b.iterable);
  const pending = zipped.next();
  await flush();
  const boom = new Error("boom");
  a.error(boom);
  await assert.rejects(pending, boom);
  assert.strictEqual(b.returned, 1, "the other input must be closed");
  assert.strictEqual(a.returned, 0, "the input that rejected is not closed");
});

test("zipLongestSync closes every input on early exit and on error (regression #83)", () => {
  const a = trackedSync([1, 2, 3]);
  const b = trackedSync([4]);
  for (const _ of zipLongestSync(null, a.iterable, b.iterable)) break;
  assert.deepStrictEqual([a.state.returned, b.state.returned], [1, 1]);

  const c = trackedSync([1, 2, 3]);
  const d = trackedSync([4, 5, 6], { throwAt: 1 });
  assert.throws(() => [...zipLongestSync(null, c.iterable, d.iterable)], /boom/);
  assert.deepStrictEqual([c.state.returned, d.state.returned], [1, 0]);

  // A natural end leaves nothing open to close.
  const e = trackedSync([1]);
  const f = trackedSync([2, 3]);
  assert.deepStrictEqual(
    [...zipLongestSync(0, e.iterable, f.iterable)],
    [
      [1, 2],
      [0, 3],
    ],
  );
  assert.deepStrictEqual([e.state.returned, f.state.returned], [0, 0]);
});

test("zipLongestAsync closes every input on early exit and on error (regression #83)", async () => {
  const a = controlled<number>();
  const b = controlled<number>();
  a.push(1);
  b.push(2);
  for await (const _ of zipLongestAsync(null, a.iterable, b.iterable)) break;
  assert.deepStrictEqual([a.returned, b.returned], [1, 1]);

  const c = controlled<number>();
  const d = controlled<number>();
  const zipped = zipLongestAsync(null, c.iterable, d.iterable);
  const pending = zipped.next();
  await flush();
  const boom = new Error("boom");
  d.error(boom);
  await assert.rejects(pending, boom);
  assert.deepStrictEqual([c.returned, d.returned], [1, 0]);
});
