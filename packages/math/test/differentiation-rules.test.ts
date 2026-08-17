import assert from "node:assert/strict";
import { test } from "node:test";
import { FUNC_DERIVATIVE_RULES } from "../src/differentiation-rules.ts";
import type { Expr, FuncName } from "../src/Symbolic.ts";
import { FUNCTION_NAMES, Symbolic } from "../src/Symbolic.ts";

const x: Expr = { type: "var", name: "x" };
const dxdx: Expr = { type: "const", value: 1 };

const evalFuncAt = (name: FuncName, point: number): number =>
  Symbolic.evaluate({ type: "func", name, arg: x }, { x: point }) as number;

/** A domain-safe evaluation point for each `FuncName`, away from singularities/kinks. */
const SAFE_POINT: Record<FuncName, number> = {
  sin: 0.6,
  cos: 0.6,
  tan: 0.6,
  exp: 0.6,
  ln: 2,
  sqrt: 4,
  asin: 0.3,
  acos: 0.3,
  atan: 0.6,
  sinh: 0.6,
  cosh: 0.6,
  tanh: 0.6,
  cot: 0.6,
  sec: 0.6,
  csc: 0.6,
  asinh: 0.6,
  acosh: 2,
  atanh: 0.3,
  coth: 0.6,
  sech: 0.6,
  csch: 0.6,
  acot: 0.6,
  asec: 2,
  acsc: 2,
  acoth: 2,
  asech: 0.5,
  acsch: 0.6,
  abs: 0.6,
  log10: 2,
  log2: 2,
  cbrt: 2,
  floor: 0.37,
  ceil: 0.37,
  round: 0.37,
  sign: 0.6,
  trunc: 0.37,
  expm1: 0.6,
  log1p: 0.6,
  sigmoid: 0.6,
  erf: 0.6,
  relu: 0.6,
};

test("FUNC_DERIVATIVE_RULES has exactly one entry per FuncName", () => {
  const declaredNames = new Set(FUNCTION_NAMES);
  const tableNames = Object.keys(FUNC_DERIVATIVE_RULES);
  assert.equal(tableNames.length, new Set(tableNames).size, "no duplicate keys");
  for (const name of tableNames) {
    assert.ok(declaredNames.has(name), `${name} should be a recognized function name`);
  }
});

for (const name of Object.keys(FUNC_DERIVATIVE_RULES) as FuncName[]) {
  test(`FUNC_DERIVATIVE_RULES.${name} matches a central-difference numerical derivative`, () => {
    const point = SAFE_POINT[name];
    const symbolic = Symbolic.evaluate(FUNC_DERIVATIVE_RULES[name](x, dxdx), { x: point }) as number;
    const h = 1e-5;
    const numeric = (evalFuncAt(name, point + h) - evalFuncAt(name, point - h)) / (2 * h);
    assert.ok(Math.abs(symbolic - numeric) < 1e-4, `${name}'(${point}): symbolic=${symbolic} numeric=${numeric}`);
  });
}

test("FUNC_DERIVATIVE_RULES applies the chain rule via the du parameter", () => {
  // d/dx sin(2x) = cos(2x) * 2, so passing du=2 should scale the result.
  const withDu2 = Symbolic.evaluate(FUNC_DERIVATIVE_RULES.sin(x, { type: "const", value: 2 }), { x: 0.6 });
  const withDu1 = Symbolic.evaluate(FUNC_DERIVATIVE_RULES.sin(x, dxdx), { x: 0.6 });
  assert.ok(Math.abs((withDu2 as number) - 2 * (withDu1 as number)) < 1e-9);
});

test("piecewise-constant functions (floor/ceil/round/sign/trunc) differentiate to 0 regardless of du", () => {
  for (const name of ["floor", "ceil", "round", "sign", "trunc"] as const) {
    const result = FUNC_DERIVATIVE_RULES[name](x, { type: "const", value: 42 });
    assert.deepEqual(result, { type: "const", value: 0 });
  }
});
