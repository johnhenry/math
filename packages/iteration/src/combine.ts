/**
 * Combinators for live values and events: merge several async sources,
 * combine their latest values, sample one by another, and conflate a fast
 * source down to its newest value.
 *
 * Every combinator here:
 * - accepts async or sync iterables as inputs;
 * - takes an optional `{ signal }`; on abort it rejects with the signal's
 *   reason (an "AbortError" DOMException by default);
 * - closes (`return()`) every input that has not ended when it finishes,
 *   when an input errors, when the signal aborts, and when the consumer
 *   exits early (`break`, or calling `return()` on it). An input with a
 *   `next()` still pending is closed without waiting for that `next()`.
 *
 * The "latest value" combinators (combineLatestAsync, withLatestFromAsync,
 * latestAsync, sampleAsync) drain some inputs eagerly: they keep pulling
 * from them whether or not the consumer is reading, and keep only the
 * newest value. Like every generator in this library they start when the
 * consumer first calls `next()`.
 */

import { type SignalOptions, throwIfAborted } from "./abort.ts";
import {
  type AnyIterable,
  closeAll,
  createFailure,
  type Entry,
  entryOf,
  type Failure,
  listenAbort,
  pull,
  Wakeup,
} from "./internal.ts";

/** The value type of an async or sync iterable. */
export type IteratedValue<I> = I extends AsyncIterable<infer V> ? V : I extends Iterable<infer V> ? V : never;

/** Inputs for combineLatestAsync / withLatestFromAsync: an array or a record of iterables. */
export type IterableShape = readonly AnyIterable<unknown>[] | { readonly [key: string]: AnyIterable<unknown> };

/** A snapshot with the same shape as its inputs: each iterable replaced by its latest value. */
export type LatestOf<I> = { -readonly [K in keyof I]: IteratedValue<I[K]> };

const isOptions = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !(Symbol.iterator in value) &&
  !(Symbol.asyncIterator in (value as object));

/**
 * Pull from an entry eagerly until it ends, errors, or `isStopped()`:
 * `onValue` gets each value, `onEnd` runs once it ends, and an error fails
 * the whole combinator.
 */
const pump = async <T>(
  entry: Entry<T>,
  isStopped: () => boolean,
  onValue: (value: T) => void,
  onEnd: () => void,
  failure: Failure,
): Promise<void> => {
  try {
    while (!isStopped()) {
      const result = await pull(entry);
      if (isStopped()) return;
      if (result.done) {
        onEnd();
        return;
      }
      onValue(result.value);
    }
  } catch (error) {
    failure.fail(error);
  }
};

/** Split an array-or-record of inputs into keys and iterables. */
const shapeOf = (inputs: IterableShape): { isArray: boolean; keys: string[]; iterables: AnyIterable<unknown>[] } => {
  if (Array.isArray(inputs)) {
    return { isArray: true, keys: inputs.map((_, i) => String(i)), iterables: [...inputs] };
  }
  const keys = Object.keys(inputs);
  return {
    isArray: false,
    keys,
    iterables: keys.map((key) => (inputs as Record<string, AnyIterable<unknown>>)[key] as AnyIterable<unknown>),
  };
};

const snapshotOf = (isArray: boolean, keys: string[], values: unknown[]): any => {
  if (isArray) return values.slice();
  const out: Record<string, unknown> = {};
  keys.forEach((key, i) => {
    out[key] = values[i];
  });
  return out;
};

/**
 * Merge several (async or sync) iterables into one, yielding each value as
 * it arrives from any input. Ends when every input has ended.
 *
 * - Lazy: each input has at most one `next()` outstanding, and the next
 *   value is requested from an input only after its previous value has
 *   been consumed. Inputs that are ready at the same time are served in
 *   rotation, so a fast or synchronous input cannot starve the others.
 * - An error from any input closes the others and is rethrown.
 * - Consumer exit or abort closes every input.
 *
 * Pass `{ signal }` as the last argument.
 * @kind function
 * @name mergeAsync
 * @example
 * ```javascript
 * for await (const event of mergeAsync(clicks, keys, { signal })) { ... }
 * ```
 */
export function mergeAsync<T>(...inputs: Array<AnyIterable<T>>): AsyncGenerator<T>;
export function mergeAsync<T>(...args: [...inputs: Array<AnyIterable<T>>, options: SignalOptions]): AsyncGenerator<T>;
export function mergeAsync<T>(...args: Array<AnyIterable<T> | SignalOptions>): AsyncGenerator<T> {
  const last = args[args.length - 1];
  const options = isOptions(last) ? (args.pop() as SignalOptions) : {};
  return mergeImpl(args as Array<AnyIterable<T>>, options);
}

const mergeImpl = async function* <T>(inputs: Array<AnyIterable<T>>, { signal }: SignalOptions): AsyncGenerator<T> {
  throwIfAborted(signal);
  const entries = inputs.map((input) => entryOf(input));
  const failure = createFailure();
  const unlisten = listenAbort(signal, (reason) => failure.fail(reason));
  // The outstanding next() of each input, tagged with its index.
  const pending = new Map<number, Promise<[number, IteratorResult<T>]>>();
  const request = (i: number) => {
    const tagged = pull(entries[i] as Entry<T>).then((result): [number, IteratorResult<T>] => [i, result]);
    tagged.catch(() => {}); // rejections are observed through the race below
    pending.set(i, tagged);
  };
  try {
    entries.forEach((_, i) => {
      request(i);
    });
    let lastWinner = -1;
    while (pending.size > 0) {
      if (failure.failed) throw failure.error;
      // Rotate the race so the input after the last winner goes first:
      // Promise.race favours the earliest already-settled promise.
      const rank = (k: number) => (k - lastWinner - 1 + entries.length) % entries.length;
      const order = [...pending.keys()].sort((a, b) => rank(a) - rank(b));
      const [i, result] = await Promise.race([...order.map((k) => pending.get(k)!), failure.promise]);
      pending.delete(i);
      lastWinner = i;
      if (result.done) continue;
      yield result.value;
      request(i);
    }
    if (failure.failed) throw failure.error;
  } finally {
    unlisten();
    await closeAll(entries);
  }
};

export interface CombineLatestOptions<I> extends SignalOptions {
  /**
   * Starting values for some or all inputs (same shape as the inputs), so a
   * snapshot can be emitted before those inputs have yielded. They are not
   * emitted on their own: the first snapshot still waits for an input to
   * yield.
   */
  initial?: Partial<LatestOf<I>>;
  /**
   * `"all"` (default): end once every input has ended. `"any"`: end as
   * soon as any input ends. Either way, an input that ends without ever
   * having a value (and no `initial` for it) ends the output at once,
   * since no complete snapshot can ever be made.
   */
  endOn?: "all" | "any";
}

/**
 * Combine the latest values of several inputs. `inputs` is an array or a
 * record of (async or sync) iterables; each output is a snapshot of the
 * same shape holding every input's latest value. A snapshot is emitted
 * whenever an input yields, once every input has a value (from the input
 * itself or from `initial`).
 *
 * Latest-wins: inputs are drained eagerly, and while the consumer is busy
 * the snapshots that would have been emitted coalesce into one, holding
 * the newest values. Every snapshot is a fresh object.
 *
 * An input error closes the others and is rethrown (a pending snapshot is
 * dropped). Consumer exit or abort closes every input.
 * @kind function
 * @name combineLatestAsync
 * @example
 * ```javascript
 * for await (const { x, y } of combineLatestAsync({ x: xs, y: ys })) { ... }
 * ```
 */
export const combineLatestAsync = async function* <const I extends IterableShape>(
  inputs: I,
  { signal, initial, endOn = "all" }: CombineLatestOptions<I> = {},
): AsyncGenerator<LatestOf<I>> {
  throwIfAborted(signal);
  const { isArray, keys, iterables } = shapeOf(inputs);
  const n = keys.length;
  const values: unknown[] = new Array(n);
  const has: boolean[] = new Array(n).fill(false);
  if (initial) {
    keys.forEach((key, i) => {
      if (Object.hasOwn(initial, key)) {
        values[i] = (initial as Record<string, unknown>)[key];
        has[i] = true;
      }
    });
  }
  const entries = iterables.map((iterable) => entryOf(iterable));
  const failure = createFailure();
  const wakeup = new Wakeup();
  const unlisten = listenAbort(signal, (reason) => {
    failure.fail(reason);
    wakeup.wake();
  });
  let stopped = false;
  let dirty = false;
  let ended = n === 0;
  try {
    entries.forEach((entry, i) => {
      void pump(
        entry,
        () => stopped,
        (value) => {
          values[i] = value;
          has[i] = true;
          dirty = true;
          wakeup.wake();
        },
        () => {
          if (endOn === "any" || !has[i] || entries.every((e) => e.done)) ended = true;
          wakeup.wake();
        },
        failure,
      );
    });
    while (true) {
      if (failure.failed) throw failure.error;
      if (dirty && has.every(Boolean)) {
        dirty = false;
        yield snapshotOf(isArray, keys, values);
        continue;
      }
      if (ended) return;
      await Promise.race([wakeup.wait(), failure.promise]);
    }
  } finally {
    stopped = true;
    unlisten();
    await closeAll(entries);
  }
};

/**
 * Pair each value of `source` with the latest value of each of `others`
 * (an array or a record of iterables): yields `[value, snapshot]`, where
 * `snapshot` has the same shape as `others`. This is the "an event samples
 * values" pattern.
 *
 * `source` is pulled lazily, as the consumer reads; `others` are drained
 * eagerly. Source values that arrive before every one of `others` has a
 * value are dropped. An input in `others` that ends keeps its last value.
 * Ends when `source` ends. An error from any input closes the rest and is
 * rethrown; consumer exit or abort closes every input.
 * @kind function
 * @name withLatestFromAsync
 * @example
 * ```javascript
 * for await (const [click, { price }] of withLatestFromAsync(clicks, { price: prices })) { ... }
 * ```
 */
export const withLatestFromAsync = async function* <T, const I extends IterableShape>(
  source: AnyIterable<T>,
  others: I,
  { signal }: SignalOptions = {},
): AsyncGenerator<[T, LatestOf<I>]> {
  throwIfAborted(signal);
  const { isArray, keys, iterables } = shapeOf(others);
  const values: unknown[] = new Array(keys.length);
  const has: boolean[] = new Array(keys.length).fill(false);
  const src = entryOf(source);
  const entries = iterables.map((iterable) => entryOf(iterable));
  const failure = createFailure();
  const unlisten = listenAbort(signal, (reason) => failure.fail(reason));
  let stopped = false;
  try {
    entries.forEach((entry, i) => {
      void pump(
        entry,
        () => stopped,
        (value) => {
          values[i] = value;
          has[i] = true;
        },
        () => {},
        failure,
      );
    });
    while (true) {
      if (failure.failed) throw failure.error;
      const result = await Promise.race([pull(src), failure.promise]);
      if (result.done) return;
      if (failure.failed) throw failure.error;
      if (has.every(Boolean)) yield [result.value, snapshotOf(isArray, keys, values)];
    }
  } finally {
    stopped = true;
    unlisten();
    await closeAll([src, ...entries]);
  }
};

/**
 * Conflate a source down to its newest value. The source is drained
 * eagerly; only the newest value not yet read is kept. Each `next()`
 * returns that value, or waits for the next one. A value is returned at
 * most once.
 *
 * Ends once the source has ended and its last value has been read. A source
 * error is rethrown on the next read (an unread value is dropped). Closing
 * the result, or aborting, closes the source.
 * @kind function
 * @name latestAsync
 * @example
 * ```javascript
 * for await (const position of latestAsync(pointerMoves)) {
 *   await render(position); // never falls behind: stale positions are skipped
 * }
 * ```
 */
export const latestAsync = async function* <T>(
  iterable: AnyIterable<T>,
  { signal }: SignalOptions = {},
): AsyncGenerator<T> {
  throwIfAborted(signal);
  const entry = entryOf(iterable);
  const failure = createFailure();
  const wakeup = new Wakeup();
  const unlisten = listenAbort(signal, (reason) => {
    failure.fail(reason);
    wakeup.wake();
  });
  let stopped = false;
  let fresh = false;
  let ended = false;
  let latest: T | undefined;
  try {
    void pump(
      entry,
      () => stopped,
      (value) => {
        latest = value;
        fresh = true;
        wakeup.wake();
      },
      () => {
        ended = true;
        wakeup.wake();
      },
      failure,
    );
    while (true) {
      if (failure.failed) throw failure.error;
      if (fresh) {
        const value = latest as T;
        fresh = false;
        latest = undefined; // don't retain a value that has been handed out
        yield value;
        continue;
      }
      if (ended) return;
      await Promise.race([wakeup.wait(), failure.promise]);
    }
  } finally {
    stopped = true;
    unlisten();
    await closeAll([entry]);
  }
};

/**
 * On each value from `trigger`, yield the latest value of `source`, if it
 * has produced one yet. The same source value is yielded again on every
 * trigger until the source produces a new one.
 *
 * `source` is drained eagerly; `trigger` is pulled lazily, as the consumer
 * reads. Ends when `trigger` ends (a source that ends keeps its last
 * value). An error from either closes the other and is rethrown; consumer
 * exit or abort closes both.
 * @kind function
 * @name sampleAsync
 * @example
 * ```javascript
 * for await (const position of sampleAsync(pointerMoves, animationFrames)) { ... }
 * ```
 */
export const sampleAsync = async function* <T>(
  source: AnyIterable<T>,
  trigger: AnyIterable<unknown>,
  { signal }: SignalOptions = {},
): AsyncGenerator<T> {
  throwIfAborted(signal);
  const src = entryOf(source);
  const trig = entryOf(trigger);
  const failure = createFailure();
  const unlisten = listenAbort(signal, (reason) => failure.fail(reason));
  let stopped = false;
  let has = false;
  let latest: T | undefined;
  try {
    void pump(
      src,
      () => stopped,
      (value) => {
        latest = value;
        has = true;
      },
      () => {},
      failure,
    );
    while (true) {
      if (failure.failed) throw failure.error;
      const result = await Promise.race([pull(trig), failure.promise]);
      if (result.done) return;
      if (failure.failed) throw failure.error;
      if (has) yield latest as T;
    }
  } finally {
    stopped = true;
    unlisten();
    await closeAll([src, trig]);
  }
};
