/**
 * Shader code generation for `Expr` trees: GLSL ES 3.0 and WGSL.
 *
 * Output is deterministic (no timestamps, ids or hash ordering): the same tree
 * and options always give the same strings, so callers can golden-test them
 * and cache compiled programs by source text.
 */
import type { Expr } from "./Symbolic.ts";

export type ShaderDialect = "glsl" | "wgsl";

export interface ShaderOptions {
  /**
   * `false` (default): every value is a scalar `float` / `f32`.
   * `true`: every value is a complex number held in a `vec2` (x = real,
   * y = imaginary); the variable `i` (unless listed in `variables`) is the
   * imaginary unit and the helper functions the expression needs are emitted once.
   */
  complex?: boolean;
  /**
   * Free variables the expression may mention; they are emitted as identifiers of the
   * same name and must be in scope where the expression is pasted. Default
   * `["x"]` (real) or `["z"]` (complex). A variable not listed is an error.
   */
  variables?: string[];
  /** When set, `source` is a complete function `name(<variables>)` wrapping the expression. */
  functionName?: string;
}

export interface ShaderResult {
  /** The expression text, e.g. `sin(x) * 2.0`. Paste it where a float (or vec2) is wanted. */
  expression: string;
  /** Helper function definitions the expression calls, in dependency order; empty when none are needed. */
  helpers: string;
  /** Complete source: `helpers` followed by the wrapping function when `functionName` was given, else `helpers` and nothing more. */
  source: string;
  /** The free variables actually used, sorted. */
  variables: string[];
}

export class ShaderUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShaderUnsupportedError";
  }
}

const RESERVED = new Set([
  // GLSL ES 3.0 keywords and common builtins a variable must not shadow
  "float",
  "int",
  "uint",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "mat2",
  "mat3",
  "mat4",
  "void",
  "if",
  "else",
  "for",
  "while",
  "do",
  "return",
  "break",
  "continue",
  "discard",
  "struct",
  "const",
  "in",
  "out",
  "inout",
  "uniform",
  "true",
  "false",
  "sin",
  "cos",
  "tan",
  "exp",
  "log",
  "sqrt",
  "pow",
  "abs",
  "min",
  "max",
  "mix",
  "step",
  "length",
  "main",
  "layout",
  // WGSL keywords
  "fn",
  "var",
  "let",
  "f32",
  "i32",
  "u32",
  "alias",
  "switch",
  "case",
  "default",
  "loop",
  "select",
  "array",
  "ptr",
  "vec2f",
]);

const LN10 = "2.302585092994046";

type Node = Expr;

interface Ctx {
  d: ShaderDialect;
  complex: boolean;
  vars: Set<string>;
  used: Set<string>;
  helpers: Set<string>;
}

function lit(v: number, c: Ctx): string {
  if (!Number.isFinite(v)) throw new ShaderUnsupportedError(`constant ${v} has no shader literal`);
  let s = String(v);
  if (!/[.e]/i.test(s)) s += ".0";
  else if (/^-?\d+e/i.test(s)) s = s.replace(/e/i, ".0e"); // 1e-7 -> 1.0e-7
  return c.d === "wgsl" ? s : s; // same float literal grammar in both
}

function vec2(a: string, b: string, c: Ctx): string {
  return c.d === "glsl" ? `vec2(${a}, ${b})` : `vec2<f32>(${a}, ${b})`;
}

function helper(c: Ctx, name: string): string {
  c.helpers.add(name);
  return `mx_${name}`;
}

function constValue(n: Node): number | undefined {
  if (n.type === "const") return n.value;
  if (n.type === "neg" && n.arg.type === "const") return -n.arg.value;
  return undefined;
}

function boolean(n: Node, c: Ctx): string {
  if (n.type === "cmp") {
    const op = { lt: "<", le: "<=", gt: ">", ge: ">=", eq: "==", ne: "!=" }[n.op];
    return `${emit(n.left, c)} ${op} ${emit(n.right, c)}`;
  }
  return `${emit(n, c)} != 0.0`;
}

function unsupported(what: string): never {
  throw new ShaderUnsupportedError(`${what} is not supported by the shader compiler`);
}

function emit(n: Node, c: Ctx): string {
  switch (n.type) {
    case "const":
      return c.complex ? vec2(lit(n.value, c), "0.0", c) : lit(n.value, c);
    case "var": {
      if (c.complex && n.name === "i" && !c.vars.has("i")) return vec2("0.0", "1.0", c);
      if (!c.vars.has(n.name)) throw new ShaderUnsupportedError(`variable "${n.name}" is not in the variables list`);
      c.used.add(n.name);
      return n.name;
    }
    case "neg":
      return `(-${emit(n.arg, c)})`;
    case "add":
      return `(${emit(n.left, c)} + ${emit(n.right, c)})`;
    case "sub":
      return `(${emit(n.left, c)} - ${emit(n.right, c)})`;
    case "mul":
      return c.complex
        ? `${helper(c, "cmul")}(${emit(n.left, c)}, ${emit(n.right, c)})`
        : `(${emit(n.left, c)} * ${emit(n.right, c)})`;
    case "div":
      return c.complex
        ? `${helper(c, "cdiv")}(${emit(n.left, c)}, ${emit(n.right, c)})`
        : `(${emit(n.left, c)} / ${emit(n.right, c)})`;
    case "pow":
      return c.complex ? powComplex(n.base, n.exp, c) : powReal(n.base, n.exp, c);
    case "func":
      return c.complex ? funcComplex(n.name, emit(n.arg, c), c) : funcReal(n.name, emit(n.arg, c), c);
    case "call2": {
      if (c.complex) unsupported(`${n.name} over complex numbers`);
      const a = emit(n.left, c);
      const b = emit(n.right, c);
      switch (n.name) {
        case "atan2":
          return c.d === "glsl" ? `atan(${a}, ${b})` : `atan2(${a}, ${b})`;
        case "hypot":
          return c.d === "glsl" ? `length(vec2(${a}, ${b}))` : `length(vec2<f32>(${a}, ${b}))`;
        case "min":
        case "max":
          return `${n.name}(${a}, ${b})`;
        default:
          return unsupported(`${n.name}`);
      }
    }
    case "cmp": {
      if (c.complex) unsupported("comparison over complex numbers");
      const t = boolean(n, c);
      return c.d === "glsl" ? `(${t} ? 1.0 : 0.0)` : `select(0.0, 1.0, ${t})`;
    }
    case "piecewise": {
      if (c.complex) unsupported("piecewise over complex numbers");
      let out = emit(n.otherwise, c);
      for (let k = n.branches.length - 1; k >= 0; k--) {
        const br = n.branches[k] as { cond: Node; expr: Node };
        const cond = boolean(br.cond, c);
        const e = emit(br.expr, c);
        out = c.d === "glsl" ? `(${cond} ? ${e} : ${out})` : `select(${out}, ${e}, ${cond})`;
      }
      return out;
    }
    case "sum":
      return unsupported("sum");
    case "product":
      return unsupported("product");
  }
}

function powReal(base: Node, exp: Node, c: Ctx): string {
  const b = emit(base, c);
  const k0 = constValue(exp);
  if (k0 !== undefined && Number.isInteger(k0) && Math.abs(k0) <= 4) {
    const k = k0;
    if (k === 0) return "1.0";
    if (k === 1) return b;
    const prod = Array.from({ length: Math.abs(k) }, () => b).join(" * ");
    return k > 0 ? `(${prod})` : `(1.0 / (${prod}))`;
  }
  if (k0 !== undefined && Number.isInteger(k0)) {
    // pow() of a negative base is undefined in GLSL: split sign and magnitude for integer powers.
    const k = k0;
    const odd = Math.abs(k) % 2 === 1;
    const mag = `pow(abs(${b}), ${lit(k, c)})`;
    return odd ? `(sign(${b}) * ${mag})` : mag;
  }
  return `pow(${b}, ${emit(exp, c)})`;
}

function funcReal(name: string, a: string, c: Ctx): string {
  const g = c.d === "glsl";
  switch (name) {
    case "sin":
    case "cos":
    case "tan":
    case "exp":
    case "sqrt":
    case "asin":
    case "acos":
    case "atan":
    case "sinh":
    case "cosh":
    case "tanh":
    case "asinh":
    case "acosh":
    case "atanh":
    case "abs":
    case "sign":
    case "floor":
    case "ceil":
    case "round":
    case "trunc":
    case "log2":
      return `${name}(${a})`;
    case "ln":
      return `log(${a})`;
    case "log10":
      return `(log(${a}) / ${LN10})`;
    case "cot":
      return `(1.0 / tan(${a}))`;
    case "sec":
      return `(1.0 / cos(${a}))`;
    case "csc":
      return `(1.0 / sin(${a}))`;
    case "coth":
      return `(1.0 / tanh(${a}))`;
    case "sech":
      return `(1.0 / cosh(${a}))`;
    case "csch":
      return `(1.0 / sinh(${a}))`;
    case "acot":
      return `atan(1.0 / ${a})`;
    case "asec":
      return `acos(1.0 / ${a})`;
    case "acsc":
      return `asin(1.0 / ${a})`;
    case "acoth":
      return `atanh(1.0 / ${a})`;
    case "asech":
      return `acosh(1.0 / ${a})`;
    case "acsch":
      return `asinh(1.0 / ${a})`;
    case "cbrt":
      return `(sign(${a}) * pow(abs(${a}), 0.3333333333333333))`;
    case "expm1":
      return `(exp(${a}) - 1.0)`;
    case "log1p":
      return `log(1.0 + ${a})`;
    case "sigmoid":
      return `(1.0 / (1.0 + exp(-${a})))`;
    case "relu":
      return g ? `max(${a}, 0.0)` : `max(${a}, 0.0)`;
    default:
      return unsupported(`function ${name}`);
  }
}

function powComplex(base: Node, exp: Node, c: Ctx): string {
  const b = emit(base, c);
  const k = constValue(exp);
  if (k !== undefined && Number.isInteger(k) && Math.abs(k) <= 64) {
    return `${helper(c, "cpowi")}(${b}, ${k})`;
  }
  return `${helper(c, "cpow")}(${b}, ${emit(exp, c)})`;
}

function funcComplex(name: string, a: string, c: Ctx): string {
  switch (name) {
    case "exp":
    case "ln":
    case "sqrt":
    case "sin":
    case "cos":
    case "tan":
    case "sinh":
    case "cosh":
    case "tanh":
    case "abs":
      return `${helper(c, `c${name}`)}(${a})`;
    default:
      return unsupported(`function ${name} over complex numbers`);
  }
}

/** Helper bodies per dialect. Dependencies listed in HELPER_DEPS; emitted in HELPER_ORDER. */
const HELPER_ORDER = [
  "cmul",
  "cdiv",
  "cexp",
  "cln",
  "cpow",
  "cpowi",
  "csqrt",
  "csin",
  "ccos",
  "ctan",
  "csinh",
  "ccosh",
  "ctanh",
  "cabs",
];
const HELPER_DEPS: Record<string, string[]> = {
  cpow: ["cmul", "cexp", "cln"],
  cpowi: ["cmul", "cdiv"],
  ctan: ["cdiv", "csin", "ccos"],
  ctanh: ["cdiv", "csinh", "ccosh"],
};

function helperSource(name: string, d: ShaderDialect): string {
  const V = d === "glsl" ? "vec2" : "vec2<f32>";
  const fn = (n: string, params: string, body: string) =>
    d === "glsl"
      ? `${V} mx_${n}(${params.replace(/(\w+): vec2|(\w+): int/g, (_m, a, b) => (a ? `vec2 ${a}` : `int ${b}`))}) {\n${body}\n}`
      : `fn mx_${n}(${params.replace(/: vec2/g, ": vec2<f32>")}) -> ${V} {\n${body}\n}`;
  const dec = (t: string, n: string, e: string) =>
    d === "glsl" ? `  ${t} ${n} = ${e};` : `  let ${n}: ${t === "float" ? "f32" : t} = ${e};`;
  const ret = (e: string) => `  return ${e};`;
  const v = (a: string, b: string) => `${V}(${a}, ${b})`;
  switch (name) {
    case "cmul":
      return fn("cmul", "a: vec2, b: vec2", ret(v("a.x * b.x - a.y * b.y", "a.x * b.y + a.y * b.x")));
    case "cdiv":
      return fn(
        "cdiv",
        "a: vec2, b: vec2",
        [
          dec("float", "m", "b.x * b.x + b.y * b.y"),
          ret(v("(a.x * b.x + a.y * b.y) / m", "(a.y * b.x - a.x * b.y) / m")),
        ].join("\n"),
      );
    case "cexp":
      return fn("cexp", "z: vec2", ret(`exp(z.x) * ${v("cos(z.y)", "sin(z.y)")}`));
    case "cln":
      return fn(
        "cln",
        "z: vec2",
        ret(v(d === "glsl" ? "log(length(z))" : "log(length(z))", d === "glsl" ? "atan(z.y, z.x)" : "atan2(z.y, z.x)")),
      );
    case "cpow":
      return fn("cpow", "a: vec2, b: vec2", ret("mx_cexp(mx_cmul(b, mx_cln(a)))"));
    case "cpowi": {
      // exponentiation by squaring, bounded loop (|n| <= 64)
      if (d === "glsl")
        return `vec2 mx_cpowi(vec2 z, int n) {\n  int k = n < 0 ? -n : n;\n  vec2 r = vec2(1.0, 0.0);\n  vec2 s = z;\n  for (int j = 0; j < 7; j++) {\n    if ((k & 1) == 1) r = mx_cmul(r, s);\n    s = mx_cmul(s, s);\n    k = k >> 1;\n  }\n  return n < 0 ? mx_cdiv(vec2(1.0, 0.0), r) : r;\n}`;
      return `fn mx_cpowi(z: vec2<f32>, n: i32) -> vec2<f32> {\n  var k: i32 = abs(n);\n  var r: vec2<f32> = vec2<f32>(1.0, 0.0);\n  var s: vec2<f32> = z;\n  for (var j: i32 = 0; j < 7; j = j + 1) {\n    if ((k & 1) == 1) { r = mx_cmul(r, s); }\n    s = mx_cmul(s, s);\n    k = k >> 1u;\n  }\n  if (n < 0) { return mx_cdiv(vec2<f32>(1.0, 0.0), r); }\n  return r;\n}`;
    }
    case "csqrt":
      return fn(
        "csqrt",
        "z: vec2",
        [
          dec("float", "r", "length(z)"),
          ret(
            v(
              "sqrt(max(0.5 * (r + z.x), 0.0))",
              d === "glsl"
                ? "(z.y < 0.0 ? -1.0 : 1.0) * sqrt(max(0.5 * (r - z.x), 0.0))"
                : "select(1.0, -1.0, z.y < 0.0) * sqrt(max(0.5 * (r - z.x), 0.0))",
            ),
          ),
        ].join("\n"),
      );
    case "csin":
      return fn("csin", "z: vec2", ret(v("sin(z.x) * cosh(z.y)", "cos(z.x) * sinh(z.y)")));
    case "ccos":
      return fn("ccos", "z: vec2", ret(v("cos(z.x) * cosh(z.y)", "-sin(z.x) * sinh(z.y)")));
    case "ctan":
      return fn("ctan", "z: vec2", ret("mx_cdiv(mx_csin(z), mx_ccos(z))"));
    case "csinh":
      return fn("csinh", "z: vec2", ret(v("sinh(z.x) * cos(z.y)", "cosh(z.x) * sin(z.y)")));
    case "ccosh":
      return fn("ccosh", "z: vec2", ret(v("cosh(z.x) * cos(z.y)", "sinh(z.x) * sin(z.y)")));
    case "ctanh":
      return fn("ctanh", "z: vec2", ret("mx_cdiv(mx_csinh(z), mx_ccosh(z))"));
    case "cabs":
      return fn("cabs", "z: vec2", ret(v("length(z)", "0.0")));
    default:
      throw new Error(`unknown helper ${name}`);
  }
}

export function compileShader(expr: Expr, dialect: ShaderDialect, options: ShaderOptions = {}): ShaderResult {
  const complex = options.complex === true;
  const variables = options.variables ?? [complex ? "z" : "x"];
  for (const v of variables) {
    if (
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(v) ||
      RESERVED.has(v) ||
      v.includes("__") ||
      v.startsWith("mx_") ||
      v.startsWith("gl_")
    )
      throw new ShaderUnsupportedError(`variable name "${v}" is not a safe shader identifier`);
  }
  if (options.functionName !== undefined && !/^[A-Za-z][A-Za-z0-9_]*$/.test(options.functionName))
    throw new ShaderUnsupportedError(`function name "${options.functionName}" is not a valid identifier`);
  const ctx: Ctx = { d: dialect, complex, vars: new Set(variables), used: new Set(), helpers: new Set() };
  const expression = emit(expr, ctx);
  // close over dependencies
  const need = new Set(ctx.helpers);
  for (let grew = true; grew; ) {
    grew = false;
    for (const h of [...need]) {
      for (const dep of HELPER_DEPS[h] ?? []) {
        if (!need.has(dep)) {
          need.add(dep);
          grew = true;
        }
      }
    }
  }
  const helpers = HELPER_ORDER.filter((h) => need.has(h))
    .map((h) => helperSource(h, dialect))
    .join("\n\n");
  let source = helpers;
  if (options.functionName !== undefined) {
    const T = complex ? (dialect === "glsl" ? "vec2" : "vec2<f32>") : dialect === "glsl" ? "float" : "f32";
    const params = variables.map((v) => (dialect === "glsl" ? `${T} ${v}` : `${v}: ${T}`)).join(", ");
    const fnText =
      dialect === "glsl"
        ? `${T} ${options.functionName}(${params}) {\n  return ${expression};\n}`
        : `fn ${options.functionName}(${params}) -> ${T} {\n  return ${expression};\n}`;
    source = helpers ? `${helpers}\n\n${fnText}` : fnText;
  }
  return { expression, helpers, source, variables: [...ctx.used].sort() };
}
