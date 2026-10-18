/**
 * The Sleep tab's view model (05-design §9.6): time in bed and efficiency
 * for a night, the one-sentence read under the 14 nights, and the bars.
 * Everything reads the engine's night normalisation from
 * `lib/physique/sleep.ts` and never re-derives a status. The contributor
 * bars, the bedtime planner and the sleep-debt copy went in S9.
 *
 * Pure. Hours are decimal hours and clocks are "HH:MM" local.
 */

import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { MIN_NIGHTS_FOR_STATUS, SLEEP_WINDOW_NIGHTS, clampSleepGoal, nightsByDate } from "@/lib/physique/sleep";
import { formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import type { PhysiqueAnalysis, SleepNight } from "@/lib/physique/types";

// ── Constants (tags as in 02-engine-spec) ──

/** Efficiency (asleep ÷ in bed). Good ≥ 85% is the usual clinical cut-off (PUB, Ohayon 2017 NSF consensus); Excellent ≥ 90% and Fair ≥ 75% are OURS. */
export const EFFICIENCY = { excellent: 0.9, good: 0.85, fair: 0.75 } as const;

export type RatingWord = "Poor" | "Fair" | "Good" | "Excellent";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// ── Time in bed ──

export type BedTime = { min: number; kind: "in_bed" | "period" };

/**
 * Time in bed for one night, for efficiency. A logged time in bed when
 * there is one; otherwise the sleep period, asleep plus awake from the
 * watch's stages, or the span from bedtime to wake. The Apple Watch alone
 * records no "in bed" (the iPhone's Sleep schedule does), so watch nights
 * usually arrive without it. Null when nothing gives a span.
 */
export function bedTime(night: SleepNight): BedTime | null {
  if ((night.inBedMin ?? 0) > 0) return { min: night.inBedMin as number, kind: "in_bed" };
  const awake = night.stages?.awakeMin;
  if (typeof awake === "number" && Number.isFinite(awake) && awake >= 0 && night.asleepMin > 0) return { min: night.asleepMin + Math.round(awake), kind: "period" };
  const b = parseClock(night.bedtime);
  const w = parseClock(night.wakeTime);
  if (b !== null && w !== null) {
    const span = (w - b + 1440) % 1440;
    if (span >= night.asleepMin && span > 0) return { min: span, kind: "period" };
  }
  return null;
}

/** Asleep ÷ time in bed, 0..1, or null without a time in bed. */
export function efficiencyOf(night: SleepNight): number | null {
  const t = bedTime(night);
  return t && t.min > 0 ? clamp01(night.asleepMin / t.min) : null;
}

// ── Insight ──

export type SleepReadLike = Pick<PhysiqueAnalysis["sleep"], "status" | "mean14h" | "nightsLogged14" | "acute">;

/**
 * One calm sentence from the engine's read (rule copy, no AI): the
 * 14-night average against the goal. Never a number the engine did not
 * produce, never a banned phrase, never a running debt to pay back.
 */
export function sleepInsight(read: SleepReadLike, sleepGoalH?: number): string {
  const goal = formatHoursMin(clampSleepGoal(sleepGoalH) * 60);
  const n = read.nightsLogged14;
  if (n === 0) return `${MIN_NIGHTS_FOR_STATUS} of ${SLEEP_WINDOW_NIGHTS} nights give a first read.`;
  if (read.status === "unknown" || read.mean14h === null) {
    const more = Math.max(1, MIN_NIGHTS_FOR_STATUS - n);
    return `${n} of ${SLEEP_WINDOW_NIGHTS} nights logged. ${more} more ${more === 1 ? "gives" : "give"} a read.`;
  }
  const avg = formatHoursMin(read.mean14h * 60);
  if (read.acute && read.status !== "severe") return `Two short nights in a row. Over ${SLEEP_WINDOW_NIGHTS} nights you average ${avg} against the ${goal} goal.`;
  if (read.status === "severe") return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, well under the ${goal} goal.`;
  if (read.status === "short") return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, under the ${goal} goal.`;
  return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, on the ${goal} goal.`;
}

// ── Trend ──

export type TrendBar = { date: LocalDate; asleepH: number | null };

/** One slot per night of the 14-night window ending today; unlogged nights are null so no bar is drawn. */
export function trendBars(nights: readonly SleepNight[], now: Now): TrendBar[] {
  const byDate = nightsByDate(nights);
  const out: TrendBar[] = [];
  for (let i = SLEEP_WINDOW_NIGHTS - 1; i >= 0; i--) {
    const date = addDays(now.today, -i);
    const n = byDate.get(date);
    out.push({ date, asleepH: n && Number.isFinite(n.asleepH) ? n.asleepH : null });
  }
  return out;
}
