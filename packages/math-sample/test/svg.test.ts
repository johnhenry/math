import assert from "node:assert/strict";
import { test } from "node:test";
import { axesToSvg, samplesToSvgPath, sampleUniform, svgDocument, type Viewport } from "../src/index.ts";

const V: Viewport = { xMin: 0, xMax: 4, yMin: 0, yMax: 4 };

test("samplesToSvgPath maps to screen space and restarts with M after a gap", () => {
  const s = sampleUniform((x) => (x === 2 ? Number.NaN : x), { min: 0, max: 4 }, 5);
  assert.equal(samplesToSvgPath(s, V, 400, 400, { digits: 1 }), "M0.0 400.0 L100.0 300.0 M300.0 100.0 L400.0 0.0");
});

test("samplesToSvgPath defaults to 2 digits and handles empty input", () => {
  assert.equal(samplesToSvgPath({ x: Float64Array.of(1 / 3), y: Float64Array.of(1) }, V, 100, 100), "M8.33 75.00");
  assert.equal(samplesToSvgPath({ x: new Float64Array(0), y: new Float64Array(0) }, V, 100, 100), "");
});

test("samplesToSvgPath accepts plain arrays", () => {
  assert.equal(samplesToSvgPath({ x: [0, 4], y: [0, 4] }, V, 4, 4, { digits: 0 }), "M0 4 L4 0");
});

test("axesToSvg draws axes at zero, ticks, and one origin label", () => {
  const svg = axesToSvg({ xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, 200, 200, { targetTickCount: 4 });
  assert.match(svg, /<line x1="0" y1="100" x2="200" y2="100"/);
  assert.match(svg, /<line x1="100" y1="0" x2="100" y2="200"/);
  assert.equal((svg.match(/>0<\/text>/g) ?? []).length, 1);
  assert.match(svg, /<text [^>]*>-2<\/text>/);
});

test("axesToSvg hugs the edge when zero is off-screen and flips labels inward", () => {
  const svg = axesToSvg({ xMin: 1, xMax: 5, yMin: 1, yMax: 5 }, 200, 200);
  assert.match(svg, /<line x1="0" y1="200" x2="200" y2="200"/);
  assert.match(svg, /<line x1="0" y1="0" x2="0" y2="200"/);
  assert.equal(axesToSvg({ xMin: 1, xMax: 1, yMin: 0, yMax: 1 }, 10, 10), "");
});

test("axesToSvg escapes nothing it was given: colours are attributes, labels are numbers", () => {
  const svg = axesToSvg(V, 100, 100, { stroke: "#123", labelFill: "#456" });
  assert.match(svg, /stroke="#123"/);
  assert.match(svg, /fill="#456"/);
});

test("svgDocument wraps content with a viewBox", () => {
  const doc = svgDocument(300, 200, "<g/>");
  assert.match(doc, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="300" height="200" viewBox="0 0 300 200">/);
  assert.match(doc, /<g\/>\n<\/svg>$/);
});
