/**
 * Ambient TYPE augmentation for `Number.prototype`, matching the methods
 * `patchNumberPrototype()` (see `./index.ts`) adds at runtime -- kept as a
 * SEPARATE opt-in import (`import "mallory-math-prototype-patch/global";`)
 * rather than folded into the main entry point, since a `declare global`
 * block is a whole-program effect the moment ANY file imports it,
 * regardless of whether `patchNumberPrototype()` was ever actually
 * called. Importing this without calling `patchNumberPrototype()` gives
 * you types for methods that don't exist at runtime; importing
 * `patchNumberPrototype()` without this gives you real methods TypeScript
 * doesn't know about. Do both, deliberately, or neither.
 */
import type { ComplexNumber } from "@johnhenry/math";

/** See index.ts's identical local alias -- mallory-math doesn't export `CNInput` publicly. */
type CNInput = ComplexNumber | number;

declare global {
  interface Number {
    add(other?: CNInput): ComplexNumber;
    subtract(other?: CNInput): ComplexNumber;
    multiply(other?: CNInput): ComplexNumber;
    divide(other?: CNInput): ComplexNumber;
    power(exponent?: CNInput, selector?: number): ComplexNumber;
    conjugate(): ComplexNumber;
    reciprocal(): ComplexNumber;
    magnitude(): number;
    angle(): number;
    neg(): ComplexNumber;
    sine(): ComplexNumber;
    cosine(): ComplexNumber;
    tangent(): ComplexNumber;
    squareRoot(): ComplexNumber;
    logarithm(base?: CNInput, selectA?: number, selectB?: number): ComplexNumber;
    toComplexNumber(): ComplexNumber;
  }
}
