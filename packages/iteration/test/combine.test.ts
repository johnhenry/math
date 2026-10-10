import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AsyncChannel,
  asyncFrom,
  combineLatestAsync,
  latestAsync,
  mergeAsync,
  sampleAsync,
  withLatestFromAsync,
} from "../src/index.ts";
import { collect, controlled, flush } from "./helpers.ts";

// ---------------------------------------------------------------- mergeAsync

test("mergeAsync yields values as they arrive and ends when every input ends", async () => {
  const a = controlled<string>();
  const b = controlled<string>();
  const merged = mergeAsync(a.iterable, b.iterable);
  const seen: string[] = [];
  const done = (async () => {
    for await (const value of merged) seen.push(value);
  })();
  b.push("b1");
  await flush();
  a.push("a1");
  await flush();
  b.push("b2");
  await flush();
  a.end();
  await flush();
  assert.deepStrictEqual(seen, ["b1", "a1", "b2"]);
  b.push("b3");
  b.end();
  await done;
  assert.deepStrictEqual(seen, ["b1", "a1", "b2", "b3"]);
});

test("mergeAsync serves ready inputs in rotation (a sync input cannot starve the others)", async () => {
  assert.deepStrictEqual(await collect(mergeAsync<number | string>([1, 2, 3], ["a", "b", "c"])), [
    1,
    "a",
    2,
    "b",
    3,
    "c",
  ]);
});

test("mergeAsync is lazy: one outstanding next() per input", async () => {
  const a = controlled<number>();
  const merged = mergeAsync(a.iterable);
  a.push(1);
  a.push(2);
  assert.strictEqual((await merged.next()).value, 1);
  await flush();
  assert.strictEqual(a.pulls, 1, "the next value is only requested once the consumer asks");
  assert.strictEqual((await merged.next()).value, 2);
  await merged.return(undefined);
});

test("mergeAsync accepts { signal } as the last argument and no inputs", async () => {
  const controller = new AbortController();
  assert.deepStrictEqual(await collect(mergeAsync([1], asyncFrom(2), { signal: controller.signal })), [1, 2]);
  assert.deepStrictEqual(await collect(mergeAsync()), []);
});

// -------------------------------------------------------- combineLatestAsync

test("combineLatestAsync emits array snapshots once every input has a value", async () => {
  const a = controlled<number>();
  const b = controlled<string>();
  const combined = combineLatestAsync([a.iterable, b.iterable]);
  const first = combined.next();
  a.push(1);
  await flush();
  a.push(2);
  b.push("x");
  assert.deepStrictEqual((await first).value, [2, "x"]);
  b.push("y");
  assert.deepStrictEqual((await combined.next()).value, [2, "y"]);
  a.end();
  b.end();
  assert.strictEqual((await combined.next()).done, true);
});

test("combineLatestAsync takes a record and returns record snapshots", async () => {
  const x = controlled<number>();
  const y = controlled<number>();
  const combined = combineLatestAsync({ x: x.iterable, y: y.iterable });
  const first = combined.next();
  x.push(1);
  y.push(2);
  assert.deepStrictEqual((await first).value, { x: 1, y: 2 });
  x.end();
  y.end();
  await combined.return(undefined);
});

test("combineLatestAsync coalesces snapshots while the consumer is busy (latest wins)", async () => {
  const a = controlled<number>();
  const b = controlled<number>();
  const combined = combineLatestAsync([a.iterable, b.iterable]);
  const first = combined.next();
  a.push(1);
  b.push(10);
  assert.deepStrictEqual((await first).value, [1, 10]);
  // The consumer is "busy": push several updates before reading again.
  a.push(2);
  a.push(3);
  b.push(20);
  a.push(4);
  await flush();
  assert.deepStrictEqual((await combined.next()).value, [4, 20], "one snapshot with the newest values");
  let next: IteratorResult<number[]> | undefined;
  void combined.next().then((r) => {
    next = r;
  });
  await flush();
  assert.strictEqual(next, undefined, "nothing new: the consumer waits");
  b.push(30);
  await flush();
  assert.deepStrictEqual(next!.value, [4, 30]);
  await combined.return(undefined);
});

test("combineLatestAsync snapshots are fresh objects", async () => {
  const combined = combineLatestAsync([asyncFrom(1, 2)]);
  const snapshots = await collect(combined);
  assert.notStrictEqual(snapshots[0], snapshots[snapshots.length - 1]);
});

test("combineLatestAsync uses `initial` for inputs that have not yielded yet", async () => {
  const a = controlled<number>();
  const b = controlled<string>();
  const combined = combineLatestAsync({ a: a.iterable, b: b.iterable }, { initial: { b: "start" } });
  const first = combined.next();
  a.push(1);
  assert.deepStrictEqual((await first).value, { a: 1, b: "start" });
  b.push("live");
  assert.deepStrictEqual((await combined.next()).value, { a: 1, b: "live" });
  await combined.return(undefined);
});

test('combineLatestAsync endOn "all" (default) keeps going after one input ends', async () => {
  const a = controlled<number>();
  const b = controlled<number>();
  const combined = combineLatestAsync([a.iterable, b.iterable]);
  const first = combined.next();
  a.push(1);
  b.push(1);
  await first;
  a.end();
  b.push(2);
  assert.deepStrictEqual((await combined.next()).value, [1, 2], "a's last value is kept");
  b.end();
  assert.strictEqual((await combined.next()).done, true);
});

test('combineLatestAsync endOn "any" ends when the first input ends, after the pending snapshot', async () => {
  const a = controlled<number>();
  const b = controlled<number>();
  const combined = combineLatestAsync([a.iterable, b.iterable], { endOn: "any" });
  const first = combined.next();
  a.push(1);
  b.push(1);
  await first;
  a.push(2);
  a.end();
  await flush();
  assert.deepStrictEqual((await combined.next()).value, [2, 1], "the pending snapshot is still delivered");
  assert.strictEqual((await combined.next()).done, true);
  assert.strictEqual(b.returned, 1, "the input still running is closed");
});

test("combineLatestAsync ends at once if an input ends without ever having a value", async () => {
  const a = controlled<number>();
  const b = controlled<number>();
  const combined = combineLatestAsync([a.iterable, b.iterable]);
  const first = combined.next();
  a.push(1);
  b.end();
  assert.strictEqual((await first).done, true);
  assert.strictEqual(a.returned, 1);
});

// ------------------------------------------------------ withLatestFromAsync

test("withLatestFromAsync pairs each source value with the latest of the others", async () => {
  const clicks = controlled<string>();
  const price = controlled<number>();
  const qty = controlled<number>();
  const paired = withLatestFromAsync(clicks.iterable, { price: price.iterable, qty: qty.iterable });
  const seen: unknown[] = [];
  const done = (async () => {
    for await (const pair of paired) seen.push(pair);
  })();
  price.push(10);
  await flush();
  clicks.push("too early"); // qty has no value yet: dropped
  await flush();
  qty.push(1);
  price.push(11);
  await flush();
  clicks.push("buy");
  await flush();
  price.push(12);
  price.end(); // keeps its last value
  await flush();
  clicks.push("buy again");
  await flush();
  clicks.end();
  await done;
  assert.deepStrictEqual(seen, [
    ["buy", { price: 11, qty: 1 }],
    ["buy again", { price: 12, qty: 1 }],
  ]);
  assert.strictEqual(qty.returned, 1, "others still running are closed when the source ends");
});

test("withLatestFromAsync takes an array of others", async () => {
  const other = controlled<number>();
  other.push(5);
  const source = controlled<string>();
  const paired = withLatestFromAsync(source.iterable, [other.iterable]);
  const first = paired.next();
  await flush();
  source.push("s");
  assert.deepStrictEqual((await first).value, ["s", [5]]);
  await paired.return(undefined);
});

// --------------------------------------------------------------- latestAsync

test("latestAsync keeps only the newest unread value", async () => {
  const source = controlled<number>();
  const latest = latestAsync(source.iterable);
  const first = latest.next();
  source.push(1);
  assert.strictEqual((await first).value, 1);
  source.push(2);
  source.push(3);
  source.push(4);
  await flush();
  assert.strictEqual((await latest.next()).value, 4, "2 and 3 were superseded");
  let next: IteratorResult<number> | undefined;
  void latest.next().then((r) => {
    next = r;
  });
  await flush();
  assert.strictEqual(next, undefined, "a value is returned at most once: next() waits");
  source.push(5);
  await flush();
  assert.strictEqual(next!.value, 5);
  source.end();
  assert.strictEqual((await latest.next()).done, true);
});

test("latestAsync delivers the last value before ending", async () => {
  const source = controlled<number>();
  const latest = latestAsync(source.iterable);
  const first = latest.next();
  source.push(1);
  await first;
  source.push(2);
  source.end();
  await flush();
  assert.deepStrictEqual(await collect(latest), [2]);
});

test("latestAsync conflates an AsyncChannel", async () => {
  const channel = new AsyncChannel<number>();
  const latest = latestAsync(channel);
  const first = latest.next();
  await channel.put(1);
  assert.strictEqual((await first).value, 1);
  await channel.put(2);
  await channel.put(3);
  await flush();
  assert.strictEqual((await latest.next()).value, 3);
  await latest.return(undefined);
});

// --------------------------------------------------------------- sampleAsync

test("sampleAsync yields the latest source value on each trigger", async () => {
  const source = controlled<string>();
  const trigger = controlled<number>();
  const sampled = sampleAsync(source.iterable, trigger.iterable);
  const seen: string[] = [];
  const done = (async () => {
    for await (const value of sampled) seen.push(value);
  })();
  trigger.push(0); // no source value yet: nothing
  await flush();
  source.push("a");
  source.push("b");
  await flush();
  trigger.push(1);
  await flush();
  trigger.push(2); // no new source value: "b" again
  await flush();
  source.push("c");
  source.end(); // keeps its last value
  await flush();
  trigger.push(3);
  await flush();
  trigger.end();
  await done;
  assert.deepStrictEqual(seen, ["b", "b", "c"]);
});
