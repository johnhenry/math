import assert from "node:assert/strict";
import { test } from "node:test";
import { asyncFrom, teeAsync, teeSync } from "../src/index.ts";
import { eventualEqual } from "./helpers.ts";

test("teeSync should produce results that mirror original", () => {
  const original = [1, 2, 3, 4, 5];
  const teed = teeSync(2)(original);
  assert.strictEqual(teed.length, 2, "teeSync(2) should produce 2 results");
  const [it0, it1] = teed;
  assert.deepStrictEqual([...it0!], original, "1st result should mirror original");
  assert.deepStrictEqual([...it1!], original, "2nd result should mirror original");
});

test("teeAsync should produce results that mirror original", async () => {
  const original = [1, 2, 3, 4, 5];
  const it = asyncFrom(...original);
  const teed = teeAsync(2)(it);
  assert.strictEqual(teed.length, 2, "teeAsync(2) should produce 2 results");
  const [it0, it1] = teed;

  await eventualEqual(it0!, original, "1st result should mirror original");
  await eventualEqual(it1!, original, "2nd result should mirror original");
  await eventualEqual(it, [], "original iterator should be exhausted");
});

// Regression: both next() functions distributed each pulled value to
// buffers[1 - i] only. That's correct for exactly 2 outputs (0 and 1 swap),
// but for 3+ outputs any index besides 0/1 never got fed at all -- verified
// empirically, teeSync(3)(...)'s 3rd output silently produced [].
test("teeSync/teeAsync should support more than 2 outputs", async () => {
  const original = [1, 2, 3, 4, 5];

  const [sa, sb, sc] = teeSync(3)(original);
  assert.deepStrictEqual([...sa!], original, "teeSync 3-way: 1st output");
  assert.deepStrictEqual([...sb!], original, "teeSync 3-way: 2nd output");
  assert.deepStrictEqual([...sc!], original, "teeSync 3-way: 3rd output");

  const [aa, ab, ac] = teeAsync(3)(asyncFrom(...original));
  await eventualEqual(aa!, original, "teeAsync 3-way: 1st output");
  await eventualEqual(ab!, original, "teeAsync 3-way: 2nd output");
  await eventualEqual(ac!, original, "teeAsync 3-way: 3rd output");
});

// Regression: neither generator called source.return() when a consumer
// stopped iterating early (e.g. `break`), leaking the underlying
// iterator/resource. A `for...of`/`for await...of` `break` calls the
// generator's own .return(), which must now propagate to the shared source.
test("teeSync calls source.return() when a consumer exits early", () => {
  let returnCalls = 0;
  let pulled = 0;
  const source: Iterator<number> = {
    next: () => (pulled < 5 ? { value: pulled++, done: false } : { value: undefined, done: true }),
    return(value?: unknown) {
      returnCalls++;
      return { value, done: true } as IteratorResult<number>;
    },
  };
  const iterable: Iterable<number> = { [Symbol.iterator]: () => source };

  const [stream] = teeSync(1)(iterable);
  for (const item of stream!) {
    if (item === 1) break; // exit before the source is exhausted
  }
  assert.strictEqual(returnCalls, 1, "breaking out of iteration early must call source.return()");
});

test("teeAsync calls source.return() when a consumer exits early", async () => {
  let returnCalls = 0;
  let pulled = 0;
  const source: AsyncIterator<number> = {
    next: async () => (pulled < 5 ? { value: pulled++, done: false } : { value: undefined, done: true }),
    return: async (value?: unknown) => {
      returnCalls++;
      return { value, done: true } as IteratorResult<number>;
    },
  };
  const iterable: AsyncIterable<number> = { [Symbol.asyncIterator]: () => source };

  const [stream] = teeAsync(1)(iterable);
  for await (const item of stream!) {
    if (item === 1) break; // exit before the source is exhausted
  }
  assert.strictEqual(returnCalls, 1, "breaking out of async iteration early must call source.return()");
});
