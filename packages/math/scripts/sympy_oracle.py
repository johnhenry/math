#!/usr/bin/env python3
"""SymPy differential oracle for Symbolic (issue #14).

Protocol (batch -- SymPy import dominates startup, so callers send many jobs
per invocation): a JSON object {"jobs": [...]} on stdin, {"results": [...]}
on stdout, one result per job in order. Each job carries @johnhenry/math's Expr
AST verbatim (it is a plain JSON discriminated union); this script rebuilds
it as a SymPy expression -- an INDEPENDENT reimplementation of the semantics,
which is the whole point.

Jobs:
  {"op": "eval",               "expr": E, "points": [{var: val}, ...]}
  {"op": "diff_eval",          "expr": E, "variable": v, "points": [...]}
  {"op": "integrate_eval",     "expr": E, "variable": v, "points": [...]}
  {"op": "integrate_definite", "expr": E, "variable": v, "lower": a, "upper": b}
  {"op": "solve",              "expr": E, "variable": v}
  {"op": "taylor_eval",        "expr": E, "variable": v, "center": c, "order": n, "points": [...]}

Results:
  eval/diff_eval/integrate_eval/taylor_eval -> {"values": [float|None, ...]}
      (None per point where SymPy's value is complex/undefined/failed;
       integrate_eval -> {"error": ...} if SymPy cannot find an antiderivative)
  integrate_definite -> {"value": float}
  solve -> {"roots": [float, ...]}  (real roots only, ascending)
Any per-job failure -> {"error": "message"} in that slot; the batch never dies.
"""
import json
import sys

import sympy as sp

UNARY = {
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
    "exp": sp.exp, "ln": sp.log, "sqrt": sp.sqrt,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "cot": sp.cot, "sec": sp.sec, "csc": sp.csc,
    "asinh": sp.asinh, "acosh": sp.acosh, "atanh": sp.atanh,
    "coth": sp.coth, "sech": sp.sech, "csch": sp.csch,
    "acot": sp.acot, "asec": sp.asec, "acsc": sp.acsc,
    "acoth": sp.acoth, "asech": sp.asech, "acsch": sp.acsch,
    "abs": sp.Abs,
    "log10": lambda a: sp.log(a, 10), "log2": lambda a: sp.log(a, 2),
    "cbrt": lambda a: sp.real_root(a, 3),  # this library's cbrt is the REAL cube root (Math.cbrt)
    "floor": sp.floor, "ceil": sp.ceiling,
    "sign": sp.sign,
    "expm1": lambda a: sp.exp(a) - 1, "log1p": lambda a: sp.log(1 + a),
    "sigmoid": lambda a: 1 / (1 + sp.exp(-a)),
    "erf": sp.erf,
    "relu": lambda a: sp.Max(a, 0),
    # round/trunc deliberately absent: SymPy has no direct symbolic
    # equivalent of JS Math.round's half-up convention; jobs using them get
    # a per-job error rather than a silently-wrong translation.
}

CALL2 = {
    "atan2": sp.atan2,  # call2("atan2", y, x) matches Math.atan2(y, x) -- same order as sympy
    "hypot": lambda l, r: sp.sqrt(l**2 + r**2),
    "min": lambda l, r: sp.Min(l, r), "max": lambda l, r: sp.Max(l, r),
    "gcd": lambda l, r: sp.gcd(l, r), "lcm": lambda l, r: sp.lcm(l, r),
}

CMP = {
    "lt": sp.Lt, "le": sp.Le, "gt": sp.Gt, "ge": sp.Ge, "eq": sp.Eq, "ne": sp.Ne,
}


def build(e):
    t = e["type"]
    if t == "const":
        return sp.Float(e["value"]) if e["value"] != int(e["value"]) else sp.Integer(int(e["value"]))
    if t == "var":
        return sp.Symbol(e["name"], real=True)
    if t == "add":
        return build(e["left"]) + build(e["right"])
    if t == "sub":
        return build(e["left"]) - build(e["right"])
    if t == "mul":
        return build(e["left"]) * build(e["right"])
    if t == "div":
        return build(e["left"]) / build(e["right"])
    if t == "pow":
        return build(e["base"]) ** build(e["exp"])
    if t == "neg":
        return -build(e["arg"])
    if t == "func":
        fn = UNARY.get(e["name"])
        if fn is None:
            raise ValueError(f"no SymPy translation for func {e['name']!r}")
        return fn(build(e["arg"]))
    if t == "call2":
        fn = CALL2.get(e["name"])
        if fn is None:
            raise ValueError(f"no SymPy translation for call2 {e['name']!r}")
        return fn(build(e["left"]), build(e["right"]))
    if t == "cmp":
        return sp.Piecewise((1, CMP[e["op"]](build(e["left"]), build(e["right"]))), (0, True))
    if t == "piecewise":
        branches = [(build(b["expr"]), sp.Ne(build(b["cond"]), 0)) for b in e["branches"]]
        branches.append((build(e["otherwise"]), True))
        return sp.Piecewise(*branches)
    raise ValueError(f"no SymPy translation for Expr type {t!r}")


def eval_at(expr, point):
    """Numeric value at a point, or None when complex/undefined/non-finite."""
    try:
        v = expr.evalf(subs={sp.Symbol(k, real=True): val for k, val in point.items()})
        if v.is_real is False:
            return None
        f = float(v)
        if f != f or f in (float("inf"), float("-inf")):
            return None
        return f
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def run_job(job):
    op = job["op"]
    expr = build(job["expr"])
    if op == "eval":
        return {"values": [eval_at(expr, p) for p in job["points"]]}
    if op == "diff_eval":
        d = sp.diff(expr, sp.Symbol(job["variable"], real=True))
        return {"values": [eval_at(d, p) for p in job["points"]]}
    if op == "integrate_eval":
        anti = sp.integrate(expr, sp.Symbol(job["variable"], real=True))
        if anti.has(sp.Integral):
            return {"error": "sympy returned an unevaluated Integral"}
        return {"values": [eval_at(anti, p) for p in job["points"]]}
    if op == "integrate_definite":
        x = sp.Symbol(job["variable"], real=True)
        v = sp.integrate(expr, (x, job["lower"], job["upper"]))
        return {"value": float(v.evalf())}
    if op == "solve":
        x = sp.Symbol(job["variable"], real=True)
        roots = []
        for r in sp.solve(sp.Eq(expr, 0), x):
            rv = sp.nsimplify(r).evalf()
            if rv.is_real:
                roots.append(float(rv))
        return {"roots": sorted(roots)}
    if op == "taylor_eval":
        x = sp.Symbol(job["variable"], real=True)
        poly = sp.series(expr, x, job["center"], job["order"] + 1).removeO()
        return {"values": [eval_at(poly, p) for p in job["points"]]}
    raise ValueError(f"unknown op {op!r}")


def main():
    batch = json.load(sys.stdin)
    results = []
    for job in batch["jobs"]:
        try:
            results.append(run_job(job))
        except Exception as e:  # per-job isolation: one bad job never kills the batch
            results.append({"error": f"{type(e).__name__}: {e}"})
    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
