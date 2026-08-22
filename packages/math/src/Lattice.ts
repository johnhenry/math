/**
 * Lattice — axial-coordinate neighbor helpers for hexagonal and triangular
 * grids (part of johnhenry/math#30's "lattice-geometry helpers" item,
 * upstream for the generalized Wang tile laboratory,
 * johnhenry/mallory#92). Both the solver (adjacency for constraint
 * propagation) and the app (drawing) need a shared, tested "direction d's
 * neighbor" definition per lattice — this is that definition, kept purely
 * combinatorial (integer coordinate offsets), independent of any pixel
 * geometry (see {@link Polygon.regular} for that side).
 */

/** One of the 6 axial directions on a hex grid, in the standard pointy-top ordering (E, NE, NW, W, SW, SE). */
export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * The 6 axial-coordinate offsets, indexed by {@link HexDirection}. Opposite
 * directions are `d` and `(d+3) % 6` — verified: `hexNeighbor` in direction
 * `d` followed by `hexNeighbor` in direction `(d+3) % 6` returns to the
 * start cell, for every `d`.
 */
export const HEX_AXIAL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** The axial-coordinate neighbor of `(q, r)` in direction `d`. */
export function hexNeighbor(q: number, r: number, d: HexDirection): readonly [number, number] {
  const [dq, dr] = HEX_AXIAL_DIRECTIONS[d] as readonly [number, number];
  return [q + dq, r + dr];
}

/** Every axial neighbor of `(q, r)`, in direction order. */
export function hexNeighbors(q: number, r: number): Array<readonly [number, number]> {
  return [0, 1, 2, 3, 4, 5].map((d) => hexNeighbor(q, r, d as HexDirection));
}

/**
 * A triangular lattice cell's orientation: `(x, y)` with `x + y` even is
 * "up" (a triangle pointing up, vertex at the top edge), odd is "down" —
 * a lattice of alternating up/down triangles tiling the plane, indexed by
 * integer `(x, y)` (NOT pixel coordinates; see {@link Polygon.regular} for
 * that side).
 */
export type TriOrientation = "up" | "down";

export function triOrientation(x: number, y: number): TriOrientation {
  return (((x + y) % 2) + 2) % 2 === 0 ? "up" : "down";
}

/** An "up" triangle's 3 edge-sharing neighbors (all "down"): its left/right neighbors in the same row, and the one above sharing its top edge. */
export type UpTriDirection = "left" | "right" | "top";
/** A "down" triangle's 3 edge-sharing neighbors (all "up"): its left/right neighbors in the same row, and the one below sharing its bottom edge. */
export type DownTriDirection = "left" | "right" | "bottom";
export type TriDirection = UpTriDirection | DownTriDirection;

/**
 * The neighbor of triangular cell `(x, y)` in `direction` — reciprocal
 * pairs: an "up" cell's `"right"` neighbor's `"left"` is itself, and an
 * "up" cell's `"top"` neighbor's `"bottom"` is itself (verified before
 * writing tests). `direction` must match `(x, y)`'s own orientation
 * (`"top"` is only valid on an "up" cell, `"bottom"` only on "down").
 */
export function triNeighbor(x: number, y: number, direction: TriDirection): readonly [number, number] {
  const orientation = triOrientation(x, y);
  if (direction === "left") return [x - 1, y];
  if (direction === "right") return [x + 1, y];
  if (direction === "top") {
    if (orientation !== "up")
      throw new Error(`triNeighbor: "top" is only valid on an "up" cell, (${x},${y}) is "down".`);
    return [x, y + 1];
  }
  if (orientation !== "down")
    throw new Error(`triNeighbor: "bottom" is only valid on a "down" cell, (${x},${y}) is "up".`);
  return [x, y - 1];
}

/** Every edge-sharing neighbor of triangular cell `(x, y)`, in the direction order valid for its own orientation. */
export function triNeighbors(x: number, y: number): Array<readonly [number, number]> {
  const orientation = triOrientation(x, y);
  const directions: readonly TriDirection[] =
    orientation === "up" ? ["left", "right", "top"] : ["left", "right", "bottom"];
  return directions.map((d) => triNeighbor(x, y, d));
}
