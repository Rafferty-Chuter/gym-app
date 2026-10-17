/**
 * Small pure helpers the Body page needs before P3's intake module lands:
 * day totals from entries, the most recent distinct foods, and the sleep
 * prefill medians. P3 owns adherence and day status.
 */

import type { FoodEntry, SavedFood, SleepNight } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";
import { median } from "@/lib/stats";

export type DayTotals = { kcal: number; proteinG: number; carbsG: number; fatG: number; entries: number };

export function dayTotals(entries: readonly FoodEntry[], date: LocalDate): DayTotals {
  const out: DayTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, entries: 0 };
  for (const e of entries) {
    if (e.date !== date) continue;
    out.kcal += e.kcal;
    out.proteinG += e.proteinG;
    out.carbsG += e.carbsG;
    out.fatG += e.fatG;
    out.entries += 1;
  }
  return out;
}

/** The last `n` distinct saved foods by last use, for one-tap re-log. */
export function recentFoods(saved: readonly SavedFood[], n = 8): SavedFood[] {
  return [...saved].sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0)).slice(0, n);
}

/** Minutes after midnight for "HH:MM"; null when malformed. */
export function parseClock(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Time in bed in minutes from a bedtime and wake clock, wrapping past midnight. */
export function minutesInBed(bedtime: string, wakeTime: string): number {
  const b = parseClock(bedtime);
  const w = parseClock(wakeTime);
  if (b === null || w === null) return 0;
  return ((w - b) % 1440 + 1440) % 1440;
}

/** Bedtime 23:00 and wake 07:00 when there is no history (U2a). OURS. */
export const DEFAULT_BEDTIME = "23:00";
export const DEFAULT_WAKE = "07:00";
/** Prefill: hours asleep = time in bed minus 20 minutes (U2a). OURS. */
export const ASLEEP_OFFSET_MIN = 20;

/** Median bedtime and wake over the last 7 logged nights, else the defaults. */
export function sleepPrefill(nights: readonly SleepNight[]): { bedtime: string; wakeTime: string } {
  const recent = [...nights]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7);
  // Bedtimes wrap midnight, so measure them relative to 18:00 before taking the median.
  const beds = recent.map((n) => parseClock(n.bedtime)).filter((x): x is number => x !== null).map((x) => (x - 18 * 60 + 1440) % 1440);
  const wakes = recent.map((n) => parseClock(n.wakeTime)).filter((x): x is number => x !== null);
  return {
    bedtime: beds.length ? formatClock(median(beds) + 18 * 60) : DEFAULT_BEDTIME,
    wakeTime: wakes.length ? formatClock(median(wakes)) : DEFAULT_WAKE,
  };
}

export function formatHoursMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
