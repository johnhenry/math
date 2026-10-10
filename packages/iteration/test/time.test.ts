import assert from "node:assert/strict";
import { test } from "node:test";
import { debounceAsync, systemClock, throttleAsync } from "../src/index.ts";
import { controlled, FakeClock, flush } from "./helpers.ts";

/** Read from `gen` in the background, recording [time, value] pairs. */
const record = <T>(gen: AsyncGenerator<T>, clock: FakeClock) => {
  const seen: Array<[number, T]> = [];
  const done = (async () => {
    for await (const value of gen) seen.push([clock.now(), value]);
  })();
  return { seen, done };
};

// ------------------------------------------------------------ debounceAsync

test("debounceAsync emits the last value of a burst after `ms` of quiet", async () => {
  const clock = new FakeClock();
  const source = controlled<string>();
  const { seen, done } = record(debounceAsync(100, source.iterable, { clock }), clock);
  await flush();
  source.push("a");
  await clock.advance(30);
  source.push("b");
  await clock.advance(30);
  source.push("c"); // burst ends at t=60
  await clock.advance(99);
  assert.deepStrictEqual(seen, [], "still within the quiet period");
  await clock.advance(1);
  assert.deepStrictEqual(seen, [[160, "c"]]);
  source.push("d");
  await clock.advance(100);
  assert.deepStrictEqual(seen, [
    [160, "c"],
    [260, "d"],
  ]);
  source.end();
  await done;
  assert.strictEqual(clock.timers.size, 0, "no timer left behind");
});

test("debounceAsync uses one timer per quiet period, not one per value", async () => {
  const clock = new FakeClock();
  const source = controlled<number>();
  let armed = 0;
  const counting = {
    now: clock.now,
    clearTimeout: clock.clearTimeout,
    setTimeout: (fn: () => void, ms: number) => {
      armed++;
      return clock.setTimeout(fn, ms);
    },
  };
  const { seen } = record(debounceAsync(100, source.iterable, { clock: counting }), clock);
  await flush();
  for (let i = 0; i < 10; i++) {
    source.push(i);
    await clock.advance(5);
  }
  await clock.advance(200);
  assert.deepStrictEqual(
    seen.map(([, v]) => v),
    [9],
  );
  assert.ok(armed <= 2, `armed ${armed} timers for 10 values`);
  source.end();
});

test("debounceAsync emits a waiting value at once when the source ends", async () => {
  const clock = new FakeClock();
  const source = controlled<number>();
  const { seen, done } = record(debounceAsync(100, source.iterable, { clock }), clock);
  await flush();
  source.push(1);
  await clock.advance(10);
  source.end();
  await done;
  assert.deepStrictEqual(seen, [[10, 1]]);
  assert.strictEqual(clock.timers.size, 0);
});

test("debounceAsync rethrows a source error after queued values, dropping a waiting one", async () => {
  const clock = new FakeClock();
  const source = controlled<number>();
  const gen = debounceAsync(10, source.iterable, { clock });
  const first = gen.next();
  source.push(1);
  await clock.advance(10); // 1 is emitted
  assert.strictEqual((await first).value, 1);
  source.push(2);
  await clock.advance(10); // 2 is emitted and queued (nobody reading)
  source.push(3); // waiting for its quiet period
  await flush();
  const boom = new Error("boom");
  source.error(boom);
  await flush();
  assert.strictEqual((await gen.next()).value, 2, "queued values come first");
  await assert.rejects(gen.next(), boom);
  assert.strictEqual(clock.timers.size, 0, "the timer for 3 was cleared");
});

test("debounceAsync validates ms", () => {
  assert.throws(() => debounceAsync(-1, []), RangeError);
  assert.throws(() => debounceAsync(Number.NaN, []), RangeError);
});

// ------------------------------------------------------------ throttleAsync

test("throttleAsync (leading + trailing, the default) emits the first value and the newest per window", async () => {
  const clock = new FakeClock();
  const source = controlled<string>();
  const { seen, done } = record(throttleAsync(100, source.iterable, { clock }), clock);
  await flush();
  source.push("a"); // leading, opens [0, 100)
  await clock.advance(20);
  source.push("b");
  await clock.advance(20);
  source.push("c"); // newest in the window
  await clock.advance(60); // t=100: trailing "c", opens [100, 200)
  await clock.advance(50);
  source.push("d"); // t=150
  await clock.advance(50); // t=200: trailing "d", opens [200, 300)
  await clock.advance(100); // t=300: window closes with nothing waiting
  await clock.advance(10);
  source.push("e"); // t=310: idle again, so leading
  await flush();
  source.end();
  await done;
  assert.deepStrictEqual(seen, [
    [0, "a"],
    [100, "c"],
    [200, "d"],
    [310, "e"],
  ]);
  assert.strictEqual(clock.timers.size, 0);
});

test("throttleAsync leading only drops values inside a window", async () => {
  const clock = new FakeClock();
  const source = controlled<number>();
  const { seen, done } = record(throttleAsync(100, source.iterable, { clock, trailing: false }), clock);
  await flush();
  source.push(1);
  await clock.advance(50);
  source.push(2);
  await clock.advance(50);
  source.push(3);
  await flush();
  source.end();
  await done;
  assert.deepStrictEqual(seen, [
    [0, 1],
    [100, 3],
  ]);
});

test("throttleAsync trailing only emits at the end of each window", async () => {
  const clock = new FakeClock();
  const source = controlled<number>();
  const { seen, done } = record(throttleAsync(100, source.iterable, { clock, leading: false }), clock);
  await flush();
  source.push(1);
  await clock.advance(50);
  source.push(2);
  await clock.advance(50);
  await clock.advance(100);
  source.push(3);
  await clock.advance(10);
  source.end(); // trailing value is flushed at once
  await done;
  assert.deepStrictEqual(seen, [
    [100, 2],
    [210, 3],
  ]);
  assert.strictEqual(clock.timers.size, 0);
});

test("throttleAsync rejects leading and trailing both false, and bad ms", () => {
  assert.throws(() => throttleAsync(10, [], { leading: false, trailing: false }), RangeError);
  assert.throws(() => throttleAsync(-5, []), RangeError);
});

test("systemClock wraps the host timers", async () => {
  let fired = false;
  const handle = systemClock.setTimeout(() => {
    fired = true;
  }, 0);
  systemClock.clearTimeout(handle);
  await flush();
  assert.strictEqual(fired, false, "clearTimeout cancels");
  assert.strictEqual(typeof systemClock.now(), "number");
});
