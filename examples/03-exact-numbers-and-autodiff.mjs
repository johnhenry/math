// Exact and specialized number types, plus forward-mode automatic
// differentiation — exact derivatives via dual numbers, no finite
// differences.
//
// Run: npm install && node examples/03-exact-numbers-and-autodiff.mjs
import { ComplexNumber, Decimal, Interval, Rational, VectorCalculus } from "@johnhenry/math";

// Complex numbers
console.log(new ComplexNumber(3, 4).magnitude()); // 5

// Exact fractions — no drift
console.log(new Rational(2n, 4n).toString()); // 1/2

// Arbitrary precision decimals (constructed from strings, deliberately)
console.log(Decimal.fromString("1.5").add(Decimal.fromString("2.5")).toNumber()); // 4

// Interval arithmetic ROUNDS OUTWARD: every non-exact op widens by ~1 ULP
// per side so the true result is guaranteed inside. Don't equality-compare
// computed intervals — assert containment instead.
const sq = Interval.of(-2, 3).pow(2);
console.log(sq.toString()); // a hair wider than [0, 9] — that's the correctness

// Multivariable calculus via dual numbers: f(x, y) = x^2*y + y^3
const f = (xs) => xs[0].pow(2).multiply(xs[1]).add(xs[1].pow(3));
console.log(VectorCalculus.gradient(f, [1, 2])); // [4, 13] — exact
console.log(VectorCalculus.hessian(f, [1, 2])); // [[4, 2], [2, 12]]
console.log(VectorCalculus.directionalDerivative(f, [1, 2], [3, 4])); // 12.8

// Or symbolically, from an expression string
console.log(VectorCalculus.symbolicGradient("x^2*y + y^3", ["x", "y"], { x: 1, y: 2 })); // [4, 13]
