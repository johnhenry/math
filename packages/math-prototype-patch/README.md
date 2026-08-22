# @johnhenry/math-prototype-patch

An **opt-in**, collision-checked patch of `Number.prototype` with
[`@johnhenry/math`](https://www.npmjs.com/package/@johnhenry/math)'s `ComplexNumber`
fluent arithmetic/trig methods, so a plain JS number can participate directly
in complex arithmetic:

```ts
import { ComplexNumber } from "@johnhenry/math";
import { patchNumberPrototype } from "@johnhenry/math-prototype-patch";

patchNumberPrototype();

(3).add(new ComplexNumber(1, 2)); // ComplexNumber(4, 2) -- instead of new ComplexNumber(3).add(...)
(2).power(ComplexNumber.I);       // 2^i, ComplexNumber(0.7692389013, 0.6389612763)
```

## ⚠️ Only call `patchNumberPrototype()` if you understand the global side effect

`Number.prototype` is shared, process-wide, mutable state. Calling
`patchNumberPrototype()` anywhere in your process changes what `(3).add`
means for **every module that runs afterward** — not just the file that
called it, and not just code that imported this package. That's a
categorically bigger risk surface than adding a method to `ComplexNumber`
itself, which is exactly why this is a separate package and not part of
`@johnhenry/math` core (see
[johnhenry/math#28](https://github.com/johnhenry/math/issues/28)).

Nothing runs on import. You always opt in explicitly:

```ts
import { patchNumberPrototype } from "@johnhenry/math-prototype-patch";
patchNumberPrototype(); // <-- the actual mutation happens here, and only here
```

## Collision safety

`patchNumberPrototype()` checks every method name it's about to add
(`PATCH_METHOD_NAMES`) against `Number.prototype`'s existing own properties
first. If **any** of them already exist — another library, a polyfill, a
previous call from unrelated code — it throws a
`NumberPrototypeCollisionError` naming exactly which ones, and adds
**nothing** (all-or-nothing, never a partial patch). Calling it again while
*this* package's own patch is already active is a no-op, not a
self-collision.

```ts
import { NumberPrototypeCollisionError, patchNumberPrototype } from "@johnhenry/math-prototype-patch";

try {
  patchNumberPrototype();
} catch (e) {
  if (e instanceof NumberPrototypeCollisionError) {
    console.error("Can't patch, already defined:", e.collidingNames);
  }
}
```

## Undoing it

```ts
import { unpatchNumberPrototype, isNumberPrototypePatched } from "@johnhenry/math-prototype-patch";

unpatchNumberPrototype();       // removes exactly what patchNumberPrototype() added; no-op if not patched
isNumberPrototypePatched();     // false
```

## Patched methods

`add`, `subtract`, `multiply`, `divide`, `power`, `conjugate`, `reciprocal`,
`magnitude`, `angle`, `neg`, `sine`, `cosine`, `tangent`, `squareRoot`,
`logarithm`, `toComplexNumber` — mirroring `ComplexNumber`'s own fluent
arithmetic/trig surface. All patched methods are defined
non-enumerable (won't show up in `for...in`/`Object.keys` over a number, and
won't appear when iterating a plain object either).

## TypeScript types

Calling `patchNumberPrototype()` doesn't change what TypeScript thinks
`Number.prototype` looks like — `(3).add(...)` won't type-check unless you
*also* opt into the ambient type augmentation, as a **separate** import:

```ts
import "@johnhenry/math-prototype-patch/global"; // ambient `interface Number { add(...): ComplexNumber; ... }`
import { patchNumberPrototype } from "@johnhenry/math-prototype-patch";

patchNumberPrototype();
const z = (3).add(1); // now type-checks as ComplexNumber, no cast needed
```

This is deliberately split from the main entry point: a `declare global`
block is a whole-program effect the instant *any* file imports it, whether
or not `patchNumberPrototype()` was ever actually called at runtime.
Importing `"@johnhenry/math-prototype-patch/global"` without calling
`patchNumberPrototype()` gives you types for methods that don't exist yet;
calling `patchNumberPrototype()` without importing `/global` gives you real
methods TypeScript doesn't know about. Do both, deliberately, or neither.

## Install & use

```bash
npm install @johnhenry/math-prototype-patch
npm test           # run the node:test suite
npm run typecheck  # tsc --noEmit (src/ only, matching this monorepo's convention)
npm run build      # emit ./dist (ESM + .d.ts)
```
