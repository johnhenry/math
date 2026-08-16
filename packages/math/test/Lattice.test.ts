import assert from "node:assert/strict";
import { test } from "node:test";
import { HEX_AXIAL_DIRECTIONS, hexNeighbor, hexNeighbors, triNeighbor, triNeighbors, triOrientation } from "../src/Lattice.ts";

test("hexNeighbor: all 6 directions are reciprocal (direction d then (d+3)%6 returns to start)", () => {
  for (let d = 0; d < 6; d++) {
    const [nq, nr] = hexNeighbor(2, 3, d as 0 | 1 | 2 | 3 | 4 | 5);
    const [bq, br] = hexNeighbor(nq, nr, (((d + 3) % 6) as 0 | 1 | 2 | 3 | 4 | 5));
    assert.equal(bq, 2, `direction ${d} did not reciprocate (q)`);
    assert.equal(br, 3, `direction ${d} did not reciprocate (r)`);
  }
});

test("hexNeighbors returns all 6 offsets, matching HEX_AXIAL_DIRECTIONS", () => {
  const neighbors = hexNeighbors(0, 0);
  assert.equal(neighbors.length, 6);
  assert.deepEqual(neighbors, HEX_AXIAL_DIRECTIONS);
});

test("triOrientation alternates by (x+y) parity, including negative coordinates", () => {
  assert.equal(triOrientation(0, 0), "up");
  assert.equal(triOrientation(1, 0), "down");
  assert.equal(triOrientation(0, 1), "down");
  assert.equal(triOrientation(1, 1), "up");
  assert.equal(triOrientation(-1, 0), "down");
  assert.equal(triOrientation(-2, 0), "up");
});

test("triNeighbor: up(0,0).right and down's .left are reciprocal", () => {
  const [x1, y1] = triNeighbor(0, 0, "right");
  assert.equal(triOrientation(x1, y1), "down");
  const [x2, y2] = triNeighbor(x1, y1, "left");
  assert.deepEqual([x2, y2], [0, 0]);
});

test("triNeighbor: up(0,0).top and down's .bottom are reciprocal", () => {
  const [x1, y1] = triNeighbor(0, 0, "top");
  assert.equal(triOrientation(x1, y1), "down");
  const [x2, y2] = triNeighbor(x1, y1, "bottom");
  assert.deepEqual([x2, y2], [0, 0]);
});

test("triNeighbor: rejects a direction that doesn't match the cell's own orientation", () => {
  assert.throws(() => triNeighbor(0, 0, "bottom" as never), /only valid on a "down" cell/);
  assert.throws(() => triNeighbor(1, 0, "top" as never), /only valid on an "up" cell/);
});

test("triNeighbors returns exactly the 3 edge-sharing neighbors for each orientation", () => {
  const up = triNeighbors(0, 0);
  assert.equal(up.length, 3);
  assert.deepEqual(
    up.map(([x, y]) => triOrientation(x, y)),
    ["down", "down", "down"],
  );
  const down = triNeighbors(1, 0);
  assert.equal(down.length, 3);
  assert.deepEqual(
    down.map(([x, y]) => triOrientation(x, y)),
    ["up", "up", "up"],
  );
});
