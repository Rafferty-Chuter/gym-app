/**
 * Plate calculator maths (Hevy's plate calculator, ticket R5). Pure: the
 * target, the bar and the plate denominations come in; the plates per side
 * come out, greedy from the heaviest plate down.
 */

/** Olympic bar weights. PUB: 20 kg / 45 lb standard bars; 15 kg women's bar; 10 kg technique bar. */
export const BAR_OPTIONS: Record<"kg" | "lb", readonly number[]> = { kg: [20, 15, 10], lb: [45, 35, 15] };

/** Common plate sets. PUB: calibrated kg plates; standard US lb plates. */
export const PLATE_OPTIONS: Record<"kg" | "lb", readonly number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export type PlateLoad = {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** Total that the bar plus plates reaches. */
  achieved: number;
  /** Target minus achieved (≥ 0): what the available plates cannot cover. */
  remainder: number;
  /** Target is below the bar. */
  belowBar: boolean;
};

/** Greedy load for `target` on a `bar` with `plates` available in unlimited pairs. */
export function platesPerSide(target: number, bar: number, plates: readonly number[]): PlateLoad {
  if (!Number.isFinite(target) || target <= bar) return { perSide: [], achieved: bar, remainder: 0, belowBar: Number.isFinite(target) && target < bar };
  let side = (target - bar) / 2;
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (side + 1e-9 >= p) {
      perSide.push(p);
      side -= p;
    }
  }
  const achieved = bar + 2 * perSide.reduce((s, p) => s + p, 0);
  return { perSide, achieved: Math.round(achieved * 100) / 100, remainder: Math.round((target - achieved) * 100) / 100, belowBar: false };
}

/** "25 · 10 · 2.5" for a side; "Bar only" for none. */
export function formatSide(perSide: readonly number[]): string {
  return perSide.length === 0 ? "Bar only" : perSide.map((p) => String(p)).join(" · ");
}
