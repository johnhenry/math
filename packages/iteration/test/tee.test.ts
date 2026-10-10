import assert from "node:assert/strict";
import { test } from "node:test";
import { asyncFrom, teeAsync, teeSync } from "../src/index.ts";
import { collect, eventualEqual, flush } from "./helpers.ts";

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

// Regression (#54): both branches' *first* .next() call landed on a still-empty
// shared buffer at essentially the same instant. There was no atomicity between
// "check if my buffer has a pending item" and "decide to pull from source", so
// both branches independently pulled from `source`, each got a *different*
// underlying item, and the two output streams desynced instead of one branch
// pulling-and-forwarding while the other read from its buffer.
test("teeAsync: concurrent first next() calls on both branches must not desync", async () => {
  const original = ["a", "b", "c", "d"];
  let calls = 0;
  const source: AsyncIterator<string> = {
    next: async () => {
      if (calls >= original.length) {
        return { value: undefined, done: true };
      }
      const value = original[calls] as string;
      calls++;
      return { value, done: false };
    },
  };
  const iterable: AsyncIterable<string> = { [Symbol.asyncIterator]: () => source };

  const [it0, it1] = teeAsync(2)(iterable);

  // Fire both branches' first `.next()` in the same microtask tick, against a
  // still-empty shared buffer -- this is the race window.
  const [r0, r1] = await Promise.all([it0!.next(), it1!.next()]);

  assert.strictEqual(
    calls,
    1,
    "source.next() must be called exactly once for one logical pull turn, not once per branch",
  );
  assert.strictEqual(r0.value, r1.value, "both branches' first item must be the same underlying source item");
  assert.strictEqual(r0.value, "a", "the shared first item must be the source's first value");

  // Continue draining both branches normally and confirm they stay paired.
  const [r2, r3] = await Promise.all([it0!.next(), it1!.next()]);
  assert.strictEqual(r2.value, r3.value, "both branches' second item must also match");
  assert.strictEqual(r2.value, "b");

  await eventualEqual(it0!, ["c", "d"], "1st branch should mirror remaining items");
  await eventualEqual(it1!, ["c", "d"], "2nd branch should mirror remaining items");
});

test("teeSync with no options stays unbounded", () => {
  const [fast, slow] = teeSync(2)(Array.from({ length: 1000 }, (_, i) => i));
  assert.strictEqual([...fast!].length, 1000);
  assert.strictEqual([...slow!].length, 1000, "the slow branch buffered everything");
});

test('teeSync overflow "drop-oldest" keeps each branch\'s newest `limit` items', () => {
  const [fast, slow] = teeSync(2, { limit: 2, overflow: "drop-oldest" })([1, 2, 3, 4, 5]);
  assert.deepStrictEqual([...fast!], [1, 2, 3, 4, 5]);
  assert.deepStrictEqual([...slow!], [4, 5]);
});

test('teeSync overflow "error" throws instead of growing past `limit`', () => {
  const [fast, slow] = teeSync(2, { limit: 2, overflow: "error" })([1, 2, 3, 4, 5]);
  assert.strictEqual(fast!.next().value, 1);
  assert.strictEqual(fast!.next().value, 2);
  assert.throws(() => fast!.next(), RangeError);
  assert.deepStrictEqual([slow!.next().value, slow!.next().value], [1, 2], "the slow branch still has its items");
});

test('teeSync rejects overflow "wait" (it cannot block) and bad limits', () => {
  assert.throws(() => teeSync(2, { limit: 2, overflow: "wait" as never })([1]), TypeError);
  assert.throws(() => teeSync(2, { limit: 0 })([1]), RangeError);
  assert.throws(() => teeAsync(2, { limit: 1.5 })(asyncFrom(1)), RangeError);
});

test("bounded teeSync: a closed branch no longer counts toward the limit", () => {
  const [fast, unused] = teeSync(2, { limit: 1, overflow: "error" })([1, 2, 3]);
  unused!.return(undefined); // closed before it was ever read
  assert.deepStrictEqual([...fast!], [1, 2, 3]);
});

test('teeAsync overflow "wait" makes the fastest branch wait for the slowest', async () => {
  let pulled = 0;
  const source = (async function* () {
    for (let i = 1; i <= 5; i++) {
      pulled = i;
      yield i;
    }
  })();
  const [fast, slow] = teeAsync(2, { limit: 2, overflow: "wait" })(source);
  assert.strictEqual((await fast!.next()).value, 1);
  assert.strictEqual((await fast!.next()).value, 2);
  let third: IteratorResult<number> | undefined;
  const pending = fast!.next().then((r) => {
    third = r;
  });
  await flush();
  assert.strictEqual(third, undefined, "the fast branch waits: the slow branch already holds 2 unread items");
  assert.strictEqual(pulled, 2, "the source is not pulled past the limit");
  assert.strictEqual((await slow!.next()).value, 1);
  await pending;
  assert.strictEqual(third!.value, 3, "a read on the slow branch frees room");
  // Drain both together: draining one alone would (correctly) stall once
  // the other holds `limit` unread items.
  const [restSlow, restFast] = await Promise.all([collect(slow!), collect(fast!)]);
  assert.deepStrictEqual(restSlow, [2, 3, 4, 5]);
  assert.deepStrictEqual(restFast, [4, 5]);
});

test('teeAsync defaults to overflow "wait" when a limit is given', async () => {
  const [fast, slow] = teeAsync(2, { limit: 1 })(asyncFrom(1, 2, 3));
  assert.strictEqual((await fast!.next()).value, 1);
  let second: IteratorResult<number> | undefined;
  const pending = fast!.next().then((r) => {
    second = r;
  });
  await flush();
  assert.strictEqual(second, undefined);
  await slow!.next();
  await pending;
  assert.strictEqual(second!.value, 2);
});

test('teeAsync overflow "wait": closing the slow branch releases the fast one', async () => {
  const [fast, slow] = teeAsync(2, { limit: 1, overflow: "wait" })(asyncFrom(1, 2, 3));
  assert.strictEqual((await fast!.next()).value, 1);
  const pending = fast!.next();
  await flush();
  await slow!.return(undefined); // never read, closed
  assert.strictEqual((await pending).value, 2);
});

test('teeAsync overflow "drop-oldest" and "error"', async () => {
  const [fast, slow] = teeAsync(2, { limit: 2, overflow: "drop-oldest" })(asyncFrom(1, 2, 3, 4, 5));
  await eventualEqual(fast!, [1, 2, 3, 4, 5]);
  await eventualEqual(slow!, [4, 5]);

  const [a, b] = teeAsync(2, { limit: 2, overflow: "error" })(asyncFrom(1, 2, 3, 4, 5));
  await a!.next();
  await a!.next();
  await assert.rejects(a!.next(), RangeError);
  assert.strictEqual((await b!.next()).value, 1);
});
