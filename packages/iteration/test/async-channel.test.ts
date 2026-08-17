import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncChannel, CHANNEL_END, pause } from "../src/index.ts";

const settled = async (p: Promise<unknown>): Promise<boolean> => {
  const marker = Symbol("pending");
  const result = await Promise.race([p, pause(10, marker)]);
  return result !== marker;
};

test("put/take round-trip and async iteration end on break", async () => {
  const channel = new AsyncChannel<number>();
  await channel.put(1);
  await channel.put(2);
  await channel.break();
  const seen: number[] = [];
  for await (const item of channel) {
    seen.push(item);
  }
  assert.deepStrictEqual(seen, [1, 2]);
});

test("take waits for a later put", async () => {
  const channel = new AsyncChannel<string>();
  const taken = channel.take();
  assert.strictEqual(channel.pending(), true, "take should be pending");
  await channel.put("hello");
  assert.strictEqual(await taken, "hello");
});

test("put resolves immediately while under the limit", async () => {
  const channel = new AsyncChannel<number>({ limit: 2 });
  assert.strictEqual(await settled(channel.put(1)), true, "1st put fits");
  assert.strictEqual(await settled(channel.put(2)), true, "2nd put fits");
});

// Regression: pre-2.1, put() at capacity threw `Error("cache full")`.
// It now returns a promise that stays pending until take() frees a slot
// (backpressure), and never throws.
test("put at capacity blocks until take frees a slot (no more 'cache full')", async () => {
  const channel = new AsyncChannel<number>({ limit: 2 });
  await channel.put(1);
  await channel.put(2);

  let thirdResolved = false;
  const third = channel.put(3).then(() => {
    thirdResolved = true;
  });
  await pause(20);
  assert.strictEqual(thirdResolved, false, "3rd put must wait for capacity");

  assert.strictEqual(await channel.take(), 1, "take drains FIFO");
  await third; // capacity freed -> pending put resolves
  assert.strictEqual(thirdResolved, true, "3rd put resolves after take");

  assert.strictEqual(await channel.take(), 2);
  assert.strictEqual(await channel.take(), 3, "blocked item lands in order");
});

test("multiple blocked puts release in FIFO order", async () => {
  const channel = new AsyncChannel<number>({ limit: 1 });
  await channel.put(1);
  const resolved: number[] = [];
  const blocked = [2, 3, 4].map((n) =>
    channel.put(n).then(() => {
      resolved.push(n);
    }),
  );
  await pause(10);
  assert.deepStrictEqual(resolved, [], "all over-capacity puts must wait");

  const seen: number[] = [];
  seen.push((await channel.take()) as number);
  seen.push((await channel.take()) as number);
  seen.push((await channel.take()) as number);
  seen.push((await channel.take()) as number);
  await Promise.all(blocked);
  assert.deepStrictEqual(seen, [1, 2, 3, 4], "items must come out in put order");
  assert.deepStrictEqual(resolved, [2, 3, 4], "puts must release in FIFO order");
});

test("limit 0 acts as a rendezvous channel", async () => {
  const channel = new AsyncChannel<string>({ limit: 0 });
  let handedOff = false;
  const put = channel.put("x").then(() => {
    handedOff = true;
  });
  await pause(10);
  assert.strictEqual(handedOff, false, "put must wait for a taker");
  assert.strictEqual(await channel.take(), "x", "take receives directly");
  await put;
  assert.strictEqual(handedOff, true);
});

test("break does not overtake blocked producers", async () => {
  const channel = new AsyncChannel<number>({ limit: 1 });
  await channel.put(1);
  const blocked = channel.put(2);
  await pause(0); // let put(2) register as a waiting producer
  await channel.break();

  const seen: number[] = [];
  for await (const item of channel) {
    seen.push(item);
  }
  await blocked;
  assert.deepStrictEqual(seen, [1, 2], "blocked item must arrive before CHANNEL_END");
});

// Regression: put() awaited `transform(item)` before reserving its place in
// the channel, so whichever concurrent put() call's transform happened to
// resolve first won the race to land in the cache -- even if it was called
// *after* another put() whose transform simply took longer. Delivery order
// must track call order, not transform-resolution order.
test("concurrent put() calls with varying transform delays deliver in call order (FIFO)", async () => {
  const channel = new AsyncChannel<number>({
    // The first-called item (1) has the slowest transform, and the
    // last-called item (3) resolves instantly -- a race-prone
    // implementation would let 3 land in the cache before 1 or 2.
    transform: async (item: number) => {
      await pause(item === 1 ? 30 : item === 2 ? 15 : 0);
      return item;
    },
  });
  const puts = [channel.put(1), channel.put(2), channel.put(3)];
  await Promise.all(puts);

  const seen: number[] = [];
  seen.push((await channel.take()) as number);
  seen.push((await channel.take()) as number);
  seen.push((await channel.take()) as number);
  assert.deepStrictEqual(seen, [1, 2, 3], "values must land in put() call order, not transform-resolution order");
});

test("CHANNEL_END is exposed and take() surfaces it after break()", async () => {
  const channel = new AsyncChannel<number>();
  await channel.break();
  assert.strictEqual(await channel.take(), CHANNEL_END);
});
