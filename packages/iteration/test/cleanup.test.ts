// Every async combinator and time operator closes (return()) each input
// that has not ended -- when it ends, when an input errors, when the
// consumer exits early, and when its signal aborts -- and never closes an
// input that already ended or errored.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineLatestAsync,
  debounceAsync,
  latestAsync,
  mergeAsync,
  sampleAsync,
  throttleAsync,
  withLatestFromAsync,
} from "../src/index.ts";
import { type Controlled, collect, controlled, FakeClock, flush } from "./helpers.ts";

type Srcs = Array<Controlled<number>>;

interface Case {
  name: string;
  inputs: number;
  make(srcs: Srcs, options: { signal?: AbortSignal; clock: FakeClock }): AsyncGenerator<unknown>;
  /** Make one output value available (the first next() is already pending). */
  prime(srcs: Srcs, clock: FakeClock): Promise<void>;
  /** End the inputs that make the output end naturally; returns their indexes. */
  end(srcs: Srcs): number[];
  /** The input whose error should fail the output. */
  errorAt: number;
  /** Before aborting: put the operator in a state with a timer running, if it has one. */
  arm?(srcs: Srcs): void;
}

const cases: Case[] = [
  {
    name: "mergeAsync",
    inputs: 2,
    make: ([a, b], { signal }) => mergeAsync(a!.iterable, b!.iterable, { signal }),
    prime: async ([a]) => a!.push(1),
    end: ([a, b]) => {
      a!.end();
      b!.end();
      return [0, 1];
    },
    errorAt: 0,
  },
  {
    name: 'combineLatestAsync (endOn "all")',
    inputs: 2,
    make: ([a, b], { signal }) => combineLatestAsync([a!.iterable, b!.iterable], { signal }),
    prime: async ([a, b]) => {
      a!.push(1);
      b!.push(2);
    },
    end: ([a, b]) => {
      a!.end();
      b!.end();
      return [0, 1];
    },
    errorAt: 1,
  },
  {
    name: 'combineLatestAsync (endOn "any")',
    inputs: 2,
    make: ([a, b], { signal }) => combineLatestAsync({ a: a!.iterable, b: b!.iterable }, { signal, endOn: "any" }),
    prime: async ([a, b]) => {
      a!.push(1);
      b!.push(2);
    },
    end: ([a]) => {
      a!.end();
      return [0];
    },
    errorAt: 0,
  },
  {
    name: "withLatestFromAsync",
    inputs: 3,
    make: ([s, a, b], { signal }) => withLatestFromAsync(s!.iterable, [a!.iterable, b!.iterable], { signal }),
    prime: async ([s, a, b]) => {
      a!.push(1);
      b!.push(2);
      await flush();
      s!.push(0);
    },
    end: ([s]) => {
      s!.end();
      return [0];
    },
    errorAt: 2,
  },
  {
    name: "latestAsync",
    inputs: 1,
    make: ([a], { signal }) => latestAsync(a!.iterable, { signal }),
    prime: async ([a]) => a!.push(1),
    end: ([a]) => {
      a!.end();
      return [0];
    },
    errorAt: 0,
  },
  {
    name: "sampleAsync",
    inputs: 2,
    make: ([source, trigger], { signal }) => sampleAsync(source!.iterable, trigger!.iterable, { signal }),
    prime: async ([source, trigger]) => {
      source!.push(1);
      await flush();
      trigger!.push(0);
    },
    end: ([, trigger]) => {
      trigger!.end();
      return [1];
    },
    errorAt: 1,
  },
  {
    name: "debounceAsync",
    inputs: 1,
    make: ([a], { signal, clock }) => debounceAsync(10, a!.iterable, { signal, clock }),
    prime: async ([a], clock) => {
      a!.push(1);
      await clock.advance(10);
    },
    end: ([a]) => {
      a!.end();
      return [0];
    },
    errorAt: 0,
    arm: ([a]) => a!.push(2), // waiting for its quiet period
  },
  {
    name: "throttleAsync",
    inputs: 1,
    make: ([a], { signal, clock }) => throttleAsync(10, a!.iterable, { signal, clock }),
    prime: async ([a]) => a!.push(1),
    end: ([a]) => {
      a!.end();
      return [0];
    },
    errorAt: 0,
  },
];

const setup = (c: Case, signal?: AbortSignal) => {
  const srcs: Srcs = Array.from({ length: c.inputs }, () => controlled<number>());
  const clock = new FakeClock();
  const gen = c.make(srcs, { signal, clock });
  return { srcs, clock, gen };
};

/** Start the output and read its first value. */
const readFirst = async (c: Case, { srcs, clock, gen }: ReturnType<typeof setup>) => {
  const first = gen.next();
  await flush();
  await c.prime(srcs, clock);
  const result = await first;
  assert.strictEqual(result.done, false, `${c.name}: primed a value`);
};

const returnedCounts = (srcs: Srcs) => srcs.map((s) => s.returned);

for (const c of cases) {
  test(`${c.name} closes the inputs still running when it ends`, async () => {
    const ctx = setup(c);
    await readFirst(c, ctx);
    const ended = c.end(ctx.srcs);
    await collect(ctx.gen);
    const expected = ctx.srcs.map((_, i) => (ended.includes(i) ? 0 : 1));
    assert.deepStrictEqual(returnedCounts(ctx.srcs), expected);
    assert.strictEqual(ctx.clock.timers.size, 0, "no timer left behind");
  });

  test(`${c.name} closes the other inputs when one errors`, async () => {
    const ctx = setup(c);
    await readFirst(c, ctx);
    const pending = ctx.gen.next();
    await flush();
    const boom = new Error("boom");
    ctx.srcs[c.errorAt]!.error(boom);
    await assert.rejects(pending, boom);
    const expected = ctx.srcs.map((_, i) => (i === c.errorAt ? 0 : 1));
    assert.deepStrictEqual(returnedCounts(ctx.srcs), expected);
    assert.strictEqual(ctx.clock.timers.size, 0, "no timer left behind");
  });

  test(`${c.name} closes every input when the consumer exits early`, async () => {
    const ctx = setup(c);
    await readFirst(c, ctx);
    await ctx.gen.return(undefined);
    assert.deepStrictEqual(
      returnedCounts(ctx.srcs),
      ctx.srcs.map(() => 1),
    );
    assert.strictEqual(ctx.clock.timers.size, 0, "no timer left behind");
  });

  test(`${c.name} rejects and closes every input on abort`, async () => {
    const controller = new AbortController();
    const ctx = setup(c, controller.signal);
    await readFirst(c, ctx);
    const pending = ctx.gen.next();
    c.arm?.(ctx.srcs);
    await flush();
    const timersBefore = ctx.clock.timers.size;
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.deepStrictEqual(
      returnedCounts(ctx.srcs),
      ctx.srcs.map(() => 1),
    );
    assert.strictEqual(ctx.clock.timers.size, 0, `abort clears the timer (${timersBefore} were running)`);
  });

  test(`${c.name} rejects at once with an already-aborted signal`, async () => {
    const controller = new AbortController();
    const reason = new Error("stop");
    controller.abort(reason);
    const ctx = setup(c, controller.signal);
    await assert.rejects(ctx.gen.next(), reason);
  });
}
