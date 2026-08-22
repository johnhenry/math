/**
 * @johnhenry/math-prototype-patch (issue #28) — an OPT-IN, collision-checked
 * patch of `Number.prototype` with `ComplexNumber`'s fluent arithmetic/
 * trig methods, so a plain JS number can participate directly in complex
 * arithmetic: `(3).add(new ComplexNumber(1, 2))` instead of
 * `new ComplexNumber(3).add(...)`.
 *
 * Deliberately a SEPARATE package from `@johnhenry/math` itself, never
 * merged into core -- patching a built-in prototype is a process-wide,
 * global-realm effect (every module in the process observes it, not just
 * callers that imported this package), a categorically bigger risk
 * surface than adding a method to `ComplexNumber`. Nothing here runs on
 * import: `patchNumberPrototype()` must be called explicitly. See the
 * README before calling it.
 */
import { ComplexNumber } from "@johnhenry/math";

/**
 * mirrors @johnhenry/math's own (internal, unexported) `CNInput` -- anything
 * `ComplexNumber`'s fluent methods accept as an operand. Defined locally
 * rather than depending on an export @johnhenry/math doesn't make public,
 * keeping this package's surface fully self-contained.
 */
type CNInput = ComplexNumber | number;

const PATCH_METHODS = {
  add(this: number, other: CNInput = 0): ComplexNumber {
    return new ComplexNumber(this).add(other);
  },
  subtract(this: number, other: CNInput = 0): ComplexNumber {
    return new ComplexNumber(this).subtract(other);
  },
  multiply(this: number, other: CNInput = 1): ComplexNumber {
    return new ComplexNumber(this).multiply(other);
  },
  divide(this: number, other: CNInput = 1): ComplexNumber {
    return new ComplexNumber(this).divide(other);
  },
  power(this: number, exponent: CNInput = 1, selector = 0): ComplexNumber {
    return new ComplexNumber(this).power(exponent, selector);
  },
  conjugate(this: number): ComplexNumber {
    return new ComplexNumber(this).conjugate();
  },
  reciprocal(this: number): ComplexNumber {
    return new ComplexNumber(this).reciprocal();
  },
  magnitude(this: number): number {
    return new ComplexNumber(this).magnitude();
  },
  angle(this: number): number {
    return new ComplexNumber(this).angle();
  },
  neg(this: number): ComplexNumber {
    return new ComplexNumber(this).neg();
  },
  sine(this: number): ComplexNumber {
    return new ComplexNumber(this).sine();
  },
  cosine(this: number): ComplexNumber {
    return new ComplexNumber(this).cosine();
  },
  tangent(this: number): ComplexNumber {
    return new ComplexNumber(this).tangent();
  },
  squareRoot(this: number): ComplexNumber {
    return new ComplexNumber(this).squareRoot();
  },
  logarithm(this: number, base: CNInput = Math.E, selectA = 0, selectB = 0): ComplexNumber {
    return new ComplexNumber(this).logarithm(base, selectA, selectB);
  },
  toComplexNumber(this: number): ComplexNumber {
    return new ComplexNumber(this);
  },
} satisfies Record<string, (this: number, ...args: any[]) => unknown>;

/** Every method name this package would add -- for introspection before committing to `patchNumberPrototype()`. */
export const PATCH_METHOD_NAMES: readonly string[] = Object.keys(PATCH_METHODS);

export class NumberPrototypeCollisionError extends Error {
  readonly collidingNames: readonly string[];
  constructor(collidingNames: readonly string[]) {
    super(
      `Number.prototype already defines: ${collidingNames.join(", ")}. ` +
        "@johnhenry/math-prototype-patch refuses to overwrite an existing member -- " +
        "something else (another library, a polyfill, a previous patch) already claimed it.",
    );
    this.name = "NumberPrototypeCollisionError";
    this.collidingNames = collidingNames;
  }
}

let patched = false;

/** Whether `patchNumberPrototype()` has been called (and not since undone by `unpatchNumberPrototype()`) in this process. */
export function isNumberPrototypePatched(): boolean {
  return patched;
}

/**
 * Patches `Number.prototype` with `ComplexNumber`'s fluent arithmetic/trig
 * methods (see {@link PATCH_METHOD_NAMES} for the exact list).
 *
 * THIS IS A GLOBAL, PROCESS-WIDE SIDE EFFECT: it mutates the one shared
 * `Number.prototype` every module in the process reads from, not just
 * callers that imported this package. Only call this if you understand
 * and accept that -- see the README's "only call this if..." warning.
 *
 * Refuses to patch (throws {@link NumberPrototypeCollisionError}) if ANY
 * target name already exists as an own property of `Number.prototype` --
 * never silently overwrites something else's method. Idempotent: calling
 * it again while already patched by THIS function is a no-op (not a
 * collision against itself).
 */
export function patchNumberPrototype(): void {
  if (patched) return;
  const colliding = PATCH_METHOD_NAMES.filter((name) => Object.hasOwn(Number.prototype, name));
  if (colliding.length > 0) throw new NumberPrototypeCollisionError(colliding);
  for (const name of PATCH_METHOD_NAMES) {
    Object.defineProperty(Number.prototype, name, {
      value: PATCH_METHODS[name as keyof typeof PATCH_METHODS],
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  patched = true;
}

/**
 * Reverses {@link patchNumberPrototype} -- removes exactly the members it
 * added. No-op if not currently patched (whether never patched, or
 * already unpatched).
 */
export function unpatchNumberPrototype(): void {
  if (!patched) return;
  for (const name of PATCH_METHOD_NAMES) {
    delete (Number.prototype as unknown as Record<string, unknown>)[name];
  }
  patched = false;
}
