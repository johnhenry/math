import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncChannel, CHANNEL_END, channelDecorators } from "../src/index.ts";

const { withEmitter, withWebSocket } = channelDecorators;

class FakeEmitter {
  private listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();
  addListener(event: string, listener: (...args: unknown[]) => unknown): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

interface FakeWebSocket {
  onmessage: ((event: unknown) => unknown) | null;
  onclose: ((event?: unknown) => unknown) | null;
  onerror: ((event?: unknown) => unknown) | null;
}

const withUnhandledRejectionTracking = async (run: () => Promise<void>): Promise<unknown[]> => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    await run();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  return unhandled;
};

test("withEmitter: put/break/error listeners wire up and deliver normally", async () => {
  const channel = new AsyncChannel<number>();
  const emitter = new FakeEmitter();
  withEmitter(channel, emitter);

  // put() is async (it awaits transform() and, per the FIFO fix, its own
  // delivery turn), so give the fire-and-forget put()s a beat to land
  // before reading them back, and only break() once they've settled --
  // otherwise break()'s synchronous cache push could race ahead of them.
  emitter.emit("data", 1);
  emitter.emit("data", 2);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.strictEqual(await channel.take(), 1, "first emitted item should be delivered to the channel");
  assert.strictEqual(await channel.take(), 2, "second emitted item should be delivered to the channel");

  emitter.emit("end");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(await channel.take(), CHANNEL_END, "end event should break() the channel");
});

// Regression: withEmitter registered `channel.put.bind(channel)` directly
// as the listener. put() is async, and its returned promise was never
// observed by the emitter -- a rejection (e.g. a throwing transform) became
// an unhandled promise rejection instead of surfacing through the
// channel's own error path.
test("withEmitter: a put() rejection must not become an unhandled promise rejection", async () => {
  const channel = new AsyncChannel<number>({
    transform: () => {
      throw new Error("boom");
    },
  });
  const emitter = new FakeEmitter();
  withEmitter(channel, emitter);

  const unhandled = await withUnhandledRejectionTracking(async () => {
    emitter.emit("data", 1);
    // Give the rejected put() promise a couple of turns to surface as an
    // unhandled rejection if it weren't caught.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.deepStrictEqual(unhandled, [], "put() rejection must be handled, not left unhandled");

  const taken = await channel.take();
  assert.ok(taken instanceof Error, "the rejection should be routed through the channel's own throw()/take() path");
  assert.strictEqual((taken as Error).message, "boom");
});

// Same regression as above, for the websocket decorator (bug's other line).
test("withWebSocket: a put() rejection must not become an unhandled promise rejection", async () => {
  const channel = new AsyncChannel<number>({
    transform: () => {
      throw new Error("ws boom");
    },
  });
  const websocket: FakeWebSocket = { onmessage: null, onclose: null, onerror: null };
  withWebSocket(channel, websocket);

  const unhandled = await withUnhandledRejectionTracking(async () => {
    websocket.onmessage?.({ data: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  assert.deepStrictEqual(unhandled, [], "put() rejection must be handled, not left unhandled");

  const taken = await channel.take();
  assert.ok(taken instanceof Error, "the rejection should be routed through the channel's own throw()/take() path");
  assert.strictEqual((taken as Error).message, "ws boom");
});
