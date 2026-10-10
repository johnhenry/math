#!/usr/bin/env node
// Smoke test for the compiled dist/ output: imports the built package
// entry (and a couple of subpath modules) exactly the way a consumer
// would, and exercises a representative slice of the API. Run via
// `npm run test:build` after `npm run build`.
import assert from "node:assert/strict";

const index = await import("../dist/index.js");
const { transduceSync, transducers, countSync, AsyncChannel, HALT, HAULT } =
  index;
const { map, take, group } = transducers;

// transduce pipeline through the built output
assert.deepStrictEqual(
  [...transduceSync(map((x) => x * 2), take(3))(countSync(1, 100))],
  [2, 4, 6],
  "dist transduceSync(map, take) must work"
);
assert.deepStrictEqual(
  [...transduceSync(group(2))([1, 2, 3])],
  [[1, 2], [3]],
  "dist group must flush its trailing partial chunk"
);
assert.strictEqual(typeof HALT, "symbol", "HALT must be exported");
assert.strictEqual(HAULT, HALT, "deprecated HAULT alias must equal HALT");

// channel round-trip
const channel = new AsyncChannel();
await channel.put(1);
await channel.put(2);
await channel.break();
const seen = [];
for await (const item of channel) seen.push(item);
assert.deepStrictEqual(seen, [1, 2], "dist AsyncChannel round-trip");

// subpath modules resolve out of dist via the exports map
// (combinatorics moved to @johnhenry/math's Combinatorics — see readme)
const { windowedSync } = await import("@johnhenry/iteration/itertools");
assert.deepStrictEqual(
  [...windowedSync([1, 2, 3, 4], 2)],
  [
    [1, 2],
    [2, 3],
    [3, 4],
  ],
  "dist subpath export resolves",
);
const assertion = await import("@johnhenry/iteration/pop-quiz/asserteventualequal");
assert.strictEqual(typeof assertion.default, "function");

// new in 0.0.1: ./combine and ./time subpaths, transducePush
const { mergeAsync, combineLatestAsync } = await import("@johnhenry/iteration/combine");
const merged = [];
for await (const item of mergeAsync([1, 2], ["a"])) merged.push(item);
assert.deepStrictEqual(merged, [1, "a", 2], "dist mergeAsync via ./combine");
const snapshots = [];
for await (const s of combineLatestAsync({ x: [1] })) snapshots.push(s);
assert.deepStrictEqual(snapshots, [{ x: 1 }], "dist combineLatestAsync via ./combine");
const { debounceAsync, throttleAsync, systemClock } = await import("@johnhenry/iteration/time");
assert.strictEqual(typeof debounceAsync, "function", "dist debounceAsync via ./time");
assert.strictEqual(typeof throttleAsync, "function", "dist throttleAsync via ./time");
assert.strictEqual(typeof systemClock.now(), "number");
const pipe = index.transducePush(map((x) => x * 2), take(1));
assert.deepStrictEqual([pipe.step(1), pipe.step(2), pipe.halted], [[2], [], true], "dist transducePush");
assert.strictEqual(index.latestAsync, (await import("@johnhenry/iteration/combine")).latestAsync);

console.log("dist smoke test passed");
