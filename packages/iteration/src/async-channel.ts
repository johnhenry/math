/**
 * Asynchronous Channel
 * @kind namespace
 * @name AsyncChannel
 */

/**
 * Constant signaling channel's end
 * @kind constant
 * @name CHANNEL_END
 */
export const CHANNEL_END: unique symbol = Symbol("CHANNEL_END");

export interface AsyncChannelOptions<T> {
  cache?: Array<T | typeof CHANNEL_END | Error>;
  limit?: number;
  transform?: (item: T) => T | Promise<T>;
  debug?: (...args: unknown[]) => unknown;
  /**
   * How an error queued by `throw()` reaches a `take()` that arrives after
   * it (a `take()` already waiting when `throw()` is called always rejects).
   * - `"value"` (default, the pre-0.0.1 behaviour): `take()` resolves with
   *   the `Error` object, and async iteration yields it as an item.
   * - `"throw"`: `take()` rejects with it, so async iteration throws.
   */
  errors?: "value" | "throw";
}

/** A pending take(), waiting for an item. */
interface Taker<T> {
  resolve: (value: T | typeof CHANNEL_END) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Asynchronous Channel class
 * @kind class
 * @name AsyncChannel
 */
export class AsyncChannel<T = unknown> {
  limit: number;
  cache: Array<T | typeof CHANNEL_END | Error>;
  transform: (item: T) => T | Promise<T>;
  debug?: (...args: unknown[]) => unknown;
  errors: "value" | "throw";
  /**
   * Consumers waiting in take(), served FIFO. Before 0.0.1 this was a
   * single slot, so a second concurrent take() replaced the first, which
   * then never resolved.
   */
  private takers: Array<Taker<T>> = [];
  /** Errors queued by throw() (as opposed to Error objects put() as values). */
  private thrown = new WeakSet<Error>();
  /** Producers awaiting capacity, FIFO (backpressure -- see put()). */
  private putters: Array<{
    value: T | typeof CHANNEL_END | Error;
    release: () => void;
  }> = [];
  /**
   * Serializes delivery of concurrent put() calls into call order. Each
   * put() grabs the current tail synchronously (before any `await`, so
   * position is fixed by call order rather than by how long e.g.
   * `transform()` happens to take) and only commits its value once its
   * predecessor has committed.
   */
  private putOrder: Promise<void> = Promise.resolve();

  /**
   * Asynchronous Channel constructor
   * @kind function
   * @name constructor
   */
  constructor({
    cache = [],
    limit = Infinity,
    transform = ($: T) => $,
    debug,
    errors = "value",
  }: AsyncChannelOptions<T> = {}) {
    this.limit = limit;
    this.cache = cache.slice(0, limit);
    this.transform = transform;
    this.debug = debug;
    this.errors = errors;
  }
  /**
   * Hand an item that came off the cache or a producer to a take() caller:
   * with `errors: "throw"`, an error queued by throw() rejects.
   * @ignore
   */
  private deliver(value: T | typeof CHANNEL_END | Error): T | typeof CHANNEL_END {
    if (this.errors === "throw" && value instanceof Error && this.thrown.has(value)) {
      throw value;
    }
    return value as T | typeof CHANNEL_END;
  }
  /**
   * Move waiting producers' items into the cache while there is capacity,
   * releasing their pending put() promises (FIFO).
   * @ignore
   */
  private drainPutters(): void {
    while (this.putters.length > 0 && this.cache.length < this.limit) {
      const { value, release } = this.putters.shift() as {
        value: T | typeof CHANNEL_END | Error;
        release: () => void;
      };
      this.cache.push(value);
      release();
    }
  }
  /**
   * Put item onto Asynchronous Channel. Returns a Promise<void> that
   * resolves once the channel has accepted the item: immediately when a
   * taker is waiting or the cache has capacity, otherwise when a later
   * take() frees a slot (backpressure -- bounded by `limit`). Replaces the
   * pre-2.1 behavior of throwing "cache full" at capacity.
   * @kind function
   * @name put
   */
  async put(item: T, ...debug: unknown[]): Promise<void> {
    this.debug?.("put", item, ...debug);
    // Reserve this call's delivery slot synchronously, in call order,
    // before doing any async work (transform() may resolve at a different
    // speed for different items -- see class doc on putOrder).
    const myTurn = this.putOrder;
    let advance!: () => void;
    this.putOrder = new Promise<void>((resolve) => {
      advance = resolve;
    });
    try {
      const value = await this.transform(item);
      await myTurn;
      const taker = this.takers.shift();
      if (taker) {
        taker.resolve(value);
        return;
      }
      if (this.cache.length < this.limit) {
        this.cache.push(value);
        return;
      }
      await new Promise<void>((release) => {
        this.putters.push({ value, release });
      });
    } finally {
      advance();
    }
  }
  /**
   * Take item off of Asynchronous Channel
   * @kind function
   * @name take
   */
  async take(...debug: unknown[]): Promise<T | typeof CHANNEL_END> {
    this.debug?.("take", ...debug);
    if (this.cache.length) {
      const value = this.cache.shift() as T | typeof CHANNEL_END | Error;
      this.drainPutters();
      return this.deliver(value);
    }
    if (this.putters.length) {
      // limit of 0 (rendezvous) or drained cache with waiting producers:
      // hand off directly.
      const { value, release } = this.putters.shift() as {
        value: T | typeof CHANNEL_END | Error;
        release: () => void;
      };
      release();
      return this.deliver(value);
    }
    return new Promise<T | typeof CHANNEL_END>((resolve, reject) => {
      this.takers.push({ resolve, reject });
    });
  }
  /**
   * Pause Asynchronous Channel
   * @kind function
   * @name break
   */
  async break(...debug: unknown[]): Promise<void> {
    this.debug?.("break", ...debug);
    const taker = this.takers.shift();
    if (taker) {
      taker.resolve(CHANNEL_END);
    } else if (this.putters.length > 0) {
      // Keep FIFO order: the end marker must not overtake producers
      // already waiting for capacity.
      this.putters.push({ value: CHANNEL_END, release: () => {} });
    } else {
      this.cache.push(CHANNEL_END);
    }
  }
  /**
   * Stop Asynchronous Channel
   * @kind function
   * @name throw
   */
  async throw(message?: string, ...debug: unknown[]): Promise<void> {
    this.debug?.("throw", ...debug);
    const error = new Error(message);
    this.thrown.add(error);
    const taker = this.takers.shift();
    if (taker) {
      taker.reject(error);
    } else if (this.putters.length > 0) {
      // Keep FIFO order behind producers already waiting for capacity.
      this.putters.push({ value: error, release: () => {} });
    } else {
      this.cache.push(error);
    }
  }
  /**
   * Return pending status of Asynchronous Channel
   * @kind function
   * @name pending
   * Note: should this be a getter?
   */
  pending(): boolean {
    return this.takers.length > 0;
  }
  /**
   * Return string representation of Asynchronous Channel
   * @kind function
   * @name toString
   */
  toString(): string {
    return `AsyncChannel {${this.pending() ? "pending" : ""}} [${this.cache.length}/${this.limit}]`;
  }
  /**
   * Return Asynchronous Channel's iterator
   * @kind function
   * @name [Symbol.asyncIterator]
   */
  async *[Symbol.asyncIterator](...debug: unknown[]): AsyncGenerator<T> {
    while (true) {
      const answer = await this.take(...debug);
      if (answer === CHANNEL_END) {
        return;
      }
      yield answer;
    }
  }
}
