/**
 * A connection's difference in kilos on a lift the person knows (PR3). The
 * founder: kilos read at a glance where a percentage does not ("+2.7%
 * stronger" says less than "+4 kg on squat"). The percentage is each
 * session's estimated 1RM against the lift's own level, so the same share
 * of the lift's current level is the honest translation.
 *
 * Also the two groups' values in a few words ("303 vs 223 g"), for the
 * Connections rows. Pure: data and `now` in.
 */

import { addDays, type Now } from "@/lib/dates";
import { median } from "@/lib/stats";
import { MAIN_LIFT_WEEKS, pickMainLifts } from "@/lib/physique/strength";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { kgToDisplay, type WeightUnit } from "@/lib/units";

// ── Thresholds ──

/** Kilos an effect is rounded to. OURS: the smallest plate pair most gyms have (2 × 0.25 kg is rare); finer reads as false precision. */
export const EFFECT_ROUND_KG = 0.5;
/** Pounds an effect is rounded to. OURS: whole pounds, the same idea in lb. */
export const EFFECT_ROUND_LB = 1;

// ── Reference lift ──

export type ReferenceLift = {
  name: string;
  /** Median estimated 1RM over the last MAIN_LIFT_WEEKS weeks, kg. */
  levelKg: number;
};

/**
 * The lift a difference is put on: the main lift trained most in the last
 * MAIN_LIFT_WEEKS weeks, and on a tie the heaviest, where the same share
 * is the most kilos and the easiest to feel. Null without main lifts.
 */
export function referenceLift(workouts: readonly StoredWorkout[], unit: WeightUnit, now: Now): ReferenceLift | null {
  const from = addDays(now.today, -(MAIN_LIFT_WEEKS * 7 - 1));
  const lifts = pickMainLifts(workouts, unit, now)
    .map((l) => {
      const recent = l.exposures.filter((e) => e.date >= from && e.date <= now.today).map((e) => e.e1rm);
      return { name: l.name, sessions: l.recentExposures, levelKg: recent.length ? median(recent) : 0 };
    })
    .filter((l) => l.levelKg > 0);
  if (!lifts.length) return null;
  lifts.sort((a, b) => b.sessions - a.sessions || b.levelKg - a.levelKg);
  return { name: lifts[0].name, levelKg: lifts[0].levelKg };
}

/** A difference in percent as kilos on a level, unrounded. */
export function effectKg(diffPct: number, levelKg: number): number {
  return (levelKg * diffPct) / 100;
}

/** "+3.5 kg", "−2 kg", "+9 lb": rounded to EFFECT_ROUND_KG or EFFECT_ROUND_LB, signed, "0 kg" when it rounds away. */
export function formatEffect(kg: number, unit: WeightUnit): string {
  const step = unit === "lb" ? EFFECT_ROUND_LB : EFFECT_ROUND_KG;
  const v = Math.round(kgToDisplay(kg, unit) / step) * step;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${unit}`;
}

// ── Wording ──

const LEAD = /^([−+-]?\d[\d.,]*)(.*)$/;

/**
 * The two groups' values in a few words: a unit both share is said once
 * ("303 vs 223 g", "127 vs 791 under maintenance"); otherwise both in full
 * ("7h 48m vs 6h 10m"). The first letter is capitalised.
 */
export function compareText(high: string, low: string): string {
  const a = LEAD.exec(high);
  const b = LEAD.exec(low);
  const text = a && b && a[2] === b[2] && a[2].startsWith(" ") ? `${a[1]} vs ${b[1]}${a[2]}` : `${high} vs ${low}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
