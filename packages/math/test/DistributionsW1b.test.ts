import assert from "node:assert/strict";
import { test } from "node:test";
import { Distributions } from "../src/Distributions.ts";
import { Rng } from "../src/Random.ts";

/** Relative closeness (absolute below 1e-15); goldens come from SciPy 1.18 (see the comment on each line). */
const near = (actual: number, expected: number, tol = 1e-9) => {
  const err = Math.abs(actual - expected);
  assert.ok(err <= tol * Math.abs(expected) || err < 1e-15, `${actual} vs ${expected}`);
};

test("continuous distributions match SciPy (pdf, cdf, sf, ppf)", () => {
  // scipy: norm(1,2).pdf(-3.0)
  near(Distributions.normal(1, 2).pdf(-3.0), 0.02699548325659403);
  // scipy: norm(1,2).cdf(-3.0)
  near(Distributions.normal(1, 2).cdf(-3.0), 0.022750131948179195);
  // scipy: norm(1,2).sf(-3.0)
  near(Distributions.normal(1, 2).sf(-3.0), 0.9772498680518208);
  // scipy: norm(1,2).pdf(0.5)
  near(Distributions.normal(1, 2).pdf(0.5), 0.19333405840142465);
  // scipy: norm(1,2).cdf(0.5)
  near(Distributions.normal(1, 2).cdf(0.5), 0.4012936743170763);
  // scipy: norm(1,2).sf(0.5)
  near(Distributions.normal(1, 2).sf(0.5), 0.5987063256829237);
  // scipy: norm(1,2).pdf(4.0)
  near(Distributions.normal(1, 2).pdf(4.0), 0.06475879783294587);
  // scipy: norm(1,2).cdf(4.0)
  near(Distributions.normal(1, 2).cdf(4.0), 0.9331927987311419);
  // scipy: norm(1,2).sf(4.0)
  near(Distributions.normal(1, 2).sf(4.0), 0.06680720126885807);
  // scipy: norm(1,2).ppf(1e-10)
  near(Distributions.normal(1, 2).ppf(1e-10), -11.722681804808111);
  // scipy: norm(1,2).ppf(0.025)
  near(Distributions.normal(1, 2).ppf(0.025), -2.919927969080109);
  // scipy: norm(1,2).ppf(0.5)
  near(Distributions.normal(1, 2).ppf(0.5), 1.0);
  // scipy: norm(1,2).ppf(0.975)
  near(Distributions.normal(1, 2).ppf(0.975), 4.919927969080108);
  // scipy: norm(1,2).ppf(0.999999)
  near(Distributions.normal(1, 2).ppf(0.999999), 10.506848617634175);
  // scipy: norm.sf(8)
  near(Distributions.normal().sf(8), 6.22096057427174e-16);
  // scipy: t(5).pdf(-2.5)
  near(Distributions.studentT(5).pdf(-2.5), 0.03332623888702283);
  // scipy: t(5).cdf(-2.5)
  near(Distributions.studentT(5).cdf(-2.5), 0.02724504967118813);
  // scipy: t(5).sf(-2.5)
  near(Distributions.studentT(5).sf(-2.5), 0.9727549503288119);
  // scipy: t(5).pdf(0.3)
  near(Distributions.studentT(5).pdf(0.3), 0.3598243283490097);
  // scipy: t(5).cdf(0.3)
  near(Distributions.studentT(5).cdf(0.3), 0.6118754788683627);
  // scipy: t(5).sf(0.3)
  near(Distributions.studentT(5).sf(0.3), 0.38812452113163726);
  // scipy: t(5).pdf(6.0)
  near(Distributions.studentT(5).pdf(6.0), 0.0006884815401374296);
  // scipy: t(5).cdf(6.0)
  near(Distributions.studentT(5).cdf(6.0), 0.999076930855203);
  // scipy: t(5).sf(6.0)
  near(Distributions.studentT(5).sf(6.0), 0.0009230691447970072);
  // scipy: t(5).ppf(0.001)
  near(Distributions.studentT(5).ppf(0.001), -5.893429531356009);
  // scipy: t(5).ppf(0.025)
  near(Distributions.studentT(5).ppf(0.025), -2.5705818356363155);
  // scipy: t(5).ppf(0.9)
  near(Distributions.studentT(5).ppf(0.9), 1.4758840488244815);
  // scipy: t(5).ppf(0.995)
  near(Distributions.studentT(5).ppf(0.995), 4.032142983555228);
  // scipy: t(2.5).ppf(0.975)
  near(Distributions.studentT(2.5).ppf(0.975), 3.5746548420036817);
  // scipy: chi2(4).pdf(0.5)
  near(Distributions.chiSquare(4).pdf(0.5), 0.09735009788392562);
  // scipy: chi2(4).cdf(0.5)
  near(Distributions.chiSquare(4).cdf(0.5), 0.026499021160743912);
  // scipy: chi2(4).sf(0.5)
  near(Distributions.chiSquare(4).sf(0.5), 0.9735009788392561);
  // scipy: chi2(4).pdf(3.0)
  near(Distributions.chiSquare(4).pdf(3.0), 0.1673476201113224);
  // scipy: chi2(4).cdf(3.0)
  near(Distributions.chiSquare(4).cdf(3.0), 0.4421745996289252);
  // scipy: chi2(4).sf(3.0)
  near(Distributions.chiSquare(4).sf(3.0), 0.5578254003710748);
  // scipy: chi2(4).pdf(12.0)
  near(Distributions.chiSquare(4).pdf(12.0), 0.007436256529999077);
  // scipy: chi2(4).cdf(12.0)
  near(Distributions.chiSquare(4).cdf(12.0), 0.9826487347633355);
  // scipy: chi2(4).sf(12.0)
  near(Distributions.chiSquare(4).sf(12.0), 0.01735126523666451);
  // scipy: chi2(4).ppf(0.05)
  near(Distributions.chiSquare(4).ppf(0.05), 0.7107230213973239);
  // scipy: chi2(4).ppf(0.5)
  near(Distributions.chiSquare(4).ppf(0.5), 3.3566939800333224);
  // scipy: chi2(4).ppf(0.99)
  near(Distributions.chiSquare(4).ppf(0.99), 13.276704135987622);
  // scipy: chi2(1).ppf(0.95)
  near(Distributions.chiSquare(1).ppf(0.95), 3.841458820694124);
  // scipy: f(3,7).pdf(0.4)
  near(Distributions.fisherF(3, 7).pdf(0.4), 0.6555047581751856);
  // scipy: f(3,7).cdf(0.4)
  near(Distributions.fisherF(3, 7).cdf(0.4), 0.2424975282447003);
  // scipy: f(3,7).sf(0.4)
  near(Distributions.fisherF(3, 7).sf(0.4), 0.7575024717552998);
  // scipy: f(3,7).pdf(2.0)
  near(Distributions.fisherF(3, 7).pdf(2.0), 0.1463569502018979);
  // scipy: f(3,7).cdf(2.0)
  near(Distributions.fisherF(3, 7).cdf(2.0), 0.7973063575133491);
  // scipy: f(3,7).sf(2.0)
  near(Distributions.fisherF(3, 7).sf(2.0), 0.2026936424866509);
  // scipy: f(3,7).pdf(9.0)
  near(Distributions.fisherF(3, 7).pdf(9.0), 0.002537124529885142);
  // scipy: f(3,7).cdf(9.0)
  near(Distributions.fisherF(3, 7).cdf(9.0), 0.9915531602647225);
  // scipy: f(3,7).sf(9.0)
  near(Distributions.fisherF(3, 7).sf(9.0), 0.00844683973527757);
  // scipy: f(3,7).ppf(0.05)
  near(Distributions.fisherF(3, 7).ppf(0.05), 0.11252716602610753);
  // scipy: f(3,7).ppf(0.5)
  near(Distributions.fisherF(3, 7).ppf(0.5), 0.870944253187285);
  // scipy: f(3,7).ppf(0.95)
  near(Distributions.fisherF(3, 7).ppf(0.95), 4.346831399907814);
  // scipy: f(3,7).mean()
  near(Distributions.fisherF(3, 7).mean(), 1.4);
  // scipy: f(3,9).var()
  near(Distributions.fisherF(3, 9).variance(), 2.204081632653061);
  // scipy: gamma(2.5, scale=1.5).cdf(4)
  near(Distributions.gamma(2.5, 1.5).cdf(4), 0.6234323552910233);
  // scipy: gamma(2.5, scale=1.5).pdf(4)
  near(Distributions.gamma(2.5, 1.5).pdf(4), 0.15174242533170468);
  // scipy: expon(scale=0.5).cdf(0.7)
  near(Distributions.exponential(2).cdf(0.7), 0.7534030360583935);
  // scipy: expon(scale=0.5).sf(0.7)
  near(Distributions.exponential(2).sf(0.7), 0.2465969639416065);
  // scipy: expon(scale=0.5).ppf(0.3)
  near(Distributions.exponential(2).ppf(0.3), 0.17833747196936622);
  // scipy: expon(scale=0.5).pdf(0.7)
  near(Distributions.exponential(2).pdf(0.7), 0.493193927883213);
  // scipy: uniform(2,4).cdf(3)
  near(Distributions.uniform(2, 6).cdf(3), 0.25);
  // scipy: uniform(2,4).ppf(0.25)
  near(Distributions.uniform(2, 6).ppf(0.25), 3.0);
  // scipy: uniform(2,4).var()
  near(Distributions.uniform(2, 6).variance(), 1.3333333333333333);
});

test("discrete distributions match SciPy (pmf, cdf, sf, ppf)", () => {
  // scipy: binom(12,0.3).pmf(0)
  near(Distributions.binomial(12, 0.3).pmf(0), 0.013841287200999995);
  // scipy: binom(12,0.3).cdf(0)
  near(Distributions.binomial(12, 0.3).cdf(0), 0.013841287201000013);
  // scipy: binom(12,0.3).sf(0)
  near(Distributions.binomial(12, 0.3).sf(0), 0.986158712799);
  // scipy: binom(12,0.3).pmf(3)
  near(Distributions.binomial(12, 0.3).pmf(3), 0.23970042557999985);
  // scipy: binom(12,0.3).cdf(3)
  near(Distributions.binomial(12, 0.3).cdf(3), 0.4925157734350003);
  // scipy: binom(12,0.3).sf(3)
  near(Distributions.binomial(12, 0.3).sf(3), 0.5074842265649997);
  // scipy: binom(12,0.3).pmf(7)
  near(Distributions.binomial(12, 0.3).pmf(7), 0.029111471928000003);
  // scipy: binom(12,0.3).cdf(7)
  near(Distributions.binomial(12, 0.3).cdf(7), 0.99051062887);
  // scipy: binom(12,0.3).sf(7)
  near(Distributions.binomial(12, 0.3).sf(7), 0.009489371129999995);
  // scipy: binom(12,0.3).pmf(12)
  near(Distributions.binomial(12, 0.3).pmf(12), 5.314409999999998e-7);
  // scipy: binom(12,0.3).cdf(12)
  near(Distributions.binomial(12, 0.3).cdf(12), 1.0);
  // scipy: binom(12,0.3).sf(12)
  near(Distributions.binomial(12, 0.3).sf(12), 0.0);
  // scipy: binom(12,0.3).ppf(0.01)
  assert.equal(Distributions.binomial(12, 0.3).ppf(0.01), 0);
  // scipy: binom(12,0.3).ppf(0.5)
  assert.equal(Distributions.binomial(12, 0.3).ppf(0.5), 4);
  // scipy: binom(12,0.3).ppf(0.9)
  assert.equal(Distributions.binomial(12, 0.3).ppf(0.9), 6);
  // scipy: binom(12,0.3).ppf(0.999)
  assert.equal(Distributions.binomial(12, 0.3).ppf(0.999), 9);
  // scipy: poisson(4.5).pmf(0)
  near(Distributions.poisson(4.5).pmf(0), 0.011108996538242306);
  // scipy: poisson(4.5).cdf(0)
  near(Distributions.poisson(4.5).cdf(0), 0.011108996538242308);
  // scipy: poisson(4.5).sf(0)
  near(Distributions.poisson(4.5).sf(0), 0.9888910034617577);
  // scipy: poisson(4.5).pmf(2)
  near(Distributions.poisson(4.5).pmf(2), 0.11247858994970336);
  // scipy: poisson(4.5).cdf(2)
  near(Distributions.poisson(4.5).cdf(2), 0.17357807091003602);
  // scipy: poisson(4.5).sf(2)
  near(Distributions.poisson(4.5).sf(2), 0.8264219290899639);
  // scipy: poisson(4.5).pmf(9)
  near(Distributions.poisson(4.5).pmf(9), 0.0231645795826592);
  // scipy: poisson(4.5).cdf(9)
  near(Distributions.poisson(4.5).cdf(9), 0.9829072671006214);
  // scipy: poisson(4.5).sf(9)
  near(Distributions.poisson(4.5).sf(9), 0.017092732899378595);
  // scipy: poisson(4.5).ppf(0.01)
  assert.equal(Distributions.poisson(4.5).ppf(0.01), 0);
  // scipy: poisson(4.5).ppf(0.5)
  assert.equal(Distributions.poisson(4.5).ppf(0.5), 4);
  // scipy: poisson(4.5).ppf(0.99)
  assert.equal(Distributions.poisson(4.5).ppf(0.99), 10);
});

test("ppf inverts cdf", () => {
  for (const dist of [
    Distributions.normal(),
    Distributions.studentT(3),
    Distributions.chiSquare(6),
    Distributions.fisherF(4, 9),
    Distributions.gamma(0.7, 2),
  ]) {
    for (const p of [0.001, 0.2, 0.5, 0.8, 0.999]) near(dist.cdf(dist.ppf(p)), p, 1e-9);
  }
  assert.equal(Distributions.normal().ppf(0), Number.NEGATIVE_INFINITY);
  assert.equal(Distributions.normal().ppf(1), Number.POSITIVE_INFINITY);
  assert.ok(Number.isNaN(Distributions.normal().ppf(1.5)));
  assert.equal(Distributions.normal().quantile(0.5), 0);
});

test("moments", () => {
  assert.equal(Distributions.binomial(10, 0.4).mean(), 4);
  near(Distributions.poisson(3).std(), Math.sqrt(3));
  near(Distributions.studentT(5).variance(), 5 / 3);
  assert.equal(Distributions.chiSquare(7).mean(), 7);
});

test("seeded sampling is reproducible and has the right moments", () => {
  const draw = (seed: number) => Distributions.normal(5, 2, new Rng(seed).next).rvs(50);
  assert.deepEqual(draw(7), draw(7));
  assert.notDeepEqual(draw(7), draw(8));
  const rng = new Rng(2024);
  const checks: Array<[string, { rvs(n: number): number[]; mean(): number; std(): number }]> = [
    ["normal", Distributions.normal(5, 2, rng.next)],
    ["exponential", Distributions.exponential(2, rng.next)],
    ["uniform", Distributions.uniform(1, 4, rng.next)],
    ["chi2", Distributions.chiSquare(5, rng.next)],
    ["t", Distributions.studentT(12, rng.next)],
    ["F", Distributions.fisherF(6, 20, rng.next)],
    ["binomial", Distributions.binomial(20, 0.3, rng.next)],
    ["poisson", Distributions.poisson(6, rng.next)],
  ];
  for (const [name, dist] of checks) {
    const xs = dist.rvs(20000);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(
      Math.abs(m - dist.mean()) < (4 * dist.std()) / Math.sqrt(xs.length),
      `${name} mean ${m} vs ${dist.mean()}`,
    );
  }
  // large-lambda Poisson does not underflow
  const big = Distributions.poisson(2000, rng.next).rvs(200);
  assert.ok(Math.abs(big.reduce((a, b) => a + b, 0) / 200 - 2000) < 30);
});
