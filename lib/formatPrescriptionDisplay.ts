/** Human-friendly ranges for programme cards (avoid "3-3 sets"). */
export function formatIntRange(range: { min: number; max: number }): string {
  const { min, max } = range;
  if (min === max) return String(min);
  return min < max ? `${min}-${max}` : `${max}-${min}`;
}
