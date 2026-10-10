/**
 * Create a function that tees emitted items to n iterators
 * @kind function
 * @name teeSync / teeAsync
 * @param num number of iterators to create
 * @returns function
 * @example <caption>Split an iterator into 4 </caption>
 * ```javascript
 * import { teeAsync, countAsync } from '@johnhenry/iteration';
 * const streams = teeAsync(4)(countAsync(Infinity))
 * for await (const num of streams[0]){
 *   console.info(num);
 * };
 * ```
 */

const DONE = Symbol("DONE");

/**
 * Optional bound on how far branches may drift apart. Without it (the
 * default), a branch that falls behind buffers without limit.
 */
export interface TeeOptions {
  /** Most items a branch may hold unread (an integer >= 1). */
  limit: number;
  /**
   * What happens when a branch pulls a new item while another branch
   * already holds `limit` unread items:
   * - `"wait"` (teeAsync only): the pulling branch waits until the slowest
   *   branch reads (true backpressure);
   * - `"drop-oldest"`: the item is delivered and that branch's oldest
   *   unread item is discarded, so each branch keeps its newest `limit`;
   * - `"error"`: the pull throws a RangeError instead.
   */
  overflow?: "wait" | "drop-oldest" | "error";
}

/** teeSync cannot block, so it supports every overflow mode except "wait". */
export interface TeeSyncOptions extends TeeOptions {
  overflow?: "drop-oldest" | "error";
}

const validate = (name: string, options: TeeOptions, allowWait: boolean): Required<TeeOptions> => {
  const { limit, overflow = allowWait ? "wait" : "error" } = options;
  if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 1))) {
    throw new RangeError(`${name}: limit must be an integer >= 1`);
  }
  if (overflow === "wait" && !allowWait) {
    throw new TypeError(`${name}: overflow "wait" needs to block, which only teeAsync can do`);
  }
  if (overflow !== "wait" && overflow !== "drop-oldest" && overflow !== "error") {
    throw new TypeError(`${name}: unknown overflow mode ${String(overflow)}`);
  }
  return { limit, overflow };
};

const overflowError = (name: string, limit: number): RangeError =>
  new RangeError(`${name}: a branch already holds ${limit} unread items (overflow: "error")`);

/**
 * Track branches that have finished or been closed, so they stop
 * receiving items (and stop counting toward the limit). Overriding
 * `return` on the instance also catches a branch closed before its first
 * next(), whose generator body (and finally block) never runs.
 */
const trackClose = <G extends Generator<unknown> | AsyncGenerator<unknown>>(gen: G, onClose: () => void): G => {
  const original = gen.return.bind(gen) as (value?: unknown) => unknown;
  (gen as { return: (value?: unknown) => unknown }).return = (value?: unknown) => {
    onClose();
    return original(value);
  };
  return gen;
};

export const teeSync =
  (num = 0, options?: TeeSyncOptions) =>
  <T>(iterable: Iterable<T>): Array<Generator<T>> => {
    if (options) return boundedTeeSync(num, validate("teeSync", options, false), iterable);
    const source = iterable[Symbol.iterator]();
    const buffers: T[][] = new Array(num).fill(null).map(() => []);

    const next = (i: number): T | typeof DONE => {
      const buffer = buffers[i] as T[];
      if (buffer.length !== 0) {
        return buffer.shift() as T;
      }
      const x = source.next();

      if (x.done) {
        return DONE;
      }

      for (let j = 0; j < buffers.length; j++) {
        if (j !== i) (buffers[j] as T[]).push(x.value);
      }
      return x.value;
    };

    return buffers.map(function* (_, i) {
      try {
        for (;;) {
          const x = next(i);

          if (x === DONE) {
            break;
          }

          yield x;
        }
      } finally {
        // Runs on natural completion *and* on early exit (e.g. a consumer
        // `break`s out of a `for...of`, which calls this generator's own
        // .return(), which runs this finally block) -- without it, an
        // early-exiting consumer left the shared source iterator (and
        // whatever resource it holds) never closed.
        source.return?.();
      }
    });
  };

export const teeAsync =
  (num = 0, options?: TeeOptions) =>
  <T>(iterable: AsyncIterable<T>): Array<AsyncGenerator<T>> => {
    if (options) return boundedTeeAsync(num, validate("teeAsync", options, true), iterable);
    const source = iterable[Symbol.asyncIterator]();
    const buffers: T[][] = new Array(num).fill(null).map(() => []);

    // Guards against the check-then-act race between "is my buffer empty"
    // and "pull from source": if two branches both call next() while their
    // buffers are empty in the same logical turn, only the first should
    // actually call source.next(); the rest must ride along on that single
    // in-flight pull and then re-check their (now-populated) buffer, rather
    // than each independently issuing their own source.next() call.
    let inFlight: Promise<T | typeof DONE> | null = null;
    let sourceDone = false;

    const next = async (i: number): Promise<T | typeof DONE> => {
      const buffer = buffers[i] as T[];
      if (buffer.length !== 0) {
        return buffer.shift() as T;
      }

      if (sourceDone) {
        return DONE;
      }

      if (inFlight) {
        // Someone else is already pulling for this turn -- wait for it, then
        // re-evaluate: our buffer will have been fed by the puller (unless
        // the source is now exhausted).
        await inFlight;
        return next(i);
      }

      const pull = (async (): Promise<T | typeof DONE> => {
        const x = await source.next();

        if (x.done) {
          sourceDone = true;
          return DONE;
        }

        for (let j = 0; j < buffers.length; j++) {
          if (j !== i) (buffers[j] as T[]).push(x.value);
        }
        return x.value;
      })();

      inFlight = pull;
      try {
        return await pull;
      } finally {
        inFlight = null;
      }
    };

    return buffers.map(async function* (_, i) {
      try {
        for (;;) {
          const x = await next(i);

          if (x === DONE) {
            break;
          }

          yield x;
        }
      } finally {
        // See teeSync's matching finally: runs on natural completion *and*
        // on early exit, so the shared source iterator is always closed.
        await source.return?.();
      }
    });
  };

/**
 * teeSync with a per-branch limit. A separate code path so the default,
 * unbounded teeSync is untouched.
 * @ignore
 */
const boundedTeeSync = <T>(num: number, { limit, overflow }: Required<TeeOptions>, iterable: Iterable<T>) => {
  const source = iterable[Symbol.iterator]();
  const buffers: T[][] = new Array(num).fill(null).map(() => []);
  const open: boolean[] = new Array(num).fill(true);

  const next = (i: number): T | typeof DONE => {
    const buffer = buffers[i] as T[];
    if (buffer.length !== 0) {
      return buffer.shift() as T;
    }
    if (overflow === "error" && buffers.some((b, j) => j !== i && open[j] && b.length >= limit)) {
      throw overflowError("teeSync", limit);
    }
    const x = source.next();
    if (x.done) {
      return DONE;
    }
    for (let j = 0; j < buffers.length; j++) {
      if (j === i || !open[j]) continue;
      const other = buffers[j] as T[];
      other.push(x.value);
      if (other.length > limit) other.shift(); // drop-oldest
    }
    return x.value;
  };

  return buffers.map((_, i) => {
    const close = () => {
      open[i] = false;
      (buffers[i] as T[]).length = 0;
    };
    return trackClose(
      (function* () {
        try {
          for (;;) {
            const x = next(i);
            if (x === DONE) break;
            yield x;
          }
        } finally {
          close();
          source.return?.();
        }
      })(),
      close,
    );
  });
};

/**
 * teeAsync with a per-branch limit. A separate code path so the default,
 * unbounded teeAsync is untouched.
 * @ignore
 */
const boundedTeeAsync = <T>(num: number, { limit, overflow }: Required<TeeOptions>, iterable: AsyncIterable<T>) => {
  const source = iterable[Symbol.asyncIterator]();
  const buffers: T[][] = new Array(num).fill(null).map(() => []);
  const open: boolean[] = new Array(num).fill(true);
  let inFlight: Promise<unknown> | null = null;
  let sourceDone = false;
  // Branches blocked by overflow "wait", woken whenever a buffer shrinks
  // or a branch closes.
  let waiters: Array<() => void> = [];
  const wake = () => {
    const ready = waiters;
    waiters = [];
    for (const resolve of ready) resolve();
  };
  const full = (i: number) => buffers.some((b, j) => j !== i && open[j] && b.length >= limit);

  const next = async (i: number): Promise<T | typeof DONE> => {
    const buffer = buffers[i] as T[];
    if (buffer.length !== 0) {
      const value = buffer.shift() as T;
      wake();
      return value;
    }
    if (sourceDone) {
      return DONE;
    }
    if (inFlight) {
      await inFlight;
      return next(i);
    }
    if (full(i)) {
      if (overflow === "error") throw overflowError("teeAsync", limit);
      if (overflow === "wait") {
        await new Promise<void>((resolve) => waiters.push(resolve));
        return next(i);
      }
    }
    const pull = (async (): Promise<T | typeof DONE> => {
      const x = await source.next();
      if (x.done) {
        sourceDone = true;
        return DONE;
      }
      for (let j = 0; j < buffers.length; j++) {
        if (j === i || !open[j]) continue;
        const other = buffers[j] as T[];
        other.push(x.value);
        if (other.length > limit) other.shift(); // drop-oldest
      }
      return x.value;
    })();
    inFlight = pull;
    try {
      return await pull;
    } finally {
      inFlight = null;
    }
  };

  return buffers.map((_, i) => {
    const close = () => {
      open[i] = false;
      (buffers[i] as T[]).length = 0;
      wake();
    };
    return trackClose(
      (async function* () {
        try {
          for (;;) {
            const x = await next(i);
            if (x === DONE) break;
            yield x;
          }
        } finally {
          close();
          await source.return?.();
        }
      })(),
      close,
    );
  });
};
