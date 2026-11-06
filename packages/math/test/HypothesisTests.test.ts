import assert from "node:assert/strict";
import { test } from "node:test";
import { HypothesisTests } from "../src/Distributions.ts";

/** Relative closeness (absolute below 1e-15); goldens come from SciPy 1.18 (see the comment on each case). */
const near = (actual: number, expected: number, tol = 1e-9) => {
  const err = Math.abs(actual - expected);
  assert.ok(err <= tol * Math.abs(expected) || err < 1e-15, `${actual} vs ${expected}`);
};

const a = [5.1, 4.9, 6.2, 5.8, 6.0, 5.5, 5.3, 6.1];
const b = [4.2, 5.0, 4.8, 5.2, 4.4, 4.9, 5.6, 4.1, 4.7];
const pa = [10.2, 9.8, 11.5, 10.9, 12.1, 9.6];
const pb = [9.9, 9.1, 11.0, 10.2, 11.3, 9.7];

test("t-tests match SciPy (one-sample, Welch, pooled, paired; all alternatives)", () => {
  // scipy: ttest_1samp(a, 5.0, alternative='two-sided')
  {
    const r = HypothesisTests.tTestOneSample(a, 5.0, { alternative: "two-sided" });
    near(r.statistic, 3.569625885346298);
    near(r.df, 7.0);
    near(r.pValue, 0.009101473008820858);
  }
  // scipy: ttest_ind(a, b, equal_var=False, alternative='two-sided')
  {
    const r = HypothesisTests.tTestTwoSample(a, b, { alternative: "two-sided" });
    near(r.statistic, 3.597652824614619);
    near(r.df, 14.742175706623556);
    near(r.pValue, 0.002703955116314331);
  }
  // scipy: ttest_1samp(a, 5.0, alternative='less')
  {
    const r = HypothesisTests.tTestOneSample(a, 5.0, { alternative: "less" });
    near(r.statistic, 3.569625885346298);
    near(r.df, 7.0);
    near(r.pValue, 0.9954492634955896);
  }
  // scipy: ttest_ind(a, b, equal_var=False, alternative='less')
  {
    const r = HypothesisTests.tTestTwoSample(a, b, { alternative: "less" });
    near(r.statistic, 3.597652824614619);
    near(r.df, 14.742175706623556);
    near(r.pValue, 0.9986480224418428);
  }
  // scipy: ttest_1samp(a, 5.0, alternative='greater')
  {
    const r = HypothesisTests.tTestOneSample(a, 5.0, { alternative: "greater" });
    near(r.statistic, 3.569625885346298);
    near(r.df, 7.0);
    near(r.pValue, 0.004550736504410429);
  }
  // scipy: ttest_ind(a, b, equal_var=False, alternative='greater')
  {
    const r = HypothesisTests.tTestTwoSample(a, b, { alternative: "greater" });
    near(r.statistic, 3.597652824614619);
    near(r.df, 14.742175706623556);
    near(r.pValue, 0.0013519775581571655);
  }
  // scipy: ttest_ind(a, b)  # pooled, SciPy default
  {
    const r = HypothesisTests.tTestIndependent(a, b);
    near(r.statistic, 3.5991172943540453);
    near(r.df, 15.0);
    near(r.pValue, 0.002630418217690363);
  }
  // scipy: ttest_ind(a, b, equal_var=False)
  {
    const r = HypothesisTests.welch(a, b);
    near(r.statistic, 3.597652824614619);
    near(r.df, 14.742175706623556);
    near(r.pValue, 0.002703955116314331);
  }
  // scipy: ttest_rel(pa, pb)
  {
    const r = HypothesisTests.tTestPaired(pa, pb);
    near(r.statistic, 3.5116062277995);
    near(r.df, 5.0);
    near(r.pValue, 0.017071355778729987);
  }
  // scipy: ttest_rel(pa, pb, alternative='greater')
  {
    const r = HypothesisTests.tTestPaired(pa, pb, { alternative: "greater" });
    near(r.statistic, 3.5116062277995);
    near(r.df, 5.0);
    near(r.pValue, 0.008535677889364993);
  }
});

test("chi-square tests match SciPy", () => {
  // scipy: chisquare([18,22,29,31],[25,25,25,25])
  {
    const r = HypothesisTests.chiSquareGoodnessOfFit([18, 22, 29, 31], [25, 25, 25, 25]);
    near(r.statistic, 4.4);
    near(r.df, 3);
    near(r.pValue, 0.2213853871894879);
  }
  // scipy: chisquare([18,22,29,31])  # uniform expected
  {
    const r = HypothesisTests.chiSquareGoodnessOfFit([18, 22, 29, 31]);
    near(r.statistic, 4.4);
    near(r.df, 3);
    near(r.pValue, 0.2213853871894879);
  }
  // scipy: chisquare([18,22,29,31],[25]*4, ddof=1)
  {
    const r = HypothesisTests.chiSquareGoodnessOfFit([18, 22, 29, 31], [25, 25, 25, 25], 1);
    near(r.statistic, 4.4);
    near(r.df, 2);
    near(r.pValue, 0.11080315836233386);
  }
  // scipy: chi2_contingency([[12,5,7],[8,15,9]])
  {
    const r = HypothesisTests.chiSquareIndependence([
      [12, 5, 7],
      [8, 15, 9],
    ]);
    near(r.statistic, 5.009375000000001);
    near(r.df, 2);
    near(r.pValue, 0.08170112559814557);
    near(r.expected[0][1], 8.571428571428571);
  }
  // scipy: chi2_contingency([[20,15],[10,25]], correction=True)
  {
    const r = HypothesisTests.chiSquareIndependence([
      [20, 15],
      [10, 25],
    ]);
    near(r.statistic, 4.725);
    near(r.df, 1);
    near(r.pValue, 0.029727183306054526);
  }
  // scipy: chi2_contingency([[20,15],[10,25]], correction=False)
  {
    const r = HypothesisTests.chiSquareIndependence(
      [
        [20, 15],
        [10, 25],
      ],
      { correction: false },
    );
    near(r.statistic, 5.833333333333334);
    near(r.df, 1);
    near(r.pValue, 0.0157252997545054);
  }
});

test("confidence intervals match SciPy", () => {
  // scipy: ttest_1samp(a, 0).confidence_interval(0.95)
  {
    const [lo, hi] = HypothesisTests.confidenceIntervalMean(a, 0.95);
    near(lo, 5.206762143815647);
    near(hi, 6.018237856184353);
  }
  // scipy: ttest_1samp(a, 0).confidence_interval(0.99)
  {
    const [lo, hi] = HypothesisTests.confidenceIntervalMean(a, 0.99);
    near(lo, 5.012035528799753);
    near(hi, 6.212964471200246);
  }
  // scipy: ttest_ind(a, b, equal_var=False).confidence_interval(0.9)
  {
    const [lo, hi] = HypothesisTests.confidenceIntervalDifference(a, b, 0.9);
    near(lo, 0.43320507857045326);
    near(hi, 1.2584615880962111);
  }
  // scipy: binomtest(37, 120).proportion_ci(0.95, method='wilson')
  {
    const [lo, hi] = HypothesisTests.confidenceIntervalProportion(37, 120, 0.95);
    near(lo, 0.23272736988916295);
    near(hi, 0.3958299772380067);
  }
});

test("argument validation", () => {
  assert.throws(() => HypothesisTests.tTestPaired([1, 2], [1]), /equal length/);
  assert.throws(() => HypothesisTests.chiSquareGoodnessOfFit([10, 10], [5, 5]), /same total/);
  assert.throws(() => HypothesisTests.chiSquareGoodnessOfFit([1, 2], [1]), /same length/);
});
