import assert from "node:assert/strict";
import { test } from "node:test";
import { countSync, transduceAsync, transducePush, transducers, transduceSync } from "../src/index.ts";
import { asyncFromArray } from "./helpers.ts";

const { map, take, drop, filter, group, accumulate, reject, dedupe, interpose, partitionBy, tap } = transducers;

test("transducer:map", () => {
  const original = [1, 2, 3, 4, 5];
  const plusOne = transduceSync(map((x: number) => x + 1));
  assert.deepStrictEqual([...plusOne(original)], [2, 3, 4, 5, 6], "should map items to 1 plus item");
});

test("transducer:filter", () => {
  const original = [1, 2, 3, 4, 5];
  const greaterThanThree = transduceSync(filter((x: number) => x > 3));
  assert.deepStrictEqual([...greaterThanThree(original)], [4, 5], "should filter out items greater than 3");
});

test("transducer:take", () => {
  const original = [1, 2, 3, 4, 5];
  const firstThree = transduceSync(take<number>(3));
  assert.deepStrictEqual([...firstThree(original)], [1, 2, 3], "should take first three items");
});

test("transducer:group", () => {
  const original = [1, 2, 3, 4];
  const pair = transduceSync(group<number>(2));
  assert.deepStrictEqual(
    [...pair(original)],
    [
      [1, 2],
      [3, 4],
    ],
    "should group items into pairs",
  );
});

// Regression: group() previously had no completion/flush step, so a
// trailing partial group (here, [7]) was silently dropped instead of
// being emitted once the source iterator was exhausted.
test("transducer:group flushes trailing partial group (regression)", () => {
  const original = [1, 2, 3, 4, 5, 6, 7];
  const triplet = transduceSync(group<number>(3));
  assert.deepStrictEqual(
    [...triplet(original)],
    [[1, 2, 3], [4, 5, 6], [7]],
    "trailing partial group [7] must be flushed on completion",
  );
});

test("transducer:accumulate", () => {
  const original = [1, 2, 3, 4];
  const sum = transduceSync(
    accumulate((a: number, b: number) => a + b, 0),
    drop<number>(3),
  );
  assert.deepStrictEqual([...sum(original)], [10], "should accumulate changes in successive items");
});

// Regression: accumulate() mutated its outer `initial` parameter directly,
// so that state carried over into the *next* transduce run reusing the
// same accumulate(...) instance -- unlike every other stateful transducer
// in this file (take/drop/group/etc), whose state resets per run.
test("transducer:accumulate resets its running total on each separate transduce run (regression)", () => {
  const runningSum = accumulate((a: number, b: number) => a + b, 0);
  const pipeline = transduceSync(runningSum);

  assert.deepStrictEqual([...pipeline([1, 2, 3])], [1, 3, 6], "first run should accumulate from a clean slate");
  assert.deepStrictEqual(
    [...pipeline([1, 2, 3])],
    [1, 3, 6],
    "second run reusing the same accumulate(...) instance must also start fresh, not continue from 6",
  );

  // Also true across two independently-built pipelines sharing one instance.
  const secondPipeline = transduceSync(runningSum);
  assert.deepStrictEqual(
    [...secondPipeline([10, 20])],
    [10, 30],
    "a freshly-built pipeline reusing the same accumulate(...) instance must also start fresh",
  );
});

// Regression: the old numeric `reject(limit)` (skip first N items) was
// renamed to `drop(limit)` to free up `reject` for a predicate-based
// complement to `filter`, matching Python's itertools.filterfalse.
test("transducer:drop drops the first N items (renamed from reject)", () => {
  const original = [1, 2, 3, 4, 5];
  const dropThree = transduceSync(drop<number>(3));
  assert.deepStrictEqual([...dropThree(original)], [4, 5], "drop(3) should drop the first 3 items");
});

test("transducer:reject (predicate) complements filter", () => {
  const original = [1, 2, 3, 4, 5];
  const rejectEven = transduceSync(reject((x: number) => x % 2 === 0));
  assert.deepStrictEqual([...rejectEven(original)], [1, 3, 5], "reject(even) should keep only odd items");
});

test("transducer:dedupe skips consecutive duplicates only", () => {
  const skipDupes = transduceSync(dedupe<number>());
  assert.deepStrictEqual(
    [...skipDupes([1, 1, 2, 2, 1, 1, 3])],
    [1, 2, 1, 3],
    "consecutive duplicates should collapse, but non-adjacent 1s must both survive",
  );
});

test("transducer:interpose inserts a separator between items", () => {
  const withCommas = transduceSync(interpose<number, string>(","));
  assert.deepStrictEqual(
    [...withCommas([1, 2, 3])],
    [1, ",", 2, ",", 3],
    "separator should appear between items, not before the first or after the last",
  );
  assert.deepStrictEqual([...withCommas([1])], [1], "a single item should have no separator at all");
  assert.deepStrictEqual([...withCommas([])], [], "an empty input should yield nothing");
});

test("transducer:partitionBy groups consecutive runs by key", () => {
  const byIdentity = transduceSync(partitionBy<number>());
  assert.deepStrictEqual(
    [...byIdentity([1, 1, 2, 1, 1])],
    [[1, 1], [2], [1, 1]],
    "should group consecutive runs, and NOT merge the non-adjacent [1,1] runs together",
  );
});

// Regression-style proof: the .complete() protocol must work for any
// stateful transducer, not just the original `group` -- this is the
// second stateful transducer to rely on it, and its trailing run must
// also be flushed once the source iterator completes.
test("transducer:partitionBy flushes a trailing partial run (regression)", () => {
  const byIdentity = transduceSync(partitionBy<number>());
  assert.deepStrictEqual(
    [...byIdentity([1, 1, 2, 2, 2])],
    [
      [1, 1],
      [2, 2, 2],
    ],
    "the trailing [2,2,2] run must be flushed on completion, not dropped",
  );
});

test("transducer:partitionBy composes with a stacked stateful transducer", () => {
  // Proves .complete() cascades correctly through two stacked stateful
  // transducers (partitionBy's completion must trigger group's too).
  const stacked = transduceSync(partitionBy<number>(), group<number[]>(1));
  assert.deepStrictEqual(
    [...stacked([1, 1, 2, 1, 1])],
    [[[1, 1]], [[2]], [[1, 1]]],
    "completion must cascade through both stateful stages",
  );
});

// Regression: through v2.0.0 the transduce engine threaded its accumulator
// as an iterable that every step wrapped in a fresh generator
// (`conjoin(init, item)`), chaining one retained generator object per item
// processed (~176 bytes/item measured) -- unbounded heap growth on long
// streams, OOM-ing a 48MB heap after a few million items. The v2.1
// pending-emission-buffer protocol must keep memory flat: heap growth
// between the 100k-th and 1,000,000-th item must stay under a few MB
// (the old code grew ~158MB over the same span).
test("transduce memory stays bounded over 1M items (leak regression)", () => {
  const gc = globalThis.gc; // available via --expose-gc in the npm test script
  const pipeline = transduceSync(map((x: number) => x + 1));
  let count = 0;
  let heapAt100k = 0;
  let heapAt1M = 0;
  for (const value of pipeline(countSync(1, 1_000_000))) {
    count += value - value + 1;
    if (count === 100_000) {
      gc?.();
      heapAt100k = process.memoryUsage().heapUsed;
    } else if (count === 1_000_000) {
      // Measured *inside* the loop, while the pipeline generator is still
      // live -- the old chain was only reachable until the loop ended, so
      // sampling after the loop would mask the leak entirely.
      gc?.();
      heapAt1M = process.memoryUsage().heapUsed;
    }
  }
  assert.strictEqual(count, 1_000_000, "all 1M items must flow through the pipeline");
  const growth = heapAt1M - heapAt100k;
  const limit = (gc ? 8 : 64) * 2 ** 20; // a few MB with gc; generous headroom without
  assert.ok(
    growth < limit,
    `heap growth 100k->1M must stay bounded (grew ${(growth / 2 ** 20).toFixed(2)}MB, limit ${limit / 2 ** 20}MB)`,
  );
});

test("transducer:tap calls fn for side effects without altering values", () => {
  const seen: number[] = [];
  const withTap = transduceSync(tap((x: number) => seen.push(x)));
  assert.deepStrictEqual([...withTap([1, 2, 3])], [1, 2, 3], "output values must be unchanged");
  assert.deepStrictEqual(seen, [1, 2, 3], "fn should have been called once per item, in order");
});

/** Push every item through `transducePush`, then complete: the push-driven equivalent of transduceSync. */
const pushAll = <A, B>(pipe: { step(v: A): B[]; complete(): B[] }, items: A[]): B[] => {
  const out: B[] = [];
  for (const item of items) out.push(...pipe.step(item));
  out.push(...pipe.complete());
  return out;
};

test("transducePush matches transduceSync (composition order, .complete flush, HALT)", () => {
  const items = [1, 1, 2, 3, 3, 3, 4, 5, 6, 7, 8, 9, 10];
  const pipelines: Array<() => Array<(next: any) => any>> = [
    () => [map((x: number) => x * 2), filter((x: number) => x % 3 !== 0)],
    () => [filter((x: number) => x % 2 === 1), map((x: number) => x + 1)],
    () => [group(4)],
    () => [map((x: number) => x % 3), partitionBy()],
    () => [dedupe(), interpose(0)],
    () => [accumulate((a: number, b: number) => a + b, 0), take(5)],
    () => [take(4), group(3)],
    () => [group(2), take(3)],
  ];
  for (const make of pipelines) {
    const expected = [...(transduceSync as any)(...make())(items)];
    const actual = pushAll((transducePush as any)(...make()), items);
    assert.deepStrictEqual(actual, expected, `pipeline ${make.toString()}`);
  }
});

test("transducePush step returns what each value emitted", () => {
  const pipe = transducePush(
    group<number>(2),
    map((pair: number[]) => pair.map((x) => x * 10)),
  );
  assert.deepStrictEqual(pipe.step(1), []);
  assert.deepStrictEqual(pipe.step(2), [[10, 20]]);
  assert.deepStrictEqual(pipe.step(3), []);
  assert.deepStrictEqual(pipe.complete(), [[30]], "complete flushes the trailing partial group");
  assert.deepStrictEqual(pipe.complete(), [], "complete is idempotent");
  assert.deepStrictEqual(pipe.step(4), [], "step after complete is ignored");
});

test("transducePush HALT sets halted and ignores later values", () => {
  const pipe = transducePush(
    map((x: number) => x + 1),
    take<number>(2),
  );
  assert.deepStrictEqual(pipe.step(1), [2]);
  assert.deepStrictEqual(pipe.step(2), [3]);
  assert.strictEqual(pipe.halted, false, "take(2) halts on the 3rd item, as in transduceSync");
  assert.deepStrictEqual(pipe.step(3), [], "the halting step's emissions are discarded");
  assert.strictEqual(pipe.halted, true);
  assert.deepStrictEqual(pipe.step(4), [], "values after HALT are ignored");
  assert.deepStrictEqual(pipe.complete(), []);
});

// Regression (#85): the stateless built-ins returned a step with no
// `.complete`, so the end-of-source flush never reached a stateful
// transducer after them -- `transduceSync(map(f), group(2))([1, 2, 3])`
// lost the trailing [3]. The README's step protocol requires `.complete` to
// cascade; each built-in now forwards it.
const statelessBuiltins: Record<string, () => (next: any) => any> = {
  map: () => map((x: number) => x * 10),
  filter: () => filter((x: number) => x % 2 === 1),
  take: () => take(5),
  drop: () => drop(2),
  reject: () => reject((x: number) => x > 8),
  tap: () => tap(() => {}),
  dedupe: () => dedupe(),
  interpose: () => interpose(0),
  accumulate: () => accumulate((a: number, b: number) => a + b, 0),
};
const statefulBuiltins: Record<string, () => (next: any) => any> = {
  "group(2)": () => group(2),
  partitionBy: () => partitionBy((x: number) => x % 2),
};
// Chosen so every stateless built-in above emits an odd number of items,
// leaving group(2) a trailing partial group to flush (asserted below).
const flushItems = [1, 1, 2, 3, 3, 4, 5, 7, 8, 9, 10];

/** What `[stateless, stateful]` must produce: each applied on its own, in turn. */
const sequential = (stateless: () => any, stateful: () => any, items: number[]) => [
  ...(transduceSync as any)(stateful())([...(transduceSync as any)(stateless())(items)]),
];

for (const [statelessName, stateless] of Object.entries(statelessBuiltins)) {
  for (const [statefulName, stateful] of Object.entries(statefulBuiltins)) {
    test(`${statelessName} forwards .complete to a following ${statefulName} (regression #85)`, async () => {
      const expected = sequential(stateless, stateful, flushItems);
      assert.ok(expected.length > 0, "the fixture produces output");
      if (statefulName === "group(2)") {
        assert.strictEqual(expected.at(-1).length, 1, "the fixture leaves a trailing partial group");
      }

      const viaSync = [...(transduceSync as any)(stateless(), stateful())(flushItems)];
      assert.deepStrictEqual(viaSync, expected, "transduceSync");

      const viaAsync: unknown[] = [];
      for await (const item of (transduceAsync as any)(stateless(), stateful())(asyncFromArray(flushItems))) {
        viaAsync.push(item);
      }
      assert.deepStrictEqual(viaAsync, expected, "transduceAsync");

      const pipe = (transducePush as any)(stateless(), stateful());
      const viaPush: unknown[] = [];
      for (const item of flushItems) viaPush.push(...pipe.step(item));
      viaPush.push(...pipe.complete());
      assert.deepStrictEqual(viaPush, expected, "transducePush");
    });
  }
}

test("the trailing group is flushed after a stateless transducer (regression #85)", () => {
  assert.deepStrictEqual(
    [
      ...transduceSync(
        map((x: number) => x),
        group<number>(2),
      )([1, 2, 3]),
    ],
    [[1, 2], [3]],
  );
  // Several stateless steps in a row, and a HALT from take on an infinite source.
  assert.deepStrictEqual(
    [
      ...transduceSync(
        map((x: number) => x + 1),
        filter((x: number) => x % 2 === 0),
        take<number>(3),
        group<number>(2),
      )(countSync(1, Infinity)),
    ],
    [[2, 4], [6]],
  );
});

// Held items: what a stateful transducer keeps between steps is visible
// (`held()`) and can be let go of (`drop(predicate)`) without making an
// operator emit early or reshaping what it sends beyond the dropped items.
test("held/drop: group's half-full batch", () => {
  const pipe = transducePush(group<number>(3));
  pipe.step(1);
  pipe.step(2);
  assert.deepStrictEqual(pipe.held(), [1, 2]);
  assert.strictEqual(
    pipe.drop((x) => x === 1),
    1,
  );
  assert.deepStrictEqual(pipe.held(), [2]);
  assert.deepStrictEqual(pipe.step(3), [], "a batch is still 3 long: dropping doesn't make it emit early");
  assert.deepStrictEqual(pipe.step(4), [[2, 3, 4]], "the batch is the held items, less the dropped one");
  assert.deepStrictEqual(pipe.held(), []);
});

test("held/drop: dropping everything held leaves nothing for complete to flush", () => {
  const pipe = transducePush(group<number>(3));
  pipe.step(1);
  assert.strictEqual(
    pipe.drop(() => true),
    1,
  );
  assert.deepStrictEqual(pipe.complete(), []);
});

test("held/drop: partitionBy's open run", () => {
  const pipe = transducePush(partitionBy<number>((x) => x % 2));
  pipe.step(1);
  pipe.step(3);
  assert.deepStrictEqual(pipe.held(), [1, 3]);
  assert.strictEqual(
    pipe.drop((x) => x === 1),
    1,
  );
  assert.deepStrictEqual(pipe.step(5), [], "the run is still open");
  assert.deepStrictEqual(pipe.step(2), [[3, 5]]);
});

test("held/drop: a partitionBy run dropped to nothing never emits an empty run", () => {
  const pipe = transducePush(partitionBy<number>((x) => x % 2));
  pipe.step(1);
  pipe.drop(() => true);
  assert.deepStrictEqual(pipe.held(), []);
  assert.deepStrictEqual(pipe.step(2), []);
  assert.deepStrictEqual(pipe.complete(), [[2]]);
});

test("held/drop: partitionBy re-derives its key from the last surviving item", () => {
  type Item = { id: number; tag: string };
  const dropped = { id: 1, tag: "t" };
  const kept = { id: 2, tag: "t" };
  const keys: Array<{ tag: string; from: Item }> = [];
  // A derived-object key, tied to the item it came from. Runs compare by tag.
  const byTag = new Map<string, { tag: string; from: Item }>();
  const pipe = transducePush(
    partitionBy<Item>((i) => {
      let k = byTag.get(i.tag);
      if (!k) byTag.set(i.tag, (k = { tag: i.tag, from: i }));
      keys.push(k);
      return k;
    }),
  );
  pipe.step(kept);
  pipe.step(dropped);
  byTag.clear(); // a re-derived key is a fresh object, as for any derived key
  assert.strictEqual(
    pipe.drop((i) => i === dropped),
    1,
  );
  assert.strictEqual(keys.at(-1)?.from, kept, "the current key was re-derived from the surviving item");
  assert.deepStrictEqual(pipe.held(), [kept]);
  // The next item derives the same fresh key (interned again), so it joins the run.
  const next = { id: 3, tag: "t" };
  assert.deepStrictEqual(pipe.step(next), [], "the run is still open");
  assert.deepStrictEqual(pipe.complete(), [[kept, next]]);
});

test("held/drop: partitionBy re-derive leaves an emptied run closed, not emitted", () => {
  const pipe = transducePush(partitionBy<{ k: number }>((i) => ({ k: i.k })));
  const only = { k: 1 };
  pipe.step(only);
  pipe.drop((i) => i === only);
  assert.deepStrictEqual(pipe.held(), []);
  assert.deepStrictEqual(pipe.complete(), []);
});

test("held/drop: dedupe holds the item its last key came from", () => {
  type Item = { id: number; kind: string };
  const first = { id: 1, kind: "x" };
  const pipe = transducePush(dedupe<Item>((i) => i.kind));
  pipe.step(first);
  assert.ok(pipe.held().includes(first), "the item is held, though its key is a derived string");
  assert.strictEqual(
    pipe.drop((h) => h === first),
    1,
  );
  assert.deepStrictEqual(pipe.held(), []);
  assert.strictEqual(pipe.step({ id: 2, kind: "x" }).length, 1, "the forgotten key lets an equal-key item through");
});

test("held/drop: dedupe with a derived-object key forgets it when the item matches", () => {
  const item = { id: 1 };
  const pipe = transducePush(dedupe<{ id: number }>((i) => ({ id: i.id })));
  pipe.step(item);
  assert.strictEqual(
    pipe.drop((h) => h === item),
    1,
  );
  assert.deepStrictEqual(pipe.held(), []);
  assert.deepStrictEqual(pipe.step({ id: 1 }), [{ id: 1 }]);
});

test("held/drop: dedupe still forgets by key; item and key both matching counts one", () => {
  const item = { id: 1 };
  const byKey = transducePush(dedupe<{ id: number }>((i) => i.id));
  byKey.step(item);
  assert.strictEqual(
    byKey.drop((h) => h === 1),
    1,
  );
  assert.deepStrictEqual(byKey.held(), []);
  const both = transducePush(dedupe<{ id: number }>((i) => i.id));
  both.step(item);
  assert.strictEqual(
    both.drop((h) => h === 1 || h === item),
    1,
  );
});

test("held/drop: accumulate's running value", () => {
  const pipe = transducePush(accumulate<number>((a, b) => a + b, 0));
  assert.deepStrictEqual(pipe.held(), [], "nothing before the first step");
  pipe.step(1);
  pipe.step(2);
  assert.deepStrictEqual(pipe.held(), [3]);
  assert.strictEqual(
    pipe.drop((v) => v === 99),
    0,
  );
  assert.deepStrictEqual(pipe.held(), [3]);
  assert.strictEqual(
    pipe.drop((v) => v === 3),
    1,
  );
  assert.deepStrictEqual(pipe.held(), []);
  assert.deepStrictEqual(pipe.step(5), [5], "the fold starts again from its initial value");
});

test("held/drop: dedupe's last key", () => {
  const pipe = transducePush(dedupe<number>());
  pipe.step(1);
  assert.deepStrictEqual(pipe.held(), [1]);
  assert.strictEqual(
    pipe.drop((k) => k === 2),
    0,
  );
  assert.deepStrictEqual(pipe.step(1), [], "an unmatched predicate changes nothing");
  assert.strictEqual(
    pipe.drop((k) => k === 1),
    1,
  );
  assert.deepStrictEqual(pipe.held(), []);
  assert.deepStrictEqual(pipe.step(1), [1], "a forgotten key lets an equal item through");
});

test("held/drop: reaches through stateless transducers and lists upstream first", () => {
  const pipe = transducePush(
    partitionBy<number>((x) => x % 2),
    map((run: number[]) => run.length),
    group<number>(2),
    map((x: number[]) => x),
  );
  pipe.step(1);
  pipe.step(3);
  pipe.step(5);
  pipe.step(4); // closes the run [1, 3, 5] -> 3, which group(2) now holds; partitionBy holds 4
  assert.deepStrictEqual(pipe.held(), [4, 3]);
  assert.strictEqual(
    pipe.drop((x) => x === 3),
    1,
  );
  assert.deepStrictEqual(pipe.held(), [4]);
});

test("held/drop: a pipeline with nothing stateful holds nothing", () => {
  const pipe = transducePush(map((x: number) => x + 1));
  pipe.step(1);
  assert.deepStrictEqual(pipe.held(), []);
  assert.strictEqual(
    pipe.drop(() => true),
    0,
  );
});

test("held/drop: the transduceSync equivalence holds when a drop happens between steps", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  const pipe = transducePush(group<number>(3));
  const out: unknown[] = [];
  for (const item of items) {
    out.push(...pipe.step(item));
    if (item === 4) pipe.drop((x) => x === 4);
  }
  out.push(...pipe.complete());
  assert.deepStrictEqual(out, [
    [1, 2, 3],
    [5, 6, 7],
  ]);
});
