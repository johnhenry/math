import assert from "node:assert/strict";
import { test } from "node:test";
import { ShaderUnsupportedError } from "../src/Shader.ts";
import { Symbolic } from "../src/Symbolic.ts";

const glsl = (s: string, o = {}) => Symbolic.toGLSL(s, o);

test("toGLSL real: golden expressions", () => {
  assert.equal(glsl("sin(x) * 2 + 1").expression, "((sin(x) * 2.0) + 1.0)");
  assert.equal(glsl("x^2").expression, "(x * x)");
  assert.equal(glsl("x^-1").expression, "(1.0 / (x))");
  assert.equal(glsl("x^3").expression, "(x * x * x)");
  assert.equal(glsl("x^7").expression, "(sign(x) * pow(abs(x), 7.0))");
  assert.equal(glsl("x^0.5").expression, "pow(x, 0.5)");
  assert.equal(glsl("ln(x) + log10(x)").expression, "(log(x) + (log(x) / 2.302585092994046))");
  assert.equal(glsl("atan2(x, 2)").expression, "atan(x, 2.0)");
  assert.equal(glsl("1e-7 * x").expression, "(1.0e-7 * x)");
  assert.equal(glsl("x > 1").expression, "(x > 1.0 ? 1.0 : 0.0)");
  assert.equal(glsl("piecewise(x < 0, -x, x)").expression, "(x < 0.0 ? (-x) : x)");
  assert.equal(glsl("hypot(x, 3)").expression, "length(vec2(x, 3.0))");
});

test("toGLSL: deterministic and reports used variables", () => {
  const a = glsl("x*y + sin(y)", { variables: ["x", "y"] });
  const b = glsl("x*y + sin(y)", { variables: ["x", "y"] });
  assert.deepEqual(a, b);
  assert.deepEqual(a.variables, ["x", "y"]);
  assert.equal(a.helpers, "");
});

test("toGLSL: functionName wraps the expression", () => {
  const r = glsl("x^2", { functionName: "f" });
  assert.equal(r.source, "float f(float x) {\n  return (x * x);\n}");
});

test("toGLSL complex: helpers emitted once, in dependency order", () => {
  const r = glsl("z^2 + 1/z + z^2", { complex: true });
  assert.equal(r.expression, "((mx_cpowi(z, 2) + mx_cdiv(vec2(1.0, 0.0), z)) + mx_cpowi(z, 2))");
  const names = [...r.helpers.matchAll(/vec2 (mx_\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(names, ["mx_cmul", "mx_cdiv", "mx_cpowi"]);
  assert.equal(r.helpers.match(/mx_cmul\(vec2 a/g)?.length, 1);
});

test("toGLSL complex: i is the imaginary unit unless declared", () => {
  assert.equal(glsl("i*z", { complex: true }).expression, "mx_cmul(vec2(0.0, 1.0), z)");
  assert.equal(glsl("i*z", { complex: true, variables: ["i", "z"] }).expression, "mx_cmul(i, z)");
});

test("toGLSL complex: transcendental helpers pull in their dependencies", () => {
  const r = glsl("tan(z) + z^(1/2) + z^w", { complex: true, variables: ["z", "w"] });
  for (const n of ["mx_cmul", "mx_cdiv", "mx_csin", "mx_ccos", "mx_ctan", "mx_cexp", "mx_cln", "mx_cpow"])
    assert.ok(r.helpers.includes(`vec2 ${n}(`), n);
  assert.ok(r.helpers.indexOf("mx_cdiv(") < r.helpers.indexOf("mx_ctan("));
});

test("toGLSL complex: golden helper text", () => {
  assert.equal(
    glsl("exp(z)", { complex: true }).helpers,
    "vec2 mx_cexp(vec2 z) {\n  return exp(z.x) * vec2(cos(z.y), sin(z.y));\n}",
  );
});

test("toGLSL refuses unsupported nodes clearly", () => {
  assert.throws(() => glsl("erf(x)"), ShaderUnsupportedError);
  assert.throws(() => glsl("gcd(x, 3)"), /gcd/);
  assert.throws(() => glsl("x + w"), /variable "w"/);
  assert.throws(() => glsl("sum(k, 1, 3, k)"), /sum/);
  assert.throws(() => glsl("floor(z)", { complex: true }), /over complex/);
  assert.throws(() => glsl("x > 1", { complex: true }), /comparison/);
  assert.throws(() => glsl("x", { variables: ["gl_x"] }), /identifier/);
  assert.throws(() => glsl("x", { variables: ["float"] }), /identifier/);
  assert.throws(() => Symbolic.toGLSL({ type: "const", value: Infinity }), /literal/);
});

test("toWGSL: golden expressions and function", () => {
  assert.equal(Symbolic.toWGSL("atan2(x, 2)").expression, "atan2(x, 2.0)");
  assert.equal(Symbolic.toWGSL("x > 1").expression, "select(0.0, 1.0, x > 1.0)");
  assert.equal(
    Symbolic.toWGSL("z^2", { complex: true, functionName: "g" }).source,
    [
      "fn mx_cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {",
      "  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);",
      "}",
      "",
      "fn mx_cdiv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {",
      "  let m: f32 = b.x * b.x + b.y * b.y;",
      "  return vec2<f32>((a.x * b.x + a.y * b.y) / m, (a.y * b.x - a.x * b.y) / m);",
      "}",
      "",
      "fn mx_cpowi(z: vec2<f32>, n: i32) -> vec2<f32> {",
      "  var k: i32 = abs(n);",
      "  var r: vec2<f32> = vec2<f32>(1.0, 0.0);",
      "  var s: vec2<f32> = z;",
      "  for (var j: i32 = 0; j < 7; j = j + 1) {",
      "    if ((k & 1) == 1) { r = mx_cmul(r, s); }",
      "    s = mx_cmul(s, s);",
      "    k = k >> 1u;",
      "  }",
      "  if (n < 0) { return mx_cdiv(vec2<f32>(1.0, 0.0), r); }",
      "  return r;",
      "}",
      "",
      "fn g(z: vec2<f32>) -> vec2<f32> {",
      "  return mx_cpowi(z, 2);",
      "}",
    ].join("\n"),
  );
});

test("toGLSL: float literals are valid GLSL (always a point or exponent)", () => {
  for (const v of ["3", "0.5", "1e21", "1e-7", "123456789"]) {
    const e = glsl(v).expression;
    assert.match(e, /^-?\d+(\.\d+)?(\.0)?(e[+-]?\d+)?$|^\d+\.\d*e/i, e);
    assert.ok(/[.e]/i.test(e), e);
  }
});

test("toGLSL: negative literals are parenthesised (no '--')", () => {
  const e = Symbolic.toGLSL({ type: "neg", arg: { type: "const", value: -2 } }).expression;
  assert.ok(!e.includes("--"), e);
  assert.equal(e, "(-(-2.0))");
  assert.ok(!Symbolic.toGLSL("x - -2").expression.includes("--"));
  assert.ok(!Symbolic.toWGSL({ type: "neg", arg: { type: "const", value: -2 } }).expression.includes("--"));
});

test("toGLSL: cmp.op is validated by own property", () => {
  const bad = {
    type: "cmp",
    op: "toString",
    left: { type: "var", name: "x" },
    right: { type: "const", value: 1 },
  } as never;
  assert.throws(() => Symbolic.toGLSL(bad), ShaderUnsupportedError);
  assert.throws(() => Symbolic.toWGSL(bad), ShaderUnsupportedError);
  assert.throws(() => Symbolic.toGLSL({ ...(bad as object), op: "__proto__" } as never), ShaderUnsupportedError);
});

test("toGLSL: reserved words and builtins are refused as variable and function names", () => {
  for (const w of [
    "input",
    "output",
    "precision",
    "sampler2D",
    "texture",
    "half",
    "floor",
    "target",
    "type",
    "override",
    "main",
    "mx_cmul",
    "gl_Position",
    "highp",
    "buffer",
    "common",
    "fixed",
    "smooth",
    "flat",
    "noperspective",
    "mod",
    "dot",
    "fract",
    "let",
    "struct",
    "enum",
    "var",
    "const",
  ]) {
    assert.throws(() => glsl("x", { variables: [w] }), ShaderUnsupportedError, w);
    assert.throws(() => glsl("x", { functionName: w }), ShaderUnsupportedError, `fn ${w}`);
    assert.throws(() => Symbolic.toWGSL("x", { variables: [w] }), ShaderUnsupportedError, `wgsl ${w}`);
  }
  assert.doesNotThrow(() => glsl("t", { variables: ["t"], functionName: "domainColor" }));
});
