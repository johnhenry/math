# @johnhenry/iteration

This module implements a number of asynchronous iterator building blocks inspired by constructs from [Python](https://docs.python.org/3/library/itertools.html), APL, Haskell, and SML. Each has been recast in a form suitable for JavaScript.

The module standardizes a core set of fast, memory efficient tools that are useful by themselves or in combination. Together, they form an “iterator algebra” making it possible to construct specialized tools succinctly and efficiently in pure JavaScript.

### Native Iterator Helpers interop

Since this library's original release, JavaScript gained native **Iterator Helpers** (`Iterator.prototype.map/filter/take/drop/flatMap/reduce/toArray/forEach/some/every/find`, `Iterator.from`, shipped as ES2025 in Node 22+ and current Chrome/Firefox/Safari) — covering much of this library's original *synchronous* transformation story directly in the language. Where a sync function here is fully covered by a native helper, its implementation leans on `Iterator.from(iterable)` rather than a hand-rolled generator.

**Async Iterator helpers are not yet shipped** (still TC39 Stage 2 as of this writing), so the async half of this library remains hand-rolled and is where it continues to add the most value — every sync function here has an async dual for exactly this reason. See [docs/discussion/python-itertools.md](./docs/discussion/python-itertools.md) for the full design rationale and a function-by-function comparison to Python's `itertools`.

Requires **Node.js 22.12+** (or an equivalent Iterator-Helpers-capable engine).

> **Provenance.** This library has been renamed twice, so its published history spans three names.
> It started life as [`async-itertools`](https://github.com/johnhenry/async-itertools) (now
> archived) — the 1.x releases and the "2.0" milestones described below (transducer rewrite,
> cancellation, bounded concurrency, backpressure) all happened under that name. It was then
> absorbed into a pure-TypeScript monorepo as `mallory-iteration`, with full git history preserved
> via `git subtree`. It now ships as **`@johnhenry/iteration`** from the
> [`johnhenry/math`](https://github.com/johnhenry/math) monorepo, restarted at `0.0.0` under the
> new scoped name — the version number is fresh, the code and its lineage are not.

## What's new in 0.0.1

Additions for carrying **live values and events**. Every existing export keeps
its signature and default behaviour.

- **Combinators** (`@johnhenry/iteration/combine`): `mergeAsync`,
  `combineLatestAsync`, `withLatestFromAsync`, `latestAsync`, `sampleAsync`.
- **Time operators** (`@johnhenry/iteration/time`): `debounceAsync`,
  `throttleAsync`, with an injectable `clock`.
- **`transducePush`**: drive transducers one value at a time, with no iterator.
- **Options:** `teeSync`/`teeAsync` take `{ limit, overflow }`, and
  `AsyncChannel` takes `errors: "value" | "throw"`.
- **Fixes:** `zipSync`/`zipAsync`/`zipLongestSync`/`zipLongestAsync` now close
  every input when the zip ends, errors or is exited early, and concurrent
  `AsyncChannel#take()` calls are now served FIFO (a second waiting `take()`
  used to replace the first, which then never resolved).

## What's new in 2.0

- **Transducer protocol rewritten (memory-leak fix).** In the 1.x line the
  transduce engine threaded its accumulator as an iterable that every step
  wrapped in a fresh generator (`conjoin(init, item)`), retaining one
  generator object *per item processed* (~176 bytes/item) — unbounded heap
  growth on long streams. In 2.0 the accumulator is a plain array used as a
  **pending-emission buffer**: the innermost step pushes emitted items onto
  it and `reduceSync`/`reduceAsync` drain it after each step, so memory
  stays flat no matter how many items flow through. Observable behavior of
  `transduceSync`/`transduceAsync` and every built-in transducer is
  unchanged (composition order, the `.complete` flush protocol, and HALT
  early termination all work as before) — but **custom code that
  implemented the old step protocol directly** (calling
  `conjoinSync`/`conjoinAsync` as its inner reducer, or passing iterable
  accumulators to `reduceSync`/`reduceAsync`) must be updated: a step now
  receives the buffer array, calls its inner step (which pushes), and
  returns the buffer (or `HALT`). See `ReducerStep`/`Transducer` in
  `src/iterator-tools.ts`.
- **`HAULT` → `HALT`.** The early-termination sentinel is now spelled
  `HALT`; `HAULT` remains exported as a deprecated alias (same symbol).
- **TypeScript.** The library is now written in TypeScript and ships
  compiled ESM + `.d.ts` declarations from `dist/`. The transducer protocol
  is fully typed (`Transducer<In, Out>`), still with **zero runtime
  dependencies**.
- **AbortSignal support.** Async terminal consumers and `transduceAsync`
  accept an optional `{ signal }` (see below).
- **Bounded concurrency.** New `mapConcurrentAsync` and `prefetchAsync`
  (see below).
- **AsyncChannel backpressure.** `put()` now returns a promise that waits
  for capacity instead of throwing `"cache full"` (see below).

### Naming conventions (worth knowing before you alias/re-export)

Some names here are deliberate and easy to misread; downstream consumers
who remap names should keep these distinctions:

- **`countSync`/`countAsync`** (and `countBig*`) are **integer sequence
  generators**, mirroring Python's `itertools.count` — not "count the
  items" (that's `quantifySync`/`quantifyAsync`).
- **`reduceSync`/`reduceAsync`** are the **streaming primitive** under
  `transduce*` (they yield each emitted item); the **terminal**
  reduce-to-one-value operation is **`foldSync`/`foldAsync`**.
- **`group(n)`** (transducer) chunks by **fixed size**;
  **`groupBySync`/`groupByAsync`** (and the `partitionBy` transducer)
  group **consecutive runs by key**.

### CommonJS / `require()`

This package ships compiled ESM (`"type": "module"`, `dist/*.js` built from
TypeScript source) — but it's still directly usable from CommonJS. Node's
native `require(esm)` support (stable and unflagged since **Node 22.12**,
which is why that's this package's floor) lets `require()` load an ES module
synchronously:

```javascript
const { countSync, someAsync } = require("@johnhenry/iteration");
```

No separate CJS build or `"require"` condition in `package.json`'s `exports` is needed or provided — `require(esm)` resolves through the same ESM files everything else uses. This is verified in CI (`scripts/require-esm-smoke-test.cjs`), not just documented.

## Installation

```bash
npm install @johnhenry/iteration
```

## Production

Generally, you'll use this library to transform existing iterators; but we provide a number of differerent methods to create iterators as well.

### `emptySync` & `emptyAsync`

Create empty iterators

```javascript
import { emptySync, emptyAsync } from "@johnhenry/iteration";
for (const a of emptySync()) {
  // dream the impossible
}
for (const a of emptyAsync()) {
  // do the impossible!
}
```

### `countSync` & `countBigSync`; `countAsync` & `countBigAsync`

Create a sequence of integers

```javascript
import {
  countSync,
  countBigSync,
  countAsync,
  countBigAsync,
} from "@johnhenry/iteration";
for (const a of countSync(0, 9)) {
  console.log(a);
} // logs 1, 2, 3, 4, 5, 6, 7, 8, 9
for (const a of countBigSync(9n, 0n)) {
  console.log(a);
} // logs 9n, 8n, 7n, 6n, 5n, 4n, 3n, 2n, 1n, 0n
for await (const a of countAsync(0, 9)) {
  console.log(a);
} // logs 1, 2, 3, 4, 5, 6, 7, 8, 9
for await (const a of countBigAsync(9n, 0n)) {
  console.log(a);
} // logs 9n, 8n, 7n, 6n, 5n, 4n, 3n, 2n, 1n, 0n
```

### `syncFrom` & `asyncFrom`

Create iterators from given items

```javascript
import { syncFrom, asyncFrom } from "@johnhenry/iteration";
for (const a of syncFrom(1, 2, 3)) {
  console.log(a);
} // logs 1, 2, 3
for await (const a of asyncFrom(4, 5, 6)) {
  console.log(a);
} // logs 4, 5, 6
```

### `zipSync` & `zipAsync`

Zip several iterators together, stopping at the shortest one. `zipAsync` pulls
the next value from every input in parallel each round, and accepts a mix of
sync and async iterables.

```javascript
import { zipSync, zipAsync } from "@johnhenry/iteration";
for (const pair of zipSync([1, 2, 3], ["a", "b", "c"])) {
  console.log(pair);
} // logs [1,'a'], [2,'b'], [3,'c']
for await (const pair of zipAsync([1, 2, 3], ["a", "b"])) {
  console.log(pair);
} // logs [1,'a'], [2,'b'] -- stops at the shorter input
```

When the zip ends (the shortest input runs out), when an input throws, or
when the consumer exits early, every input that has not ended is closed
with `return()`, so generator `finally` blocks and the resources they guard
are released. The same holds for `zipLongestSync`/`zipLongestAsync`. An input
that ended or threw is not closed again. `zipAsync` does not take a
`{ signal }`; wrap it in `abortable` for cancellation.

## Transformation: transducers

This library employs transducers,
(see [this](https://clojure.org/reference/transducers)),
to transform iterators.

This library provides two methods
-- `transduceSync` and `transduceAsync` --
to apply transducers to synchronous
and asynchronous iterators.

```javascript
import { transduceSync } from "@johnhenry/iteration";
// import { transduceSync } from "@johnhenry/iteration/transduce";
for (const item of transduceSync(/*list of transducers*/)(/*some iterator*/)) {
  // do something with transduced item
}
```

```javascript
import { transduceAsync } from "@johnhenry/iteration";
// import { transduceAsync } from "@johnhenry/iteration/transduce";
for await (const item of transduceAsync(/*list of transducers*/)(/*some asynchronous iterator*/)) {
  // do something with transduced item
}
```

In addition, the library provides
a number of built-in transducers
that can be applied.

### `map`

Similiar to [Array.prototype.map](),
maps items with a given transformation function.

```javascript
// import { transducers } from "@johnhenry/iteration";
// const { map } = transducers;
import { map } from "@johnhenry/iteration/transducers";
const addOne = map((x) => x + 1);
const abs = map(Math.abs);
for (const x of transduceSync(addOne, abs)([-3, -2, -1, 0, 1, 2, 3])) {
  console.log(x);
}
// logs: 2, 1, 0, 1, 2, 3, 4
```

### `filter`

Similiar to [Array.prototype.filter](),
filters items that do not match a given predicate

```javascript
import { filter } from "@johnhenry/iteration/transducers";
const removeStrings = map((x) => typeof x !== "string");
const keepPositive = map((x) => x > 0);
for (const x of transduceSync(
  removeStrings,
  keepPositive
)(["alice", -3, -2, "bob", -1, 0, 1, "claire", 2, 3])) {
  console.log(x);
}
// logs: 0, 1, 2, 3
```

### `accumulate`

Apply function successively to items in iterator.
Similar to `Array.prototype.reduce`.

```javascript
import { accumulate } from "@johnhenry/iteration/transducers";
const sum = accumulate((a, b) => a + b, 0);
for (const x of transduceSync(sum)([1, 2, 3, 4])) {
  console.log(x);
}
// logs: 1, 3, 6, 10
```

### `group`

Place items into groups of size N. A trailing, under-sized group is flushed
once the source is exhausted (via the transducer completion protocol — see
`transduceSync`/`transduceAsync`).

```javascript
import { group } from "@johnhenry/iteration/transducers";
const triplet = group(3);
for (const x of transduceSync(triplet)([1, 2, 3, 4, 5, 6, 7])) {
  console.log(x);
}
// logs: [1, 2, 3], [4, 5, 6], [7]
```

### `take`

Take only the first N items and drop the rest (see 'drop').

```javascript
import { take } from "@johnhenry/iteration/transducers";
const take5 = take(5);
for (const x of transduceSync(take5)([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
  console.log(x);
}
// logs: 1, 2, 3, 4, 5
```

### `drop`

Drop the first N items and take the rest (see 'take'). Previously named
`reject` — renamed since `reject` now names the predicate-based complement
of `filter`, below.

```javascript
import { drop } from "@johnhenry/iteration/transducers";
const dropDozen = drop(12);
for (const x of transduceSync(dropDozen)([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
])) {
  console.log(x);
}
// logs 13, 14
```

### `reject`

Reject items matching a predicate and keep the rest — the complement of
`filter` (see 'filter'). Mirrors Python's `itertools.filterfalse`.

```javascript
import { reject } from "@johnhenry/iteration/transducers";
const rejectEven = reject((x) => x % 2 === 0);
for (const x of transduceSync(rejectEven)([1, 2, 3, 4, 5])) {
  console.log(x);
}
// logs 1, 3, 5
```

### `dedupe`

Skip consecutive duplicate items (by key). Mirrors the `unique_justseen`
recipe documented in Python's itertools docs — the transducer-pipeline,
adjacent-only counterpart to `uniqueSync`/`uniqueAsync` (which dedupe
globally, across the whole stream, not just neighboring items).

```javascript
import { dedupe } from "@johnhenry/iteration/transducers";
for (const x of transduceSync(dedupe())([1, 1, 2, 2, 1, 1, 3])) {
  console.log(x);
}
// logs 1, 2, 1, 3 -- note the non-adjacent 1s both survive
```

### `interpose`

Insert a separator between consecutive emitted items — not before the
first item, and not after the last.

```javascript
import { interpose } from "@johnhenry/iteration/transducers";
for (const x of transduceSync(interpose(","))([1, 2, 3])) {
  console.log(x);
}
// logs 1, ',', 2, ',', 3
```

### `partitionBy`

Group consecutive items sharing a key into arrays, emitting each completed
group as soon as the key changes. The transducer-pipeline counterpart to
`groupBySync`/`groupByAsync`; distinct from `group`, above, which chunks by
a fixed size rather than by a shared key. Like `group`, a trailing partial
run is flushed once the source completes.

```javascript
import { partitionBy } from "@johnhenry/iteration/transducers";
for (const x of transduceSync(partitionBy())([1, 1, 2, 1, 1])) {
  console.log(x);
}
// logs [1, 1], [2], [1, 1]
```

### `tap`

Call `fn(item)` for its side effect and pass the item through unchanged.
RxJS-style, for debugging or instrumenting a pipeline without altering its
values.

```javascript
import { tap } from "@johnhenry/iteration/transducers";
const logged = tap((x) => console.log("saw:", x));
for (const x of transduceSync(logged)([1, 2, 3])) {
  // "saw: 1", "saw: 2", "saw: 3" logged as a side effect;
  // x is still 1, 2, 3
}
```

Multiple different types of transducers can be applied.

```javascript
import { map, filter, take } from "@johnhenry/iteration/transducers";
const transformation = transduceSync(
  map((x) => x + 2),
  filter((x) => x % 2),
  take(4)
);
for (const x of transformation([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
])) {
  console.log(x);
}
// logs 3, 5, 7, 9
```

### `transducePush`: push values in, one at a time

`transducePush(...transducers)` runs the same transducers without an
iterator, for code that receives values by callback (an event handler, a
wire in a dataflow graph). It returns `{ step(value), complete(), halted }`:
`step` returns the items that value emitted, `complete()` flushes stateful
transducers (such as a trailing partial `group`), and `halted` turns true
once a transducer returns `HALT`.

```javascript
import { transducePush, transducers } from "@johnhenry/iteration";
const { group, map } = transducers;
const pipe = transducePush(group(2), map((pair) => pair.join("+")));
socket.onmessage = (event) => pipe.step(event.data).forEach(send); // "a+b", "c+d", ...
socket.onclose = () => pipe.complete().forEach(send); // a trailing "e", if any
```

It uses the same composition order, `.complete` flush and `HALT` as
`transduceSync`: pushing every item of `xs` and then calling `complete()`
returns exactly what `transduceSync(...)(xs)` yields. What it does **not**
do:

- It does not buffer or schedule anything: each `step` runs synchronously
  and returns its output. There is no async variant; a transducer is pure.
- After `HALT`, or after `complete()`, `step` ignores its value and returns
  `[]`; it does not throw. `complete()` is idempotent.
- Like `transduceSync`, it drops what the halting step emitted, and a
  `.complete` flush only reaches stateful transducers that come before any
  built-in stateless one (`map`, `filter`, `take` do not forward
  `.complete`).

### Early termination: `HALT`

A step may return the `HALT` sentinel to stop consumption of the source —
this is how `take` works. Renamed from the misspelled `HAULT` in 2.0;
`HAULT` is still exported as a deprecated alias of the same symbol.

```javascript
import { HALT } from "@johnhenry/iteration";
```

### The step protocol (writing custom transducers)

As of 2.0, the accumulator is a plain array used as a *pending-emission
buffer*: the innermost step ("emit") pushes emitted items onto it and
returns it, and `reduceSync`/`reduceAsync` drain the buffer after each
step. A transducer transforms a step consuming its output type into a step
consuming its input type:

```typescript
type Transducer<In, Out> = (next: ReducerStep<Out>) => ReducerStep<In>;
// a ReducerStep<In> is (buffer, item: In, iterator?) => buffer | HALT,
// optionally carrying a .complete(buffer) => buffer flush method
```

Custom stateful transducers can flush buffered state once the source
iterator completes by attaching a `.complete(init)` method to the step
function they return (see `group`, above, for a worked example, and note
that `.complete` must cascade to the inner step's own `.complete`) — see
`reduceSync`/`reduceAsync` in `src/iterator-tools.ts` for the protocol.

> **Migrating from 2.0:** the old protocol threaded an *iterable*
> accumulator that each step wrapped in a new generator via
> `conjoin(init, item)` — which retained one generator per item processed
> and leaked ~176 bytes/item on long streams. If you wrote a custom
> transducer with the standard curried shape
> (`(conjoin) => (init, item) => conjoin(init, item)` etc.) it keeps
> working unchanged; only code that constructed accumulator iterables
> itself, or called `reduceSync`/`reduceAsync` with an iterable `init`,
> needs updating to the array-buffer protocol.

## Python itertools parity (`@johnhenry/iteration/itertools`)

Flat, non-curried building blocks mirroring functions from Python's
[`itertools`](https://docs.python.org/3/library/itertools.html) module —
unlike the transducer factories above, these take the iterable(s) directly
and return a generator, matching Python's argument order. Each has a sync
and async form. See
[docs/discussion/python-itertools.md](./docs/discussion/python-itertools.md)
for the full comparison table and documented design divergences.

```javascript
import {
  takeWhileSync,
  dropWhileSync,
  compressSync,
  pairwiseSync,
  windowedSync,
  groupBySync,
  chainSync,
  flattenSync,
  cycleSync,
  repeatSync,
  uniqueSync,
  enumerateSync,
  starmapSync,
  zipLongestSync,
  isliceSync,
  // ...and their `*Async` duals: takeWhileAsync, dropWhileAsync, etc.
} from "@johnhenry/iteration";
// or: import { ... } from "@johnhenry/iteration/itertools";

takeWhileSync((x) => x < 3, [1, 2, 3, 4, 1]); // yields 1, 2
dropWhileSync((x) => x < 3, [1, 2, 3, 4, 1]); // yields 3, 4, 1
compressSync(["a", "b", "c", "d"], [1, 0, 1, 0]); // yields 'a', 'c'
[...pairwiseSync([1, 2, 3, 4])]; // [[1,2],[2,3],[3,4]]
[...windowedSync([1, 2, 3, 4, 5], 3)]; // [[1,2,3],[2,3,4],[3,4,5]]
[...groupBySync([1, 1, 2, 1])]; // [[1,[1,1]],[2,[2]],[1,[1]]] -- consecutive runs only
[...chainSync([1, 2], [3, 4])]; // [1,2,3,4]
[...flattenSync([[1, 2], [3, 4]])]; // [1,2,3,4]
[...isliceSync(cycleSync([1, 2, 3]), 7)]; // [1,2,3,1,2,3,1]
[...repeatSync("x", 3)]; // ['x','x','x']
[...uniqueSync([1, 1, 2, 3, 2, 1])]; // [1,2,3]
[...enumerateSync(["a", "b"])]; // [[0,'a'],[1,'b']]
[...starmapSync((a, b) => a + b, [[1, 2], [3, 4]])]; // [3,7]
[...zipLongestSync(null, [1, 2, 3], ["a", "b"])]; // [[1,'a'],[2,'b'],[3,null]]
[...isliceSync([1, 2, 3, 4, 5, 6, 7, 8], 1, 8, 2)]; // [2,4,6,8]
```

## Combinatorics — moved to `@johnhenry/math`

`product`, `permutations`, `combinations`, and `combinationsWithReplacement`
now live in [`@johnhenry/math`](../math)'s `Combinatorics`, alongside the counting
functions they pair with (`binomial`, `permutationsCount`, …). Enumeration is
mathematics rather than stream plumbing, and having both faces in one place
lets the library assert that they agree.

```javascript
import { Combinatorics } from "@johnhenry/math";

[...Combinatorics.combinations([1, 2, 3], 2)]; // [[1,2],[1,3],[2,3]]
Combinatorics.binomial(3, 2); // 3n — the count of exactly the above
```

The `Async` duals were dropped rather than moved: they only wrapped
"materialize the source, then run the same sync generator" (these algorithms
are inherently collect-then-compute, in Python too), so `exhaustAsync` from
this package plus the sync generator gives the identical result.

## Terminal consumers (`@johnhenry/iteration/consumers`)

Resolve an iterable to a single value (or a `Promise` of one), rather than
another iterable. Two families:

- **Iterator-Helper parity** — `someSync`/`everySync`/`findSync`/
  `forEachSync`/`foldSync` mirror native ES2025 `Iterator.prototype.some/
  every/find/forEach/reduce` (which sync code already gets for free via
  `Iterator.from(iterable)`); the `*Async` duals hand-roll the same behavior
  since `AsyncIterator` helpers aren't shipped yet. `foldSync`/`foldAsync`
  are named `fold`, not `reduce`, to avoid colliding with this library's own
  `reduceSync`/`reduceAsync` (an internal streaming primitive, not a
  terminal reduce-to-one-value). `someSync`/`someAsync`/`everySync`/
  `everyAsync`/`findSync`/`findAsync` all short-circuit — they won't
  exhaust an infinite source once the answer is known.
- **Summary/aggregate consumers** — `firstSync`/`lastSync`/`nthSync`/
  `quantifySync`/`minSync`/`maxSync`, borrowed from Python builtins/
  itertools-recipes and other itertools-adjacent libraries' "summary"
  namespaces. `quantifySync`/`quantifyAsync` (count items matching a
  predicate) are named after the `quantify` recipe documented in Python's
  own itertools docs — deliberately *not* `count`, which already means
  something else here (`countSync` mirrors `itertools.count`, an integer
  sequence generator; see [`countSync` & `countBigSync`](#countsync--countbigsync-countasync--countbigasync),
  above). `findSync`/`firstSync`/`lastSync`/`nthSync`/`minSync`/`maxSync`
  return `undefined` (or a caller-supplied `defaultValue`) on an
  empty/no-match input rather than throwing — this deliberately diverges
  from Python's own `min()`/`max()`, which throw without a `default`.

```javascript
import {
  someSync, everySync, findSync, forEachSync, foldSync,
  firstSync, lastSync, nthSync, quantifySync, minSync, maxSync,
  // ...and their `*Async` duals
} from "@johnhenry/iteration";
// or: import { ... } from "@johnhenry/iteration/consumers";

someSync((x) => x > 2, [1, 2, 3]); // true
everySync((x) => x > 0, [1, 2, 3]); // true
findSync((x) => x > 1, [1, 2, 3]); // 2
foldSync((a, b) => a + b, 0, [1, 2, 3, 4]); // 10
firstSync([1, 2, 3]); // 1
lastSync([1, 2, 3]); // 3
nthSync([10, 20, 30, 40], 2); // 30
quantifySync([1, 2, 3, 4], (x) => x % 2 === 0); // 2
minSync(["abc", "a", "ab"], (s) => s.length); // 'a'
maxSync(["abc", "a", "ab"], (s) => s.length); // 'abc'
```

Need every item collected into an array instead? That's `exhaustSync`/
`exhaustAsync` (below) — no separate `toArraySync`/`toArrayAsync` alias is
provided.

### Cancellation: `{ signal }` (new in 2.0)

Every async terminal consumer (`someAsync`, `everyAsync`, `findAsync`,
`forEachAsync`, `foldAsync`, `firstAsync`, `lastAsync`, `nthAsync`,
`quantifyAsync`, `minAsync`, `maxAsync`) accepts an optional trailing
`{ signal }` options bag, and the function returned by `transduceAsync`
accepts one as a second argument. On abort, the source iterator is closed
(`iterator.return()` is propagated upstream) and the operation rejects with
the signal's reason — an `"AbortError"` `DOMException` by default:

```javascript
import { lastAsync, transduceAsync, transducers } from "@johnhenry/iteration";

const controller = new AbortController();
setTimeout(() => controller.abort(), 1000);

try {
  await lastAsync(slowInfiniteStream(), undefined, { signal: controller.signal });
} catch (err) {
  err.name; // 'AbortError'
}

// transduceAsync: pass { signal } when applying the pipeline to a source
const pipeline = transduceAsync(transducers.map((x) => x + 1));
for await (const item of pipeline(source, { signal: controller.signal })) {
  // ...
}
```

The underlying `abortable(iterable, signal)` async-generator wrapper is
exported too (also at `@johnhenry/iteration/abort`) if you want the same prompt,
`return()`-propagating cancellation around any `for await` loop.

## Bounded concurrency (`@johnhenry/iteration/concurrency`, new in 2.0)

### `mapConcurrentAsync`

`mapConcurrentAsync(fn, iterable, { concurrency, ordered = true, signal })`
maps `fn` over an (a)sync iterable with up to `concurrency` invocations in
flight at once. With `ordered: true` (default) results are yielded in input
order; with `ordered: false`, in completion order. The source is only
pulled while there is spare capacity (backpressure), `{ signal }` aborts
promptly even mid-`fn`, and early consumer exit / `fn` errors / abort all
close the source via `iterator.return()`.

```javascript
import { mapConcurrentAsync } from "@johnhenry/iteration";
// or: import { mapConcurrentAsync } from "@johnhenry/iteration/concurrency";

for await (const page of mapConcurrentAsync(
  (url) => fetch(url).then((r) => r.text()),
  urls,
  { concurrency: 4 }
)) {
  console.log(page.length); // input order; pass ordered: false for completion order
}
```

### `prefetchAsync`

`prefetchAsync(n, iterable)` eagerly keeps up to `n` reads in flight ahead
of the consumer in a bounded buffer, overlapping a slow producer with a
slow consumer. `n <= 0` degenerates to plain iteration; early consumer exit
closes the source via `iterator.return()`.

```javascript
import { prefetchAsync } from "@johnhenry/iteration";

for await (const record of prefetchAsync(8, slowDatabaseCursor())) {
  await expensiveProcessing(record); // next 8 reads already in flight
}
```

## Live values and events (`@johnhenry/iteration/combine`, new in 0.0.1)

Combinators for sources that produce values over time: UI events, sockets,
channels, sensors. Shared rules:

- Inputs may be async or sync iterables.
- Each takes an optional `{ signal }`. On abort it rejects with the signal's
  reason (an `"AbortError"` `DOMException` by default).
- Each closes (`return()`) every input that has not ended when it ends, when
  an input errors (the error is rethrown), when the signal aborts, and when
  the consumer exits early. An input whose `next()` is still pending is
  closed without waiting for that `next()` to settle, so a stalled source
  cannot block cleanup.
- Like every generator here, nothing starts until the first `next()`.

The "latest value" combinators (`combineLatestAsync`, `withLatestFromAsync`,
`latestAsync`, `sampleAsync`) drain some inputs **eagerly**: they keep
pulling whether or not the consumer is reading, and keep only the newest
value. That is the point for live values, but it means they do **not**
apply backpressure to those inputs, and a synchronous infinite iterable
given as one of those inputs would be drained forever. Give them event
sources, not generators of unbounded data.

### `mergeAsync`

`mergeAsync(...iterables, { signal })` yields each value as it arrives from
any input, and ends when every input has ended.

```javascript
import { mergeAsync } from "@johnhenry/iteration";
// or: import { mergeAsync } from "@johnhenry/iteration/combine";
for await (const event of mergeAsync(clicks, keypresses, { signal })) {
  handle(event);
}
```

It does **not** read ahead: each input has at most one `next()` pending, and
an input is asked for its next value only after its previous one has been
consumed. Inputs that are ready at the same moment are served in rotation,
so one fast (or synchronous) input cannot starve the rest. It does not tag
values with their input; map each input first if you need that.

### `combineLatestAsync`

`combineLatestAsync(inputs, { signal, initial, endOn })`: `inputs` is an
array or a record of iterables, and each output is a snapshot of the same
shape holding every input's latest value. A snapshot is emitted whenever an
input yields, once every input has a value.

```javascript
import { combineLatestAsync } from "@johnhenry/iteration";
for await (const { width, theme } of combineLatestAsync(
  { width: widths, theme: themes },
  { initial: { theme: "light" } },
)) {
  render(width, theme);
}
```

- **Latest wins:** while the consumer is busy, the snapshots it would have
  received coalesce into one, holding the newest values.
- `initial` supplies starting values for some or all inputs. It does **not**
  emit on its own: the first snapshot still waits for an input to yield.
- `endOn: "all"` (default) ends once every input has ended; `"any"` ends as
  soon as one does. A snapshot still pending is delivered first. Either way,
  an input that ends without ever having a value (and no `initial`) ends the
  output at once, since no complete snapshot could follow.
- It does **not** emit every intermediate combination, and it does not
  compare values: an input that yields the same value again still produces
  a snapshot. Each snapshot is a fresh object. An input error drops a
  snapshot that was still pending.

### `withLatestFromAsync`

`withLatestFromAsync(source, others, { signal })` pairs each value of
`source` with the latest value of each of `others` (an array or a record),
yielding `[value, snapshot]`. This is the "an event samples values" pattern.

```javascript
import { withLatestFromAsync } from "@johnhenry/iteration";
for await (const [click, { price, qty }] of withLatestFromAsync(buyClicks, { price: prices, qty: quantities })) {
  placeOrder(price, qty);
}
```

`source` is pulled as the consumer reads; `others` are drained eagerly.
Values of `others` do **not** produce output by themselves. Source values that
arrive before every one of `others` has a value are **dropped**, not
buffered. An input in `others` that ends keeps its last value. The output
ends when `source` ends.

### `latestAsync`

`latestAsync(iterable, { signal })` conflates a source: it drains the source
eagerly and keeps only the newest value not yet read. `next()` returns that
value, or waits for the next one.

```javascript
import { latestAsync } from "@johnhenry/iteration";
for await (const position of latestAsync(pointerMoves)) {
  await expensiveRender(position); // never falls behind: stale positions are skipped
}
```

It does **not** repeat a value: each value is returned at most once, so a
consumer faster than the source waits. It ends after the source ends and
its last value has been read. A source error is rethrown on the next read,
and an unread value is dropped. Closing it closes the source.

### `sampleAsync`

`sampleAsync(source, trigger, { signal })`: on each `trigger` value, yields
the latest `source` value, if the source has produced one yet.

```javascript
import { sampleAsync } from "@johnhenry/iteration";
for await (const position of sampleAsync(pointerMoves, animationFrames)) {
  draw(position);
}
```

Unlike RxJS `sample`, it does **not** skip a trigger when the source has not
changed since the last one: the same value is yielded again. Triggers that
fire before the source has a value yield nothing. The source is drained
eagerly and the trigger is pulled as the consumer reads. It ends when the
trigger ends; a source that ends keeps its last value.

## Time operators (`@johnhenry/iteration/time`, new in 0.0.1)

`debounceAsync` and `throttleAsync` drain their source eagerly (timing
depends on when values arrive, not on when you read them) and queue what
they emit until it is read. Both take `{ clock, signal }`. On abort, a source
error or consumer exit they clear their timer and close the source.

`clock` is `{ setTimeout(callback, ms), clearTimeout(handle), now() }`, and
defaults to `systemClock` (the host's timers and `performance.now()`). Pass
your own to drive them from a test's fake clock or from a host scheduler;
`now()` must share the time base of the delays given to `setTimeout`.

### `debounceAsync`

`debounceAsync(ms, iterable, { clock, signal })` emits a value only after
`ms` has passed with no newer value: a burst becomes its last value, `ms`
after the burst ends. When the source ends, a value still waiting is
emitted at once.

```javascript
import { debounceAsync } from "@johnhenry/iteration";
// or: import { debounceAsync } from "@johnhenry/iteration/time";
for await (const query of debounceAsync(250, searchInputs)) {
  search(query);
}
```

It has no `leading` or `maxWait` option: nothing is emitted during a burst
that never pauses. A source error is rethrown after the values already
emitted, and a value still waiting for its quiet period is dropped.

### `throttleAsync`

`throttleAsync(ms, iterable, { leading, trailing, clock, signal })` emits at
most one value per `ms` window. A value arriving while no window is open
opens one, and with `leading` (default `true`) is emitted at once. With
`trailing` (default `true`), the newest value that arrived during the
window is emitted when it closes, which opens the next window. When the
source ends, a trailing value still waiting is emitted at once.

```javascript
import { throttleAsync } from "@johnhenry/iteration";
for await (const position of throttleAsync(16, pointerMoves)) {
  draw(position); // at most one per 16 ms, and always the final position
}
```

`leading` and `trailing` cannot both be `false` (a `RangeError`). The
defaults match lodash's `throttle`, not RxJS `throttleTime` (whose
`trailing` defaults to `false`). It does **not** align windows to wall-clock
boundaries, and a source error drops a trailing value still waiting.

## Utilities

This library provides a number of iterator related utilities.

### `isIterator` & `isAsyncIterator` & `exhaustable`

Test of object is an iterator or asyncIterator, or either.

```javascript
import { isIterator, isAsyncIterator, exhaustable } from "@johnhenry/iteration";
const iterator = (function* () {})();
const asyncIterator = (async function* () {})();
const block = {};
console.log(isIterator(iterator)); // true
console.log(isAsyncIterator(iterator)); // false
console.log(exhaustable(iterator)); // true
console.log(isIterator(asyncIterator)); // false
console.log(isAsyncIterator(asyncIterator)); // true
console.log(exhaustable(asyncIterator)); // true
console.log(isIterator(block)); // false
console.log(isAsyncIterator(block)); // false
console.log(exhaustable(block)); // false
```

### `exhaust` & `exhaustSync` & `exhaustAsync`

Exhaust all items from iterator — this library's "collect to an array"
(`toArray`) operation; see [Terminal consumers](#terminal-consumers-johnhenryiterationconsumers)
for other ways to resolve an iterable to a single value.
Warning: Initial object may have items removed

```javascript
import { exhaust, exhaustSync, exhaustAsync } from "@johnhenry/iteration";
const iterator = [1, 2, 3];
const aIterator = (async function* () {
  yield 4;
  yield 5;
  yield 6;
})();
const oneTwoThree = exhaust(iterator); //[1,2,3]
const fourFiveSix = await exhaust(iterator); //[4,5,6]
const oneTwoThreeB = exhaustSync(iterator); //[1,2,3]
const fourFiveSixB = await exhaustAsync(iterator); //[]
```

### `teeSync` & `teeAsync`

Tee iterator onto n other iterators
Warning: Initial object may be emptied

```javascript
import { teeSync, teeAsync } from "@johnhenry/iteration";
const iterator = (async function* () {
  yield 1;
  yield 2;
  yield 3;
})();

const [i0, i1, i2] = teeAsync(3)(iterator);

for (const x of i0) {
  console.log(x);
} // logs 1, 2, 3

for (const x of transduce(map((x) => x - 1))(i1)) {
  console.log(x);
} // logs 0, 1, 2

for (const x of transduce(filter((x) => x > 2))(i2)) {
  console.log(x);
} // logs  3
```

By default a branch that falls behind buffers without limit. Pass
`{ limit, overflow }` as a second argument to bound each branch's unread
items (new in 0.0.1):

```javascript
const [ui, log] = teeAsync(2, { limit: 100, overflow: "wait" })(events);
```

- `"wait"` (the `teeAsync` default when a `limit` is given): a branch that
  wants a new item waits until the slowest branch has room, which is true
  backpressure. Read the branches concurrently: draining one to the end
  while another sits unread stalls once that one holds `limit` items.
- `"drop-oldest"`: the item is delivered, and a full branch discards its
  oldest unread item, so each branch keeps its newest `limit`.
- `"error"` (the `teeSync` default when a `limit` is given): the pull throws
  a `RangeError` instead of growing a buffer past `limit`.

`teeSync` cannot block, so it does **not** support `"wait"` (a `TypeError`).
`limit` must be an integer `>= 1`. A branch you are not going to read should
be closed with `return()`: a closed branch stops receiving items and no
longer counts toward the limit.

### `AsyncChannel`

AsyncChannel is an experimental primative object.

**Backpressure (new in 2.0):** `put(item)` returns a `Promise<void>` that
resolves once the channel has accepted the item — immediately while a taker
is waiting or the cache is under `limit`, otherwise **when a later `take()`
frees a slot**. It no longer throws `"cache full"` at capacity. Blocked
producers release in FIFO order, `break()` queues behind already-waiting
producers (the end marker can't overtake their items), and `limit: 0`
behaves as a rendezvous channel (each `put` waits for its `take`).

```javascript
const bounded = new AsyncChannel({ limit: 100 });
await bounded.put(item); // suspends the producer while the channel is full
```

**Concurrent takers (fixed in 0.0.1):** several `take()` calls waiting at
once are served in call order, one item each. Before 0.0.1 the channel kept
a single waiting-taker slot, so a second `take()` replaced the first, which
then never resolved. `break()` and `throw()` likewise reach only the
longest-waiting taker; the others keep waiting.

**Errors (`errors` option, new in 0.0.1):** `throw(message)` queues an error.
A `take()` already waiting when it is called always rejects. For a later
`take()`, the `errors` option decides:

```javascript
const lenient = new AsyncChannel(); // errors: "value" (default, unchanged)
await lenient.throw("bad");
await lenient.take(); // resolves with an Error object; iteration yields it

const strict = new AsyncChannel({ errors: "throw" });
await strict.throw("bad");
await strict.take(); // rejects with the Error; `for await` throws
```

With `"throw"`, only errors queued by `throw()` reject. An `Error` passed to
`put()` is still delivered as a value. The error does **not** close the
channel: items queued after it are still delivered.

```javascript
// file://declare.mjs
import { AsyncChannel } from "@johnhenry/iteration";
export const c = new AsyncChannel();
setTimeout(async () => {
  for await (const i of c) {
    console.log(i);
  }
});
```

Put items directly on an async channel.

```javascript
// file://use.mjs
import { c } from "./declare.mjs";
c.put("hello"); //logs "hello"
c.put("world"); //logs "world"
```

Automatically place items onto channels via decorators

```javascript
// file://use-websocket.mjs
import { c } from "./declare.mjs";
import { withWebSocket } from "@johnhenry/iteration/channel-decorators";
const socket = new WebSocket(/*ws url*/);
withWebSocket(c, socket);
```

```javascript
// file://use-event-emitter.mjs
import { c } from "./declare.mjs";
import { withEmitter } from "@johnhenry/iteration/channel-decorators";
const source = new EventSource(/*sse url*/);
withEmitter(c, source);
```

## Releasing

`@johnhenry/iteration` publishes as part of the `johnhenry/math` monorepo, via
that repo's root [Changesets](https://github.com/changesets/changesets) flow
(`.github/workflows/release.yml`), not a standalone per-package workflow:

1. Bump `version` in `package.json` and describe the change with
   `npm run changeset` (run from the `math` repo root), or bump it directly
   in a PR that includes a changeset.
2. Merge to `main`; the root release workflow opens or updates a
   "chore: version packages" PR.
3. Merge that PR. The workflow verifies (typecheck, check, test, build,
   test:build) and publishes every workspace package whose version isn't yet
   on npm — idempotent, so re-running (including manual `workflow_dispatch`)
   is safe.

See the root [README](../../README.md#releasing) for the full flow. The
`scripts/npm-publish-if-new.mjs` script in this package's own directory
predates the monorepo merge and is not what the current release workflow
uses.

Requires the **`NPM_TOKEN`** repository secret — a granular automation token
with write access to this package:

```bash
gh secret set NPM_TOKEN --repo johnhenry/math
```
