// @johnhenry/math-prototype-patch: OPT-IN, collision-checked, reversible
// Number.prototype patch for ComplexNumber fluent arithmetic. Nothing
// runs on import — the mutation happens only at the explicit call.
//
// In TypeScript you would ALSO opt into the ambient types, separately:
//   import "@johnhenry/math-prototype-patch/global";
//
// Run: npm install && npm run build && node examples/05-prototype-patch.mjs
// (This package has no prepare script, so its dist/ needs the explicit build.)
import { ComplexNumber } from "@johnhenry/math";
import {
  NumberPrototypeCollisionError,
  PATCH_METHOD_NAMES,
  isNumberPrototypePatched,
  patchNumberPrototype,
  unpatchNumberPrototype,
} from "@johnhenry/math-prototype-patch";

// Collision-safe: throws NumberPrototypeCollisionError (naming the
// collisions, adding NOTHING) if any method already exists.
try {
  patchNumberPrototype();
} catch (e) {
  if (e instanceof NumberPrototypeCollisionError) {
    console.error("Can't patch, already defined:", e.collidingNames);
    process.exit(1);
  }
  throw e;
}

console.log(isNumberPrototypePatched()); // true
console.log(PATCH_METHOD_NAMES.length); // 16 — all non-enumerable

// Plain numbers now participate directly in complex arithmetic
console.log(String((3).add(new ComplexNumber(1, 2)))); // 4+2*i
console.log(String((2).power(ComplexNumber.I))); // 0.7692389013+0.6389612763*i

// Fully reversible — removes exactly what it added
unpatchNumberPrototype();
console.log(isNumberPrototypePatched()); // false
