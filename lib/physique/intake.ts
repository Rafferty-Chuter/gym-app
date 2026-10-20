/**
 * Intake: day status, daily totals, partial-day suggestions, window means,
 * logged share, adherence and macro means per kg.
 * Normative spec: docs/plan/02-engine-spec.md §1.2 (day status), §3.
 *
 * Pure. Dates are local `YYYY-MM-DD`; energy is kcal; macros are grams.
 */

import { addDays, dateRange, type LocalDate } from "@/lib/dates";
import { mean, median, stdev } from "@/lib/stats";
import type { DailyIntake, DayFlags, DayStatus, FoodEntry, PhysiqueProgram, ProgramEntry } from "@/lib/physique/types";

// ── Constants (tags per 02-engine-spec) ──

/** A day below this share of the recent median is suggested as partial. OURS (MacroFactor's example is 500 vs 2,000). */
export const PARTIAL_RATIO = 0.5;
/** Days of history the partial-day median looks back over. PUB (MacroFactor's 21-day nutrition window). */
export const PARTIAL_LOOKBACK_DAYS = 21;
/** Complete days needed before a "norm" exists to compare against. OURS: fewer days don't establish a habit. */
export const PARTIAL_MIN_COMPLETE_DAYS = 7;
/** Adherence window. PUB (MacroFactor coaches on roughly two weeks of intake). */
export const ADHERENCE_WINDOW_DAYS = 14;
/** Fixed part of the adherence tolerance, kcal/day. OURS. */
export const ADHERENCE_TOLERANCE_KCAL = 150;
/** Two-sided 95% z for the adherence noise term: |delta| is tested both ways. OURS (sim: a plain ±150 fires 10.7% of the time on a perfectly adherent user; 1.645 still fired 10 to 17% in the usefulness study, research H). */
export const ADHERENCE_Z = 1.96;
/** Window for the short macro means, days. OURS. */
export const MACRO_WINDOW_SHORT_DAYS = 7;
/** Window for the long macro means, days. OURS. */
export const MACRO_WINDOW_LONG_DAYS = 14;

// ── Day status ──

/** Days that count as logged intake for means, logged share and expenditure. */
export function countsAsLogged(status: DayStatus): boolean {
  return status === "complete" || status === "fasting";
}

function sumEntries(entries: readonly FoodEntry[]): { kcal: number; proteinG: number; carbsG: number; fatG: number } {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const e of entries) {
    kcal += Number.isFinite(e.kcal) ? e.kcal : 0;
    proteinG += Number.isFinite(e.proteinG) ? e.proteinG : 0;
    carbsG += Number.isFinite(e.carbsG) ? e.carbsG : 0;
    fatG += Number.isFinite(e.fatG) ? e.fatG : 0;
  }
  return { kcal, proteinG, carbsG, fatG };
}

/**
 * One day's intake and status (02 §1.2). `kcalOverride` beats the sum of
 * entries; `fasting` counts as 0 kcal; a user-flagged `partial` is skipped;
 * no entries and no override is `unlogged`. The partial suggestion is set
 * later by `dailyIntakeSeries`, because it needs the surrounding days.
 */
export function dailyIntake(date: LocalDate, entries: readonly FoodEntry[], flags: DayFlags | undefined): DailyIntake {
  const sums = sumEntries(entries);
  const hasOverride = typeof flags?.kcalOverride === "number" && Number.isFinite(flags.kcalOverride);
  const kcal = hasOverride ? (flags!.kcalOverride as number) : sums.kcal;
  let status: DayStatus;
  if (flags?.status === "fasting") status = "fasting";
  else if (entries.length === 0 && !hasOverride) status = "unlogged";
  else if (flags?.status === "partial") status = "partial";
  else status = "complete";
  return {
    date,
    kcal: status === "fasting" ? 0 : kcal,
    proteinG: status === "fasting" ? 0 : sums.proteinG,
    carbsG: status === "fasting" ? 0 : sums.carbsG,
    fatG: status === "fasting" ? 0 : sums.fatG,
    status,
    suggestedPartial: false,
    entries: entries.length,
  };
}

/** Food entries grouped by local date. */
export function entriesByDate(foodEntries: readonly FoodEntry[]): Map<LocalDate, FoodEntry[]> {
  const out = new Map<LocalDate, FoodEntry[]>();
  for (const e of foodEntries) {
    const list = out.get(e.date);
    if (list) list.push(e);
    else out.set(e.date, [e]);
  }
  return out;
}

/**
 * The daily intake series for every day in [from, to], with suspected
 * partial days left out: a complete day with 0 < kcal < PARTIAL_RATIO ×
 * the median of the other complete days in the previous
 * PARTIAL_LOOKBACK_DAYS (needs PARTIAL_MIN_COMPLETE_DAYS of them) becomes
 * `partial` with `suggestedPartial` set, so the engine skips it without
 * asking (C11; it used to wait for an answer). A day the user marked
 * complete in Edit day (`partialDismissed`) always counts.
 */
export function dailyIntakeSeries(
  foodEntries: readonly FoodEntry[],
  dayFlags: Readonly<Record<string, DayFlags>>,
  from: LocalDate,
  to: LocalDate
): DailyIntake[] {
  const byDate = entriesByDate(foodEntries);
  const days = dateRange(from, to).map((date) => dailyIntake(date, byDate.get(date) ?? [], dayFlags[date]));
  // Suggestions: compare each complete day with the complete days before it.
  const recent: number[] = []; // kcal of complete days, oldest first, within the lookback
  const recentDates: LocalDate[] = [];
  for (const day of days) {
    while (recentDates.length > 0 && recentDates[0] < addDays(day.date, -PARTIAL_LOOKBACK_DAYS)) {
      recentDates.shift();
      recent.shift();
    }
    if (day.status === "complete") {
      const dismissed = dayFlags[day.date]?.partialDismissed === true;
      if (!dismissed && day.kcal > 0 && recent.length >= PARTIAL_MIN_COMPLETE_DAYS) {
        const norm = median(recent);
        if (day.kcal < PARTIAL_RATIO * norm) {
          day.suggestedPartial = true;
          day.status = "partial";
        }
      }
      // A suspected partial day is not part of anyone's norm.
      if (!day.suggestedPartial) {
        recent.push(day.kcal);
        recentDates.push(day.date);
      }
    }
  }
  return days;
}

export function intakeByDate(series: readonly DailyIntake[]): Map<LocalDate, DailyIntake> {
  return new Map(series.map((d) => [d.date, d]));
}

/** Dates in [from, to] the engine left out as suspected partial days, ascending (C11). */
export function partialDaysLeftOut(series: readonly DailyIntake[], from?: LocalDate, to?: LocalDate): LocalDate[] {
  return series
    .filter((d) => d.suggestedPartial && (!from || d.date >= from) && (!to || d.date <= to))
    .map((d) => d.date)
    .sort();
}

// ── Windows ──

function inWindow(series: readonly DailyIntake[], endDate: LocalDate, windowDays: number): DailyIntake[] {
  const start = addDays(endDate, -(windowDays - 1));
  return series.filter((d) => d.date >= start && d.date <= endDate);
}

/** Mean kcal over complete and fasting days in the window (02 §3). Null with no such day. */
export function intakeMean(series: readonly DailyIntake[], endDate: LocalDate, windowDays: number): number | null {
  const kcal = inWindow(series, endDate, windowDays)
    .filter((d) => countsAsLogged(d.status))
    .map((d) => d.kcal);
  return kcal.length ? mean(kcal) : null;
}

/** (complete + fasting days) ÷ window days (02 §3). */
export function loggedShare(series: readonly DailyIntake[], endDate: LocalDate, windowDays: number): number {
  if (windowDays <= 0) return 0;
  const n = inWindow(series, endDate, windowDays).filter((d) => countsAsLogged(d.status)).length;
  return n / windowDays;
}

// ── Targets in effect ──

/** The program entry in effect on `date`: the latest with `startDate ≤ date` (02 §1.1). */
export function targetInEffect(program: PhysiqueProgram | null | undefined, date: LocalDate): ProgramEntry | null {
  if (!program) return null;
  let best: ProgramEntry | null = null;
  for (const entry of program.history) {
    if (entry.startDate > date) continue;
    if (!best || entry.startDate > best.startDate || (entry.startDate === best.startDate && entry.acceptedAt >= best.acceptedAt)) {
      best = entry;
    }
  }
  return best;
}

// ── Adherence ──

export type Adherence = {
  /** Mean (intake − target) over logged days with a program; null when not computable. */
  deltaKcal: number | null;
  onTarget: boolean | null;
  /** Tolerance the delta was judged against. */
  threshold: number | null;
  /** Logged days with a target that went into the mean. */
  n: number;
  /** Days in the window that had a program in effect. */
  daysWithProgram: number;
  windowDays: number;
};

/**
 * Adherence against the target in effect on each day (02 §3): the mean of
 * (intake − target) over complete/fasting days with a program in the last
 * `windowDays`. On target unless |delta| > max(150, 1.96 × sd / √n).
 * Suspected partial days are already left out (C11), so nothing waits on them.
 */
export function adherence(
  series: readonly DailyIntake[],
  program: PhysiqueProgram | null | undefined,
  endDate: LocalDate,
  windowDays: number = ADHERENCE_WINDOW_DAYS
): Adherence {
  const window = inWindow(series, endDate, windowDays);
  const diffs: number[] = [];
  let daysWithProgram = 0;
  for (const day of window) {
    const target = targetInEffect(program, day.date);
    if (!target) continue;
    daysWithProgram++;
    if (!countsAsLogged(day.status)) continue;
    diffs.push(day.kcal - target.kcal);
  }
  const base = { n: diffs.length, daysWithProgram, windowDays };
  if (diffs.length === 0) return { ...base, deltaKcal: null, onTarget: null, threshold: null };
  const delta = mean(diffs);
  const sd = stdev(diffs);
  const threshold = Math.max(ADHERENCE_TOLERANCE_KCAL, (ADHERENCE_Z * sd) / Math.sqrt(diffs.length));
  return { ...base, deltaKcal: delta, onTarget: Math.abs(delta) <= threshold, threshold };
}

// ── Macro means per kg ──

export type MacroMeans = {
  proteinGPerKg: number | null;
  fatGPerKg: number | null;
  carbsGPerKg: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  /** Complete days that went into the means. */
  n: number;
  windowDays: number;
};

/** Mean protein, fat and carbs over complete days, per kg of `bwKg` (02 §3). */
export function macroMeans(series: readonly DailyIntake[], endDate: LocalDate, windowDays: number, bwKg: number | null): MacroMeans {
  const days = inWindow(series, endDate, windowDays).filter((d) => d.status === "complete");
  const n = days.length;
  if (n === 0) {
    return { proteinGPerKg: null, fatGPerKg: null, carbsGPerKg: null, proteinG: null, fatG: null, carbsG: null, n, windowDays };
  }
  const proteinG = mean(days.map((d) => d.proteinG));
  const fatG = mean(days.map((d) => d.fatG));
  const carbsG = mean(days.map((d) => d.carbsG));
  const perKg = (g: number) => (bwKg && bwKg > 0 ? g / bwKg : null);
  return { proteinGPerKg: perKg(proteinG), fatGPerKg: perKg(fatG), carbsGPerKg: perKg(carbsG), proteinG, fatG, carbsG, n, windowDays };
}
