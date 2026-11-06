import { Graph } from "./Graph.ts";
import { Rational } from "./Rational.ts";

/**
 * Two "Frobenius" normal forms.
 *
 * - {@link frobeniusNormalForm}: the *permutation* normal form of a square
 *   matrix (Frobenius / Perron-Frobenius block-triangular form). Treat the
 *   matrix as a weighted digraph (row `i` = node `i`'s out-edges, a non-zero
 *   entry = an edge); its strongly connected components, put in
 *   source-to-sink topological order, give a relabelling `P` for which
 *   `Pᵀ·A·P` is block upper triangular with an irreducible diagonal block per
 *   component. This is what mallory's matrix panel shows (`MAL-LIN-10`).
 * - {@link rationalCanonicalForm}: the *similarity* normal form (Frobenius
 *   normal form in the algebraic sense): `A ~ diag(C(f₁), …, C(f_k))`,
 *   companion blocks of the invariant factors `f₁ | f₂ | … | f_k`, computed
 *   exactly over ℚ from the Smith normal form of `xI − A`.
 */

export type NumericMatrix = ReadonlyArray<ReadonlyArray<number>>;

export interface FrobeniusBlock {
  /** The component's vertices as ORIGINAL matrix indices. */
  component: number[];
  /** Row/column range in `permuted` (inclusive start, exclusive end). */
  start: number;
  end: number;
}

export interface FrobeniusResult {
  /** `order[i]` = the original index now at permuted position `i`. */
  order: number[];
  /** Permutation matrix with `Pᵀ·matrix·P === permuted`. */
  P: number[][];
  /** `matrix` reindexed by `order` on both axes: block upper triangular. */
  permuted: number[][];
  /** One entry per strongly connected component, source to sink. */
  blocks: FrobeniusBlock[];
  /** True when the whole matrix is a single strongly connected component. */
  irreducible: boolean;
}

/**
 * The block-triangular (permutation) Frobenius normal form of a square matrix.
 * Diagonal entries are self-loops and never affect the component structure.
 * Within a component, original index order is the (deterministic) tiebreak.
 */
export function frobeniusNormalForm(matrix: NumericMatrix): FrobeniusResult {
  const n = matrix.length;
  for (const row of matrix) {
    if (row.length !== n)
      throw new Error(
        `frobeniusNormalForm requires a square matrix (got a ${n}-row matrix with a ${row.length}-entry row).`,
      );
  }
  const graph = new Graph<number>(true);
  for (let i = 0; i < n; i++) graph.addVertex(i);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (matrix[i][j] !== 0) graph.addEdge(i, j, matrix[i][j]);

  const { graph: dag, components } = graph.condensation();
  const topo = dag.topologicalSort();
  if (!topo) throw new Error("frobeniusNormalForm: condensation unexpectedly has a cycle.");

  const order: number[] = [];
  const blocks: FrobeniusBlock[] = [];
  for (const c of topo) {
    const component = [...components[c]].sort((a, b) => a - b);
    const start = order.length;
    order.push(...component);
    blocks.push({ component, start, end: order.length });
  }
  const permuted = order.map((oi) => order.map((oj) => matrix[oi][oj]));
  const P = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) P[order[i]][i] = 1;
  return { order, P, permuted, blocks, irreducible: components.length === 1 };
}

// ---- rational canonical form ------------------------------------------------

/** A polynomial over ℚ, coefficients lowest degree first, no trailing zeros ([] is the zero polynomial). */
type Poly = Rational[];

const trim = (p: Poly): Poly => {
  let n = p.length;
  while (n > 0 && p[n - 1].isZero()) n--;
  return p.slice(0, n);
};
const deg = (p: Poly) => p.length - 1;
const padd = (a: Poly, b: Poly): Poly =>
  trim(
    Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? Rational.Zero).add(b[i] ?? Rational.Zero)),
  );
const pneg = (a: Poly): Poly => a.map((c) => c.negate());
const pmul = (a: Poly, b: Poly): Poly => {
  if (!a.length || !b.length) return [];
  const out: Rational[] = Array.from({ length: a.length + b.length - 1 }, () => Rational.Zero);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] = out[i + j].add(a[i].multiply(b[j]));
  return trim(out);
};
/** Polynomial division with remainder (`b` non-zero). */
const pdivmod = (a: Poly, b: Poly): { q: Poly; r: Poly } => {
  let r = [...a];
  const q: Rational[] = Array.from({ length: Math.max(0, a.length - b.length + 1) }, () => Rational.Zero);
  const lead = b[b.length - 1];
  while (r.length >= b.length) {
    const c = r[r.length - 1].divide(lead);
    const d = r.length - b.length;
    q[d] = c;
    r = trim(r.map((x, i) => (i >= d ? x.subtract(c.multiply(b[i - d])) : x)));
  }
  return { q: trim(q), r };
};
const monic = (p: Poly): Poly => (p.length ? p.map((c) => c.divide(p[p.length - 1])) : p);

/** Smith normal form diagonal of a polynomial matrix, as monic polynomials (zero entries stay zero). */
function smithDiagonal(M: Poly[][]): Poly[] {
  const n = M.length;
  for (let t = 0; t < n; t++) {
    for (;;) {
      // pivot: non-zero entry of least degree in the trailing submatrix
      let pi = -1;
      let pj = -1;
      for (let i = t; i < n; i++) {
        for (let j = t; j < n; j++) {
          if (M[i][j].length && (pi < 0 || deg(M[i][j]) < deg(M[pi][pj]))) {
            pi = i;
            pj = j;
          }
        }
      }
      if (pi < 0) return M.map((row, i) => (i < t ? monic(row[i]) : [])).concat([]);
      [M[t], M[pi]] = [M[pi], M[t]];
      for (const row of M) [row[t], row[pj]] = [row[pj], row[t]];
      const p = M[t][t];
      let dirty = false;
      for (let i = t + 1; i < n; i++) {
        if (!M[i][t].length) continue;
        const { q } = pdivmod(M[i][t], p);
        for (let j = t; j < n; j++) M[i][j] = padd(M[i][j], pneg(pmul(q, M[t][j])));
        if (M[i][t].length) dirty = true;
      }
      for (let j = t + 1; j < n; j++) {
        if (!M[t][j].length) continue;
        const { q } = pdivmod(M[t][j], p);
        for (let i = t; i < n; i++) M[i][j] = padd(M[i][j], pneg(pmul(q, M[i][t])));
        if (M[t][j].length) dirty = true;
      }
      if (dirty) continue; // a smaller-degree remainder appeared: re-pivot
      // pivot must divide everything left; if not, fold the offending row in
      let bad = -1;
      for (let i = t + 1; i < n && bad < 0; i++) {
        for (let j = t + 1; j < n; j++) {
          if (M[i][j].length && pdivmod(M[i][j], p).r.length) {
            bad = i;
            break;
          }
        }
      }
      if (bad < 0) break;
      for (let j = t; j < n; j++) M[t][j] = padd(M[t][j], M[bad][j]);
    }
  }
  return M.map((row, i) => monic(row[i]));
}

export interface RationalCanonicalResult {
  /** Monic invariant factors `f₁ | f₂ | … | f_k` (non-constant only), each as coefficients lowest degree first. */
  invariantFactors: Rational[][];
  /** Block diagonal of the companion matrices of `invariantFactors` (n×n, exact). */
  form: Rational[][];
  /** The blocks' sizes (the degrees of the invariant factors). */
  blockSizes: number[];
}

/**
 * Rational canonical form (Frobenius normal form in the similarity sense) of a
 * square matrix with integer or {@link Rational} entries, exact over ℚ.
 * `invariantFactors` multiply to the characteristic polynomial and the last is
 * the minimal polynomial. Each companion block `C(f)` for
 * `f = xᵏ + c_{k-1}x^{k-1} + … + c₀` has ones on the subdiagonal and last
 * column `(-c₀, …, -c_{k-1})ᵀ`. The similarity transform itself is not returned.
 */
export function rationalCanonicalForm(
  matrix: ReadonlyArray<ReadonlyArray<number | bigint | Rational>>,
): RationalCanonicalResult {
  const n = matrix.length;
  for (const row of matrix) if (row.length !== n) throw new Error("rationalCanonicalForm requires a square matrix.");
  const A = matrix.map((row) => row.map((v) => Rational.from(v)));
  // xI - A as a polynomial matrix
  const M: Poly[][] = A.map((row, i) => row.map((a, j) => trim(i === j ? [a.negate(), Rational.One] : [a.negate()])));
  const diag = smithDiagonal(M);
  const factors = diag.filter((p) => p.length > 1);
  const form: Rational[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => Rational.Zero));
  let off = 0;
  for (const f of factors) {
    const k = deg(f);
    for (let i = 1; i < k; i++) form[off + i][off + i - 1] = Rational.One;
    for (let i = 0; i < k; i++) form[off + i][off + k - 1] = f[i].negate();
    off += k;
  }
  return { invariantFactors: factors, form, blockSizes: factors.map(deg) };
}
