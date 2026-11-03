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

type Jet = Float64Array;

class JetUnsupported extends Error {}

function jmul(a: Jet, b: Jet): Jet {
  const n = a.length;
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ai = a[i] as number;
    if (ai === 0) continue;
    for (let j = 0; i + j < n; j++) c[i + j] = (c[i + j] as number) + ai * (b[j] as number);
  }
  return c;
}

function jdiv(a: Jet, b: Jet): Jet {
  const n = a.length;
  const c = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let acc = a[k] as number;
    for (let j = 1; j <= k; j++) acc -= (b[j] as number) * (c[k - j] as number);
    c[k] = acc / (b[0] as number);
  }
  return c;
}

const jconst = (v: number, n: number): Jet => {
  const j = new Float64Array(n);
  j[0] = v;
  return j;
};

function jexp(a: Jet): Jet {
  const n = a.length;
  const e = new Float64Array(n);
  e[0] = Math.exp(a[0] as number);
  for (let k = 1; k < n; k++) {
    let acc = 0;
    for (let j = 1; j <= k; j++) acc += j * (a[j] as number) * (e[k - j] as number);
    e[k] = acc / k;
  }
  return e;
}

function jln(a: Jet): Jet {
  const n = a.length;
  const l = new Float64Array(n);
  l[0] = Math.log(a[0] as number);
  for (let k = 1; k < n; k++) {
    let acc = 0;
    for (let j = 1; j < k; j++) acc += j * (l[j] as number) * (a[k - j] as number);
    l[k] = ((a[k] as number) - acc / k) / (a[0] as number);
  }
  return l;
}

/** sin/cos (hyperbolic = true for sinh/cosh) of a jet, together. */
function jsincos(a: Jet, hyperbolic: boolean): [Jet, Jet] {
  const n = a.length;
  const s = new Float64Array(n);
  const c = new Float64Array(n);
  s[0] = hyperbolic ? Math.sinh(a[0] as number) : Math.sin(a[0] as number);
  c[0] = hyperbolic ? Math.cosh(a[0] as number) : Math.cos(a[0] as number);
  for (let k = 1; k < n; k++) {
    let ss = 0;
    let cc = 0;
    for (let j = 1; j <= k; j++) {
      ss += j * (a[j] as number) * (c[k - j] as number);
      cc += j * (a[j] as number) * (s[k - j] as number);
    }
    s[k] = ss / k;
    c[k] = (hyperbolic ? cc : -cc) / k;
  }
  return [s, c];
}

function jpowReal(a: Jet, p: number): Jet {
  const n = a.length;
  const f = new Float64Array(n);
  const a0 = a[0] as number;
  f[0] = a0 ** p;
  for (let k = 1; k < n; k++) {
    let acc = 0;
    for (let j = 1; j <= k; j++) acc += (p * j - (k - j)) * (a[j] as number) * (f[k - j] as number);
    f[k] = acc / (k * a0);
  }
  return f;
}

function jpowInt(a: Jet, m: number): Jet {
  let r = jconst(1, a.length);
  let base = a;
  let e = Math.abs(m);
  while (e > 0) {
    if (e & 1) r = jmul(r, base);
    base = jmul(base, base);
    e = Math.floor(e / 2);
  }
  return m < 0 ? jdiv(jconst(1, a.length), r) : r;
}

/** Integrate a jet's derivative: given g = f', return f with f(0) = f0. */
function jantiderivative(g: Jet, f0: number): Jet {
  const n = g.length;
  const f = new Float64Array(n);
  f[0] = f0;
  for (let k = 1; k < n; k++) f[k] = (g[k - 1] as number) / k;
  return f;
}

function jderivative(a: Jet): Jet {
  const n = a.length;
  const d = new Float64Array(n);
  for (let k = 0; k + 1 < n; k++) d[k] = (k + 1) * (a[k + 1] as number);
  return d;
}

function jfunc(name: string, a: Jet): Jet {
  const n = a.length;
  const one = jconst(1, n);
  switch (name) {
    case "exp":
      return jexp(a);
    case "ln":
      return jln(a);
    case "sqrt":
      return jpowReal(a, 0.5);
    case "cbrt":
      return jpowReal(a, 1 / 3);
    case "sin":
      return jsincos(a, false)[0];
    case "cos":
      return jsincos(a, false)[1];
    case "tan": {
      const [s, c] = jsincos(a, false);
      return jdiv(s, c);
    }
    case "sinh":
      return jsincos(a, true)[0];
    case "cosh":
      return jsincos(a, true)[1];
    case "tanh": {
      const [s, c] = jsincos(a, true);
      return jdiv(s, c);
    }
    case "atan": {
      const d = jdiv(jderivative(a), jplus(one, jmul(a, a), 1));
      return jantiderivative(d, Math.atan(a[0] as number));
    }
    case "asin":
    case "acos": {
      const inv = jpowReal(jplus(one, jmul(a, a), -1), -0.5);
      const d = jmul(jderivative(a), inv);
      return name === "asin"
        ? jantiderivative(d, Math.asin(a[0] as number))
        : jantiderivative(d.map((v) => -v) as Jet, Math.acos(a[0] as number));
    }
    default:
      throw new JetUnsupported(name);
  }
}

function jplus(a: Jet, b: Jet, sign: 1 | -1): Jet {
  const c = new Float64Array(a.length);
  for (let k = 0; k < a.length; k++) c[k] = (a[k] as number) + sign * (b[k] as number);
  return c;
}

function evalJet(e: Expr, variable: string, x0: number, params: Record<string, number>, n: number): Jet {
  const go = (t: Expr): Jet => {
    switch (t.type) {
      case "const":
        return jconst(t.value, n);
      case "var": {
        if (t.name === variable) {
          const j = jconst(x0, n);
          if (n > 1) j[1] = 1;
          return j;
        }
        return jconst(params[t.name] ?? Number.NaN, n);
      }
      case "neg":
        return go(t.arg).map((v) => -v) as Jet;
      case "add":
        return jplus(go(t.left), go(t.right), 1);
      case "sub":
        return jplus(go(t.left), go(t.right), -1);
      case "mul":
        return jmul(go(t.left), go(t.right));
      case "div":
        return jdiv(go(t.left), go(t.right));
      case "func":
        return jfunc(t.name, go(t.arg));
      case "pow": {
        const b = go(t.base);
        const ex = go(t.exp);
        const constExp = ex.every((v, k) => k === 0 || v === 0);
        if (constExp) {
          const p = ex[0] as number;
          if (Number.isInteger(p) && Math.abs(p) <= 256) return jpowInt(b, p);
          return jpowReal(b, p);
        }
        return jexp(jmul(ex, jln(b)));
      }
      default:
        throw new JetUnsupported(t.type);
    }
  };
  return go(e);
}

/**
 * Taylor coefficients `a_k = f^(k)(x0) / k!` for `k = 0..order` of an expression. They are computed by truncated
 * power-series ("jet") arithmetic, O(order^2) per node, so order 12 of `sin(x)*exp(x)/(1+x^2)` takes well under a
 * millisecond. Supported: `+ - * /`, powers (integer or real exponent, or a variable exponent), and `exp ln sqrt cbrt sin
 * cos tan sinh cosh tanh atan asin acos`. Any other node falls back to repeated symbolic differentiation with
 * simplification after every derivative, which grows quickly: keep `order` at or below 8 there. A coefficient that is
 * not finite at `x0` (a pole, `ln(0)`) is `NaN` or `Infinity`, and the partial sums built on it are gaps.
 */
export function taylorCoefficients(
  expr: Expr | string,
  x0: number,
  order: number,
  options: { variable?: string; params?: Record<string, number> } = {},
): Float64Array {
  if (!Number.isInteger(order) || order < 0) throw new RangeError("order must be a non-negative integer");
  const variable = options.variable ?? "x";
  const tree: Expr = typeof expr === "string" ? Symbolic.parse(expr) : expr;
  try {
    return evalJet(tree, variable, x0, options.params ?? {}, order + 1);
  } catch (err) {
    if (!(err instanceof JetUnsupported)) throw err;
  }
  let term: Expr = tree;
  const out = new Float64Array(order + 1);
  let factorial = 1;
  for (let k = 0; k <= order; k++) {
    if (k > 0) factorial *= k;
    out[k] = Symbolic.evaluate(term, { ...options.params, [variable]: x0 }) / factorial;
    if (k < order) term = Symbolic.simplify(Symbolic.differentiate(term, variable));
  }
  return out;
}
