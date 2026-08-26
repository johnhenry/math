// @johnhenry/iteration: transducers, Python-itertools parity, bounded
// concurrency, and backpressure-aware channels — sync and async.
//
// Run: npm install && node examples/04-iteration-pipelines.mjs
// (Full docs: packages/iteration/readme.md and its docs/ tree.)
import { AsyncChannel, mapConcurrentAsync, transduceSync } from "@johnhenry/iteration";
import { cycleSync, isliceSync, pairwiseSync, windowedSync } from "@johnhenry/iteration/itertools";
import { filter, map, take } from "@johnhenry/iteration/transducers";
import { foldSync } from "@johnhenry/iteration/consumers";

// Transducers: one composed transformation, no intermediate arrays
const transformation = transduceSync(
  map((x) => x + 2),
  filter((x) => x % 2),
  take(4),
);
console.log([...transformation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]); // [3, 5, 7, 9]

// itertools parity
console.log([...pairwiseSync([1, 2, 3, 4])]); // [[1,2],[2,3],[3,4]]
console.log([...windowedSync([1, 2, 3, 4, 5], 3)]); // [[1,2,3],[2,3,4],[3,4,5]]
console.log([...isliceSync(cycleSync([1, 2, 3]), 7)]); // [1,2,3,1,2,3,1]

// Terminal consumers (note: the terminal reduce is fold, not reduce —
// reduceSync is the streaming transducer primitive)
console.log(foldSync((a, b) => a + b, 0, [1, 2, 3, 4])); // 10

// Bounded concurrency: at most 3 in flight, results in input order
const delays = [30, 10, 20, 40, 5, 15];
const results = [];
for await (const r of mapConcurrentAsync(
  (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)),
  delays,
  { concurrency: 3 },
)) {
  results.push(r);
}
console.log(results); // [30, 10, 20, 40, 5, 15] — input order preserved

// Backpressure-aware channel: put() suspends the producer when full
const channel = new AsyncChannel({ limit: 2 });
(async () => {
  await channel.put("hello");
  await channel.put("world");
  await channel.break();
})();
for await (const item of channel) console.log(item); // hello, world
