import assert from "node:assert/strict";
import { test } from "node:test";
import { Symbolic } from "@johnhenry/math";
import { compileExpression } from "../src/expr.ts";

test("compileExpression compiles strings and Expr trees to number -> number", () => {
  assert.equal(compileExpression("x^2 + 1")(3), 10);
  assert.equal(compileExpression(Symbolic.parse("2*x"))(4), 8);
});

test("compileExpression binds params and a custom variable", () => {
  assert.equal(compileExpression("a*x^2 + b", { params: { a: 2, b: 1 } })(3), 19);
  assert.equal(compileExpression("t + 1", { variable: "t" })(1), 2);
});

test("the returned function is reusable and does not leak state between calls", () => {
  const f = compileExpression("x*x");
  assert.deepEqual([1, 2, 3].map(f), [1, 4, 9]);
  assert.equal(f(5), 25);
});

test("explicit multiplication is required by default", () => {
  assert.throws(() => compileExpression("2x")(1));
  assert.throws(() => compileExpression("2x", { implicitMultiplication: false })(1));
});

test("implicitMultiplication: true reads 2x, 3sin(x) and (x+1)(x-1)", () => {
  const opt = { implicitMultiplication: true };
  assert.equal(compileExpression("2x", opt)(4), 8);
  assert.equal(compileExpression("3sin(x)", opt)(0), 0);
  assert.equal(compileExpression("(x+1)(x-1)", opt)(3), 8);
  assert.equal(compileExpression("a x", { ...opt, params: { a: 5 } })(2), 10);
});
