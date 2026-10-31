/**
 * The step "nice numbers" tick generation uses for `[min, max]`: the value of
 * 1, 2, 5 or 10 times a power of ten nearest `(max - min) / targetCount`.
 * Returns `NaN` for a degenerate range.
 */
export function tickStep(min: number, max: number, targetCount = 6): number {
  if (!(max > min) || !Number.isFinite(max - min) || !(targetCount >= 1)) return Number.NaN;
  const roughStep = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const nice = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return nice * magnitude;
}

/**
 * Round tick values inside `[min, max]`, about `targetCount` of them (default
 * 6). Ticks are integer multiples of the step, rounded to the step's own
 * decimal places, so `0.1 * 3` reads `0.3` and not `0.30000000000000004`.
 * Returns `[]` for a degenerate or non-finite range.
 */
export function niceTicks(min: number, max: number, targetCount = 6): number[] {
  const step = tickStep(min, max, targetCount);
  if (!Number.isFinite(step)) return [];
  const decimals = decimalsOf(step);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(roundTo(i * step, decimals));
  return ticks;
}

/** A tick label with as many decimals as `step` needs, so a run of labels reads uniformly (`3.0, 3.5, 4.0`). */
export function formatTick(value: number, step: number): string {
  if (value === 0) return "0";
  return value.toFixed(decimalsOf(step));
}

function decimalsOf(step: number): number {
  return Math.min(20, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
}

function roundTo(value: number, decimals: number): number {
  const r = Number(value.toFixed(decimals));
  return r === 0 ? 0 : r; // fold -0 into 0
}
