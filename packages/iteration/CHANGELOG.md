# @johnhenry/iteration

## 0.0.1

### Patch Changes

- 7b1ca17: Live values and events (#83). Non-breaking: every existing export keeps its signature and default behaviour; new behaviour comes only from new exports and new optional arguments.

  - **New combinators** (`@johnhenry/iteration/combine`): `mergeAsync(...iterables, { signal })`, `combineLatestAsync(inputs, { signal, initial, endOn })` (array or record inputs, latest-wins coalescing), `withLatestFromAsync(source, others, { signal })`, `latestAsync(iterable, { signal })` (conflation), and `sampleAsync(source, trigger, { signal })`. Each closes every input on end, error, abort, and early consumer exit.
  - **New time operators** (`@johnhenry/iteration/time`): `debounceAsync(ms, iterable, { clock, signal })` and `throttleAsync(ms, iterable, { leading, trailing, clock, signal })`, with an injectable `Clock` (`{ setTimeout, clearTimeout, now }`, default `systemClock`).
  - **`transducePush(...transducers)`** returns `{ step, complete, halted }` to drive transducers one value at a time, with the same composition order, `.complete` flush and `HALT` as `transduceSync`.
  - **New options:** `teeSync`/`teeAsync` take an optional `{ limit, overflow: "wait" | "drop-oldest" | "error" }` (default still unbounded; `"wait"` is `teeAsync`-only). `AsyncChannel` takes `errors: "value" | "throw"` (default `"value"`, the existing behaviour).
  - **Fix:** `zipSync`, `zipAsync`, `zipLongestSync` and `zipLongestAsync` now close (`return()`) every input that has not ended when the zip ends, an input throws, or the consumer exits early. Previously the other inputs were left open.
  - **Fix:** concurrent `AsyncChannel#take()` calls are served FIFO. Previously a second waiting `take()` replaced the first, which never resolved. The same single-slot state also lost the next `put()` after `throw()` rejected a waiting `take()`; that is fixed too.

- 58fdc16: Fix #85: the stateless built-in transducers (`map`, `filter`, `take`, `drop`, `reject`, `tap`, `dedupe`, `interpose`, `accumulate`) now forward the `.complete` flush to the transducers after them, as the README's step protocol already requires ("`.complete` must cascade to the inner step's own `.complete`"). Previously each returned a step with no `.complete`, so a stateful transducer placed after one of them never flushed: `transduceSync(map(f), group(2))([1, 2, 3])` yielded `[[1, 2]]` and silently dropped the trailing `[3]`. The same applied to `partitionBy`, `transduceAsync` and `transducePush`. Pipelines like these now also yield the trailing items that were previously dropped (here, `[[1, 2], [3]]`). Pipelines whose stateful transducer comes first, or that have none, are unchanged.
