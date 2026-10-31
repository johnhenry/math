/** A rectangle of data space: the part of the plane a plot currently shows. */
export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Data x to a screen coordinate in `[0, width]` (left to right). */
export function toScreenX(x: number, viewport: Viewport, width: number): number {
  return ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width;
}

/** Data y to a screen coordinate in `[0, height]` (screen y grows downward, so this flips). */
export function toScreenY(y: number, viewport: Viewport, height: number): number {
  return height - ((y - viewport.yMin) / (viewport.yMax - viewport.yMin)) * height;
}

/** Inverse of {@link toScreenX}. */
export function toDataX(sx: number, viewport: Viewport, width: number): number {
  return viewport.xMin + (sx / width) * (viewport.xMax - viewport.xMin);
}

/** Inverse of {@link toScreenY}. */
export function toDataY(sy: number, viewport: Viewport, height: number): number {
  return viewport.yMin + ((height - sy) / height) * (viewport.yMax - viewport.yMin);
}

/**
 * The viewport of the given data-space span in which data point
 * (`anchorX`, `anchorY`) sits under screen point (`sx`, `sy`). Panning,
 * wheel-zoom and pinch-zoom all reduce to this: panning keeps the span and
 * moves the anchor's screen position; zooming keeps the anchor's screen
 * position and changes the span.
 */
export function viewportFromAnchor(
  anchorX: number,
  anchorY: number,
  sx: number,
  sy: number,
  spanX: number,
  spanY: number,
  width: number,
  height: number,
): Viewport {
  const xMin = anchorX - (sx / width) * spanX;
  const yMin = anchorY - ((height - sy) / height) * spanY;
  return { xMin, xMax: xMin + spanX, yMin, yMax: yMin + spanY };
}

/**
 * Pan by a pointer drag of (`dxPx`, `dyPx`) screen pixels: the content follows
 * the pointer, so dragging right moves the window left and dragging down moves
 * it up. Pixels are whatever unit `width`/`height` use (CSS px or device px,
 * as long as they agree).
 */
export function panViewport(viewport: Viewport, dxPx: number, dyPx: number, width: number, height: number): Viewport {
  const dx = (dxPx / width) * (viewport.xMax - viewport.xMin);
  const dy = (dyPx / height) * (viewport.yMax - viewport.yMin);
  return {
    xMin: viewport.xMin - dx,
    xMax: viewport.xMax - dx,
    yMin: viewport.yMin + dy,
    yMax: viewport.yMax + dy,
  };
}

/**
 * Scale both spans by `factor` (below 1 zooms in, above 1 zooms out) while
 * keeping the data point under screen point (`sx`, `sy`) fixed there.
 */
export function zoomViewport(
  viewport: Viewport,
  factor: number,
  sx: number,
  sy: number,
  width: number,
  height: number,
): Viewport {
  const ax = toDataX(sx, viewport, width);
  const ay = toDataY(sy, viewport, height);
  return viewportFromAnchor(
    ax,
    ay,
    sx,
    sy,
    (viewport.xMax - viewport.xMin) * factor,
    (viewport.yMax - viewport.yMin) * factor,
    width,
    height,
  );
}

/** Wheel step: scrolling down (`deltaY > 0`) zooms out (factor above 1), up zooms in. Feed to {@link zoomViewport}. */
export function wheelZoomFactor(deltaY: number, step = 1.1): number {
  return deltaY > 0 ? step : 1 / step;
}

/** Pinch span factor: fingers moving apart zoom in (factor below 1). Feed to {@link zoomViewport}. */
export function pinchZoomFactor(startDistancePx: number, currentDistancePx: number): number {
  return startDistancePx / currentDistancePx;
}

/**
 * The viewport that bounds the finite `(x, y)` points, grown by `padding` (a
 * fraction of each span, default 0.05). A degenerate extent (one point, or a
 * constant) is widened to a span of 2 so the result is always drawable.
 * Non-finite values (gaps) are ignored. With no finite points, returns `[-1, 1]^2`.
 */
export function fitViewport(x: ArrayLike<number>, y: ArrayLike<number>, padding = 0.05): Viewport {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const px = x[i];
    const py = y[i];
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (px < xMin) xMin = px;
    if (px > xMax) xMax = px;
    if (py < yMin) yMin = py;
    if (py > yMax) yMax = py;
  }
  if (xMin > xMax) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  const pad = (lo: number, hi: number): [number, number] => {
    if (hi === lo) return [lo - 1, hi + 1];
    const p = (hi - lo) * padding;
    return [lo - p, hi + p];
  };
  const [x0, x1] = pad(xMin, xMax);
  const [y0, y1] = pad(yMin, yMax);
  return { xMin: x0, xMax: x1, yMin: y0, yMax: y1 };
}

/**
 * Canvas backing-store size for a CSS-pixel box at a device pixel ratio:
 * set `canvas.width/height` to `width`/`height` and `ctx.scale(scale, scale)`,
 * then draw in CSS pixels. A non-finite or non-positive `dpr` is treated as 1.
 * Sample against the CSS size (or the backing size) consistently; the
 * viewport maths is unit-agnostic.
 */
export function backingStoreSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { width: number; height: number; scale: number } {
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return { width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale), scale };
}
