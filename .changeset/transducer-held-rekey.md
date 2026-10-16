---
"@johnhenry/iteration": patch
---

`held()`/`drop(predicate)` no longer leave a dropped item referenced by derived keys. `partitionBy` re-derives its open run's key from the run's last surviving item after a drop, and `dedupe` keeps the item its last key came from so `drop(predicate)` tests that item (as well as the key) and forgets the key when it matches. Neither makes an operator emit early.
