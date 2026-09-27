# @johnhenry/math-prototype-patch

## 0.0.1

### Patch Changes

- 1d8e222: Fix #79: `@johnhenry/math` was pinned `^0.0.1`, which (npm's well-known 0.0.x-caret quirk — a caret range on a pre-1.0 `0.0.x` version only ever matches that EXACT version) installs a second, separate copy of `@johnhenry/math` the next time `math` publishes any patch beyond `0.0.1` — `instanceof`/CAS-object-identity checks between the two copies then silently diverge, exactly the failure mode this package's `Number.prototype` methods depend on avoiding. Widened to the non-caret `">=0.0.0 <0.1.0"`, matching the fix already applied to `math-grapher`'s identical bug and elsewhere in the family (`browsermesh`, `hostable`, `servable`, …), so it survives every future `0.0.x` patch without needing a bump in lockstep with `math`. Verified with a real `npm pack` + fresh-consumer install against a future-patch fixture (`test/dep-range-dedupe.test.ts`), confirmed failing against both the previous `^0.0.1` and the originally-reported `^0.0.0` before this fix.
