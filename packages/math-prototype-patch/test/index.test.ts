import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ComplexNumber } from "@johnhenry/math";
import {
  isNumberPrototypePatched,
  NumberPrototypeCollisionError,
  PATCH_METHOD_NAMES,
  patchNumberPrototype,
  unpatchNumberPrototype,
} from "../src/index.ts";

// Every test unpatches afterward -- these tests mutate the one shared,
// process-wide Number.prototype, so leaving it patched would leak into
// every OTHER test file's run (node:test runs files in the same process).
afterEach(() => {
  unpatchNumberPrototype();
});

test("isNumberPrototypePatched: false before patching, true after, false again after unpatching", () => {
  assert.equal(isNumberPrototypePatched(), false);
  patchNumberPrototype();
  assert.equal(isNumberPrototypePatched(), true);
  unpatchNumberPrototype();
  assert.equal(isNumberPrototypePatched(), false);
});

test("patchNumberPrototype: adds exactly PATCH_METHOD_NAMES as non-enumerable own properties of Number.prototype", () => {
  patchNumberPrototype();
  for (const name of PATCH_METHOD_NAMES) {
    assert.ok(Object.hasOwn(Number.prototype, name), `missing ${name}`);
    const descriptor = Object.getOwnPropertyDescriptor(Number.prototype, name);
    assert.equal(
      descriptor?.enumerable,
      false,
      `${name} should not be enumerable (would show up in for...in over numbers)`,
    );
  }
  // Doesn't leak into a plain object's for...in either.
  for (const _key in {}) assert.fail("unexpected enumerable key");
});

test("patchNumberPrototype: is idempotent when called twice in a row (not a self-collision)", () => {
  patchNumberPrototype();
  assert.doesNotThrow(() => patchNumberPrototype());
  assert.equal(isNumberPrototypePatched(), true);
});

test("patchNumberPrototype: throws NumberPrototypeCollisionError and patches nothing if a target name already exists", () => {
  const marker = () => "not mine";
  Object.defineProperty(Number.prototype, "add", { value: marker, configurable: true });
  try {
    assert.throws(() => patchNumberPrototype(), NumberPrototypeCollisionError);
    assert.equal(isNumberPrototypePatched(), false);
    // Every other (non-colliding) method must ALSO be absent -- an
    // all-or-nothing patch, not a partial one that silently skipped `add`.
    assert.ok(!Object.hasOwn(Number.prototype, "subtract"));
  } finally {
    delete (Number.prototype as unknown as Record<string, unknown>).add;
  }
});

test("NumberPrototypeCollisionError: names the exact colliding member(s)", () => {
  Object.defineProperty(Number.prototype, "magnitude", { value: () => 0, configurable: true });
  Object.defineProperty(Number.prototype, "angle", { value: () => 0, configurable: true });
  try {
    assert.throws(
      () => patchNumberPrototype(),
      (e: unknown) => {
        assert.ok(e instanceof NumberPrototypeCollisionError);
        assert.deepEqual([...e.collidingNames].sort(), ["angle", "magnitude"]);
        return true;
      },
    );
  } finally {
    delete (Number.prototype as unknown as Record<string, unknown>).magnitude;
    delete (Number.prototype as unknown as Record<string, unknown>).angle;
  }
});

test("unpatchNumberPrototype: no-op when not currently patched", () => {
  assert.equal(isNumberPrototypePatched(), false);
  assert.doesNotThrow(() => unpatchNumberPrototype());
  assert.equal(isNumberPrototypePatched(), false);
});

test("patched arithmetic: (3).add(1+2i) matches ComplexNumber(3).add(1+2i) exactly", () => {
  patchNumberPrototype();
  const patched = (3 as any).add(new ComplexNumber(1, 2));
  const expected = new ComplexNumber(3).add(new ComplexNumber(1, 2));
  assert.ok(patched instanceof ComplexNumber);
  assert.equal(patched.value, expected.value);
  assert.equal(patched.iValue, expected.iValue);
});

test("patched arithmetic: (2).power(i) matches the hand-computed Euler form e^(i*ln2)", () => {
  patchNumberPrototype();
  const result = (2 as any).power(ComplexNumber.I);
  const expectedRe = Math.cos(Math.log(2));
  const expectedIm = Math.sin(Math.log(2));
  assert.ok(Math.abs(result.value - expectedRe) < 1e-9);
  assert.ok(Math.abs(result.iValue - expectedIm) < 1e-9);
});

test("patched arithmetic: (4).magnitude() and (4).angle() match a real ComplexNumber's", () => {
  patchNumberPrototype();
  const n = 4 as any;
  assert.equal(n.magnitude(), new ComplexNumber(4).magnitude());
  assert.equal(n.angle(), new ComplexNumber(4).angle());
});

test("patched arithmetic: (5).toComplexNumber() equals new ComplexNumber(5)", () => {
  patchNumberPrototype();
  const z = (5 as any).toComplexNumber();
  assert.ok(z instanceof ComplexNumber);
  assert.ok(z.equals(new ComplexNumber(5)));
});

test("after unpatchNumberPrototype, the added methods are gone from plain numbers", () => {
  patchNumberPrototype();
  unpatchNumberPrototype();
  assert.equal(typeof (3 as any).add, "undefined");
});
