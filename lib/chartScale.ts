/**
 * Shared Y-axis auto-scaling for trend charts. Used by both the Plateau
 * detail chart and the per-exercise charts on the Progress tab so axis
 * behaviour stays identical across the app.
 *
 * Rules (per P1.8):
 *   - Padding ≈ 15% of data range, with a 2-unit absolute minimum so small
 *     ranges still breathe.
 *   - Y-min is never negative (weights / e1RMs are >= 0).
 *   - Total span is at least 6 units — keeps small ranges from being masked
 *     and stops near-flat lines from looking exaggerated.
 *   - Final min/max snap to a sensible step (1, 2.5, or 5 depending on span)
 *     so axis labels are easy to read.
 *   - The returned `ticks` array is { min, mid, max } where mid is guaranteed
 *     to land on the same step grid.
 */

export type ChartYScale = {
  yMin: number;
  yMax: number;
  ticks: [number, number, number];
};

function pickStep(span: number): number {
  if (span >= 20) return 5;
  if (span >= 10) return 2.5;
  return 1;
}

export function computeNiceYAxis(values: readonly number[]): ChartYScale {
  if (values.length === 0) {
    return { yMin: 0, yMax: 10, ticks: [0, 5, 10] };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0, max - min);

  // Padding: 15% of range, at least 2 units either side.
  const pad = Math.max(range * 0.15, 2);
  let yMin = Math.max(0, min - pad);
  let yMax = max + pad;

  // Enforce minimum span so a flat-ish line still has visual breathing room
  // and doesn't look like a wild swing on a tiny axis.
  const MIN_SPAN = 6;
  if (yMax - yMin < MIN_SPAN) {
    const mid = (yMin + yMax) / 2;
    yMin = Math.max(0, mid - MIN_SPAN / 2);
    yMax = yMin + MIN_SPAN;
  }

  // Snap min/max to a sensible increment.
  const step = pickStep(yMax - yMin);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  // Make sure the span is an even number of steps so the middle tick is
  // a clean multiple of `step` rather than a half-step.
  const steps = Math.round((yMax - yMin) / step);
  if (steps % 2 !== 0) yMax += step;

  const yMid = (yMin + yMax) / 2;
  return { yMin, yMax, ticks: [yMin, yMid, yMax] };
}
