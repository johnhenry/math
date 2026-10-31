---
"@johnhenry/math": minor
---

`Symbolic.parse(input, options)` and `Symbolic.fromLatex(latex, options)` take a new `ParseOptions` argument (exported type). `{ implicitMultiplication: true }` reads juxtaposition as multiplication, so `2x`, `x y`, `xy`, `2(x+1)`, `(x+1)(x-1)` and `3sin(x)` parse; with the option, `fromLatex` also reads Desmos-style input such as `\sin 2x`, `\sin x\cos x`, `3\left(x+1\right)` and `x^23` (TeX's one-token exponent). The default is off and behaves as before: `2x` is still an error and `xy` is one variable. With the option on, multi-letter variable names are unavailable (`theta` is `t*h*e*t*a`; use `x_1`), and a function name without parentheses is an error. Independently of the option, `fromLatex` now accepts TeX's single-token arguments (`\frac12`, `\frac1x`, `\sqrt2`, `\sin x` with a space) and a power on a function command (`\sin^{2}(x)` is `sin(x)^2`).

`fromLatex` also no longer swallows the second backslash of a `\\` row separator followed by a space (`\begin{cases} 1 & x<0 \\ 2 & \text{otherwise} \end{cases}` used to fail).
