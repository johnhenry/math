import assert from "node:assert/strict";
import { test } from "node:test";
import { Polygon } from "../src/Polygon.ts";
import { Vector } from "../src/Vector.ts";

const pt = (x: number, y: number) => Vector.fromArray([x, y]);
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("vertex wraps around", () => {
  const p = new Polygon(pt(0, 0), pt(1, 0), pt(1, 1));
  assert.equal(p.vertex(3), p.vertex(0));
  assert.equal(p.vertexCount, 3);
  assert.equal(p.edgeCount, 3);
});

test("perimeter is a real length (bug fix: was truncated to uint)", () => {
  // right triangle 3-4-5
  const tri = new Polygon(pt(0, 0), pt(4, 0), pt(0, 3));
  assert.ok(close(tri.perimeter(), 12));
  // unit-ish triangle with fractional perimeter
  const t2 = new Polygon(pt(0, 0), pt(1, 0), pt(0, 1));
  assert.ok(close(t2.perimeter(), 2 + Math.SQRT2), "fractional perimeter preserved");
});

test("triangle area via Heron", () => {
  const tri = new Polygon(pt(0, 0), pt(4, 0), pt(0, 3));
  assert.ok(close(tri.area(), 6));
});

test("area via shoelace for a pentagon (bug fix)", () => {
  // square of side 2 -> area 4
  const square = new Polygon(pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2));
  assert.ok(close(square.area(), 4));
  // regular-ish pentagon (unit square with a triangular bump) — general n-gon
  const house = new Polygon(pt(0, 0), pt(2, 0), pt(2, 2), pt(1, 3), pt(0, 2));
  // square (4) + triangle base 2 height 1 (1) = 5
  assert.ok(close(house.area(), 5));
});

test("interior angle via law of cosines (bug fix: was always 0)", () => {
  const square = new Polygon(pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2));
  assert.ok(close(square.angle(1), Math.PI / 2), "square corner is 90 degrees");
});

test("edge and clone", () => {
  const p = new Polygon(pt(0, 0), pt(1, 0), pt(1, 1));
  const e = p.edge(0);
  assert.ok(e instanceof Polygon);
  assert.equal(e.vertexCount, 2);
  const c = p.clone();
  (c.vertex(0) as Vector<number>)[0] = 99;
  assert.equal(p.vertex(0)[0], 0, "deep clone independent");
});

test("Polygon.regular: hexagon area/perimeter match the closed-form n-gon formulas", () => {
  const hex = Polygon.regular(6, 1);
  assert.equal(hex.vertexCount, 6);
  assert.ok(close(hex.area(), 0.5 * 6 * Math.sin((2 * Math.PI) / 6)), "area = (1/2)*n*r^2*sin(2*pi/n)");
  assert.ok(close(hex.perimeter(), 6 * 2 * Math.sin(Math.PI / 6)), "perimeter = n*2*r*sin(pi/n)");
  assert.equal(hex.isConvex(), true);
});

test("Polygon.regular: startAngle=-pi/2 (default) points the first vertex straight up", () => {
  const square = Polygon.regular(4, 1);
  assert.ok(close(square.vertex(0)[0] as number, 0));
  assert.ok(close(square.vertex(0)[1] as number, -1));
});

test("Polygon.regular: radius and center are honored", () => {
  const tri = Polygon.regular(3, 2, pt(5, 5));
  for (let i = 0; i < 3; i++) {
    const v = tri.vertex(i);
    const dx = (v[0] as number) - 5;
    const dy = (v[1] as number) - 5;
    assert.ok(close(Math.sqrt(dx * dx + dy * dy), 2), `vertex ${i} is at radius 2 from center`);
  }
});

test("Polygon.regular: rejects n < 3", () => {
  assert.throws(() => Polygon.regular(2));
});
