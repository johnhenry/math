/**
 * SymPy differential oracle for Symbolic (issue #14) — math-plus's proven
 * subprocess-oracle pattern (numpy_oracle.py / scipy_oracle.py) applied to
 * this repo's own CAS. SymPy rebuilds mallory's Expr AST independently
 * (scripts/sympy_oracle.py), so agreement is two implementations agreeing,
 * not one implementation agreeing with itself.
 *
 * Comparison principles (from the issue, both Woxi-thread caveats encoded):
 * - Compare PROPERTIES, not incidental forms: antiderivatives modulo an
 *   additive constant (pointwise difference must be CONSTANT, not zero),
 *   solution sets modulo ordering, simplification by numeric equivalence.
 * - The reference isn't gospel: a disagreement is a finding to triage, not
 *   automatically a mallory bug — failures print both sides for exactly
 *   that reason.
 *
 * Oracle resolution: $MALLORY_SYMPY_ORACLE_PYTHON, else `python3` on PATH;
 * skip-don't-fail when no python with sympy is importable. On NixOS:
 *   nix-shell -p "python3.withPackages(ps: [ps.sympy])" --run "which python3"
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { type Expr, Symbolic } from "../src/index.ts";

const HERE = new URL(".", import.meta.url).pathname;
const ORACLE = join(HERE, "../scripts/sympy_oracle.py");

const PYTHON = process.env.MALLORY_SYMPY_ORACLE_PYTHON ?? "python3";
let SKIP_REASON: string | undefined;
try {
  execFileSync(PYTHON, ["-c", "import sympy"], { stdio: "ignore" });
} catch {
  SKIP_REASON =
    `no python with sympy (tried ${JSON.stringify(PYTHON)}) — set $MALLORY_SYMPY_ORACLE_PYTHON; ` +
    `on NixOS: nix-shell -p "python3.withPackages(ps: [ps.sympy])" --run "which python3"`;
}

type Point = Record<string, number>;
interface ValuesResult {
  values?: Array<number | null>;
  value?: number;
  roots?: number[];
  error?: string;
}

function runSympy(jobs: object[]): ValuesResult[] {
  const out = execFileSync(PYTHON, [ORACLE], {
    input: JSON.stringify({ jobs }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (JSON.parse(out) as { results: ValuesResult[] }).results;
}

const RTOL = 1e-6;
const ATOL = 1e-8;
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= ATOL + RTOL * Math.max(Math.abs(a), Math.abs(b));
}

/** mallory-side evaluation that mirrors the oracle's None convention. */
function evalOrNull(expr: Expr | string, point: Point): number | null {
  try {
    const v = Symbolic.evaluate(expr, point);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Compare mallory values against oracle values pointwise where BOTH are
 * defined; require a minimum number of comparable points so domain
 * mismatches can't make a check vacuous. */
function assertPointwiseAgreement(
  label: string,
  mallory: Array<number | null>,
  sympy: Array<number | null>,
  minComparable: number,
): void {
  let compared = 0;
  for (let i = 0; i < mallory.length; i++) {
    const m = mallory[i];
    const s = sympy[i];
    if (m === null || m === undefined || s === null || s === undefined) continue;
    compared++;
    assert.ok(close(m, s), `${label}: point #${i}: mallory=${m} sympy=${s}`);
  }
  assert.ok(
    compared >= minComparable,
    `${label}: only ${compared} comparable points (need ${minComparable}) — domain drift?`,
  );
}

const X_POINTS: Point[] = [-1.7, -0.6, 0.3, 0.9, 1.4, 2.2].map((x) => ({ x }));

test("differentiate agrees with sympy.diff across a diverse fixed expression set", { skip: SKIP_REASON }, () => {
  const exprs = [
    "x^3 - 2*x + 1",
    "sin(x)*cos(x)",
    "exp(x)/(1 + x^2)",
    "ln(x^2 + 1)",
    "sqrt(x^2 + 4)",
    "tanh(x)*x^2",
    "sigmoid(x)",
    "atan(x) + asinh(x)",
    "hypot(x, 3)",
    "atan2(x, 2)",
    "erf(x)",
    "x^x", // exponent depends on x — the general pow rule, positive domain only
  ];
  const jobs = exprs.map((e) => ({ op: "diff_eval", expr: Symbolic.parse(e), variable: "x", points: X_POINTS }));
  const results = runSympy(jobs);
  for (let i = 0; i < exprs.length; i++) {
    const r = results[i] as ValuesResult;
    assert.ok(!r.error, `sympy failed on ${exprs[i]}: ${r.error}`);
    const d = Symbolic.differentiate(exprs[i] as string, "x");
    const mallory = X_POINTS.map((p) => evalOrNull(d, p));
    assertPointwiseAgreement(`d/dx ${exprs[i]}`, mallory, r.values as Array<number | null>, 3);
  }
});

test("integrate agrees with sympy.integrate modulo an additive constant", { skip: SKIP_REASON }, () => {
  // Expressions inside mallory's documented elementary-rule coverage.
  const exprs = ["x^2 + 3*x", "cos(x)", "x*sin(x)", "2*x*sin(x^2)", "exp(x) + 1/x", "x*exp(x)"];
  const points: Point[] = [0.4, 0.9, 1.5, 2.1, 3.0].map((x) => ({ x })); // positive: keeps 1/x's ln(x) real
  const jobs = exprs.map((e) => ({ op: "integrate_eval", expr: Symbolic.parse(e), variable: "x", points }));
  const results = runSympy(jobs);
  for (let i = 0; i < exprs.length; i++) {
    const r = results[i] as ValuesResult;
    assert.ok(!r.error, `sympy failed on ${exprs[i]}: ${r.error}`);
    const anti = Symbolic.integrate(exprs[i] as string, "x");
    const diffs: number[] = [];
    for (let j = 0; j < points.length; j++) {
      const m = evalOrNull(anti, points[j] as Point);
      const s = (r.values as Array<number | null>)[j];
      assert.ok(m !== null && s !== null && s !== undefined, `∫ ${exprs[i]}: undefined at point #${j}`);
      diffs.push((m as number) - (s as number));
    }
    const spread = Math.max(...diffs) - Math.min(...diffs);
    assert.ok(
      spread <= 1e-6 * Math.max(1, ...diffs.map(Math.abs)),
      `∫ ${exprs[i]}: antiderivatives do NOT differ by a constant (diffs=${JSON.stringify(diffs)})`,
    );
  }
});

test("integrateDefinite agrees with sympy's definite integrals", { skip: SKIP_REASON }, () => {
  const cases: Array<{ expr: string; lower: number; upper: number }> = [
    { expr: "x^2", lower: 0, upper: 2 },
    { expr: "sin(x)", lower: 0, upper: Math.PI },
    { expr: "exp(-x)", lower: 0, upper: 5 },
    { expr: "sin(x^2)", lower: 0, upper: 1 }, // no elementary antiderivative — quadrature vs sympy's Fresnel form
  ];
  const results = runSympy(
    cases.map((c) => ({
      op: "integrate_definite",
      expr: Symbolic.parse(c.expr),
      variable: "x",
      lower: c.lower,
      upper: c.upper,
    })),
  );
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i] as { expr: string; lower: number; upper: number };
    const r = results[i] as ValuesResult;
    assert.ok(!r.error, `sympy failed on ${c.expr}: ${r.error}`);
    const m = Symbolic.integrateDefinite(c.expr, c.lower, c.upper);
    assert.ok(
      Math.abs(m - (r.value as number)) <= 1e-6 * Math.max(1, Math.abs(r.value as number)),
      `∫[${c.lower},${c.upper}] ${c.expr}: mallory=${m} sympy=${r.value}`,
    );
  }
});

test("solve agrees with sympy.solve as real solution SETS (order-independent)", { skip: SKIP_REASON }, () => {
  const exprs = [
    "x^2 - 5*x + 6",
    "x^2 - 2",
    "x^3 - x", // three real roots
    "x^4 - 5*x^2 + 4", // four real roots
    "x^2 + 1", // no real roots
  ];
  const results = runSympy(exprs.map((e) => ({ op: "solve", expr: Symbolic.parse(e), variable: "x" })));
  for (let i = 0; i < exprs.length; i++) {
    const r = results[i] as ValuesResult;
    assert.ok(!r.error, `sympy failed on ${exprs[i]}: ${r.error}`);
    const mallory = Symbolic.solve(exprs[i] as string, "x")
      .map((root) => Symbolic.evaluate(root, {}))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    const sympy = r.roots as number[];
    assert.equal(
      mallory.length,
      sympy.length,
      `solve ${exprs[i]}: mallory found ${JSON.stringify(mallory)}, sympy ${JSON.stringify(sympy)}`,
    );
    for (let j = 0; j < mallory.length; j++) {
      assert.ok(
        close(mallory[j] as number, sympy[j] as number),
        `solve ${exprs[i]}: root #${j}: mallory=${mallory[j]} sympy=${sympy[j]}`,
      );
    }
  }
});

test("taylor agrees with sympy.series near the expansion center", { skip: SKIP_REASON }, () => {
  const cases = [
    { expr: "exp(x)", center: 0, order: 6 },
    { expr: "sin(x)", center: 0, order: 7 },
    { expr: "ln(x)", center: 1, order: 6 },
  ];
  // Near-center points: both truncated polynomials approximate the function,
  // and — being the SAME Taylor polynomial if both engines are right — must
  // agree with each other far more tightly than either agrees with f itself.
  const results = runSympy(
    cases.map((c) => ({
      op: "taylor_eval",
      expr: Symbolic.parse(c.expr),
      variable: "x",
      center: c.center,
      order: c.order,
      points: [-0.3, -0.1, 0.1, 0.3].map((dx) => ({ x: c.center + dx })),
    })),
  );
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i] as { expr: string; center: number; order: number };
    const r = results[i] as ValuesResult;
    assert.ok(!r.error, `sympy failed on ${c.expr}: ${r.error}`);
    const poly = Symbolic.taylor(c.expr, "x", c.center, c.order);
    const mallory = [-0.3, -0.1, 0.1, 0.3].map((dx) => evalOrNull(poly, { x: c.center + dx }));
    assertPointwiseAgreement(`taylor ${c.expr} @ ${c.center}`, mallory, r.values as Array<number | null>, 4);
  }
});

test("simplify preserves semantics: sympy evaluates the ORIGINAL, mallory the SIMPLIFIED", {
  skip: SKIP_REASON,
}, () => {
  const exprs = ["a*b + b*a", "x + x + 2*x", "(x+1)^2 - (x^2 + 2*x + 1)", "sin(x)^2 + cos(x)^2 + x", "x*1 + 0*y + x^1"];
  const points: Point[] = [
    { x: 0.7, y: -1.2, a: 2.5, b: -0.4 },
    { x: -1.1, y: 0.3, a: -1.5, b: 2.2 },
    { x: 2.4, y: 1.8, a: 0.6, b: 0.9 },
  ];
  const results = runSympy(exprs.map((e) => ({ op: "eval", expr: Symbolic.parse(e), points })));
  for (let i = 0; i < exprs.length; i++) {
    const r = results[i] as ValuesResult;
    assert.ok(!r.error, `sympy failed on ${exprs[i]}: ${r.error}`);
    const simplified = Symbolic.simplify(exprs[i] as string);
    const mallory = points.map((p) => evalOrNull(simplified, p));
    assertPointwiseAgreement(`simplify ${exprs[i]}`, mallory, r.values as Array<number | null>, 3);
  }
});

// ---- property leg: random Expr trees, evaluate + differentiate --------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth, sympy-translatable, non-piecewise subset — the property leg's
 * spec table. Kinked/discrete funcs (abs/floor/relu/min/max/...) are pinned
 * by the fixed suites; FD-meaningless at kinks applies to derivatives here
 * exactly as it did in math-plus's fuzzer. */
const GEN_FUNCS = ["sin", "cos", "exp", "tanh", "sinh", "atan", "sigmoid", "sqrt", "ln", "erf", "asinh"] as const;

function genExpr(rng: () => number, depth: number): Expr {
  if (depth >= 3 || rng() < 0.3) {
    return rng() < 0.65
      ? { type: "var", name: "x" }
      : { type: "const", value: Math.round((rng() * 4 - 2) * 100) / 100 };
  }
  const r = rng();
  if (r < 0.45) {
    const name = GEN_FUNCS[Math.floor(rng() * GEN_FUNCS.length)] as (typeof GEN_FUNCS)[number];
    return { type: "func", name, arg: genExpr(rng, depth + 1) };
  }
  const ops = ["add", "sub", "mul", "div"] as const;
  const op = ops[Math.floor(rng() * ops.length)] as (typeof ops)[number];
  return { type: op, left: genExpr(rng, depth + 1), right: genExpr(rng, depth + 1) };
}

function usesVar(e: Expr): boolean {
  if (e.type === "var") return true;
  if ("left" in e && "right" in e) return usesVar(e.left) || usesVar(e.right);
  if (e.type === "func" || e.type === "neg") return usesVar(e.arg);
  if (e.type === "pow") return usesVar(e.base) || usesVar(e.exp);
  return false;
}

test("property leg: random Expr trees agree with sympy on evaluate AND differentiate (seeded)", {
  skip: SKIP_REASON,
}, () => {
  const BASE_SEED = Number(process.env.MALLORY_SYMPY_FUZZ_SEED ?? 20260813);
  const CASES = Number(process.env.MALLORY_SYMPY_FUZZ_CASES ?? 40);
  const points: Point[] = [-1.6, -0.8, -0.2, 0.5, 1.1, 1.9].map((x) => ({ x }));

  interface Case {
    seed: number;
    expr: Expr;
    derivative: Expr;
  }
  const cases: Case[] = [];
  let discarded = 0;
  for (let i = 0; i < CASES; i++) {
    const seed = BASE_SEED + i;
    const rng = mulberry32(seed);
    const expr = genExpr(rng, 0);
    if (!usesVar(expr)) {
      discarded++;
      continue;
    }
    // Reject graphs whose mallory-side values explode (domain/pole trouble
    // makes float comparison meaningless — same guard as the IR fuzzer).
    const vals = points.map((p) => evalOrNull(expr, p));
    if (vals.filter((v) => v !== null && Math.abs(v) < 1e6).length < 3) {
      discarded++;
      continue;
    }
    let derivative: Expr;
    try {
      derivative = Symbolic.differentiate(expr, "x");
    } catch {
      discarded++; // e.g. a construct differentiate declines — fine, fixed suites pin those
      continue;
    }
    cases.push({ seed, expr, derivative });
  }
  assert.ok(
    cases.length >= CASES * 0.5,
    `property leg only kept ${cases.length}/${CASES} cases (${discarded} discarded) — generator drift?`,
  );

  const jobs = cases.flatMap((c) => [
    { op: "eval", expr: c.expr, points },
    { op: "diff_eval", expr: c.expr, variable: "x", points },
  ]);
  const results = runSympy(jobs);

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i] as Case;
    const evalResult = results[2 * i] as ValuesResult;
    const diffResult = results[2 * i + 1] as ValuesResult;
    const label = `seed ${c.seed} (replay: MALLORY_SYMPY_FUZZ_SEED=${c.seed} MALLORY_SYMPY_FUZZ_CASES=1): ${Symbolic.toString(c.expr)}`;
    assert.ok(!evalResult.error, `${label}: sympy eval error ${evalResult.error}`);
    assert.ok(!diffResult.error, `${label}: sympy diff error ${diffResult.error}`);
    // Derivative magnitudes can legitimately be huge near domain edges even
    // when values are tame; compare only where BOTH sides are modest.
    const clampBig = (v: number | null): number | null => (v !== null && Math.abs(v) < 1e6 ? v : null);
    assertPointwiseAgreement(
      `${label}: value`,
      points.map((p) => clampBig(evalOrNull(c.expr, p))),
      (evalResult.values as Array<number | null>).map(clampBig),
      3,
    );
    assertPointwiseAgreement(
      `${label}: derivative`,
      points.map((p) => clampBig(evalOrNull(c.derivative, p))),
      (diffResult.values as Array<number | null>).map(clampBig),
      2,
    );
  }
});
