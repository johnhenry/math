---
"@johnhenry/iteration": patch
---

Fix #85: the stateless built-in transducers (`map`, `filter`, `take`, `drop`, `reject`, `tap`, `dedupe`, `interpose`, `accumulate`) now forward the `.complete` flush to the transducers after them, as the README's step protocol already requires ("`.complete` must cascade to the inner step's own `.complete`"). Previously each returned a step with no `.complete`, so a stateful transducer placed after one of them never flushed: `transduceSync(map(f), group(2))([1, 2, 3])` yielded `[[1, 2]]` and silently dropped the trailing `[3]`. The same applied to `partitionBy`, `transduceAsync` and `transducePush`. Pipelines like these now also yield the trailing items that were previously dropped (here, `[[1, 2], [3]]`). Pipelines whose stateful transducer comes first, or that have none, are unchanged.
