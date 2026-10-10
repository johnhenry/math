/**
 * Time-based operators: debounceAsync and throttleAsync.
 *
 * Both drain their source eagerly (timing depends on when values arrive,
 * not on when the consumer reads) and queue what they emit until the
 * consumer reads it. Both take an injectable `clock`, so they can be driven
 * by a fake clock in tests or by a host's own scheduler, and an optional
 * `signal`. On abort, on a source error, and on consumer exit they clear
 * their timer and close (`return()`) the source.
 */

import { type SignalOptions, throwIfAborted } from "./abort.ts";
import { type AnyIterable, closeAll, createFailure, entryOf, listenAbort, pull, Wakeup } from "./internal.ts";

/**
 * The timer functions the time operators use. Defaults to the host's
 * global `setTimeout`/`clearTimeout` and `performance.now()` (or
 * `Date.now()` where `performance` is missing). `now()` must use the same
 * time base as the delays given to `setTimeout`.
 */
export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export interface TimeOptions extends SignalOptions {
  clock?: Clock;
}

export interface ThrottleOptions extends TimeOptions {
  /** Emit the value that opens a window immediately. Default `true`. */
  leading?: boolean;
  /** At the end of a window, emit the newest value that arrived during it. Default `true`. */
  trailing?: boolean;
}

/** The host's timers. */
export const systemClock: Clock = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as Parameters<typeof globalThis.clearTimeout>[0]),
  now: () => (typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now()),
};

const checkMs = (name: string, ms: number): void => {
  if (!(typeof ms === "number" && ms >= 0 && Number.isFinite(ms))) {
    throw new RangeError(`${name}: ms must be a finite number >= 0`);
  }
};

/**
 * Run the shared machinery of a time operator: pump the source, hand each
 * value and the end to `hooks`, and yield whatever they emit, in order.
 */
const timed = async function* <T>(
  iterable: AnyIterable<T>,
  { signal }: SignalOptions,
  setup: (emit: (value: T) => void) => { onValue(value: T): void; onEnd(): void; dispose(): void },
): AsyncGenerator<T> {
  throwIfAborted(signal);
  const entry = entryOf(iterable);
  const aborted = createFailure();
  const wakeup = new Wakeup();
  const queue: T[] = [];
  let ended = false;
  let stopped = false;
  let sourceError: { error: unknown } | undefined;
  const hooks = setup((value) => {
    queue.push(value);
    wakeup.wake();
  });
  const unlisten = listenAbort(signal, (reason) => {
    aborted.fail(reason);
    wakeup.wake();
  });
  const pump = async () => {
    try {
      while (!stopped) {
        const result = await pull(entry);
        if (stopped) return;
        if (result.done) {
          hooks.onEnd();
          ended = true;
          wakeup.wake();
          return;
        }
        hooks.onValue(result.value);
      }
    } catch (error) {
      hooks.dispose(); // drop a waiting value; stop the timer
      sourceError = { error };
      wakeup.wake();
    }
  };
  try {
    void pump();
    while (true) {
      // Abort wins at once; a source error comes after the values that
      // were already emitted.
      if (aborted.failed) throw aborted.error;
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }
      if (sourceError) throw sourceError.error;
      if (ended) return;
      await Promise.race([wakeup.wait(), aborted.promise]);
    }
  } finally {
    stopped = true;
    hooks.dispose();
    unlisten();
    await closeAll([entry]);
  }
};

/**
 * Emit a value only after `ms` have passed with no newer value: a burst of
 * values becomes its last value, emitted `ms` after the burst ends. When
 * the source ends, a value still waiting is emitted at once.
 *
 * Emitted values queue until the consumer reads them. A source error is
 * rethrown after the queued values; a value still waiting for its quiet
 * period is dropped.
 * @kind function
 * @name debounceAsync
 * @example
 * ```javascript
 * for await (const query of debounceAsync(250, keystrokes)) search(query);
 * ```
 */
export const debounceAsync = <T>(
  ms: number,
  iterable: AnyIterable<T>,
  { clock = systemClock, signal }: TimeOptions = {},
): AsyncGenerator<T> => {
  checkMs("debounceAsync", ms);
  return timed<T>(iterable, { signal }, (emit) => {
    let timer: unknown;
    let armed = false;
    let waiting = false;
    let value: T | undefined;
    let lastAt = 0;
    const fire = () => {
      armed = false;
      if (!waiting) return;
      // Re-arm rather than reset the timer on every value: one timer per
      // quiet period instead of one per value.
      const elapsed = clock.now() - lastAt;
      if (elapsed < ms) {
        armed = true;
        timer = clock.setTimeout(fire, ms - elapsed);
        return;
      }
      const out = value as T;
      waiting = false;
      value = undefined;
      emit(out);
    };
    return {
      onValue(next) {
        value = next;
        waiting = true;
        lastAt = clock.now();
        if (!armed) {
          armed = true;
          timer = clock.setTimeout(fire, ms);
        }
      },
      onEnd() {
        if (armed) clock.clearTimeout(timer);
        armed = false;
        if (waiting) {
          waiting = false;
          emit(value as T);
        }
      },
      dispose() {
        if (armed) clock.clearTimeout(timer);
        armed = false;
      },
    };
  });
};

/**
 * Emit at most one value per `ms` window. A value arriving while no window
 * is open opens one, and is emitted at once if `leading` (default `true`).
 * With `trailing` (default `true`), the newest value that arrived during a
 * window is emitted when the window closes, which opens the next window.
 * When the source ends, a trailing value still waiting is emitted at once.
 *
 * `leading` and `trailing` cannot both be false. Emitted values queue
 * until the consumer reads them. A source error is rethrown after the
 * queued values; a trailing value still waiting is dropped.
 * @kind function
 * @name throttleAsync
 * @example
 * ```javascript
 * for await (const position of throttleAsync(16, pointerMoves)) draw(position);
 * ```
 */
export const throttleAsync = <T>(
  ms: number,
  iterable: AnyIterable<T>,
  { leading = true, trailing = true, clock = systemClock, signal }: ThrottleOptions = {},
): AsyncGenerator<T> => {
  checkMs("throttleAsync", ms);
  if (!leading && !trailing) {
    throw new RangeError("throttleAsync: leading and trailing cannot both be false");
  }
  return timed<T>(iterable, { signal }, (emit) => {
    let timer: unknown;
    let open = false;
    let waiting = false;
    let value: T | undefined;
    const close = () => {
      open = false;
      if (trailing && waiting) {
        const out = value as T;
        waiting = false;
        value = undefined;
        emit(out);
        openWindow();
      }
    };
    const openWindow = () => {
      open = true;
      timer = clock.setTimeout(close, ms);
    };
    return {
      onValue(next) {
        if (open) {
          if (trailing) {
            value = next;
            waiting = true;
          }
          return;
        }
        if (leading) {
          emit(next);
        } else {
          value = next;
          waiting = true;
        }
        openWindow();
      },
      onEnd() {
        if (open) clock.clearTimeout(timer);
        open = false;
        if (trailing && waiting) {
          waiting = false;
          emit(value as T);
        }
      },
      dispose() {
        if (open) clock.clearTimeout(timer);
        open = false;
      },
    };
  });
};
