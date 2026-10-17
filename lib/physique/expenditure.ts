/**
 * Expenditure (Layer 1, copied from MacroFactor): the fixed seed, the
 * initial estimate, the daily back-calculation pipeline and its maturity.
 * Normative spec: docs/plan/02-engine-spec.md §4; research A §A1–A4, §G.
 *
 * Pure. The seed is snapshotted once and stored on the profile, so later
 * profile or goal edits never rewrite past expenditure (02 §0.2, §4.2).
 */

import { addDays, dateRange, dayDiff, localDateKey, type LocalDate } from "@/lib/dates";
import { mean } from "@/lib/stats";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { countsAsLogged, dailyIntakeSeries, intakeByDate } from "@/lib/physique/intake";
import { trendSeries, weighInsByDate } from "@/lib/physique/weight";
import type {
  DailyIntake,
  DayFlags,
  ExpenditureMaturity,
  ExpenditurePoint,
  ExpenditureSeed,
  FoodEntry,
  GeneralActivity,
  PhysiqueGoal,
  PhysiqueProfile,
  Sex,
  WeighIn,
} from "@/lib/physique/types";

// ── Constants (tags per 02-engine-spec) ──

/** kcal per kg of weight change, the same for gain and loss. PUB (MacroFactor V3, 3,500 kcal/lb). */
export const ENERGY_DENSITY_KCAL_PER_KG = 7716;
/** Days of intake averaged for the observed expenditure. PUB (MacroFactor KB#241). */
export const INTAKE_WINDOW_DAYS = 21;
/** Days of trend change behind the rate term. PUB (MacroFactor KB#19). */
export const RATE_WINDOW_DAYS = 20;
/** Daily gain toward the observed expenditure once calibrated. CAL (research A §G.6 impulse fit). */
export const K_STEADY = 0.1;
/** Daily gain while calibrating. OURS: "larger daily adjustments while confidence ramps up", 50–150 kcal overshoot. */
export const K_WARMUP = 0.2;
/** Updating days at the warm-up gain before switching to the steady gain. OURS (inside MacroFactor's 14–30 day range). */
export const WARMUP_UPDATING_DAYS = 21;
/** Days the seed is held before the pipeline starts moving. PUB (qualitative: "starts moving after a week"). */
export const INITIAL_HOLD_DAYS = 7;
/** Logged nutrition days needed in the last 7 to keep updating. PUB (MacroFactor V3, KB#74). */
export const MIN_NUTRITION_DAYS_7 = 4;
/** Weigh-ins needed in the last 7 days to keep updating. PUB (KB#74). */
export const MIN_WEIGHINS_7 = 1;
/** Consecutive complete days that end a logging pause. PUB (MacroFactor MM Oct 2024). */
export const RESUME_DAYS = 3;
/** Predictive goal adjustment: expenditure × this × Δrate (fraction/wk). PUB (MacroFactor expenditure modifiers). */
export const GOAL_PRED_FACTOR = 4;
/** Days the predictive offset ramps up over. PUB (≈ "a couple of weeks") / OURS (linear shape). */
export const GOAL_PRED_RAMP_DAYS = 14;
/** Days the predictive offset then decays over as the data takes over. OURS. */
export const GOAL_PRED_DECAY_DAYS = 28;
/** Updating days until the estimate is "settling" (UI). PUB (MacroFactor: 2–3 weeks to dial in). */
export const SETTLING_UPDATING_DAYS = 21;
/** Updating days until the estimate is "stable" (UI). OURS (inside the published 14–30 day range). */
export const STABLE_UPDATING_DAYS = 28;
/** Honest ± shown while settling and once stable, kcal. EVID (Hall & Chow 2011). */
export const PLUS_MINUS_SETTLING = 400;
export const PLUS_MINUS_STABLE = 300;
/** Days before the seed date over which sessions per week are measured. PUB (02 §4.2). */
export const SEED_SESSIONS_LOOKBACK_DAYS = 28;
/** How far from the seed date a weigh-in may be to seed the BMR weight. OURS. */
export const SEED_WEIGHT_SEARCH_DAYS = 7;
/** Age over which the BMR age penalty steepens. PUB (MacroFactor BMR). */
export const BMR_AGE_KNEE = 60;
/** BMR multiplier when the seed goal is a deficit. PUB (MacroFactor: metabolic adaptation). */
export const BMR_DEFICIT_MULT = 0.95;
/** General activity factors. PUB (MacroFactor onboarding image). */
export const ACTIVITY_FACTOR: Record<GeneralActivity, number> = { low: 1.2, moderate: 1.4, high: 1.6 };
/** Sex term for the BMR equation; prefer_not_to_say sits halfway. PUB (M/F) / OURS (0.5). */
export const BMR_SEX_TERM: Record<Sex, number> = { M: 0, F: 1, prefer_not_to_say: 0.5 };

// ── Seed and initial estimate ──

/** Exercise add-on to the activity factor by sessions per week. PUB. */
export function exerciseAddOn(sessionsPerWeek: number): number {
  if (sessionsPerWeek >= 7) return 0.3;
  if (sessionsPerWeek >= 4) return 0.2;
  if (sessionsPerWeek >= 1) return 0.1;
  return 0;
}

/** MacroFactor's height/weight BMR. PUB. Units: kg, cm, years. */
export function bmrHeightWeight(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const a = 1.96 * Math.min(age, BMR_AGE_KNEE) + 4.9 * Math.max(0, age - BMR_AGE_KNEE);
  return 129.6 * Math.pow(weightKg, 0.55) + 0.011 * heightCm * heightCm - a - 213.8 * BMR_SEX_TERM[sex];
}

/** MacroFactor's body-composition BMR, only with a measured body-fat %. PUB. */
export function bmrBodyComposition(ffmKg: number, fmKg: number, age: number): number {
  const a = 1.1 * Math.min(age, BMR_AGE_KNEE) + 2.75 * Math.max(0, age - BMR_AGE_KNEE);
  const ffm07 = Math.pow(ffmKg, 0.7);
  return 50.2 * ffm07 + 40.5 * (ffm07 * Math.pow(Math.max(fmKg, 0), 0.066)) - a;
}

/** The goal rate in effect on `date`, replaying the goal's rate history. */
export function goalRateOn(goal: PhysiqueGoal, date: LocalDate): number {
  const history = goal.rateHistory ?? [];
  let rate = history.length ? history[0].fromPctPerWeek : goal.ratePctPerWeek;
  for (const change of history) {
    if (change.date <= date) rate = change.toPctPerWeek;
  }
  return rate;
}

/** The goal active on `date`: started on or before it and not completed before it. */
export function goalActiveOn(goals: readonly PhysiqueGoal[], date: LocalDate): PhysiqueGoal | null {
  let best: PhysiqueGoal | null = null;
  for (const g of goals) {
    if (g.startDate > date) continue;
    if (g.completedAt && g.completedAt.slice(0, 10) < date) continue;
    if (!best || g.startDate > best.startDate || (g.startDate === best.startDate && g.createdAt > best.createdAt)) best = g;
  }
  return best;
}

/** Sessions per week over the 28 days before `date` (02 §4.2). Null with no sessions in that window. */
export function sessionsPerWeekBefore(workouts: readonly StoredWorkout[], date: LocalDate, tz: string): number | null {
  const from = addDays(date, -SEED_SESSIONS_LOOKBACK_DAYS);
  const dates = new Set<LocalDate>();
  for (const w of workouts) {
    const d = localDateKey(new Date(w.completedAt), tz);
    if (d >= from && d < date) dates.add(d);
  }
  if (dates.size === 0) return null;
  return dates.size / (SEED_SESSIONS_LOOKBACK_DAYS / 7);
}

export type SeedInputs = {
  profile: PhysiqueProfile;
  goals?: readonly PhysiqueGoal[];
  weighIns?: readonly WeighIn[];
  workouts?: readonly StoredWorkout[];
  /** Timezone used to date workouts; defaults to UTC. */
  tz?: string;
  startDate: LocalDate;
  /** Onboarding fallbacks: `daysPerWeek` when no workouts precede the seed; `bodyweightKg` when no weigh-in is near it. */
  onboarding?: { daysPerWeek?: number; bodyweightKg?: number; age?: number };
};

function seedWeight(weighIns: readonly WeighIn[], startDate: LocalDate): number | null {
  const byDate = weighInsByDate(weighIns);
  const exact = byDate.get(startDate);
  if (exact !== undefined) return exact;
  let best: { kg: number; dist: number } | null = null;
  for (const [date, kg] of byDate) {
    const dist = Math.abs(dayDiff(startDate, date));
    if (dist > SEED_WEIGHT_SEARCH_DAYS) continue;
    if (!best || dist < best.dist) best = { kg, dist };
  }
  return best ? best.kg : null;
}

/**
 * Snapshot the expenditure seed at `startDate` (02 §4.2): profile fields,
 * the goal active that day (rate 0 if none), sessions per week over the 28
 * days before, and the weight nearest the start. Null when height or weight
 * is unknown and there is no manual estimate.
 */
export function snapshotSeed(input: SeedInputs): ExpenditureSeed | null {
  const { profile, startDate } = input;
  const goals = input.goals ?? [];
  const goal = goalActiveOn(goals, startDate);
  const weightKg = seedWeight(input.weighIns ?? [], startDate) ?? goal?.startTrendKg ?? input.onboarding?.bodyweightKg ?? null;
  const heightCm = profile.heightCm;
  const manual = profile.manualInitialTdee;
  if ((!heightCm || !weightKg) && !manual) return null;
  const sessions = sessionsPerWeekBefore(input.workouts ?? [], startDate, input.tz ?? "UTC") ?? input.onboarding?.daysPerWeek ?? 0;
  return {
    date: startDate,
    sex: profile.sex ?? "prefer_not_to_say",
    age: profile.age ?? input.onboarding?.age ?? 30,
    heightCm: heightCm ?? 0,
    weightKg: weightKg ?? 0,
    bodyFatPctMeasured: profile.bodyFatPctMeasured,
    generalActivity: profile.generalActivity,
    sessionsPerWeek: sessions,
    goalRatePctPerWeek: goal ? goalRateOn(goal, startDate) : 0,
    manualInitialTdee: manual,
    schemaVersion: 1,
  };
}

/** Initial expenditure from the seed (02 §4.2). Rounded once, at the end. */
export function initialTdee(seed: ExpenditureSeed): number {
  if (typeof seed.manualInitialTdee === "number" && Number.isFinite(seed.manualInitialTdee) && seed.manualInitialTdee > 0) {
    return Math.round(seed.manualInitialTdee);
  }
  let bmr: number;
  if (typeof seed.bodyFatPctMeasured === "number" && seed.bodyFatPctMeasured > 0 && seed.bodyFatPctMeasured < 70) {
    const fm = seed.weightKg * (seed.bodyFatPctMeasured / 100);
    bmr = bmrBodyComposition(seed.weightKg - fm, fm, seed.age);
  } else {
    bmr = bmrHeightWeight(seed.weightKg, seed.heightCm, seed.age, seed.sex);
  }
  if (seed.goalRatePctPerWeek < 0) bmr *= BMR_DEFICIT_MULT;
  const af = ACTIVITY_FACTOR[seed.generalActivity] + exerciseAddOn(seed.sessionsPerWeek);
  const tdee0 = bmr * af * (1 + (GOAL_PRED_FACTOR * seed.goalRatePctPerWeek) / 100);
  return Math.round(tdee0);
}

/** The stored seed when it matches the start date, else a fresh snapshot. */
export function resolveSeed(input: SeedInputs): ExpenditureSeed | null {
  const stored = input.profile.expenditureSeed;
  if (stored && stored.date === input.startDate) return stored;
  return snapshotSeed(input);
}

// ── Predictive goal adjustment ──

export type GoalChange = { date: LocalDate; deltaRatePctPerWeek: number };

/**
 * Confirmed phase starts and rate changes after the seed date (02 §4.1).
 * A new goal's delta is against the previous goal's rate if that goal was
 * still running, else 0. Maintain-band nudges are not goal changes.
 */
export function goalChangesAfterSeed(goals: readonly PhysiqueGoal[], seedDate: LocalDate): GoalChange[] {
  const sorted = [...goals].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const out: GoalChange[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const initial = (g.rateHistory ?? []).length ? g.rateHistory![0].fromPctPerWeek : g.ratePctPerWeek;
    if (g.startDate > seedDate && g.phaseStartConfirmedAt) {
      const prev = sorted[i - 1];
      const prevRunning = prev && (!prev.completedAt || prev.completedAt.slice(0, 10) >= g.startDate);
      const rOld = prevRunning ? goalRateOn(prev, g.startDate) : 0;
      const delta = initial - rOld;
      if (delta !== 0) out.push({ date: g.startDate, deltaRatePctPerWeek: delta });
    }
    for (const change of g.rateHistory ?? []) {
      if (change.date <= seedDate) continue;
      const delta = change.toPctPerWeek - change.fromPctPerWeek;
      if (delta !== 0) out.push({ date: change.date, deltaRatePctPerWeek: delta });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Ramp 0 → 1 over GOAL_PRED_RAMP_DAYS, then 1 → 0 over GOAL_PRED_DECAY_DAYS. */
export function predictiveRamp(daysSinceChange: number): number {
  if (daysSinceChange <= 0) return 0;
  if (daysSinceChange <= GOAL_PRED_RAMP_DAYS) return daysSinceChange / GOAL_PRED_RAMP_DAYS;
  const decayed = daysSinceChange - GOAL_PRED_RAMP_DAYS;
  if (decayed >= GOAL_PRED_DECAY_DAYS) return 0;
  return 1 - decayed / GOAL_PRED_DECAY_DAYS;
}

// ── Daily pipeline ──

export type ExpenditureSeriesInput = {
  seed: ExpenditureSeed;
  weighIns: readonly WeighIn[];
  /** Daily intake covering the seed date through `today`; missing dates count as unlogged. */
  intake: readonly DailyIntake[];
  goals?: readonly PhysiqueGoal[];
  today: LocalDate;
};

/**
 * The expenditure series from the seed date to `today` (02 §4.1). The trend
 * ends at the last real weigh-in, so the rate term is measured up to that
 * day. The predictive goal offset is a separate additive term, kept outside
 * the EMA so the data can't erase it.
 */
export function expenditureSeries(input: ExpenditureSeriesInput): ExpenditurePoint[] {
  const { seed, today } = input;
  if (today < seed.date) return [];
  const days = dateRange(seed.date, today);
  const trend = trendSeries(input.weighIns);
  const trendByDate = new Map<LocalDate, number>();
  const realDates = new Set<LocalDate>();
  for (const p of trend) {
    trendByDate.set(p.date, p.trendKg);
    if (p.real) realDates.add(p.date);
  }
  const firstTrendDate = trend.length ? trend[0].date : null;
  const byDate = intakeByDate(input.intake);
  const logged = (date: LocalDate): boolean => {
    const d = byDate.get(date);
    return !!d && countsAsLogged(d.status);
  };
  const changes = goalChangesAfterSeed(input.goals ?? [], seed.date);

  let lastReal: LocalDate | null = null;
  for (const d of realDates) if (d < seed.date && (!lastReal || d > lastReal)) lastReal = d;

  const points: ExpenditurePoint[] = [];
  let base = initialTdee(seed);
  let paused = false;
  let updatingDays = 0;
  const offsets: Array<{ start: LocalDate; amount: number }> = [];

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (realDates.has(d)) lastReal = d;
    let state: ExpenditurePoint["state"] = "holding";
    let holdReason: ExpenditurePoint["holdReason"] = "warmup";
    let obs: number | undefined;

    // The pause rule starts once the initial hold ends: before that there
    // can't be 4 logged days in the last 7, and the first week is a warm-up,
    // not a logging pause.
    if (i >= INITIAL_HOLD_DAYS) {
      const last7 = days.slice(Math.max(0, i - 6), i + 1);
      const nutritionOK = last7.filter(logged).length >= MIN_NUTRITION_DAYS_7;
      const weightOK = last7.filter((x) => realDates.has(x)).length >= MIN_WEIGHINS_7;
      if (paused) {
        const last3 = days.slice(Math.max(0, i - (RESUME_DAYS - 1)), i + 1);
        paused = !(last3.length >= RESUME_DAYS && last3.every(logged) && weightOK);
      } else {
        paused = !(nutritionOK && weightOK);
      }
      if (paused) {
        holdReason = "paused";
      } else {
        const ne = Math.min(INTAKE_WINDOW_DAYS, i + 1);
        const le = Math.min(RATE_WINDOW_DAYS, i);
        const kcal = days
          .slice(i - ne + 1, i + 1)
          .filter(logged)
          .map((x) => byDate.get(x)!.kcal);
        const dw = lastReal;
        if (kcal.length > 0 && dw !== null && trendByDate.has(dw)) {
          let from = addDays(dw, -le);
          if (firstTrendDate && from < firstTrendDate) from = firstTrendDate;
          const span = dayDiff(from, dw);
          const rateKgPerDay = span > 0 ? (trendByDate.get(dw)! - (trendByDate.get(from) ?? trendByDate.get(dw)!)) / span : 0;
          obs = mean(kcal) - ENERGY_DENSITY_KCAL_PER_KG * rateKgPerDay;
          const k = updatingDays < WARMUP_UPDATING_DAYS ? K_WARMUP : K_STEADY;
          base = base + k * (obs - base);
          updatingDays++;
          state = "updating";
          holdReason = undefined;
        } else {
          holdReason = "paused";
        }
      }
    }

    for (const c of changes) {
      if (c.date === d) offsets.push({ start: d, amount: (base * GOAL_PRED_FACTOR * c.deltaRatePctPerWeek) / 100 });
    }
    let offset = 0;
    for (const o of offsets) offset += o.amount * predictiveRamp(dayDiff(o.start, d));

    points.push({
      date: d,
      tdee: Math.round(base + offset),
      state,
      holdReason,
      trendKg: trendByDate.get(d) ?? null,
      base,
      offset,
      obs,
      updatingDays,
    });
  }
  return points;
}

// ── Maturity ──

/**
 * What the UI says about the estimate (02 §4.3). `holding` means a logging
 * pause (not the first week), and overrides every other state. Maturity
 * counts updating days, not calendar days.
 */
export function expenditureMaturity(
  series: readonly ExpenditurePoint[],
  opts?: { intake?: readonly DailyIntake[]; weighIns?: readonly WeighIn[] }
): ExpenditureMaturity {
  const last = series.length ? series[series.length - 1] : null;
  if (!last) return { state: "calibrating", kcal: null, updatingDays: 0, plusMinus: null, resume: null };
  const paused = last.state === "holding" && last.holdReason === "paused";
  if (paused) {
    const byDate = opts?.intake ? intakeByDate(opts.intake) : new Map<LocalDate, DailyIntake>();
    let streak = 0;
    for (let k = 0; k < RESUME_DAYS; k++) {
      const d = byDate.get(addDays(last.date, -k));
      if (d && countsAsLogged(d.status)) streak++;
      else break;
    }
    const weighDates = weighInsByDate(opts?.weighIns ?? []);
    let weighInNeeded = true;
    for (let k = 0; k < 7; k++) if (weighDates.has(addDays(last.date, -k))) weighInNeeded = false;
    return {
      state: "holding",
      kcal: last.tdee,
      updatingDays: last.updatingDays,
      plusMinus: null,
      resume: { foodDaysNeeded: Math.max(0, RESUME_DAYS - streak), weighInNeeded },
    };
  }
  const n = last.updatingDays;
  const state = n >= STABLE_UPDATING_DAYS ? "stable" : n >= SETTLING_UPDATING_DAYS ? "settling" : "calibrating";
  return {
    state,
    kcal: last.tdee,
    updatingDays: n,
    plusMinus: state === "stable" ? PLUS_MINUS_STABLE : state === "settling" ? PLUS_MINUS_SETTLING : null,
    resume: null,
  };
}

// ── Convenience: from raw records ──

export type ExpenditureInputs = {
  profile: PhysiqueProfile;
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  /** Every goal (history plus current). */
  goals?: readonly PhysiqueGoal[];
  workouts?: readonly StoredWorkout[];
  onboarding?: SeedInputs["onboarding"];
};

export type ExpenditureResult = {
  seed: ExpenditureSeed;
  series: ExpenditurePoint[];
  intake: DailyIntake[];
  maturity: ExpenditureMaturity;
};

/**
 * Seed (stored or snapshotted), intake series and expenditure series up to
 * `today`. Null when no seed can be built (no height and no manual estimate).
 * With no `expenditureStartDate`, the series starts today.
 */
export function computeExpenditure(inputs: ExpenditureInputs, now: { today: LocalDate; tz: string }): ExpenditureResult | null {
  const startDate = inputs.profile.expenditureStartDate ?? now.today;
  const seed = resolveSeed({
    profile: inputs.profile,
    goals: inputs.goals,
    weighIns: inputs.weighIns,
    workouts: inputs.workouts,
    tz: now.tz,
    startDate,
    onboarding: inputs.onboarding,
  });
  if (!seed) return null;
  const intake = dailyIntakeSeries(inputs.foodEntries, inputs.dayFlags, seed.date, now.today);
  const series = expenditureSeries({ seed, weighIns: inputs.weighIns, intake, goals: inputs.goals, today: now.today });
  const maturity = expenditureMaturity(series, { intake, weighIns: inputs.weighIns });
  return { seed, series, intake, maturity };
}
