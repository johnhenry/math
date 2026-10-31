"""Regenerates test/fixtures/goldens.json from SciPy / SymPy / NumPy.

The committed JSON is what the tests read; this script is only run by hand
when a case is added (the tests never shell out to Python). On NixOS:

  nix-shell -p "python3.withPackages(ps: [ps.sympy ps.scipy ps.numpy])" \
    --run "python3 scripts/generate-goldens.py > test/fixtures/goldens.json"

Expressions use the @johnhenry/math grammar (`^` for powers, explicit `*`).
"""
import json
import sys

import numpy as np
import sympy as sp
from scipy.optimize import brentq
from sympy.parsing.sympy_parser import convert_xor, parse_expr, standard_transformations

X = sp.Symbol("x")
TR = standard_transformations + (convert_xor,)


def parse(src):
    return parse_expr(src, local_dict={"x": X}, transformations=TR)


def fn(src):
    return sp.lambdify(X, parse(src), modules="numpy")


def roots(src, lo, hi, n=4000):
    f = fn(src)
    xs = np.linspace(lo, hi, n)
    ys = f(xs)
    found = []
    for i in range(n):
        if ys[i] == 0:
            found.append(float(xs[i]))
    for i in range(n - 1):
        if np.isfinite(ys[i]) and np.isfinite(ys[i + 1]) and ys[i] * ys[i + 1] < 0:
            found.append(brentq(f, xs[i], xs[i + 1], xtol=1e-14))
    return sorted(found)


out = {"generator": "scripts/generate-goldens.py", "numpy": np.__version__, "sympy": sp.__version__}

# 1. NumPy: uniform-grid values.
values = []
for src, lo, hi, n in [
    ("sin(x)*exp(-x/5)", 0.0, 10.0, 41),
    ("x^3 - 2*x + 1", -3.0, 3.0, 25),
    ("cos(3*x)/(1 + x^2)", -4.0, 4.0, 33),
    ("sqrt(x)", 0.0, 9.0, 19),
]:
    xs = np.linspace(lo, hi, n)
    values.append({"expr": src, "min": lo, "max": hi, "n": n, "y": [float(v) for v in fn(src)(xs)]})
out["values"] = values

# 2. SciPy brentq: roots.
out["roots"] = [
    {"expr": s, "min": lo, "max": hi, "roots": roots(s, lo, hi)}
    for s, lo, hi in [
        ("sin(x)", -10.0, 10.0),
        ("x^3 - 2*x + 1", -3.0, 3.0),
        ("cos(x) - x/3", -6.0, 6.0),
        ("x^2 - 2", -3.0, 3.0),
    ]
]

# 3. SciPy brentq: intersections of two curves.
inter = []
for a, b, lo, hi in [
    ("sin(x)", "x/3", -6.0, 6.0),
    ("x^2", "2*x + 1", -3.0, 4.0),
    ("exp(x)", "x + 2", -4.0, 3.0),
]:
    xs = roots(f"({a}) - ({b})", lo, hi)
    inter.append({"a": a, "b": b, "min": lo, "max": hi, "x": xs, "y": [float(fn(a)(v)) for v in xs]})
out["intersections"] = inter

# 4. SymPy: pole locations inside a window (what gap detection must find).
poles = []
for src, lo, hi in [
    ("1/(x - 2)", -5.0, 5.0),
    ("1/(x^2 - 1)", -3.0, 3.0),
    ("tan(x)", -5.0, 5.0),
    ("1/x^2", -4.0, 4.0),
]:
    e = parse(src)
    if src.startswith("tan"):
        sol = sp.solveset(sp.cos(X), X, sp.Interval(lo, hi))
        xs = sorted(float(v) for v in sol)
    else:
        sing = sp.singularities(e, X)
        xs = sorted(float(v) for v in sing if lo <= float(v) <= hi)
    poles.append({"expr": src, "min": lo, "max": hi, "poles": xs})
out["poles"] = poles

# 5. NumPy dense reference for adaptive-sampling accuracy.
dense = []
for src, lo, hi in [("sin(x^2)", -3.0, 3.0), ("sin(1/(x + 3.5))", -3.0, 3.0), ("exp(-x^2)*cos(8*x)", -3.0, 3.0)]:
    xs = np.linspace(lo, hi, 20001)
    dense.append({"expr": src, "min": lo, "max": hi, "dense_n": 20001,
                  "y_min": float(np.min(fn(src)(xs))), "y_max": float(np.max(fn(src)(xs)))})
out["dense"] = dense

json.dump(out, sys.stdout, indent=1)
print()
