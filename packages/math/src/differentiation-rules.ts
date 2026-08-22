/**
 * Data-driven derivative rules for single-argument elementary functions --
 * the `func` `Expr` variant (`sin`, `exp`, `asinh`, etc.). This is the
 * "declarative rewrite-rule table" from the Woxi-study design note
 * (github.com/johnhenry/math#15): each `FuncName` maps to a pure function
 * from (the function's argument `u`, its already-differentiated form `du`)
 * to d/dx[f(u)]. The chain-rule wrapping itself (computing `du` and
 * dispatching on `e.name`) stays in Symbolic.ts, since that's structural
 * recursion over the `Expr` union, not a per-function identity.
 *
 * Keeping this as a `Record<FuncName, ...>` rather than a `switch` means:
 * adding/fixing one function's derivative touches one line here, not the
 * differentiation engine; TypeScript enforces every `FuncName` has an entry
 * (no `throw new Error("Unhandled function")` needed); and each rule is
 * independently unit-testable (see differentiation-rules.test.ts).
 */
import type { Expr, FuncName } from "./Symbolic.ts";

const num = (value: number): Expr => ({ type: "const", value });
const add = (left: Expr, right: Expr): Expr => ({ type: "add", left, right });
const sub = (left: Expr, right: Expr): Expr => ({ type: "sub", left, right });
const mul = (left: Expr, right: Expr): Expr => ({ type: "mul", left, right });
const div = (left: Expr, right: Expr): Expr => ({ type: "div", left, right });
const pow = (base: Expr, exp: Expr): Expr => ({ type: "pow", base, exp });
const neg = (arg: Expr): Expr => ({ type: "neg", arg });
const fn = (name: FuncName, arg: Expr): Expr => ({ type: "func", name, arg });

/** d/dx[f(u)] given `u` and `du` (= du/dx, already computed by the caller). */
export type FuncDerivativeRule = (u: Expr, du: Expr) => Expr;

export const FUNC_DERIVATIVE_RULES: Record<FuncName, FuncDerivativeRule> = {
  sin: (u, du) => mul(fn("cos", u), du),
  cos: (u, du) => neg(mul(fn("sin", u), du)),
  tan: (u, du) => div(du, pow(fn("cos", u), num(2))),
  exp: (u, du) => mul(fn("exp", u), du),
  ln: (u, du) => div(du, u),
  sqrt: (u, du) => div(du, mul(num(2), fn("sqrt", u))),
  asin: (u, du) => div(du, fn("sqrt", sub(num(1), pow(u, num(2))))),
  acos: (u, du) => neg(div(du, fn("sqrt", sub(num(1), pow(u, num(2)))))),
  atan: (u, du) => div(du, add(num(1), pow(u, num(2)))),
  sinh: (u, du) => mul(fn("cosh", u), du),
  cosh: (u, du) => mul(fn("sinh", u), du),
  tanh: (u, du) => div(du, pow(fn("cosh", u), num(2))),
  cot: (u, du) => neg(mul(pow(fn("csc", u), num(2)), du)),
  sec: (u, du) => mul(mul(fn("sec", u), fn("tan", u)), du),
  csc: (u, du) => neg(mul(mul(fn("csc", u), fn("cot", u)), du)),
  asinh: (u, du) => div(du, fn("sqrt", add(pow(u, num(2)), num(1)))),
  acosh: (u, du) => div(du, fn("sqrt", sub(pow(u, num(2)), num(1)))),
  atanh: (u, du) => div(du, sub(num(1), pow(u, num(2)))),
  coth: (u, du) => neg(mul(pow(fn("csch", u), num(2)), du)),
  sech: (u, du) => neg(mul(mul(fn("sech", u), fn("tanh", u)), du)),
  csch: (u, du) => neg(mul(mul(fn("csch", u), fn("coth", u)), du)),
  acot: (u, du) => neg(div(du, add(num(1), pow(u, num(2))))),
  asec: (u, du) => div(du, mul(fn("abs", u), fn("sqrt", sub(pow(u, num(2)), num(1))))),
  acsc: (u, du) => neg(div(du, mul(fn("abs", u), fn("sqrt", sub(pow(u, num(2)), num(1)))))),
  acoth: (u, du) => div(du, sub(num(1), pow(u, num(2)))),
  asech: (u, du) => neg(div(du, mul(u, fn("sqrt", sub(num(1), pow(u, num(2))))))),
  acsch: (u, du) => neg(div(du, mul(fn("abs", u), fn("sqrt", add(num(1), pow(u, num(2))))))),
  abs: (u, du) => mul(fn("sign", u), du),
  log10: (u, du) => div(du, mul(u, fn("ln", num(10)))),
  log2: (u, du) => div(du, mul(u, fn("ln", num(2)))),
  cbrt: (u, du) => div(du, mul(num(3), pow(fn("cbrt", u), num(2)))),
  floor: () => num(0),
  ceil: () => num(0),
  round: () => num(0),
  sign: () => num(0),
  trunc: () => num(0),
  expm1: (u, du) => mul(fn("exp", u), du),
  log1p: (u, du) => div(du, add(num(1), u)),
  sigmoid: (u, du) => mul(mul(fn("sigmoid", u), sub(num(1), fn("sigmoid", u))), du),
  erf: (u, du) => mul(mul(div(num(2), fn("sqrt", num(Math.PI))), fn("exp", neg(pow(u, num(2))))), du),
  relu: (u, du) => mul(div(add(num(1), fn("sign", u)), num(2)), du),
};
