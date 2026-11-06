import { ComplexNumber } from "./ComplexNumber.ts";

/**
 * General (non-symmetric) eigen solver: Householder reduction to upper
 * Hessenberg form, then single-shift QR iteration (Wilkinson shifts, Givens
 * rotations, deflation) in complex arithmetic until the matrix is the complex
 * Schur form `A = Z·T·Zᴴ`; eigenvectors come from back-substitution on the
 * triangular `T`. Real input with conjugate eigenvalue pairs works without a
 * separate real-Schur code path, at the cost of doing the arithmetic in ℂ.
 *
 * Mirrors `scipy.linalg.eig` / `numpy.linalg.eig` (right eigenvectors,
 * columns of `vectors`, unit 2-norm). Eigenvalues are sorted by descending
 * real part, then descending imaginary part; each eigenvector's largest
 * component is real and positive (LAPACK leaves that sign arbitrary).
 */

export interface GeneralEigenResult {
  /** Eigenvalues, `values[k]` pairs with column `k` of `vectors`. */
  values: ComplexNumber[];
  /** `n×n` matrix whose column `k` is the unit-norm eigenvector for `values[k]`. */
  vectors: ComplexNumber[][];
}

type CMat = { re: number[][]; im: number[][] };

const zeros = (n: number): number[][] => Array.from({ length: n }, () => new Array<number>(n).fill(0));

export function eigenGeneral(
  input: ReadonlyArray<ReadonlyArray<number | ComplexNumber>>,
  maxIterations = 60,
): GeneralEigenResult {
  const n = input.length;
  if (n === 0) return { values: [], vectors: [] };
  const H: CMat = { re: zeros(n), im: zeros(n) };
  for (let i = 0; i < n; i++) {
    if (input[i].length !== n) throw new Error("eigen requires a square matrix.");
    for (let j = 0; j < n; j++) {
      const v = input[i][j];
      if (typeof v === "number") H.re[i][j] = v;
      else {
        H.re[i][j] = v.re;
        H.im[i][j] = v.im;
      }
      if (!Number.isFinite(H.re[i][j]) || !Number.isFinite(H.im[i][j]))
        throw new Error("eigen requires finite matrix entries.");
    }
  }
  const Z: CMat = { re: zeros(n), im: zeros(n) };
  for (let i = 0; i < n; i++) Z.re[i][i] = 1;

  let norm = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) norm = Math.max(norm, Math.hypot(H.re[i][j], H.im[i][j]));
  if (norm === 0) norm = 1;

  hessenberg(H, Z, n);
  schur(H, Z, n, norm, maxIterations);

  // eigenvalues & vectors
  const tNorm = norm * n;
  const lam: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) lam.push([H.re[k][k], H.im[k][k]]);
  const realTol = 1e-12 * norm;
  const realInput = input.every((row) => row.every((v) => typeof v === "number" || v.im === 0));

  const cols: Array<{ lre: number; lim: number; vre: number[]; vim: number[] }> = [];
  for (let k = 0; k < n; k++) {
    // back-substitute (T - λ_k I) y = 0 with y_k = 1
    const yr = new Array<number>(n).fill(0);
    const yi = new Array<number>(n).fill(0);
    yr[k] = 1;
    for (let i = k - 1; i >= 0; i--) {
      let sr = 0;
      let si = 0;
      for (let j = i + 1; j <= k; j++) {
        sr += H.re[i][j] * yr[j] - H.im[i][j] * yi[j];
        si += H.re[i][j] * yi[j] + H.im[i][j] * yr[j];
      }
      let dr = H.re[i][i] - lam[k][0];
      let di = H.im[i][i] - lam[k][1];
      if (Math.hypot(dr, di) < Number.EPSILON * tNorm) {
        dr = Number.EPSILON * tNorm;
        di = 0;
      }
      const d2 = dr * dr + di * di;
      yr[i] = -(sr * dr + si * di) / d2;
      yi[i] = -(si * dr - sr * di) / d2;
    }
    // v = Z y
    const vre = new Array<number>(n).fill(0);
    const vim = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= k; j++) {
        vre[i] += Z.re[i][j] * yr[j] - Z.im[i][j] * yi[j];
        vim[i] += Z.re[i][j] * yi[j] + Z.im[i][j] * yr[j];
      }
    }
    // unit norm, largest component real positive
    let nrm = 0;
    let big = 0;
    let bigIdx = 0;
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(vre[i], vim[i]);
      nrm += m * m;
      if (m > big * (1 + 1e-12)) {
        big = m;
        bigIdx = i;
      }
    }
    nrm = Math.sqrt(nrm);
    const pr = vre[bigIdx] / big;
    const pi = -vim[bigIdx] / big; // conj(phase)
    for (let i = 0; i < n; i++) {
      const r = (vre[i] * pr - vim[i] * pi) / nrm;
      const m = (vre[i] * pi + vim[i] * pr) / nrm;
      vre[i] = r;
      vim[i] = m;
    }
    let lre = lam[k][0];
    let lim = lam[k][1];
    if (Math.abs(lim) <= realTol && realInput) {
      lim = 0;
      for (let i = 0; i < n; i++) if (Math.abs(vim[i]) <= 1e-10) vim[i] = 0;
    }
    if (lre === 0) lre = 0; // normalise -0
    cols.push({ lre, lim, vre, vim });
  }

  cols.sort((a, b) => (Math.abs(a.lre - b.lre) <= realTol ? b.lim - a.lim : b.lre - a.lre));
  return {
    values: cols.map((c) => new ComplexNumber(c.lre, c.lim)),
    vectors: Array.from({ length: n }, (_, i) => cols.map((c) => new ComplexNumber(c.vre[i], c.vim[i]))),
  };
}

/** Householder reduction to upper Hessenberg form, accumulating the unitary Z (`A = Z H Zᴴ`). */
function hessenberg(H: CMat, Z: CMat, n: number): void {
  for (let k = 0; k < n - 2; k++) {
    let alpha = 0;
    for (let i = k + 1; i < n; i++) alpha += H.re[i][k] ** 2 + H.im[i][k] ** 2;
    alpha = Math.sqrt(alpha);
    if (alpha === 0) continue;
    const x0 = Math.hypot(H.re[k + 1][k], H.im[k + 1][k]);
    // v = x + e^{i arg(x0)} alpha e1
    const pr = x0 === 0 ? 1 : H.re[k + 1][k] / x0;
    const pi = x0 === 0 ? 0 : H.im[k + 1][k] / x0;
    const vr = new Array<number>(n).fill(0);
    const vi = new Array<number>(n).fill(0);
    for (let i = k + 1; i < n; i++) {
      vr[i] = H.re[i][k];
      vi[i] = H.im[i][k];
    }
    vr[k + 1] += pr * alpha;
    vi[k + 1] += pi * alpha;
    let vv = 0;
    for (let i = k + 1; i < n; i++) vv += vr[i] ** 2 + vi[i] ** 2;
    if (vv === 0) continue;
    // H <- P H, P = I - 2 v vᴴ / vᴴv   (rows k+1.., all columns)
    for (let j = 0; j < n; j++) {
      let sr = 0;
      let si = 0;
      for (let i = k + 1; i < n; i++) {
        sr += vr[i] * H.re[i][j] + vi[i] * H.im[i][j];
        si += vr[i] * H.im[i][j] - vi[i] * H.re[i][j];
      }
      sr = (2 * sr) / vv;
      si = (2 * si) / vv;
      for (let i = k + 1; i < n; i++) {
        H.re[i][j] -= vr[i] * sr - vi[i] * si;
        H.im[i][j] -= vr[i] * si + vi[i] * sr;
      }
    }
    // H <- H P and Z <- Z P  (columns k+1..)
    for (const M of [H, Z]) {
      for (let i = 0; i < n; i++) {
        let sr = 0;
        let si = 0;
        for (let j = k + 1; j < n; j++) {
          sr += M.re[i][j] * vr[j] - M.im[i][j] * vi[j];
          si += M.re[i][j] * vi[j] + M.im[i][j] * vr[j];
        }
        sr = (2 * sr) / vv;
        si = (2 * si) / vv;
        for (let j = k + 1; j < n; j++) {
          M.re[i][j] -= sr * vr[j] + si * vi[j];
          M.im[i][j] -= si * vr[j] - sr * vi[j];
        }
      }
    }
    for (let i = k + 2; i < n; i++) {
      H.re[i][k] = 0;
      H.im[i][k] = 0;
    }
  }
}

/** Shifted QR iteration on a Hessenberg matrix until upper triangular (complex Schur form). */
function schur(H: CMat, Z: CMat, n: number, norm: number, maxIterations: number): void {
  let hi = n - 1;
  let iter = 0;
  let total = 0;
  while (hi > 0) {
    // find the start of the active unreduced block
    let l = hi;
    while (l > 0) {
      const s = Math.hypot(H.re[l - 1][l - 1], H.im[l - 1][l - 1]) + Math.hypot(H.re[l][l], H.im[l][l]);
      const sub = Math.hypot(H.re[l][l - 1], H.im[l][l - 1]);
      if (sub <= Number.EPSILON * (s === 0 ? norm : s)) {
        H.re[l][l - 1] = 0;
        H.im[l][l - 1] = 0;
        break;
      }
      l--;
    }
    if (l === hi) {
      hi--;
      iter = 0;
      continue;
    }
    if (++iter > maxIterations) throw new Error("eigen: QR iteration failed to converge.");
    if (++total > 1000 * n) throw new Error("eigen: QR iteration failed to converge.");

    // Wilkinson shift: eigenvalue of the trailing 2x2 closer to H[hi][hi]
    let mur: number;
    let mui: number;
    if (iter % 10 === 0) {
      // exceptional shift
      mur = H.re[hi][hi] + Math.hypot(H.re[hi][hi - 1], H.im[hi][hi - 1]);
      mui = H.im[hi][hi];
    } else {
      const ar = H.re[hi - 1][hi - 1];
      const ai = H.im[hi - 1][hi - 1];
      const br = H.re[hi - 1][hi];
      const bi = H.im[hi - 1][hi];
      const cr = H.re[hi][hi - 1];
      const ci = H.im[hi][hi - 1];
      const dr = H.re[hi][hi];
      const di = H.im[hi][hi];
      // tr/2, disc = sqrt(((a-d)/2)^2 + bc)
      const hr = (ar - dr) / 2;
      const hiI = (ai - di) / 2;
      const qr = hr * hr - hiI * hiI + (br * cr - bi * ci);
      const qi = 2 * hr * hiI + (br * ci + bi * cr);
      const qm = Math.hypot(qr, qi);
      const sr = Math.sqrt((qm + qr) / 2);
      const si = (qi < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (qm - qr) / 2));
      const mr = (ar + dr) / 2;
      const mi = (ai + di) / 2;
      const e1r = mr + sr;
      const e1i = mi + si;
      const e2r = mr - sr;
      const e2i = mi - si;
      if (Math.hypot(e1r - dr, e1i - di) <= Math.hypot(e2r - dr, e2i - di)) {
        mur = e1r;
        mui = e1i;
      } else {
        mur = e2r;
        mui = e2i;
      }
    }

    for (let i = l; i <= hi; i++) {
      H.re[i][i] -= mur;
      H.im[i][i] -= mui;
    }
    const rots: Array<[number, number, number]> = []; // [c, sr, si]
    for (let k = l; k < hi; k++) {
      const ar = H.re[k][k];
      const ai = H.im[k][k];
      const br = H.re[k + 1][k];
      const bi = H.im[k + 1][k];
      const am = Math.hypot(ar, ai);
      const r = Math.hypot(am, Math.hypot(br, bi));
      let c: number;
      let sr: number;
      let si: number;
      if (r === 0) {
        c = 1;
        sr = 0;
        si = 0;
      } else if (am === 0) {
        c = 0;
        // s = conj(b)/|b|
        const bm = Math.hypot(br, bi);
        sr = br / bm;
        si = -bi / bm;
      } else {
        c = am / r;
        // s = (a/|a|) conj(b) / r
        const pr = ar / am;
        const pi = ai / am;
        sr = (pr * br + pi * bi) / r;
        si = (pi * br - pr * bi) / r;
      }
      rots.push([c, sr, si]);
      // rows k, k+1 over columns k..n-1: [c s; -conj(s) c]
      for (let j = k; j < n; j++) {
        const xr = H.re[k][j];
        const xi = H.im[k][j];
        const yr = H.re[k + 1][j];
        const yi = H.im[k + 1][j];
        H.re[k][j] = c * xr + (sr * yr - si * yi);
        H.im[k][j] = c * xi + (sr * yi + si * yr);
        H.re[k + 1][j] = -(sr * xr + si * xi) + c * yr;
        H.im[k + 1][j] = -(sr * xi - si * xr) + c * yi;
      }
      H.re[k + 1][k] = 0;
      H.im[k + 1][k] = 0;
    }
    for (let idx = 0; idx < rots.length; idx++) {
      const k = l + idx;
      const [c, sr, si] = rots[idx];
      const top = Math.min(hi, k + 1);
      // columns k, k+1 over rows 0..top (H) and all rows (Z): multiply by Gᴴ = [c -s; conj(s) c]
      for (const [M, rowEnd] of [
        [H, top],
        [Z, n - 1],
      ] as Array<[CMat, number]>) {
        for (let i = 0; i <= rowEnd; i++) {
          const xr = M.re[i][k];
          const xi = M.im[i][k];
          const yr = M.re[i][k + 1];
          const yi = M.im[i][k + 1];
          M.re[i][k] = c * xr + (yr * sr + yi * si);
          M.im[i][k] = c * xi + (yi * sr - yr * si);
          M.re[i][k + 1] = -(xr * sr - xi * si) + c * yr;
          M.im[i][k + 1] = -(xr * si + xi * sr) + c * yi;
        }
      }
    }
    for (let i = l; i <= hi; i++) {
      H.re[i][i] += mur;
      H.im[i][i] += mui;
    }
  }
  // clear numerical dust below the diagonal
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      H.re[i][j] = 0;
      H.im[i][j] = 0;
    }
  }
}
