/**
 * Why the weight isn't moving as calories predict (IN3, 08-insights.md).
 * Pure.
 *
 * The weekly card already splits a miss against the plan into intake off
 * target and a target that drifted from the plan. What it couldn't say is
 * why the scale trend sits away from what the calories predict ("calories
 * predict −0.4 kg a week, the scale −0.1"). Over the rate's own window this
 * names, each with its share in kg a week where it can be sized:
 * - steps that changed across the window: the maintenance estimate is
 *   still catching up on them, so about half the change shows as the gap;
 *   IN8: active energy from Apple Health in their place when both ends
 *   have it, as it holds the steps and every other workout, with the
 *   workouts and steps that changed named beside it;
 * - carbs that rose or fell across the window: the water they hold moves
 *   the trend (0.3 kg per 100 g, as IN2);
 * - creatine started, or a carb switch logged: named, not sized;
 * - days not logged, when the scale sits above the prediction: named;
 * - and what is left, said as such.
 * Separately, since the goal began: how far maintenance has moved, and how
 * much of that a change in steps (or active energy, IN8) accounts for,
 * which is why a cut slows.
 *
 * Active energy only explains here. It is never an input to the
 * maintenance estimate, which is worked back from intake and the trend.
 *
 * Causes only count the way the gap points. Never fat, never "metabolism"
 * (02 §10).
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { mean } from "@/lib/stats";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries } from "@/lib/physique/intake";
import { ENERGY_DENSITY_KCAL_PER_KG } from "@/lib/physique/expenditure";
import { CARB_WATER_KG_PER_G } from "@/lib/physique/scaleJump";
import type { DailySteps, DailyVitals, DayEventType, DayFlags, ExpenditurePoint, FoodEntry, HealthActivity } from "@/lib/physique/types";

// ── Thresholds ──

/** Smallest gap between the scale trend and the calories' prediction read, kg a week. OURS: about 110 kcal a day, inside which a month's trend and logging don't separate. */
export const GAP_MIN_KG_WK = 0.1;
/** Net energy of one step per kg of body weight, kcal. EVID: walking's net cost is about 0.5 kcal/kg/km (ACSM) at about 1,300 steps a km. */
export const NET_KCAL_PER_KG_PER_STEP = 0.0004;
/** Days of steps or carbs at each end that are compared. OURS: two weeks smooths the weekday rhythm. */
export const END_DAYS = 14;
/** Days with a reading in each end before it counts. OURS. */
export const END_MIN_DAYS = 7;
/** Shortest window the two ends are taken from. OURS: two weeks at each end. */
export const MIN_WINDOW_DAYS = 28;
/** Share of a change across the window that shows as the gap. EVID derived: a change through the window shows in the window's mean at about half its size, and the maintenance estimate has the rest. */
export const ACROSS_WINDOW_SHARE = 0.5;
/** Change in steps a day before it is named. OURS: about 50 kcal a day at 85 kg. */
export const STEPS_MIN_CHANGE = 1500;
/** Change in carbs a day before it is named, g. OURS (as IN2's listing floor). */
export const CARBS_MIN_CHANGE_G = 40;
/** Smallest share a sized cause carries to be listed, kg a week. OURS. */
export const SHARE_MIN_KG_WK = 0.03;
/** Unlogged or partial days in the window before logging is named. OURS: three days hide enough to move a month's mean by about 100 kcal a day. */
export const GAP_LOGGING_DAYS = 3;
/** Days before the window a creatine start or carb switch still counts. OURS: water from creatine builds over the first weeks (02 §2.4). */
export const EVENT_LOOKBACK_DAYS = 14;
/** Change in maintenance since the goal began before it is said, kcal a day. OURS: inside this the estimate is still settling (02 §4.3). */
export const MAINT_MIN_CHANGE = 100;
/** Days since the goal began before "since the goal began" is said. OURS: a month, so the two ends don't overlap. */
export const SINCE_START_MIN_DAYS = 28;
/** Days the maintenance estimate updates before its value is a starting point to compare against. EVID (research H): within about 175 kcal by week 3 and 120 by week 6; before that a "change" is the estimate settling. */
export const MAINT_SETTLED_DAYS = 28;
/** Change in active energy a day before it is named, kcal. OURS (IN8): twice the steps floor in kcal, as a watch's energy figure is rougher than a step count. */
export const ACTIVE_MIN_CHANGE = 100;
/** Change in one kind of Apple Health workout a week before it is named beside active energy. OURS (IN8): one session a week is a change a person notices in their own week. */
export const WORKOUTS_MIN_CHANGE_WK = 1;

// ── Types ──

/** IN8: the Apple Health workouts of one kind a week at each end of a span. */
export type WorkoutChange = { activity: HealthActivity; fromPerWeek: number; toPerWeek: number };

export type WeightGapCause =
  | { kind: "steps"; fromSteps: number; toSteps: number; kcalPerDay: number; kgPerWeek: number }
  /** IN8: active energy from Apple Health; with the steps and the workouts that moved the same way, when they did. */
  | { kind: "active"; fromKcal: number; toKcal: number; kcalPerDay: number; kgPerWeek: number; steps: { from: number; to: number } | null; workouts: WorkoutChange | null }
  | { kind: "water"; fromCarbsG: number; toCarbsG: number; kgPerWeek: number }
  | { kind: "event"; type: Extract<DayEventType, "creatine_start" | "carb_switch">; date: LocalDate }
  | { kind: "logging"; unlogged: number; partial: number };

export type WeightGapRead = {
  /** Scale trend less the calories' prediction, kg a week: positive when the scale sits above it (losing slower, or gaining faster). */
  gapKgWk: number;
  /** Causes the way the gap points, the sized ones first, largest first. */
  causes: WeightGapCause[];
  /** What the sized causes leave, kg a week, the gap's way (0 when they cover it). */
  unexplainedKgWk: number;
};

export type SinceStart = {
  /** The goal's start, or the day the maintenance estimate had settled when that came later. */
  since: LocalDate;
  maintFrom: number;
  maintTo: number;
  stepsFrom: number | null;
  stepsTo: number | null;
  /** kcal a day less burned (positive) or more (negative) from the change in steps. */
  stepsKcal: number | null;
  /** IN8: active energy a day at each end, when both have it; said in place of steps. */
  activeFrom: number | null;
  activeTo: number | null;
};

export type WeightGapInputs = {
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  steps: readonly DailySteps[];
  /** IN8: Apple Health's day records, for active energy and workouts. */
  vitals?: readonly DailyVitals[];
  expenditure: readonly ExpenditurePoint[] | null;
  goalStart: LocalDate | null;
  /** The weight rate's own window. */
  from: LocalDate;
  through: LocalDate;
  /** Today's steps are still counting, so they are left out. */
  today: LocalDate;
  bodyKg: number;
  /** What the window's intake against maintenance predicts, kg a week. */
  expectedKgWk: number;
  /** The scale trend over the window, kg a week. */
  actualKgWk: number;
};

// ── Helpers ──

const kgWk = (kcalPerDay: number) => (kcalPerDay * 7) / ENERGY_DENSITY_KCAL_PER_KG;

function stepsMean(steps: readonly DailySteps[], from: LocalDate, to: LocalDate, today: LocalDate): number | null {
  const xs = steps.filter((s) => s.date >= from && s.date <= to && s.date < today && Number.isFinite(s.steps)).map((s) => s.steps);
  return xs.length >= END_MIN_DAYS ? mean(xs) : null;
}

/** Active energy a day over a span, from the days that have it; today is still counting. */
function activeMean(vitals: readonly DailyVitals[] | undefined, from: LocalDate, to: LocalDate, today: LocalDate): number | null {
  const xs = (vitals ?? []).filter((v) => v.date >= from && v.date <= to && v.date < today && v.activeKcal != null && Number.isFinite(v.activeKcal)).map((v) => v.activeKcal as number);
  return xs.length >= END_MIN_DAYS ? mean(xs) : null;
}

/** Workouts a week by kind over a span. */
function workoutsPerWeek(vitals: readonly DailyVitals[] | undefined, from: LocalDate, to: LocalDate): Map<HealthActivity, number> {
  const weeks = (dayDiff(from, to) + 1) / 7;
  const out = new Map<HealthActivity, number>();
  for (const v of vitals ?? []) {
    if (v.date < from || v.date > to) continue;
    for (const w of v.workouts ?? []) out.set(w.activity, (out.get(w.activity) ?? 0) + 1 / weeks);
  }
  return out;
}

/** The kind of workout that changed most the way active energy did (fewer when it fell), when it changed by a session a week or more. */
function workoutChange(vitals: readonly DailyVitals[] | undefined, early: readonly [LocalDate, LocalDate], late: readonly [LocalDate, LocalDate], fell: boolean): WorkoutChange | null {
  const a = workoutsPerWeek(vitals, early[0], early[1]);
  const b = workoutsPerWeek(vitals, late[0], late[1]);
  let best: WorkoutChange | null = null;
  for (const activity of new Set([...a.keys(), ...b.keys()])) {
    const from = a.get(activity) ?? 0;
    const to = b.get(activity) ?? 0;
    if ((to < from) !== fell || Math.abs(to - from) < WORKOUTS_MIN_CHANGE_WK) continue;
    if (!best || Math.abs(to - from) > Math.abs(best.toPerWeek - best.fromPerWeek)) best = { activity, fromPerWeek: from, toPerWeek: to };
  }
  return best;
}

// ── The read ──

function scaleRead(i: WeightGapInputs): WeightGapRead | null {
  const gap = i.actualKgWk - i.expectedKgWk;
  if (!Number.isFinite(gap) || !Number.isFinite(i.bodyKg) || Math.abs(gap) < GAP_MIN_KG_WK) return null;
  const sign = Math.sign(gap);
  const days = dayDiff(i.from, i.through) + 1;
  const sized: Array<Extract<WeightGapCause, { kind: "steps" | "active" | "water" }>> = [];
  const named: WeightGapCause[] = [];
  const all = dailyIntakeSeries(i.foodEntries, i.dayFlags, i.from, i.through);

  if (days >= MIN_WINDOW_DAYS) {
    const earlyTo = addDays(i.from, END_DAYS - 1);
    const lateFrom = addDays(i.through, -(END_DAYS - 1));
    // Steps: fewer now burns less, so the scale sits higher.
    const s0 = stepsMean(i.steps, i.from, earlyTo, i.today);
    const s1 = stepsMean(i.steps, lateFrom, i.through, i.today);
    // IN8: active energy holds the steps and every other workout, so when both ends have it, it is sized instead of steps.
    const a0 = activeMean(i.vitals, i.from, earlyTo, i.today);
    const a1 = activeMean(i.vitals, lateFrom, i.through, i.today);
    if (a0 != null && a1 != null) {
      if (Math.abs(a0 - a1) >= ACTIVE_MIN_CHANGE) {
        const kcal = a0 - a1;
        const share = ACROSS_WINDOW_SHARE * kgWk(kcal);
        const fell = a1 < a0;
        const steps = s0 != null && s1 != null && Math.abs(s0 - s1) >= STEPS_MIN_CHANGE && s1 < s0 === fell ? { from: Math.round(s0), to: Math.round(s1) } : null;
        const workouts = workoutChange(i.vitals, [i.from, earlyTo], [lateFrom, i.through], fell);
        if (Math.sign(share) === sign && Math.abs(share) >= SHARE_MIN_KG_WK) sized.push({ kind: "active", fromKcal: Math.round(a0), toKcal: Math.round(a1), kcalPerDay: Math.round(kcal), kgPerWeek: share, steps, workouts });
      }
    } else if (s0 != null && s1 != null && Math.abs(s0 - s1) >= STEPS_MIN_CHANGE) {
      const kcal = (s0 - s1) * NET_KCAL_PER_KG_PER_STEP * i.bodyKg;
      const share = ACROSS_WINDOW_SHARE * kgWk(kcal);
      if (Math.sign(share) === sign && Math.abs(share) >= SHARE_MIN_KG_WK) sized.push({ kind: "steps", fromSteps: Math.round(s0), toSteps: Math.round(s1), kcalPerDay: Math.round(kcal), kgPerWeek: share });
    }
    // Carbs: more now holds water, so the trend reads higher.
    const series = all.filter((d) => countsForBalance(d.status));
    const carbs = (a: LocalDate, b: LocalDate) => {
      const xs = series.filter((d) => d.date >= a && d.date <= b).map((d) => d.carbsG);
      return xs.length >= END_MIN_DAYS ? mean(xs) : null;
    };
    const c0 = carbs(i.from, earlyTo);
    const c1 = carbs(lateFrom, i.through);
    if (c0 != null && c1 != null && Math.abs(c1 - c0) >= CARBS_MIN_CHANGE_G) {
      const share = (CARB_WATER_KG_PER_G * (c1 - c0)) / (days / 7);
      if (Math.sign(share) === sign && Math.abs(share) >= SHARE_MIN_KG_WK) sized.push({ kind: "water", fromCarbsG: Math.round(c0), toCarbsG: Math.round(c1), kgPerWeek: share });
    }
  }

  // Creatine and a carb switch hold water: the scale sits higher.
  if (sign > 0) {
    for (let d = addDays(i.from, -EVENT_LOOKBACK_DAYS); d <= i.through; d = addDays(d, 1)) {
      for (const e of i.dayFlags[d]?.events ?? []) {
        if ((e.type === "creatine_start" || e.type === "carb_switch") && !named.some((x) => x.kind === "event" && x.type === e.type)) named.push({ kind: "event", type: e.type, date: d });
      }
    }
    // Food eaten and not logged: the scale knows about it, the prediction doesn't.
    const firstFood = i.foodEntries.reduce<LocalDate | null>((m, e) => (m == null || e.date < m ? e.date : m), null);
    const unlogged = all.filter((d) => d.status === "unlogged" && firstFood != null && d.date >= firstFood).length;
    const partial = all.filter((d) => d.status === "partial").length;
    if (unlogged + partial >= GAP_LOGGING_DAYS) named.push({ kind: "logging", unlogged, partial });
  }

  sized.sort((a, b) => Math.abs(b.kgPerWeek) - Math.abs(a.kgPerWeek));
  const explained = sized.reduce((n, c) => n + c.kgPerWeek, 0);
  const left = gap - explained;
  return { gapKgWk: gap, causes: [...sized, ...named], unexplainedKgWk: Math.sign(left) === sign ? left : 0 };
}

function sinceStartRead(i: WeightGapInputs): SinceStart | null {
  const start = i.goalStart;
  if (!start || dayDiff(start, i.through) < SINCE_START_MIN_DAYS || !i.expenditure?.length) return null;
  const pts = i.expenditure.filter((p) => p.date <= i.through && Number.isFinite(p.tdee));
  // From the goal's start, or once the estimate has settled if it began with the goal: the first weeks are the formula's guess.
  const updating = pts.find((p) => p.state === "updating");
  if (!updating) return null;
  const settled = addDays(updating.date, MAINT_SETTLED_DAYS);
  const since = start > settled ? start : settled;
  if (dayDiff(since, i.through) < SINCE_START_MIN_DAYS) return null;
  const first = pts.find((p) => p.date >= since);
  const last = pts.at(-1);
  if (!first || !last || first.date === last.date || Math.abs(last.tdee - first.tdee) < MAINT_MIN_CHANGE) return null;
  const s0 = stepsMean(i.steps, since, addDays(since, END_DAYS - 1), i.today);
  const s1 = stepsMean(i.steps, addDays(i.through, -(END_DAYS - 1)), i.through, i.today);
  const stepsKcal = s0 != null && s1 != null && Math.abs(s0 - s1) >= STEPS_MIN_CHANGE ? Math.round((s0 - s1) * NET_KCAL_PER_KG_PER_STEP * i.bodyKg) : null;
  const a0 = activeMean(i.vitals, since, addDays(since, END_DAYS - 1), i.today);
  const a1 = activeMean(i.vitals, addDays(i.through, -(END_DAYS - 1)), i.through, i.today);
  const active = a0 != null && a1 != null;
  return {
    since,
    maintFrom: first.tdee,
    maintTo: last.tdee,
    stepsFrom: s0 != null ? Math.round(s0) : null,
    stepsTo: s1 != null ? Math.round(s1) : null,
    stepsKcal,
    activeFrom: active ? Math.round(a0) : null,
    activeTo: active ? Math.round(a1) : null,
  };
}

/** The window's gap between the scale and the calories, and maintenance since the goal began. */
export function weightGap(i: WeightGapInputs): { scale: WeightGapRead | null; sinceStart: SinceStart | null } {
  return { scale: scaleRead(i), sinceStart: sinceStartRead(i) };
}

/**
 * The same read from the raw records, for the goal card: intake and
 * maintenance over the rate's window to `through`, the calories'
 * prediction from them, and the scale trend from the rate. Null with food
 * logged on under half the window (as the weekly card), or no estimate.
 */
export function weightGapFromRecords(
  r: Omit<WeightGapInputs, "from" | "expectedKgWk" | "actualKgWk"> & { windowDays: number; ratePctPerWeek: number },
  minFoodShare: number
): { scale: WeightGapRead | null; sinceStart: SinceStart | null; expectedKgWk: number; actualKgWk: number } | null {
  const from = addDays(r.through, -(r.windowDays - 1));
  const counted = dailyIntakeSeries(r.foodEntries, r.dayFlags, from, r.through).filter((d) => countsForBalance(d.status));
  const exp = (r.expenditure ?? []).filter((p) => p.date >= from && p.date <= r.through);
  if (counted.length < minFoodShare * r.windowDays || !exp.length) return null;
  const expectedKgWk = kgWk(mean(counted.map((d) => d.kcal)) - mean(exp.map((p) => p.tdee)));
  const actualKgWk = (r.ratePctPerWeek / 100) * r.bodyKg;
  return { ...weightGap({ ...r, from, expectedKgWk, actualKgWk }), expectedKgWk, actualKgWk };
}
