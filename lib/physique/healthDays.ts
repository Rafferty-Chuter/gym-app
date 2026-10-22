/**
 * What the opt-in Apple Health kinds feed (IN8). Pure.
 *
 * Cycle: a day Apple Health records a period counts as a period day, as one
 * logged here would. The engines already handle those: a rate window with a
 * period near either end waits for a longer window (02 §3, G-NOISE-4), and
 * a scale jump names it, never sizes it (02 §10 rule 12).
 *
 * Wrist temperature: the night's reading against the person's own usual,
 * shown with that morning's HRV and resting heart rate.
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { median } from "@/lib/stats";
import type { DailyVitals, DayFlags } from "@/lib/physique/types";

// ── Thresholds ──

/** Nights before a night its usual wrist temperature is taken from. OURS: four weeks, as the recovery baselines. */
export const WRIST_USUAL_DAYS = 28;
/** Readings among them before a usual exists. OURS (rule 3): a week of nights. */
export const WRIST_USUAL_MIN = 7;

// ── Cycle ──

/**
 * Day flags with a period event on each day Apple Health records a flow
 * (any flow but "none"), unless the day already has one. The input is
 * returned as it is when there is nothing to add, so memoised reads keep
 * their identity.
 */
export function withHealthPeriods(dayFlags: Readonly<Record<string, DayFlags>>, vitals: readonly DailyVitals[]): Readonly<Record<string, DayFlags>> {
  let out: Record<string, DayFlags> | null = null;
  for (const v of vitals) {
    if (!v.menstrualFlow || v.menstrualFlow === "none") continue;
    const cur = (out ?? dayFlags)[v.date];
    if (cur?.events?.some((e) => e.type === "period")) continue;
    out ??= { ...dayFlags };
    out[v.date] = { ...(cur ?? { date: v.date }), events: [...(cur?.events ?? []), { type: "period" }] };
  }
  return out ?? dayFlags;
}

// ── Wrist temperature ──

export type WristTempRead = { c: number; usualC: number | null };

/** The night's wrist temperature and the person's usual over the four weeks before, or null with no reading that night. */
export function wristTempRead(vitals: readonly DailyVitals[], date: LocalDate): WristTempRead | null {
  const night = vitals.find((v) => v.date === date && v.wristTempC != null);
  if (night?.wristTempC == null) return null;
  const from = addDays(date, -WRIST_USUAL_DAYS);
  const before = vitals.filter((v) => v.date >= from && v.date < date && v.wristTempC != null).map((v) => v.wristTempC as number);
  return { c: night.wristTempC, usualC: before.length >= WRIST_USUAL_MIN ? Math.round(median(before) * 10) / 10 : null };
}
