// @johnhenry/math-sample: sample tan(x) the way a plot pane would (adaptive,
// gap-aware, typed arrays out), find where it breaks, and emit SVG.
//
// Run: npm install && npm run build && node examples/06-plot-sampling.mjs
import {
  axesToSvg,
  findDiscontinuities,
  niceTicks,
  panViewport,
  sampleAdaptive,
  samplesToSvgPath,
  svgDocument,
} from "@johnhenry/math-sample";
import { compileExpression } from "@johnhenry/math-sample/expr";

const f = compileExpression("tan(x)");
const view = { xMin: -5, xMax: 5, yMin: -6, yMax: 6 };

const s = sampleAdaptive(f, { min: view.xMin, max: view.xMax }, 200, {
  visibleYRange: { min: view.yMin, max: view.yMax },
});
console.log(`${s.x.length} samples, Float64Array: ${s.x instanceof Float64Array}`);

for (const g of findDiscontinuities(s)) {
  console.log(`gap between x=${g.before.x.toFixed(3)} and x=${g.after.x.toFixed(3)}`);
}
console.log("x ticks:", niceTicks(view.xMin, view.xMax).join(" "));

const panned = panViewport(view, 100, 0, 600, 300);
console.log("after dragging 100px right:", panned.xMin.toFixed(3), "..", panned.xMax.toFixed(3));

const svg = svgDocument(600, 300, `${axesToSvg(view, 600, 300)}\n<path d="${samplesToSvgPath(s, view, 600, 300)}" fill="none" stroke="#2563eb" />`);
console.log(`SVG document: ${svg.length} bytes`);
