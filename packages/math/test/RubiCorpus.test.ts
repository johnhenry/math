/**
 * Rubi-derived integration corpus (issue #16): 771 problems curated from
 * the MIT-licensed RuleBasedIntegration/MaximaSyntaxTestSuite (72,254
 * problems scanned; see test/fixtures/rubi-corpus.json's attribution field
 * and scripts/rubi-convert.mjs for regeneration).
 *
 * Tier 1 — derivative verification, broad: for every problem, differentiate
 * Rubi's OWN optimal antiderivative with Symbolic.differentiate and check
 * numeric equivalence with the integrand at sampled in-domain points. The
 * calculus identity d/dx ∫f = f is self-checking — no external oracle, no
 * subprocess, plain CI — and exercises parse/differentiate/evaluate across
 * hundreds of real-world expressions far gnarlier than any hand-written
 * test.
 *
 * Tier 2 — integrate verification, narrow: for low-step-count problems that
 * Symbolic.integrate accepts, its own antiderivative must differentiate
 * back to the integrand numerically. Rubi's form is never string-compared
 * (antiderivatives legitimately differ by constants and simplification);
 * NotIntegrableError is an expected, counted outcome, not a failure.
 *
 * Sampling: parameters (a, b, c, ...) and x are bound from fixed value
 * sets; a (params, x) combo counts only when integrand AND differentiated
 * antiderivative both evaluate finite and moderate there (fractional powers
 * of negatives, log of negatives, poles etc. make combos invalid, not
 * wrong). Problems that never yield enough valid combos are counted and
 * bounded — a coverage-collapse guard keeps the suite from going vacuous,
 * per the Woxi exception discipline (no silent skips).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Symbolic, NotIntegrableError, type Expr } from "../src/index.ts";

interface RubiProblem {
  source: string;
  index: number;
  integrand: string;
  variable: string;
  steps: number;
  antiderivative: string;
  params: string[];
}

const HERE = new URL(".", import.meta.url).pathname;
const CORPUS = JSON.parse(readFileSync(join(HERE, "fixtures/rubi-corpus.json"), "utf8")) as {
  attribution: string;
  problems: RubiProblem[];
};

// Fixed parameter/point value sets — varied signs and magnitudes, nothing
// at obvious symmetry points (0, 1) where a wrong formula could hide.
const PARAM_SETS = [
  { a: 2.3, b: 1.7, c: 0.6, d: 1.9, ee: 2.6, f: 1.3, g: 0.8, m: 2, n: 3, p: 2, q: 1.4, r: 0.9, s: 1.1 },
  { a: 0.7, b: -1.2, c: 1.8, d: 0.5, ee: 1.1, f: -0.6, g: 1.5, m: 3, n: 2, p: 1, q: 0.8, r: 1.6, s: 0.4 },
  { a: -1.4, b: 2.1, c: -0.9, d: 2.4, ee: 0.9, f: 1.8, g: -0.5, m: 2, n: 4, p: 3, q: -1.1, r: 0.6, s: 2.2 },
] as const;
const X_VALUES = [0.37, 0.81, 1.42, 2.19, -0.53, -1.27];

const RTOL = 1e-5;
const ATOL = 1e-7;
const MAGNITUDE_CAP = 1e8;

function evalFinite(expr: Expr, env: Record<string, number>): number | null {
  try {
    const v = Symbolic.evaluate(expr, env);
    return Number.isFinite(v) && Math.abs(v) < MAGNITUDE_CAP ? v : null;
  } catch {
    return null;
  }
}

interface CheckOutcome {
  compared: number;
  mismatch?: { env: Record<string, number>; expected: number; got: number };
}

/** Compare d/dx(antiderivative) against integrand across the sample grid. */
function checkDerivativeIdentity(integrand: Expr, derivative: Expr, params: readonly string[]): CheckOutcome {
  let compared = 0;
  for (const paramSet of PARAM_SETS) {
    for (const x of X_VALUES) {
      const env: Record<string, number> = { x };
      for (const p of params) env[p] = (paramSet as Record<string, number>)[p] ?? 1.5;
      const f = evalFinite(integrand, env);
      const dF = evalFinite(derivative, env);
      if (f === null || dF === null) continue; // out of domain / pole — invalid combo, not wrong
      compared++;
      if (Math.abs(f - dF) > ATOL + RTOL * Math.max(Math.abs(f), Math.abs(dF))) {
        return { compared, mismatch: { env, expected: f, got: dF } };
      }
    }
  }
  return { compared };
}

const MIN_COMPARABLE_POINTS = 4;

test(`tier 1: d/dx of Rubi's antiderivative matches the integrand (${CORPUS.problems.length} corpus problems)`, () => {
  assert.ok(CORPUS.problems.length >= 700, `fixture shrank to ${CORPUS.problems.length} problems — regenerate or investigate`);
  let verified = 0;
  let insufficientDomain = 0;
  const failures: string[] = [];

  for (const problem of CORPUS.problems) {
    let integrand: Expr;
    let derivative: Expr;
    try {
      integrand = Symbolic.parse(problem.integrand);
      derivative = Symbolic.differentiate(Symbolic.parse(problem.antiderivative), problem.variable);
    } catch (e) {
      failures.push(`${problem.source}#${problem.index}: parse/differentiate threw: ${(e as Error).message}`);
      continue;
    }
    const outcome = checkDerivativeIdentity(integrand, derivative, problem.params);
    if (outcome.mismatch) {
      failures.push(
        `${problem.source}#${problem.index}: ∫ ${problem.integrand}\n  d/dx(rubi antiderivative) = ${outcome.mismatch.got} but integrand = ${outcome.mismatch.expected} at ${JSON.stringify(outcome.mismatch.env)}`,
      );
    } else if (outcome.compared >= MIN_COMPARABLE_POINTS) {
      verified++;
    } else {
      insufficientDomain++; // e.g. sqrt(a+b*x) real only on a sliver none of the fixed sets hit
    }
  }

  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} corpus problems diverged (first 10 shown)`);
  // Coverage-collapse guard: most problems must actually be VERIFIED, not
  // quietly domain-skipped — if this ratio drops, the sampling sets or the
  // converter have drifted.
  assert.ok(
    verified >= CORPUS.problems.length * 0.7,
    `only ${verified}/${CORPUS.problems.length} problems fully verified (${insufficientDomain} lacked in-domain sample coverage)`,
  );
});

test("tier 2: where Symbolic.integrate accepts a low-step problem, its OWN antiderivative differentiates back to the integrand", () => {
  const easy = CORPUS.problems.filter((p) => p.steps > 0 && p.steps <= 2);
  assert.ok(easy.length >= 100, `corpus has only ${easy.length} 1-2 step problems`);
  let attempted = 0;
  let integrated = 0;
  let declined = 0;
  const failures: string[] = [];

  for (const problem of easy) {
    let integrand: Expr;
    try {
      integrand = Symbolic.parse(problem.integrand);
    } catch {
      continue;
    }
    attempted++;
    let own: Expr;
    try {
      own = Symbolic.integrate(integrand, problem.variable);
    } catch (e) {
      if (e instanceof NotIntegrableError) {
        declined++; // honest "outside my elementary rules" — expected, counted
        continue;
      }
      failures.push(`${problem.source}#${problem.index}: integrate threw non-NotIntegrable: ${(e as Error).message}`);
      continue;
    }
    let derivative: Expr;
    try {
      derivative = Symbolic.differentiate(own, problem.variable);
    } catch (e) {
      failures.push(`${problem.source}#${problem.index}: differentiating our own antiderivative threw: ${(e as Error).message}`);
      continue;
    }
    const outcome = checkDerivativeIdentity(integrand, derivative, problem.params);
    if (outcome.mismatch) {
      failures.push(
        `${problem.source}#${problem.index}: ∫ ${problem.integrand} — OUR antiderivative ${Symbolic.toString(own)} is WRONG: ` +
          `d/dx gives ${outcome.mismatch.got}, integrand is ${outcome.mismatch.expected} at ${JSON.stringify(outcome.mismatch.env)}`,
      );
    } else if (outcome.compared >= MIN_COMPARABLE_POINTS) {
      integrated++;
    }
  }

  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} of our own antiderivatives are wrong (first 10 shown)`);
  // integrate() declining is fine; SUCCEEDING WRONGLY is the only failure.
  // But require a floor so a regression to decline-everything can't pass
  // silently. The floor is the MEASURED baseline at corpus-generation time
  // (7 verified of 181 attempted, 174 honest declines -- Rubi's low-step
  // problems lean on symbolic-exponent forms like (a+b*x)^m that are
  // outside mallory's documented elementary-rule coverage), minus headroom.
  // This is a coverage ratchet, not a correctness claim; raise it when
  // integrate() grows.
  assert.ok(
    integrated >= 5,
    `integrate() verified only ${integrated}/${attempted} low-step problems (declined ${declined}) — coverage regressed below the measured baseline of 7`,
  );
  console.log(`[rubi tier 2] ${integrated} integrated+verified, ${declined} honestly declined, of ${attempted} low-step problems`);
});
