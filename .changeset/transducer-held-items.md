---
"@johnhenry/iteration": minor
---

`transducePush` pipelines have `held()` and `drop(predicate)`, to see and let go of what stateful transducers keep between steps (a half-full `group`, `partitionBy`'s open run, `accumulate`'s running value, `dedupe`'s last key). Dropping never emits early or changes a batch beyond leaving the dropped items out. `ReducerStep` gains optional `held`/`drop`, cascaded like `complete`.
