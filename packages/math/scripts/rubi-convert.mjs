#!/usr/bin/env node
/**
 * Rubi corpus converter (issue #16): turns a checkout of the MIT-licensed
 * RuleBasedIntegration/MaximaSyntaxTestSuite into the committed fixture
 * test/fixtures/rubi-corpus.json consumed by test/RubiCorpus.test.ts.
 *
 *   node scripts/rubi-convert.mjs /path/to/MaximaSyntaxTestSuite
 *
 * Each .mac entry is a 4-tuple [integrand, variable, rubiStepCount,
 * optimalAntiderivative] in Maxima's plain-infix syntax. Translation to
 * Symbolic.parse's grammar is rename-level:
 *   %pi -> pi                    (both natural-log)      log(x) -> ln(x)
 *   %e  -> exp(1)                (JS half of signum)     signum -> sign
 *   e   -> ee   -- CRITICAL: Maxima's plain `e` is a free PARAMETER
 *                  (Euler's number is `%e`), but Symbolic.parse resolves
 *                  bare `e` to Euler's constant. Without the rename every
 *                  problem using the parameter e would silently bind it
 *                  to 2.718... and the numeric check would test nonsense.
 *
 * Problems are kept only when every function called is one Symbolic
 * supports (drops elliptic_e, polylog, the expintegral family, etc.) and
 * every remaining identifier is a plain parameter. Curation is
 * deterministic: per top-level category, every problem is parsed and an
 * evenly-spaced sample up to PER_CATEGORY is kept — rerunning against the
 * same suite commit reproduces the same fixture byte-for-byte.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PER_CATEGORY = 90;

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/rubi-convert.mjs /path/to/MaximaSyntaxTestSuite");
  process.exit(1);
}

/** Functions Symbolic.parse understands (canonical names after translation). */
const SUPPORTED_FUNCS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "asin", "acos", "atan", "acot", "asec", "acsc",
  "sinh", "cosh", "tanh", "coth", "sech", "csch",
  "asinh", "acosh", "atanh", "acoth", "asech", "acsch",
  "exp", "ln", "sqrt", "cbrt", "abs", "erf", "sign",
  "log10", "log2", "floor", "ceil", "round", "trunc", "expm1", "log1p", "sigmoid", "relu",
  "atan2", "hypot", "min", "max",
]);

function* macFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* macFiles(p);
    else if (entry.endsWith(".mac")) yield p;
  }
}

/** Extract top-level [ ... ] groups after the `lst: '[` header. */
function* entries(text) {
  const start = text.indexOf("lst:");
  if (start < 0) return;
  let i = text.indexOf("[", start) + 1; // inside the outer list
  let depth = 0;
  let current = -1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i) + 1;
      continue;
    }
    if (ch === "[") {
      if (depth === 0) current = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && current >= 0) {
        yield text.slice(current + 1, i);
        current = -1;
      }
      if (depth < 0) return; // closed the outer list
    }
  }
}

/** Split a tuple body on top-level commas. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((s) => s.trim());
}

function translate(maxima) {
  let s = maxima.replace(/%pi/g, "pi").replace(/%e\b/g, "exp(1)");
  // Token-level renames (never inside longer identifiers):
  s = s.replace(/\blog\(/g, "ln(").replace(/\bsignum\(/g, "sign(").replace(/\be\b/g, "ee");
  return s;
}

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Validate a translated expression: every called identifier supported,
 * every non-call identifier a plain parameter; no leftover Maxima syntax. */
function analyze(expr) {
  if (expr.includes("%") || expr.includes("!") || expr.includes(":=") || expr.includes("'")) return null;
  const params = new Set();
  for (const m of expr.matchAll(IDENT_RE)) {
    const name = m[0];
    const isCall = expr[m.index + name.length] === "(";
    if (isCall) {
      if (!SUPPORTED_FUNCS.has(name)) return null;
    } else if (name !== "pi") {
      if (name.length > 2) return null; // unexpected long symbol — likely an untranslated construct
      params.add(name);
    }
  }
  return params;
}

const categories = readdirSync(root).filter((d) => /^\d/.test(d) && statSync(join(root, d)).isDirectory());
const fixture = [];
let scanned = 0;
let kept = 0;

for (const category of categories.sort()) {
  const candidates = [];
  for (const file of macFiles(join(root, category))) {
    const text = readFileSync(file, "utf8");
    for (const [index, raw] of [...entries(text)].entries()) {
      scanned++;
      const parts = splitTopLevel(raw);
      if (parts.length !== 4) continue;
      const [integrandM, variable, stepsStr, antiM] = parts;
      const steps = Number(stepsStr);
      if (!Number.isInteger(steps) || variable !== "x") continue;
      const integrand = translate(integrandM);
      const antiderivative = translate(antiM);
      const p1 = analyze(integrand);
      const p2 = analyze(antiderivative);
      if (!p1 || !p2) continue;
      const params = [...new Set([...p1, ...p2])].filter((v) => v !== "x").sort();
      candidates.push({
        source: file.slice(root.length + 1),
        index,
        integrand,
        variable: "x",
        steps,
        antiderivative,
        params,
      });
    }
  }
  // Deterministic evenly-spaced sample.
  const stride = Math.max(1, Math.floor(candidates.length / PER_CATEGORY));
  const sampled = candidates.filter((_, i) => i % stride === 0).slice(0, PER_CATEGORY);
  kept += sampled.length;
  fixture.push(...sampled);
  console.log(`${category}: ${candidates.length} convertible, kept ${sampled.length}`);
}

const out = {
  attribution:
    "Derived from RuleBasedIntegration/MaximaSyntaxTestSuite (https://github.com/RuleBasedIntegration/MaximaSyntaxTestSuite), MIT License, Copyright (c) 2018 Rule-based Integration. Converted by scripts/rubi-convert.mjs (Maxima -> mallory-math Symbolic syntax).",
  problems: fixture,
};
writeFileSync(new URL("../test/fixtures/rubi-corpus.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`scanned ${scanned} entries, kept ${kept} -> test/fixtures/rubi-corpus.json`);
