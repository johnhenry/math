import assert from "node:assert/strict";
import { test } from "node:test";
import { ComplexNumber } from "../src/ComplexNumber.ts";
import { MatrixMath } from "../src/MatrixMath.ts";

/** Check eigenvalues against SciPy's, and every eigenpair by its residual ||A v - lambda v||. */
function checkEigen(A: number[][], expected: Array<[number, number]>, tol = 1e-8) {
  const n = A.length;
  const { values, vectors } = MatrixMath.eigen(A);
  assert.equal(values.length, n);
  // eigenvalues match the SciPy set (sorted order is ours: real desc, imag desc)
  values.forEach((v, k) => {
    assert.ok(
      Math.abs(v.re - expected[k][0]) < tol * Math.max(1, Math.abs(expected[k][0])) &&
        Math.abs(v.im - expected[k][1]) < tol * Math.max(1, Math.abs(expected[k][1])),
      `value ${k}: ${v.re}+${v.im}i vs ${expected[k]}`,
    );
  });
  for (let k = 0; k < n; k++) {
    let norm = 0;
    let resid = 0;
    for (let i = 0; i < n; i++) {
      const v = vectors[i][k];
      norm += v.re ** 2 + v.im ** 2;
      let ar = 0;
      let ai = 0;
      for (let j = 0; j < n; j++) {
        ar += A[i][j] * vectors[j][k].re;
        ai += A[i][j] * vectors[j][k].im;
      }
      const lr = values[k].re * v.re - values[k].im * v.im;
      const li = values[k].re * v.im + values[k].im * v.re;
      resid = Math.max(resid, Math.hypot(ar - lr, ai - li));
    }
    assert.ok(Math.abs(norm - 1) < 1e-10, `vector ${k} not unit norm: ${norm}`);
    assert.ok(resid < 1e-8, `residual ${resid} for eigenpair ${k}`);
  }
}

test("general eigen matches scipy.linalg.eig (eigenvalues) with valid unit eigenvectors", () => {
  // scipy: scipy.linalg.eig(A)[0]  -- rotation plus scale
  {
    const A = [
      [0.0, -2.0, 0.0],
      [2.0, 0.0, 0.0],
      [0.0, 0.0, 3.0],
    ];
    checkEigen(A, [
      [3.0, 0.0],
      [0.0, 2.0000000000000004],
      [0.0, -2.0000000000000004],
    ]);
  }
  // scipy: scipy.linalg.eig(A)[0]  -- companion of x^4 - 3x^3 + 2x^2 + x - 5
  {
    const A = [
      [0.0, 0.0, 0.0, 5.0],
      [1.0, 0.0, 0.0, -1.0],
      [0.0, 1.0, 0.0, -2.0],
      [0.0, 0.0, 1.0, 3.0],
    ];
    checkEigen(A, [
      [2.353209964199325, 0.0],
      [0.8233950179003375, 1.2028208192854777],
      [0.8233950179003375, -1.2028208192854777],
      [-0.9999999999999998, 0.0],
    ]);
  }
  // scipy: scipy.linalg.eig(A)[0]  -- random 5x5
  {
    const A = [
      [-0.007, 1.046, 0.742, 0.724, 1.619],
      [-1.206, -0.627, -1.321, -0.108, 0.999],
      [-0.022, 0.496, -1.911, 0.147, -0.907],
      [1.775, 0.887, 0.949, -0.058, 0.613],
      [0.658, -0.344, -0.497, -0.115, -0.605],
    ];
    checkEigen(A, [
      [1.0903185438916423, 0.0],
      [-0.5604596195276473, 1.1607309046914078],
      [-0.5604596195276473, -1.1607309046914078],
      [-0.8014370540343594, 0.0],
      [-2.3759622508019835, 0.0],
    ]);
  }
  // scipy: scipy.linalg.eig(A)[0]  -- random 8x8
  {
    const A = [
      [-0.594, -0.283, -0.728, 0.766, -1.596, 0.824, -0.626, -0.546],
      [-1.351, -0.144, -0.248, 0.191, -0.534, 0.094, 1.82, 0.409],
      [-0.574, 0.953, -0.129, 0.594, 0.613, -0.391, -1.93, -0.348],
      [0.551, -0.38, 0.439, 0.98, -0.544, 1.231, 1.622, 1.079],
      [1.165, 1.097, 2.255, 0.186, 0.002, 0.603, -0.908, -1.553],
      [-0.882, 0.373, 0.473, -1.536, -1.883, -0.316, -0.188, -0.049],
      [0.671, 1.229, 0.231, 0.613, -1.095, -1.176, 0.236, 0.665],
      [0.726, 0.593, 0.784, 0.81, -1.752, -0.734, 0.455, 0.597],
    ];
    checkEigen(A, [
      [3.399469377260999, 0.0],
      [1.5160781130973429, 0.0],
      [0.6091281392268724, 0.0],
      [0.2093617187012355, 2.063713972052666],
      [0.2093617187012355, -2.063713972052666],
      [-1.0541855680146275, 0.0],
      [-2.12860674948653, 1.9643785942760446],
      [-2.12860674948653, -1.9643785942760446],
    ]);
  }
  // scipy: scipy.linalg.eig(A)[0]  -- upper triangular
  {
    const A = [
      [2.0, 1.0, 4.0],
      [0.0, -1.0, 3.0],
      [0.0, 0.0, 5.0],
    ];
    checkEigen(A, [
      [5.0, 0.0],
      [2.0, 0.0],
      [-1.0, 0.0],
    ]);
  }
  // scipy: scipy.linalg.eig(A)[0]  -- Markov chain
  {
    const A = [
      [0.9, 0.075, 0.025],
      [0.15, 0.8, 0.05],
      [0.25, 0.25, 0.5],
    ];
    checkEigen(A, [
      [1.0000000000000002, 0.0],
      [0.7414213562373095, 0.0],
      [0.4585786437626903, 0.0],
    ]);
  }
  // scipy: scipy.linalg.eig(A)[0]  -- nilpotent-ish 4x4
  {
    const A = [
      [1.0, 2.0, 0.0, 1.0],
      [0.0, 1.0, 1.0, 0.0],
      [3.0, 0.0, 2.0, 1.0],
      [1.0, 1.0, 1.0, 4.0],
    ];
    checkEigen(A, [
      [5.1026996332739305, 0.0],
      [2.1278984971429016, 0.0],
      [0.38470093479158407, 1.5590838944739214],
      [0.38470093479158407, -1.5590838944739214],
    ]);
  }
});

test("symmetric input agrees with eigenSymmetric", () => {
  const A = [
    [4, 1, 2],
    [1, 3, 0],
    [2, 0, 5],
  ];
  const g = MatrixMath.eigen(A).values.map((v) => v.re);
  const s = [...MatrixMath.eigenSymmetric(A).values];
  for (const [i, v] of g.entries()) assert.ok(Math.abs(v - s[i]) < 1e-9);
  assert.ok(MatrixMath.eigen(A).values.every((v) => v.im === 0));
});

test("real eigenvalues give real eigenvectors; conjugate pairs come positive-imaginary first", () => {
  const { values, vectors } = MatrixMath.eigen([
    [0, -1],
    [1, 0],
  ]);
  assert.ok(Math.abs(values[0].im - 1) < 1e-12 && Math.abs(values[1].im + 1) < 1e-12);
  const r = MatrixMath.eigen([
    [2, 0],
    [0, 3],
  ]);
  assert.deepEqual(
    r.values.map((v) => [v.re, v.im]),
    [
      [3, 0],
      [2, 0],
    ],
  );
  assert.ok(r.vectors.flat().every((v) => v.im === 0));
  assert.equal(vectors.length, 2);
});

test("repeated eigenvalues, 1x1, zero and empty matrices", () => {
  assert.deepEqual(
    MatrixMath.eigen([[7]]).values.map((v) => v.re),
    [7],
  );
  assert.deepEqual(
    MatrixMath.eigen([
      [0, 0],
      [0, 0],
    ]).values.map((v) => v.re),
    [0, 0],
  );
  const id = MatrixMath.eigen([
    [2, 0, 0],
    [0, 2, 0],
    [0, 0, 2],
  ]);
  assert.ok(id.values.every((v) => Math.abs(v.re - 2) < 1e-12));
  assert.deepEqual(MatrixMath.eigen([]).values, []);
  assert.throws(() => MatrixMath.eigen([[1, 2], [3]]), /square/);
});

test("complex-entry matrix: Hermitian [[2, i], [-i, 2]] has eigenvalues 3 and 1", () => {
  const A = [
    [new ComplexNumber(2, 0), new ComplexNumber(0, 1)],
    [new ComplexNumber(0, -1), new ComplexNumber(2, 0)],
  ];
  const { values } = MatrixMath.eigen(A);
  assert.ok(Math.abs(values[0].re - 3) < 1e-12 && Math.abs(values[1].re - 1) < 1e-12);
  assert.ok(values.every((v) => Math.abs(v.im) < 1e-12));
});

test("scales: a large 30x30 non-symmetric matrix keeps small residuals", () => {
  let seed = 1;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  const n = 30;
  const A = Array.from({ length: n }, () => Array.from({ length: n }, rnd));
  const { values, vectors } = MatrixMath.eigen(A);
  const trace = A.reduce((s, r, i) => s + r[i], 0);
  assert.ok(Math.abs(values.reduce((s, v) => s + v.re, 0) - trace) < 1e-9);
  for (let k = 0; k < n; k++) {
    let resid = 0;
    for (let i = 0; i < n; i++) {
      let ar = 0;
      let ai = 0;
      for (let j = 0; j < n; j++) {
        ar += A[i][j] * vectors[j][k].re;
        ai += A[i][j] * vectors[j][k].im;
      }
      resid = Math.max(
        resid,
        Math.hypot(
          ar - (values[k].re * vectors[i][k].re - values[k].im * vectors[i][k].im),
          ai - (values[k].re * vectors[i][k].im + values[k].im * vectors[i][k].re),
        ),
      );
    }
    assert.ok(resid < 1e-9, `residual ${resid}`);
  }
});
