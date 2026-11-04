import { type CancelSignal, SampleCancelledError } from "./sample.ts";

/**
 * A work limit for the 2D/3D samplers. When it runs out the sampler stops at a
 * row boundary and returns what it has, with a {@link Progress} saying where
 * it stopped (it does not throw).
 */
export interface Budget {
  /** Most function evaluations ("cells") the call may spend. Checked per row/slab. */
  maxCells?: number;
  /** Wall-clock limit in milliseconds. Checked per row/slab, so a single row can overrun it. */
  maxMillis?: number;
  /** Clock override for tests; default `performance.now` when present, else `Date.now`. */
  now?: () => number;
}

export interface Cancellable {
  signal?: CancelSignal;
  isCancelled?: () => boolean;
}

export interface Progress {
  /** Rows (or slabs, or steps) completed. */
  rows: number;
  /** Rows the full job needed. */
  of: number;
  complete: boolean;
  /** Why it stopped early. Absent when `complete`. */
  reason?: "cells" | "time";
}

/** Tracks a {@link Budget} and cancellation for one call. */
export class Meter {
  private readonly start: number;
  private spent = 0;
  private readonly now: () => number;
  private readonly budget: Budget | undefined;
  private readonly cancel: Cancellable | undefined;
  constructor(budget: Budget | undefined, cancel: Cancellable | undefined) {
    this.budget = budget;
    this.cancel = cancel;
    this.now = budget?.now ?? (typeof performance !== "undefined" ? () => performance.now() : () => Date.now());
    this.start = this.now();
  }
  /** Throws on cancellation; returns a reason when the budget cannot afford `cost` more evaluations. */
  check(cost: number): "cells" | "time" | undefined {
    if (this.cancel?.signal?.aborted || this.cancel?.isCancelled?.()) throw new SampleCancelledError();
    const b = this.budget;
    if (b?.maxCells !== undefined && this.spent + cost > b.maxCells) return "cells";
    if (b?.maxMillis !== undefined && this.now() - this.start > b.maxMillis) return "time";
    return undefined;
  }
  spend(n: number): void {
    this.spent += n;
  }
  get cells(): number {
    return this.spent;
  }
}

export function progress(rows: number, of: number, reason?: "cells" | "time"): Progress {
  return reason === undefined ? { rows, of, complete: rows >= of } : { rows, of, complete: false, reason };
}

export function assertCount(name: string, n: number, min = 2): void {
  if (!Number.isInteger(n) || n < min) throw new RangeError(`${name} must be an integer >= ${min}, got ${n}`);
}

export function assertRange(name: string, d: { min: number; max: number }): void {
  if (!Number.isFinite(d.min) || !Number.isFinite(d.max) || !(d.min < d.max))
    throw new RangeError(`${name} must be finite with min < max`);
}
