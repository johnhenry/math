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

export const teeSync =
  (num = 0) =>
  <T>(iterable: Iterable<T>): Array<Generator<T>> => {
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
  (num = 0) =>
  <T>(iterable: AsyncIterable<T>): Array<AsyncGenerator<T>> => {
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
