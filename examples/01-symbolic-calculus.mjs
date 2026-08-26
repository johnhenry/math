// Symbolic calculus: parse, differentiate, integrate, take limits, and
// solve — exact symbolic forms that show their work, not numeric
// approximations.
//
// Run: npm install && node examples/01-symbolic-calculus.mjs
// (More recipes: packages/math/docs/COOKBOOK.md — every fence there is
//  executed as a test.)
import { Symbolic } from "@johnhenry/math";

// Differentiation
console.log(Symbolic.toString(Symbolic.differentiate("x^3"))); // 3*x^2

// Integration — by parts and u-substitution, symbolically
console.log(Symbolic.toString(Symbolic.integrate("x*sin(x)"))); // -(cos(x)*x) + sin(x)
console.log(Symbolic.toString(Symbolic.integrate("2*x*sin(x^2)"))); // -cos(x^2)
console.log(Symbolic.integrateDefinite("x^2", 0, 2)); // 8/3 = 2.666...

// Limits — L'Hopital under the hood
console.log(Symbolic.limit("sin(x)/x", "x", 0)); // 1

// Solving
console.log(Symbolic.solve("x^2 - 5*x + 6").map(Symbolic.toString)); // ["3", "2"]
console.log(Symbolic.solveSystem(["2*x + y - 5", "x - y - 1"], ["x", "y"])); // { x: 2, y: 1 }

// Series — exact geometric closed form, not partial summation
console.log(Symbolic.sumSeries("3*0.5^n", 0, Infinity)); // 6

// Rendering
console.log(Symbolic.toLatex("x^2/2")); // \frac{x^{2}}{2}
