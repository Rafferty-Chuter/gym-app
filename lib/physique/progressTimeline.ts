/**
 * The Progress timeline (PR1): every measure the app keeps, rolled into
 * weeks on one shared axis, so weight, food, training and sleep can be
 * read side by side over a month, a quarter, half a year or the whole
 * history. The founder: people should "truly see all their data in one
 * place and see the connections"; the weekly report alone stops being
 * enough after a few months.
 *
 * Weeks run Monday to Sunday, the last one up to today. A weekly mean needs
 * WEEK_MIN_DAYS of its kind, otherwise the week shows nothing for it rather
 * than a number from one or two days. Pure: data and `now` in, weeks out.
 */

import { addDays, dayDiff, minDate, type LocalDate, type Now } from "@/lib/dates";
import { mean, median, olsSlope } from "@/lib/stats";
import { countHardSets } from "@/lib/completedSets";
import { countsForBalance } from "@/lib/physique/food/energy";
import { weekStart } from "@/lib/physique/food/week";
import { dailyIntakeSeries, targetInEffect } from "@/lib/physique/intake";
import { nightsByDate, SLEEP_USUAL_MIN_NIGHTS } from "@/lib/physique/sleep";
import { pickMainLifts, workoutDate } from "@/lib/physique/strength";
import { trendSeries } from "@/lib/physique/weight";
import type { DayFlags, ExpenditurePoint, FoodEntry, PhysiqueProgram, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";

// ── Thresholds ──

/** Days of a kind before a week shows its mean. OURS: three of seven, the weekly report's own floor. */
export const WEEK_MIN_DAYS = 3;
/** Weeks the "All" range reads at most. OURS: two years. */
export const ALL_MAX_WEEKS = 104;
/** Columns a range draws at most; a longer history puts two or more weeks in each (C7). OURS: about half a year of weekly bars is as many as stay readable and tappable on a phone. */
export const MAX_COLUMNS = 26;
/** Sessions of a lift in the range before a line is drawn through them (PR3). OURS: two weeks of three sessions; fewer draws the noise. */
export const LIFT_FIT_MIN_SESSIONS = 6;
/** Days from a lift's first session in the range to its last before a line is drawn. OURS: three weeks, so one hard week does not make a trend. */
export const LIFT_FIT_MIN_DAYS = 21;
/** How many standard errors a lift's line must sit from flat before its change is shown (PR3). OURS: a fit through one best a week drew "+6 kg" on flat lifts with 3% session noise; through every session at 2.5 SE, about one flat lift in fifty reads as changing. */
export const LIFT_FIT_Z = 2.5;
/** Columns the lift's current level is the median of. OURS: three weeks, as the strength engine's blocks of three. */
export const LIFT_LEVEL_COLUMNS = 3;

export type ProgressRange = "1M" | "3M" | "6M" | "All";
/** Weeks per range, the current week included. */
export const RANGE_WEEKS: Record<Exclude<ProgressRange, "All">, number> = { "1M": 5, "3M": 13, "6M": 26 };

// ── Types ──

export type ProgressWeek = {
  start: LocalDate;
  /** Sunday, or today for the week in progress. */
  end: LocalDate;
  /** True for the week that includes today. */
  current: boolean;
  /** Mean of the week's weigh-ins, kg. */
  weightKg: number | null;
  /** Trend weight at the week's end, kg. */
  trendKg: number | null;
  /** Trend change over the week, kg (end against the week before's end). */
  trendChangeKg: number | null;
  weighIns: number;
  /** Mean intake over complete and fasting days, kcal. */
  kcal: number | null;
  foodDays: number;
  /** Mean of the maintenance estimate over the week, kcal. */
  maintenanceKcal: number | null;
  /** Intake against maintenance, kcal a day (negative is a deficit). */
  balanceKcal: number | null;
  targetKcal: number | null;
  /** Mean protein over complete days, g. */
  proteinG: number | null;
  proteinTargetG: number | null;
  sessions: number;
  hardSets: number;
  /** The main lifts' best sets against their first reading in the range, % (mean across lifts). */
  strengthPct: number | null;
  /** Mean sleep over valid nights, hours. */
  sleepH: number | null;
  nights: number;
};

/** One main lift on the timeline's columns, in kg (PR3, X1). */
export type LiftWeeks = {
  name: string;
  /** The column's best estimated 1RM, kg; null for a column without the lift. */
  e1rmKg: Array<number | null>;
  /** A straight line through every session's estimated 1RM in the range (least squares on the day), first session to last; null below LIFT_FIT_MIN_SESSIONS or LIFT_FIT_MIN_DAYS. `clear` when its slope is LIFT_FIT_Z standard errors from flat: only then is the change shown. */
  fit: { fromDate: LocalDate; toDate: LocalDate; fromKg: number; toKg: number; clear: boolean } | null;
  /** The median of the last LIFT_LEVEL_COLUMNS columns with a best, kg: the lift's level now. */
  levelKg: number | null;
  /** The line's change over the range when it is clear, kg; null otherwise, and then nothing is said about the change (a sudden drop can fail a straight line, so "steady" would claim too much). */
  changeKg: number | null;
};

export type ProgressTimeline = {
  range: ProgressRange;
  from: LocalDate;
  through: LocalDate;
  /** Weeks in each column: 1, or more for a long "All" (C7). */
  periodWeeks: number;
  /** One per column, oldest first; each covers `periodWeeks` weeks. */
  weeks: ProgressWeek[];
  /** Daily trend and scale weight in the range, for the weight line. */
  days: Array<{ date: LocalDate; trendKg: number; kg: number | null }>;
  /** The main lifts the strength line follows. */
  lifts: string[];
  /** Each main lift's weekly best, in the same order as `lifts`. */
  liftWeeks: LiftWeeks[];
  summary: {
    trendChangeKg: number | null;
    kcal: number | null;
    balanceKcal: number | null;
    proteinG: number | null;
    setsPerWeek: number | null;
    strengthPct: number | null;
    sleepH: number | null;
    /** The person's usual night over the range (median of valid nights), the sleep chart's reference; null under SLEEP_USUAL_MIN_NIGHTS. */
    usualSleepH: number | null;
  };
};

export type TimelineInputs = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  workouts: readonly StoredWorkout[];
  program: PhysiqueProgram | null;
  expenditure: readonly ExpenditurePoint[] | null;
  unit: WeightUnit;
};

// ── Helpers ──

const meanOrNull = (xs: number[], min = WEEK_MIN_DAYS): number | null => (xs.length >= min ? mean(xs) : null);

/** The earliest date anything was logged, or null with no data at all. */
function firstDataDate(i: TimelineInputs, tz: string): LocalDate | null {
  const dates: LocalDate[] = [];
  if (i.weighIns.length) dates.push(i.weighIns.reduce((m, w) => (w.date < m ? w.date : m), i.weighIns[0].date));
  if (i.foodEntries.length) dates.push(i.foodEntries.reduce((m, e) => (e.date < m ? e.date : m), i.foodEntries[0].date));
  if (i.sleepNights.length) dates.push(i.sleepNights.reduce((m, n) => (n.date < m ? n.date : m), i.sleepNights[0].date));
  for (const w of i.workouts) {
    const d = workoutDate(w, tz);
    if (d) dates.push(d);
  }
  return dates.length ? dates.reduce((m, d) => (d < m ? d : m)) : null;
}

/** The Monday the range starts on. "All" starts at the week of the first data, at most ALL_MAX_WEEKS back. */
export function rangeStart(range: ProgressRange, today: LocalDate, firstData: LocalDate | null): LocalDate {
  const thisWeek = weekStart(today);
  const weeks = range === "All" ? ALL_MAX_WEEKS : RANGE_WEEKS[range];
  const earliest = addDays(thisWeek, -7 * (weeks - 1));
  if (range !== "All") return earliest;
  return firstData ? (weekStart(firstData) > earliest ? weekStart(firstData) : earliest) : thisWeek;
}

// ── Timeline ──

/** Every week of the range, oldest first, with the measures above and a summary over them. */
export function progressTimeline(i: TimelineInputs, range: ProgressRange, now: Now): ProgressTimeline {
  const through = now.today;
  const start0 = rangeStart(range, through, firstDataDate(i, now.tz));
  // A long history goes into columns of k weeks, the last one ending with this week.
  const totalWeeks = dayDiff(start0, weekStart(through)) / 7 + 1;
  const k = Math.max(1, Math.ceil(totalWeeks / MAX_COLUMNS));
  const from = addDays(weekStart(through), -7 * (k * Math.ceil(totalWeeks / k) - 1));
  const minDays = WEEK_MIN_DAYS * k;

  // Daily series, built once and bucketed by week.
  const trend = trendSeries(i.weighIns);
  const trendByDate = new Map(trend.map((p) => [p.date, p.trendKg]));
  const trendAt = (d: LocalDate): number | null => {
    let last: number | null = null;
    for (const p of trend) {
      if (p.date > d) break;
      last = p.trendKg;
    }
    return last;
  };
  const scaleByDate = new Map<LocalDate, number>();
  for (const w of i.weighIns) if (w.date >= from && w.date <= through) scaleByDate.set(w.date, w.kg);
  // Food reads through yesterday: today is still being logged, as in the weekly report.
  const intake = new Map(dailyIntakeSeries(i.foodEntries, i.dayFlags, from, addDays(through, -1)).map((d) => [d.date, d]));
  const maint = new Map((i.expenditure ?? []).map((p) => [p.date, p.tdee]));
  const nights = nightsByDate(i.sleepNights);

  // Workouts by date: sessions, hard sets, and each main lift's best set.
  const mainLifts = pickMainLifts(i.workouts, i.unit, now);
  const liftBest = mainLifts.map((l) => new Map(l.exposures.filter((e) => e.date >= from && e.date <= through).map((e) => [e.date, e.e1rm])));
  const firstBest = liftBest.map((m) => {
    const dates = [...m.keys()].sort();
    return dates.length ? (m.get(dates[0]) as number) : null;
  });
  const byDate = new Map<LocalDate, { sessions: number; hardSets: number }>();
  for (const w of i.workouts) {
    const d = workoutDate(w, now.tz);
    if (!d || d < from || d > through) continue;
    const cur = byDate.get(d) ?? { sessions: 0, hardSets: 0 };
    cur.sessions += 1;
    cur.hardSets += (w.exercises ?? []).reduce((n, ex) => n + countHardSets(ex.sets ?? []), 0);
    byDate.set(d, cur);
  }

  const weeks: ProgressWeek[] = [];
  const liftCols: Array<Array<number | null>> = mainLifts.map(() => []);
  let prevTrendEnd: number | null = trendAt(addDays(from, -1));
  for (let start = from; start <= through; start = addDays(start, 7 * k)) {
    const end = minDate(addDays(start, 7 * k - 1), through);
    const dates: LocalDate[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

    const scale = dates.map((d) => scaleByDate.get(d)).filter((x): x is number => x != null);
    const trendEnd = trendAt(end);
    const counted = dates.map((d) => intake.get(d)).filter((x) => x && countsForBalance(x.status)) as Array<{ kcal: number }>;
    const complete = dates.map((d) => intake.get(d)).filter((x) => x && x.status === "complete") as Array<{ proteinG: number }>;
    const kcal = meanOrNull(counted.map((x) => x.kcal), minDays);
    const maintVals = dates.map((d) => maint.get(d)).filter((x): x is number => x != null);
    const maintenanceKcal = maintVals.length ? mean(maintVals) : null;
    const target = targetInEffect(i.program, end);
    const sleep = dates.map((d) => nights.get(d)).filter((n) => n && n.valid).map((n) => n!.asleepH);
    let sessions = 0;
    let hardSets = 0;
    for (const d of dates) {
      const t = byDate.get(d);
      if (t) {
        sessions += t.sessions;
        hardSets += t.hardSets;
      }
    }
    const liftPcts: number[] = [];
    liftBest.forEach((m, k) => {
      const base = firstBest[k];
      const best = Math.max(...dates.map((d) => m.get(d) ?? -Infinity));
      liftCols[k].push(Number.isFinite(best) ? best : null);
      if (base && Number.isFinite(best)) liftPcts.push((best / base - 1) * 100);
    });

    weeks.push({
      start,
      end,
      current: end === through && dayDiff(start, through) < 7 * k,
      weightKg: scale.length ? mean(scale) : null,
      trendKg: trendEnd,
      trendChangeKg: trendEnd != null && prevTrendEnd != null ? trendEnd - prevTrendEnd : null,
      weighIns: scale.length,
      kcal,
      foodDays: counted.length,
      maintenanceKcal,
      balanceKcal: kcal != null && maintenanceKcal != null ? kcal - maintenanceKcal : null,
      targetKcal: target?.kcal ?? null,
      proteinG: meanOrNull(complete.map((x) => x.proteinG), minDays),
      proteinTargetG: target?.proteinG ?? null,
      sessions,
      hardSets,
      strengthPct: liftPcts.length ? mean(liftPcts) : null,
      sleepH: meanOrNull(sleep, minDays),
      nights: sleep.length,
    });
    if (trendEnd != null) prevTrendEnd = trendEnd;
  }

  const days: ProgressTimeline["days"] = [];
  for (let d = from; d <= through; d = addDays(d, 1)) {
    const t = trendByDate.get(d);
    if (t != null) days.push({ date: d, trendKg: t, kg: scaleByDate.get(d) ?? null });
  }

  const rangeNights = [...nights.entries()].filter(([d, n]) => d >= from && d <= through && n.valid).map(([, n]) => n.asleepH);

  const vals = (pick: (w: ProgressWeek) => number | null) => weeks.map(pick).filter((x): x is number => x != null);
  const trendVals = vals((w) => w.trendKg);
  const trained = weeks.filter((w) => !w.current || w.sessions > 0);
  // The week in progress may hold one session, so the strength summary reads the last full week when there is one.
  const strengths = weeks.filter((w, k) => !(w.current && k > 0)).map((w) => w.strengthPct).filter((x): x is number => x != null);
  return {
    range,
    from,
    through,
    periodWeeks: k,
    weeks,
    days,
    lifts: mainLifts.map((l) => l.name),
    liftWeeks: mainLifts.map((l, k) => {
      const recent = liftCols[k].filter((v): v is number => v != null).slice(-LIFT_LEVEL_COLUMNS);
      const fit = fitSessions(liftBest[k]);
      return { name: l.name, e1rmKg: liftCols[k], fit, levelKg: recent.length ? median(recent) : null, changeKg: fit?.clear ? fit.toKg - fit.fromKg : null };
    }),
    summary: {
      trendChangeKg: trendVals.length >= 2 ? trendVals[trendVals.length - 1] - (trendAt(addDays(from, -1)) ?? trendVals[0]) : null,
      kcal: vals((w) => w.kcal).length ? mean(vals((w) => w.kcal)) : null,
      balanceKcal: vals((w) => w.balanceKcal).length ? mean(vals((w) => w.balanceKcal)) : null,
      proteinG: vals((w) => w.proteinG).length ? mean(vals((w) => w.proteinG)) : null,
      setsPerWeek: trained.length && trained.some((w) => w.sessions > 0) ? mean(trained.map((w) => w.hardSets)) / k : null,
      strengthPct: strengths.length >= 2 ? strengths[strengths.length - 1] : null,
      sleepH: vals((w) => w.sleepH).length ? mean(vals((w) => w.sleepH)) : null,
      usualSleepH: rangeNights.length >= SLEEP_USUAL_MIN_NIGHTS ? median(rangeNights) : null,
    },
  };
}

/** A straight line through a lift's sessions by day (least squares), or null below LIFT_FIT_MIN_SESSIONS or LIFT_FIT_MIN_DAYS. */
function fitSessions(byDate: ReadonlyMap<LocalDate, number>): LiftWeeks["fit"] {
  const dates = [...byDate.keys()].sort();
  if (dates.length < LIFT_FIT_MIN_SESSIONS) return null;
  const fromDate = dates[0];
  const toDate = dates[dates.length - 1];
  const span = dayDiff(fromDate, toDate);
  if (span < LIFT_FIT_MIN_DAYS) return null;
  const f = olsSlope(dates.map((d) => dayDiff(fromDate, d)), dates.map((d) => byDate.get(d) as number));
  const clear = Number.isFinite(f.se) && f.se > 0 && Math.abs(f.slope) / f.se >= LIFT_FIT_Z;
  return { fromDate, toDate, fromKg: f.intercept, toKg: f.intercept + f.slope * span, clear };
}
