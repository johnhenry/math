/**
 * Internal plumbing shared by combine.ts, time.ts and the zip fixes.
 * Not re-exported from index.ts and not in the package `exports` map.
 * @ignore
 */

export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;
export type AnyIterator<T> = AsyncIterator<T> | Iterator<T>;

const noop = (): void => {};

/** Get an iterator from an async or sync iterable (async preferred). */
export const getIterator = <T>(iterable: AnyIterable<T>): AnyIterator<T> =>
  Symbol.asyncIterator in Object(iterable)
    ? (iterable as AsyncIterable<T>)[Symbol.asyncIterator]()
    : (iterable as Iterable<T>)[Symbol.iterator]();

/** The reason an aborted signal carries ("AbortError" DOMException by default). */
export const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("This operation was aborted", "AbortError");

/**
 * Call `onAbort(reason)` once when `signal` aborts (immediately if it
 * already has). Returns a function that removes the listener.
 */
export const listenAbort = (signal: AbortSignal | undefined, onAbort: (reason: unknown) => void): (() => void) => {
  if (!signal) return noop;
  if (signal.aborted) {
    onAbort(abortReason(signal));
    return noop;
  }
  const listener = () => onAbort(abortReason(signal));
  signal.addEventListener("abort", listener, { once: true });
  return () => signal.removeEventListener("abort", listener);
};

/**
 * A one-shot failure latch: `fail(error)` records the first error and
 * rejects `promise` with it. `promise` is pre-handled, so it never surfaces
 * as an unhandled rejection; race it against a pending read to wake up on
 * failure.
 */
export interface Failure {
  failed: boolean;
  error: unknown;
  promise: Promise<never>;
  fail(error: unknown): void;
}

export const createFailure = (): Failure => {
  let reject!: (error: unknown) => void;
  const promise = new Promise<never>((_, r) => {
    reject = r;
  });
  promise.catch(noop);
  const failure: Failure = {
    failed: false,
    error: undefined,
    promise,
    fail(error) {
      if (failure.failed) return;
      failure.failed = true;
      failure.error = error;
      reject(error);
    },
  };
  return failure;
};

/** A reusable wake-up: `wait()` resolves on the next `wake()`. */
export class Wakeup {
  #promise: Promise<void> | undefined;
  #resolve: (() => void) | undefined;
  wait(): Promise<void> {
    if (!this.#promise) {
      this.#promise = new Promise<void>((resolve) => {
        this.#resolve = resolve;
      });
    }
    return this.#promise;
  }
  wake(): void {
    const resolve = this.#resolve;
    this.#promise = undefined;
    this.#resolve = undefined;
    resolve?.();
  }
}

/** An input iterator plus the state needed to close it correctly. */
export interface Entry<T> {
  it: AnyIterator<T>;
  /** Ended, errored, or already closed: never call return() on it. */
  done: boolean;
  /** A next() call is outstanding. */
  inFlight: boolean;
}

export const entryOf = <T>(iterable: AnyIterable<T>): Entry<T> => ({
  it: getIterator(iterable),
  done: false,
  inFlight: false,
});

/**
 * Call `next()` on an entry, tracking `inFlight`/`done`. A synchronous
 * throw from `next()` becomes a rejection. An input whose `next()` rejects
 * or throws is marked done (the iterator protocol does not call return()
 * on an iterator that threw).
 */
export const pull = <T>(entry: Entry<T>): Promise<IteratorResult<T>> => {
  entry.inFlight = true;
  return new Promise<IteratorResult<T>>((resolve) => resolve(entry.it.next())).then(
    (result) => {
      entry.inFlight = false;
      if (result.done) entry.done = true;
      return result;
    },
    (error: unknown) => {
      entry.inFlight = false;
      entry.done = true;
      throw error;
    },
  );
};

/**
 * Close (`return()`) every entry that has not ended. Entries with no
 * outstanding `next()` are awaited, so their cleanup has finished when
 * this resolves. Entries with a `next()` still in flight are closed
 * fire-and-forget: an async generator queues `return()` behind its pending
 * `next()`, so awaiting it would hang on a stalled source (the case that
 * aborting is for). Errors from `return()` are swallowed.
 */
export const closeAll = async (entries: Iterable<Entry<unknown>>): Promise<void> => {
  const waits: Array<Promise<unknown>> = [];
  for (const entry of entries) {
    if (entry.done) continue;
    entry.done = true;
    if (typeof entry.it.return !== "function") continue;
    let result: unknown;
    try {
      result = entry.it.return();
    } catch {
      continue;
    }
    const settled = Promise.resolve(result).then(noop, noop);
    if (!entry.inFlight) waits.push(settled);
  }
  await Promise.all(waits);
};

/** Synchronous counterpart of closeAll, for sync iterators. */
export const closeAllSync = (entries: Iterable<{ it: Iterator<unknown>; done: boolean }>): void => {
  for (const entry of entries) {
    if (entry.done) continue;
    entry.done = true;
    try {
      entry.it.return?.();
    } catch {
      // Cleanup is best-effort; the original completion (or error) wins.
    }
  }
};
