import assert from "node:assert/strict";

/** A one-shot async iterable over the given items. */
export const asyncFromArray = <T>(items: T[]): AsyncGenerator<T> =>
  (async function* () {
    for (const item of items) yield item;
  })();

/** Collect any (a)sync iterable into an array. */
export const collect = async <T>(iterable: AsyncIterable<T> | Iterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of iterable) {
    out.push(item);
  }
  return out;
};

/**
 * node:test replacement for the old pop-quiz `eventualequal` assertion:
 * exhausts `actual` (sync or async) and deep-compares to `expected`.
 */
export const eventualEqual = async <T>(
  actual: AsyncIterable<T> | Iterable<T>,
  expected: T[],
  message?: string,
): Promise<void> => {
  assert.deepStrictEqual(await collect(actual), expected, message);
};

/** Let every pending microtask (and promise chain) run. */
export const flush = async (rounds = 3): Promise<void> => {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};

/**
 * A hand-driven async source: `push`/`end`/`error` feed it, and `returned`
 * counts calls to its `return()` (recorded synchronously, so a test can
 * check it as soon as a combinator has closed it).
 */
export interface Controlled<T> {
  iterable: AsyncIterable<T> & AsyncIterator<T>;
  push(value: T): void;
  end(): void;
  error(error: unknown): void;
  /** How many times return() was called. */
  readonly returned: number;
  /** How many times next() was called. */
  readonly pulls: number;
}

export const controlled = <T>(): Controlled<T> => {
  type Item = { result: IteratorResult<T> } | { error: unknown };
  const queue: Item[] = [];
  let waiting: { resolve: (r: IteratorResult<T>) => void; reject: (e: unknown) => void } | undefined;
  let returned = 0;
  let pulls = 0;
  let finished = false;
  const deliver = (item: Item) => {
    if (waiting) {
      const w = waiting;
      waiting = undefined;
      if ("error" in item) w.reject(item.error);
      else w.resolve(item.result);
    } else {
      queue.push(item);
    }
  };
  const iterable: AsyncIterable<T> & AsyncIterator<T> = {
    next() {
      pulls++;
      const item = queue.shift();
      if (item) return "error" in item ? Promise.reject(item.error) : Promise.resolve(item.result);
      if (finished) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
      });
    },
    return(value?: unknown) {
      returned++;
      finished = true;
      queue.length = 0;
      deliver({ result: { value: undefined, done: true } });
      return Promise.resolve({ value, done: true } as IteratorResult<T>);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return {
    iterable,
    push: (value) => deliver({ result: { value, done: false } }),
    end: () => {
      finished = true;
      deliver({ result: { value: undefined, done: true } });
    },
    error: (error) => {
      finished = true;
      deliver({ error });
    },
    get returned() {
      return returned;
    },
    get pulls() {
      return pulls;
    },
  };
};

/**
 * A deterministic clock for the time operators: time only moves when
 * `advance` is called, and nothing waits on real time.
 */
export class FakeClock {
  time = 0;
  private nextId = 0;
  readonly timers = new Map<number, { at: number; fn: () => void }>();
  now = (): number => this.time;
  setTimeout = (fn: () => void, ms: number): number => {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown): void => {
    this.timers.delete(id as number);
  };
  /** Move time forward by `ms`, firing due timers in order. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    await flush();
    while (true) {
      let due: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry;
      }
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
      await flush();
    }
    this.time = end;
    await flush();
  }
}
