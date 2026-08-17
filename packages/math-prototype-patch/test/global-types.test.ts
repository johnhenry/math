import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ComplexNumber } from "mallory-math";
import "../src/global.ts";
import { patchNumberPrototype, unpatchNumberPrototype } from "../src/index.ts";

afterEach(() => {
  unpatchNumberPrototype();
});

test("global.ts's ambient types let TS compile a call to a patched method with no `as any`, and it works once actually patched", () => {
  patchNumberPrototype();
  // No cast needed here -- this is exactly what importing "../src/global.ts"
  // buys a consumer over index.test.ts's `as any` workaround.
  const result: ComplexNumber = (3).add(new ComplexNumber(1, 2));
  assert.equal(result.value, 4);
  assert.equal(result.iValue, 2);
});
