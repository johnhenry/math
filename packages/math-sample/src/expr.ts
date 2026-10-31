import { type Expr, Symbolic } from "@johnhenry/math";
import type { Fn1 } from "./sample.ts";

export interface CompileOptions {
  /** The free variable that becomes the argument. Default `"x"`. */
  variable?: string;
  /** Fixed values for every other free variable (slider values, say). */
  params?: Record<string, number>;
}

/**
 * Compile an `@johnhenry/math` expression (source text or a parsed `Expr`)
 * into a plain `(x) => number` the samplers take. The AST is walked once; the
 * closure is cheap to call thousands of times. This is the only module that
 * needs `@johnhenry/math` (an optional peer dependency), so a Worker can
 * receive an expression string plus params, compile it here, and sample.
 *
 * Source text uses `@johnhenry/math`'s grammar: write `2*x`, not `2x`
 * (implicit multiplication is not supported in the released parser).
 */
export function compileExpression(expr: Expr | string, options: CompileOptions = {}): Fn1 {
  const variable = options.variable ?? "x";
  const compiled = Symbolic.compile(expr);
  const env: Record<string, number> = { ...options.params, [variable]: 0 };
  return (x) => {
    env[variable] = x;
    return compiled(env);
  };
}
