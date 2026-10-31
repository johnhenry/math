import { formatTick, niceTicks, tickStep } from "./ticks.ts";
import { toScreenX, toScreenY, type Viewport } from "./viewport.ts";

/** Anything with parallel `x` / `y` arrays, e.g. {@link Samples}. `NaN` in `y` breaks the path. */
export interface XY {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
}

export interface PathOptions {
  /** Decimal places for screen coordinates. Default 2. */
  digits?: number;
}

/**
 * SVG path data (`d` attribute) for a sampled curve, mapped through the
 * viewport to a `width` x `height` screen box. Each run of finite rows is one
 * `M ... L ...` subpath, so gaps stay gaps. Empty input gives `""`.
 */
export function samplesToSvgPath(
  samples: XY,
  viewport: Viewport,
  width: number,
  height: number,
  options: PathOptions = {},
): string {
  const digits = options.digits ?? 2;
  const parts: string[] = [];
  let pen = false;
  const n = Math.min(samples.x.length, samples.y.length);
  for (let i = 0; i < n; i++) {
    const y = samples.y[i];
    const x = samples.x[i];
    if (!Number.isFinite(y) || !Number.isFinite(x)) {
      pen = false;
      continue;
    }
    const sx = toScreenX(x, viewport, width).toFixed(digits);
    const sy = toScreenY(y, viewport, height).toFixed(digits);
    parts.push(`${pen ? "L" : "M"}${sx} ${sy}`);
    pen = true;
  }
  return parts.join(" ");
}

/** Escape a value for use inside a double-quoted SVG attribute, so a caller-supplied colour cannot break out of it. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface AxesOptions {
  /** Approximate tick count per axis. Default 6. */
  targetTickCount?: number;
  /** Axis and tick colour. Default `#888`. */
  stroke?: string;
  /** Label colour. Default `#222`. */
  labelFill?: string;
  /** Label size in px. Default 11. */
  fontSize?: number;
}

/**
 * SVG elements (`<line>` and `<text>` with inline attributes, no stylesheet)
 * for x/y axes with ticks and labels. An axis sits at data zero when that is
 * on screen and otherwise hugs the nearest edge, labels flipping inward so
 * they never clip. The origin is labelled once. Returns `""` for a
 * degenerate viewport.
 */
export function axesToSvg(viewport: Viewport, width: number, height: number, options: AxesOptions = {}): string {
  const { xMin, xMax, yMin, yMax } = viewport;
  if (!(xMax > xMin) || !(yMax > yMin)) return "";
  const stroke = attr(options.stroke ?? "#888");
  const fill = attr(options.labelFill ?? "#222");
  const fontSize = options.fontSize !== undefined && Number.isFinite(options.fontSize) ? options.fontSize : 11;
  const count = options.targetTickCount ?? 6;
  const half = 4;
  const font = `font-size="${fontSize}" font-family="system-ui, sans-serif"`;

  const xAxisAtBottom = yMin > 0;
  const xAxisAtTop = yMax < 0;
  const axisY = xAxisAtBottom ? height : xAxisAtTop ? 0 : toScreenY(0, viewport, height);
  const yAxisAtRight = xMax < 0;
  const yAxisAtLeft = xMin > 0;
  const axisX = yAxisAtRight ? width : yAxisAtLeft ? 0 : toScreenX(0, viewport, width);

  const out: string[] = [
    `<line x1="0" y1="${axisY}" x2="${width}" y2="${axisY}" stroke="${stroke}" stroke-width="1" />`,
    `<line x1="${axisX}" y1="0" x2="${axisX}" y2="${height}" stroke="${stroke}" stroke-width="1" />`,
  ];

  const xStep = tickStep(xMin, xMax, count);
  const labelBelow = !xAxisAtBottom;
  for (const v of niceTicks(xMin, xMax, count)) {
    const sx = toScreenX(v, viewport, width);
    out.push(
      `<line x1="${sx.toFixed(2)}" y1="${(axisY - half).toFixed(2)}" x2="${sx.toFixed(2)}" y2="${(axisY + half).toFixed(2)}" stroke="${stroke}" stroke-width="1" />`,
    );
    if (v !== 0) {
      const ty = axisY + (labelBelow ? half + 2 : -(half + 2));
      out.push(
        `<text x="${sx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${fill}" ${font} text-anchor="middle" dominant-baseline="${labelBelow ? "hanging" : "auto"}">${formatTick(v, xStep)}</text>`,
      );
    }
  }

  const yStep = tickStep(yMin, yMax, count);
  const labelLeft = !yAxisAtLeft;
  for (const v of niceTicks(yMin, yMax, count)) {
    const sy = toScreenY(v, viewport, height);
    out.push(
      `<line x1="${(axisX - half).toFixed(2)}" y1="${sy.toFixed(2)}" x2="${(axisX + half).toFixed(2)}" y2="${sy.toFixed(2)}" stroke="${stroke}" stroke-width="1" />`,
    );
    const tx = axisX + (labelLeft ? -(half + 4) : half + 4);
    out.push(
      `<text x="${tx.toFixed(2)}" y="${sy.toFixed(2)}" fill="${fill}" ${font} text-anchor="${labelLeft ? "end" : "start"}" dominant-baseline="middle">${formatTick(v, yStep)}</text>`,
    );
  }
  return out.join("\n");
}

/** Wrap SVG `content` in a standalone `<svg>` document of the given size. */
export function svgDocument(width: number, height: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${content}\n</svg>`;
}
