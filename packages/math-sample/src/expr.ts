import { type Expr, Symbolic } from "@johnhenry/math";
import type { Fn1 } from "./sample.ts";

export interface CompileOptions {
  /** The free variable that becomes the argument. Default `"x"`. */
  variable?: string;
  /** Fixed values for every other free variable (slider values, say). */
  params?: Record<string, number>;
  /**
   * Read juxtaposition as multiplication in source text (`2x`, `3sin(x)`, `(x+1)(x-1)`), the way people
   * type maths. Default `false`. Needs `@johnhenry/math` 0.1.0 or later; multi-letter variable names are
   * unavailable when it is on (see `ParseOptions` in `@johnhenry/math`). Ignored when `expr` is already a parsed `Expr`.
   */
  implicitMultiplication?: boolean;
}

/**
 * Compile an `@johnhenry/math` expression (source text or a parsed `Expr`)
 * into a plain `(x) => number` the samplers take. The AST is walked once; the
 * closure is cheap to call thousands of times. This is the only module that
 * needs `@johnhenry/math` (an optional peer dependency), so a Worker can
 * receive an expression string plus params, compile it here, and sample.
 *
 * Source text uses `@johnhenry/math`'s grammar: write `2*x`, or pass
 * `implicitMultiplication: true` to accept `2x`.
 */
export function compileExpression(expr: Expr | string, options: CompileOptions = {}): Fn1 {
  const variable = options.variable ?? "x";
  const tree =
    typeof expr === "string"
      ? Symbolic.parse(expr, { implicitMultiplication: options.implicitMultiplication === true })
      : expr;
  const compiled = Symbolic.compile(tree);
  const env: Record<string, number> = { ...options.params, [variable]: 0 };
  return (x) => {
    env[variable] = x;
    return compiled(env);
  };
}

/**
 * Taylor coefficients `a_k = f^(k)(x0) / k!` for `k = 0..order` of an expression, by symbolic
 * differentiation then evaluation. Feed them to `sampleTaylorPartialSums`. A derivative that is not finite
 * at `x0` yields `NaN` for that coefficient (and the sums are gaps).
 */
export function taylorCoefficients(
  expr: Expr | string,
  x0: number,
  order: number,
  options: { variable?: string; params?: Record<string, number> } = {},
): Float64Array {
  if (!Number.isInteger(order) || order < 0) throw new RangeError("order must be a non-negative integer");
  const variable = options.variable ?? "x";
  let term: Expr = typeof expr === "string" ? Symbolic.parse(expr) : expr;
  const out = new Float64Array(order + 1);
  let factorial = 1;
  for (let k = 0; k <= order; k++) {
    if (k > 0) factorial *= k;
    out[k] = Symbolic.evaluate(term, { ...options.params, [variable]: x0 }) / factorial;
    if (k < order) term = Symbolic.differentiate(term, variable);
  }
  return out;
}
