/**
 * Weekly report (06-execution Sprint 0, W1): one Monday-to-Sunday week of
 * everything the user logged, as numbers and the engine's own words.
 * Weight trend and rate, expenditure move, intake against target, protein,
 * sessions and hard sets per muscle, main-lift e1RM changes, sleep mean
 * and debt, the week's verdict, and every gap. Pure: the caller passes
 * the records, the expenditure series and the verdict.
 *
 * Copy rule for anything built on this: state what is, never cheer.
 */

import { addDays, dateRange, dayDiff, minDate, type LocalDate, type Now } from "@/lib/dates";
import { weekStart } from "@/lib/physique/food/week";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries, targetInEffect } from "@/lib/physique/intake";
import { displayRate, segmentStart, trendSeries, weighInsByDate } from "@/lib/physique/weight";
import { clampSleepGoal, nightsByDate, thresholdsForWindow, type NormalizedNight } from "@/lib/physique/sleep";
import { isCompoundLift, liftSeries, workoutDate } from "@/lib/physique/strength";
import { countHardSets } from "@/lib/completedSets";
import { getDetailedVolumeByMuscleGroup, type DetailedMuscleGroup } from "@/lib/trainingMetrics";
import { GROUP_LABEL } from "@/lib/volumeAnalysis";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";
import type { DayFlags, ExpenditurePoint, ExpenditureState, FoodEntry, PhysiqueGoal, PhysiqueProgram, SignalState, SleepNight, WeighIn } from "@/lib/physique/types";

/** Lift changes compare this week's best e1RM with the best of the previous 3 weeks. OURS. */
export const LIFT_BASELINE_WEEKS = 3;
/** Muscles shown in the training section, most sets first. OURS. */
export const MUSCLES_SHOWN = 8;

export type WeekGapKind = "food" | "weight" | "sleep";
export type WeekGap = { kind: WeekGapKind; date: LocalDate };

export type WeekVerdict = { title: string; detail: string; state: SignalState };

export type WeekReportInputs = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  workouts: readonly StoredWorkout[];
  program: PhysiqueProgram | null;
  goal: PhysiqueGoal | null;
  sleepGoalH?: number;
  weightUnit: WeightUnit;
  /** The engine's expenditure series up to today, or null before it can be seeded. */
  expenditure: readonly ExpenditurePoint[] | null;
  /** The judge's verdict as of today; shown on the current week only. */
  verdict?: WeekVerdict | null;
};

export type WeekReport = {
  start: LocalDate;
  end: LocalDate;
  /** Last day the report covers: the week's end, or today while the week runs. */
  through: LocalDate;
  /** True once the whole week is behind today. */
  complete: boolean;
  daysCovered: number;
  weight: {
    startTrendKg: number | null;
    endTrendKg: number | null;
    deltaKg: number | null;
    ratePctPerWeek: number | null;
    rateWindowDays: number | null;
    weighIns: number;
    missing: LocalDate[];
  };
  expenditure: { startKcal: number | null; endKcal: number | null; deltaKcal: number | null; state: ExpenditureState | null };
  food: {
    daysLogged: number;
    complete: number;
    partial: number;
    fasting: number;
    unlogged: LocalDate[];
    meanKcal: number | null;
    targetKcal: number | null;
    deltaKcal: number | null;
    meanProteinG: number | null;
    targetProteinG: number | null;
    proteinGPerKg: number | null;
  };
  training: {
    sessions: number;
    hardSets: number;
    byMuscle: Array<{ group: DetailedMuscleGroup; label: string; sets: number }>;
    lifts: Array<{ name: string; e1rmKg: number; prevE1rmKg: number | null; changePct: number | null }>;
  };
  sleep: {
    nights: number;
    missing: LocalDate[];
    meanH: number | null;
    debtH: number | null;
    goalH: number;
    shortNights: number;
  };
  verdict: WeekVerdict | null;
  gaps: WeekGap[];
  /** False when the week holds no food, weigh-in, night or workout at all. */
  hasData: boolean;
};

/** The Monday of the week containing `date`. */
export function reportWeekStart(date: LocalDate): LocalDate {
  return weekStart(date);
}

/**
 * The week a user most wants on opening: the running week once it has
 * three days of data, else the previous one. OURS.
 */
export function defaultReportWeek(today: LocalDate): LocalDate {
  const start = weekStart(today);
  return dayDiff(start, today) + 1 >= 3 ? start : addDays(start, -7);
}

/** A kind has gaps only from its first record onward, as the gap lists do (lib/physique/gaps.ts). */
function earliest(dates: Iterable<LocalDate>): LocalDate | null {
  let first: LocalDate | null = null;
  for (const d of dates) if (first == null || d < first) first = d;
  return first;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildWeekReport(inputs: WeekReportInputs, start: LocalDate, now: Now): WeekReport {
  const end = addDays(start, 6);
  const today = now.today;
  const through = minDate(end, today);
  const complete = end < today;
  const days = start <= through ? dateRange(start, through) : [];
  const daysCovered = days.length;

  // ── Weight ──
  const weighInsToEnd = inputs.weighIns.filter((w) => w.date <= through);
  const trend = trendSeries(weighInsToEnd);
  const trendAt = (date: LocalDate): number | null => {
    if (trend.length === 0) return null;
    let last: number | null = null;
    for (const p of trend) {
      if (p.date > date) break;
      last = p.trendKg;
    }
    return last;
  };
  const startTrendKg = trendAt(addDays(start, -1)) ?? trendAt(start);
  const endTrendKg = trendAt(through);
  const seg = segmentStart({ goal: inputs.goal, dayFlags: inputs.dayFlags, today: through });
  const rate = daysCovered > 0 ? displayRate(inputs.weighIns, through, seg, inputs.dayFlags) : null;
  const weighDates = weighInsByDate(inputs.weighIns);
  const firstWeigh = earliest(weighDates.keys());
  const weighMissing = days.filter((d) => firstWeigh != null && d >= firstWeigh && !weighDates.has(d));

  // ── Expenditure ──
  const expWeek = (inputs.expenditure ?? []).filter((p) => p.date >= start && p.date <= through);
  const expStart = expWeek[0] ?? null;
  const expEnd = expWeek[expWeek.length - 1] ?? null;

  // ── Food ──
  const intake = daysCovered > 0 ? dailyIntakeSeries(inputs.foodEntries, inputs.dayFlags, start, through) : [];
  const counted = intake.filter((d) => countsForBalance(d.status));
  const completeDays = intake.filter((d) => d.status === "complete");
  const target = targetInEffect(inputs.program, through);
  const meanKcal = counted.length ? Math.round(counted.reduce((s, d) => s + d.kcal, 0) / counted.length) : null;
  const meanProteinG = completeDays.length ? Math.round(completeDays.reduce((s, d) => s + d.proteinG, 0) / completeDays.length) : null;
  const firstFood = earliest([...inputs.foodEntries.map((e) => e.date), ...Object.values(inputs.dayFlags).filter((f) => f.status === "fasting" || typeof f.kcalOverride === "number").map((f) => f.date)]);
  const unlogged = intake.filter((d) => d.status === "unlogged" && firstFood != null && d.date >= firstFood).map((d) => d.date);

  // ── Training ──
  const weekWorkouts = inputs.workouts.filter((w) => {
    const d = workoutDate(w, now.tz);
    return d != null && d >= start && d <= through;
  });
  const hardSets = weekWorkouts.reduce((n, w) => n + (w.exercises ?? []).reduce((m, ex) => m + countHardSets(ex.sets ?? []), 0), 0);
  const volume = getDetailedVolumeByMuscleGroup(weekWorkouts);
  const byMuscle = (Object.entries(volume) as Array<[DetailedMuscleGroup, number]>)
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MUSCLES_SHOWN)
    .map(([group, sets]) => ({ group, label: GROUP_LABEL[group] ?? group, sets }));
  const baselineFrom = addDays(start, -LIFT_BASELINE_WEEKS * 7);
  const lifts = liftSeries(inputs.workouts, inputs.weightUnit, { today: through, tz: now.tz })
    .filter((s) => isCompoundLift(s.name, s.exerciseId))
    .map((s) => {
      const thisWeek = s.exposures.filter((e) => e.date >= start && e.date <= through);
      if (thisWeek.length === 0) return null;
      const prev = s.exposures.filter((e) => e.date >= baselineFrom && e.date < start);
      const e1rmKg = Math.max(...thisWeek.map((e) => e.e1rm));
      const prevE1rmKg = prev.length ? Math.max(...prev.map((e) => e.e1rm)) : null;
      return { name: s.name, e1rmKg: round1(e1rmKg), prevE1rmKg: prevE1rmKg != null ? round1(prevE1rmKg) : null, changePct: prevE1rmKg ? round1(((e1rmKg - prevE1rmKg) / prevE1rmKg) * 100) : null };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Sleep ──
  const goalH = clampSleepGoal(inputs.sleepGoalH);
  const byDate = nightsByDate(inputs.sleepNights);
  const nights: NormalizedNight[] = days.map((d) => byDate.get(d)).filter((n): n is NormalizedNight => n != null && n.valid);
  const firstNight = earliest(byDate.keys());
  const sleepMissing = days.filter((d) => firstNight != null && d >= firstNight && !byDate.has(d));
  const meanH = nights.length ? round1(nights.reduce((s, n) => s + n.asleepH, 0) / nights.length) : null;
  const debtH = nights.length ? round1(nights.reduce((s, n) => s + Math.max(0, goalH - n.asleepH), 0)) : null;
  const acuteH = thresholdsForWindow(nights).acuteH;
  const shortNights = nights.filter((n) => n.asleepH < acuteH).length;

  // ── Gaps ──
  const gaps: WeekGap[] = [
    ...unlogged.map((date) => ({ kind: "food" as const, date })),
    ...weighMissing.map((date) => ({ kind: "weight" as const, date })),
    ...sleepMissing.map((date) => ({ kind: "sleep" as const, date })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));

  return {
    start,
    end,
    through,
    complete,
    daysCovered,
    weight: {
      startTrendKg: startTrendKg != null ? round1(startTrendKg) : null,
      endTrendKg: endTrendKg != null ? round1(endTrendKg) : null,
      deltaKg: startTrendKg != null && endTrendKg != null ? round1(endTrendKg - startTrendKg) : null,
      ratePctPerWeek: rate ? Math.round(rate.result.ratePctPerWeek * 100) / 100 : null,
      rateWindowDays: rate ? rate.windowDays : null,
      weighIns: days.filter((d) => weighDates.has(d)).length,
      missing: weighMissing,
    },
    expenditure: {
      startKcal: expStart ? Math.round(expStart.tdee) : null,
      endKcal: expEnd ? Math.round(expEnd.tdee) : null,
      deltaKcal: expStart && expEnd ? Math.round(expEnd.tdee - expStart.tdee) : null,
      state: expEnd ? (expEnd.state === "holding" ? "holding" : null) : null,
    },
    food: {
      daysLogged: counted.length + intake.filter((d) => d.status === "partial").length,
      complete: completeDays.length,
      partial: intake.filter((d) => d.status === "partial").length,
      fasting: intake.filter((d) => d.status === "fasting").length,
      unlogged,
      meanKcal,
      targetKcal: target ? target.kcal : null,
      deltaKcal: meanKcal != null && target ? meanKcal - target.kcal : null,
      meanProteinG,
      targetProteinG: target ? target.proteinG : null,
      proteinGPerKg: meanProteinG != null && endTrendKg ? round1(meanProteinG / endTrendKg) : null,
    },
    training: { sessions: weekWorkouts.length, hardSets, byMuscle, lifts },
    sleep: { nights: nights.length, missing: sleepMissing, meanH, debtH, goalH, shortNights },
    verdict: inputs.verdict ?? null,
    gaps,
    hasData: counted.length + intake.filter((d) => d.status === "partial").length > 0 || days.some((d) => weighDates.has(d)) || nights.length > 0 || weekWorkouts.length > 0,
  };
}
