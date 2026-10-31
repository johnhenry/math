---
"@johnhenry/math": minor
---

`Symbolic.simplify` now expands products and cancels common polynomial factors (johnhenry/math#92). `(x+1)^2 - x^2 - 2*x` simplifies to `1`, and `(x^2-1)/(x-1)` to `x + 1`. The expression is read as a rational function in its variables, with non-polynomial subexpressions such as `sin(x)` treated as opaque symbols; the expanded and cancelled form is used only when it is smaller than the form `simplify` already had, so shapes such as `(x+1)*2` are unchanged. Cancellation ignores the points where the original is undefined (`(x^2-1)/(x-1)` at `x = 1`), as a CAS does. `Symbolic.expand` is unchanged. `Graph.topologicalSort` already returns `null` on a cyclic graph; a regression test now covers self-loops and cycles behind a DAG prefix.
