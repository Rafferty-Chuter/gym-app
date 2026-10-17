/**
 * Strength signal: adjusted e1RM, main-lift selection, the STR-1..STR-OK
 * status against the phase start, and the lift-derived training status.
 * Normative spec: docs/plan/02-engine-spec.md §1.2 (main lifts), §5.2
 * (training status), §6 (strength). Evidence: research/F-evidence-rules.md §7.
 *
 * Pure. Workouts arrive as data (`StoredWorkout[]`, weights as strings in
 * `weightUnit`); time arrives as `now = {today, tz}`. This is the only e1RM
 * function for physique; `lib/liftTrend.ts` keeps Epley without RIR until T2.
 */

import { addDays, dayDiff, localDateKey, type LocalDate, type Now } from "@/lib/dates";
import { getExerciseById, getExerciseByName, type ExerciseRole } from "@/lib/exerciseMetadataLibrary";
import { mean, median, olsSlope } from "@/lib/stats";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { parseWeightText, type WeightUnit } from "@/lib/units";
import { countHardSets, setTypeOf, type SetType } from "@/lib/completedSets";
import { nightsByDate, sessionSleepExclusion, type NormalizedNight, type SessionSleepExclusion } from "@/lib/physique/sleep";
import type { PhysiqueGoal, SleepNight, StrengthStatus, TrainingStatus } from "@/lib/physique/types";

// ── Constants (tags per 02-engine-spec) ──

/** Epley's divisor: e1RM = load × (1 + reps/30). PUB (matches lib/trainingMetrics). */
export const EPLEY_DIVISOR = 30;
/** Sets with reps + RIR above this predict 1RM poorly and are skipped. EVID (Reynolds 2006). */
export const MAX_REPS_PLUS_RIR = 12;
/** Main lifts: the 2–4 most logged loaded compounds trained in ≥5 of the last 6 weeks. OURS (02 §1.2). */
export const MAIN_LIFTS_MIN = 2;
export const MAIN_LIFTS_MAX = 4;
export const MAIN_LIFT_WEEKS = 6;
export const MAIN_LIFT_MIN_WEEKS_TRAINED = 5;
/** Library roles that count as compound. OURS (02 §1.2). */
export const COMPOUND_ROLES: ReadonlySet<ExerciseRole> = new Set(["main_compound", "secondary_compound", "machine_compound"]);
/** Name fallback when the library has no entry. OURS (02 §1.2 list). */
export const COMPOUND_NAME_RE = /\b(squat|bench|deadlift|dead lift|overhead press|ohp|shoulder press|military press|rows?|pull[\s-]?ups?|chin[\s-]?ups?)\b/i;
/** STR-1: median of the last 3 exposures vs the 3 before the phase, per lift. EVID (research F §7). */
export const STR_BLOCK_EXPOSURES = 3;
/** A lift is "down" at or below this change. EVID (Grgic 2020 CV ≈ 4%; one-sided 95%). */
export const STR_DROP_PCT = -5;
/** STR-OK: every main lift inside ±3% or rising. EVID/OURS (02 §6.2). */
export const STR_OK_BAND_PCT = 3;
/** A lift is "rising" at or above this change, matching GAIN-3 and RECOMP-1. EVID (research F). */
export const STR_RISING_PCT = 2.5;
/** STR-1 needs the phase to be this old. EVID (research F §7: earliest meaningful call ≥3 weeks in). */
export const STR_MIN_PHASE_AGE_DAYS = 21;
/** STR-3: sessions in the first 14 days of a cut are excluded (glycogen and fatigue dip). EVID (Henselmans 2022; Bone 2017). */
export const STR_EARLY_CUT_EXCLUDED_DAYS = 14;
/** Deload week: weekly working sets under this share of the previous 4-week median. OURS (02 §6.2). */
export const DELOAD_SET_RATIO = 0.6;
export const DELOAD_BASELINE_WEEKS = 4;
/** Rep-range change: median working reps move by more than this; the first 2 sessions after are excluded. OURS (02 §6.2). */
export const REP_RANGE_CHANGE_REPS = 3;
export const REP_RANGE_EXCLUDED_SESSIONS = 2;
export const REP_RANGE_BASELINE_EXPOSURES = 3;
/** Lift-derived training status needs this many main-lift exposures outside cuts and deloads in 12 weeks. OURS (02 §5.2). */
export const TRAINING_STATUS_MIN_EXPOSURES = 12;
export const TRAINING_STATUS_WEEKS = 12;
/** Exposures a lift needs before its slope counts. OURS. */
export const TRAINING_STATUS_MIN_EXPOSURES_PER_LIFT = 3;
/** Median main-lift e1RM slope (%/wk): novice ≥1.5, intermediate ≥0.5, else advanced. OURS (02 §5.2, after MacroFactor). */
export const TRAINING_STATUS_NOVICE_SLOPE = 1.5;
export const TRAINING_STATUS_INTERMEDIATE_SLOPE = 0.5;

// ── e1RM ──

export type LoggedSet = { weight?: string | number | null; reps?: string | number | null; rir?: number | null; type?: SetType | string | null };

/** `loadKg × (1 + (reps + RIR) / 30)`; RIR defaults to 0 (02 §6.1). */
export function e1rmAdj(loadKg: number, reps: number, rir = 0): number {
  return loadKg * (1 + (reps + rir) / EPLEY_DIVISOR);
}

export type ParsedSet = { loadKg: number; reps: number; rir: number; e1rm: number };

function parseReps(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const n = Number.parseFloat(s.replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

/** A completed set with reps > 0 (weight may be blank for bodyweight rows). */
function isCompletedSet(set: LoggedSet): boolean {
  const reps = parseReps(set.reps);
  return reps !== null && reps > 0;
}

/**
 * A set that may feed e1RM_adj: loaded (parseWeightText, so "", "BW" and
 * NaN are skipped), reps > 0 and reps + RIR ≤ 12. Null otherwise.
 */
export function parseWorkingSet(set: LoggedSet, unit: WeightUnit): ParsedSet | null {
  // T1: warm-ups and drop sets never feed e1RM; a failure set is RIR 0 whatever was typed.
  const type = setTypeOf(set);
  if (type === "warmup" || type === "drop") return null;
  const loadKg = parseWeightText(set.weight, unit);
  if (loadKg === null) return null;
  const reps = parseReps(set.reps);
  if (reps === null || reps <= 0) return null;
  const rir = type === "failure" ? 0 : typeof set.rir === "number" && Number.isFinite(set.rir) && set.rir > 0 ? set.rir : 0;
  if (reps + rir > MAX_REPS_PLUS_RIR) return null;
  return { loadKg, reps, rir, e1rm: e1rmAdj(loadKg, reps, rir) };
}

/** The best e1RM_adj across a session's valid sets, or null when none qualifies (02 §6.1). */
export function bestSessionE1rm(sets: readonly LoggedSet[], unit: WeightUnit): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const p = parseWorkingSet(set, unit);
    if (p && (best === null || p.e1rm > best)) best = p.e1rm;
  }
  return best;
}

// ── Exposures ──

/** One session of one lift with at least one valid loaded set. */
export type LiftExposure = {
  date: LocalDate;
  completedAt: string;
  /** Best e1RM_adj of the session, kg. */
  e1rm: number;
  /** Completed sets of the lift that session (loaded or not). */
  sets: number;
  /** Median reps across the lift's completed sets (rep-range detection). */
  medianReps: number;
};

export type LiftSeries = {
  /** Normalised name (trimmed, lower-cased, single spaces), mirroring `exerciseKey`. */
  key: string;
  /** Display name from the first occurrence. */
  name: string;
  exerciseId?: string;
  /** Ascending by date, one per date. */
  exposures: LiftExposure[];
};

export function liftKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function workoutDate(w: StoredWorkout, tz: string): LocalDate | null {
  const ms = Date.parse(w.completedAt);
  if (!Number.isFinite(ms)) return null;
  return localDateKey(new Date(ms), tz);
}

/**
 * Every lift's exposure series from the workout history, up to `now.today`.
 * Two sessions of the same lift on one date merge into one exposure.
 */
export function liftSeries(workouts: readonly StoredWorkout[], unit: WeightUnit, now: Now): LiftSeries[] {
  const byKey = new Map<string, LiftSeries & { byDate: Map<LocalDate, LiftExposure> }>();
  for (const w of workouts) {
    const date = workoutDate(w, now.tz);
    if (!date || date > now.today) continue;
    for (const ex of w.exercises ?? []) {
      const key = liftKey(ex.name);
      if (!key) continue;
      const sets = ex.sets ?? [];
      const completed = sets.filter(isCompletedSet);
      const best = bestSessionE1rm(sets, unit);
      if (best === null) continue;
      const reps = completed.map((s) => parseReps(s.reps) as number);
      let series = byKey.get(key);
      if (!series) {
        series = { key, name: ex.name.trim(), exerciseId: ex.exerciseId, exposures: [], byDate: new Map() };
        byKey.set(key, series);
      }
      const cur = series.byDate.get(date);
      if (cur) {
        cur.e1rm = Math.max(cur.e1rm, best);
        cur.sets += completed.length;
        if (cur.completedAt > w.completedAt) cur.completedAt = w.completedAt;
      } else {
        series.byDate.set(date, { date, completedAt: w.completedAt, e1rm: best, sets: completed.length, medianReps: median(reps) });
      }
    }
  }
  const out: LiftSeries[] = [];
  for (const s of byKey.values()) {
    const exposures = [...s.byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    out.push({ key: s.key, name: s.name, exerciseId: s.exerciseId, exposures });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// ── Main lifts ──

/** Compound by library role, else by the 02 §1.2 name list. */
export function isCompoundLift(name: string, exerciseId?: string): boolean {
  const meta = (exerciseId ? getExerciseById(exerciseId) : undefined) ?? getExerciseByName(name);
  if (meta) return COMPOUND_ROLES.has(meta.role);
  return COMPOUND_NAME_RE.test(name);
}

export type MainLift = LiftSeries & {
  /** Exposures in the last 6 weeks. */
  recentExposures: number;
  /** Distinct 7-day blocks (ending today) with an exposure, out of the last 6. */
  weeksTrained: number;
};

/** 0 for the block ending today, 1 for the block before, and so on. */
function weekBlock(date: LocalDate, today: LocalDate): number {
  return Math.floor(dayDiff(date, today) / 7);
}

/**
 * The user's 2–4 main lifts (02 §1.2): loaded compounds, ranked by sessions
 * in the last 6 weeks, trained in ≥5 of those weeks. Fewer than 2 means the
 * strength status is `unclear`.
 */
export function pickMainLifts(workouts: readonly StoredWorkout[], unit: WeightUnit, now: Now): MainLift[] {
  const from = addDays(now.today, -(MAIN_LIFT_WEEKS * 7 - 1));
  const candidates: MainLift[] = [];
  for (const s of liftSeries(workouts, unit, now)) {
    if (!isCompoundLift(s.name, s.exerciseId)) continue;
    const recent = s.exposures.filter((e) => e.date >= from);
    const weeks = new Set(recent.map((e) => weekBlock(e.date, now.today)));
    if (weeks.size < MAIN_LIFT_MIN_WEEKS_TRAINED) continue;
    candidates.push({ ...s, recentExposures: recent.length, weeksTrained: weeks.size });
  }
  candidates.sort((a, b) => b.recentExposures - a.recentExposures || b.weeksTrained - a.weeksTrained || a.key.localeCompare(b.key));
  return candidates.slice(0, MAIN_LIFTS_MAX);
}

/** Main-lift series, the shape `sleepCorroboration` consumes. */
export function mainLiftSeries(workouts: readonly StoredWorkout[], unit: WeightUnit, now: Now): LiftSeries[] {
  return pickMainLifts(workouts, unit, now).map(({ key, name, exerciseId, exposures }) => ({ key, name, exerciseId, exposures }));
}

// ── Exclusions ──

export type DeloadWeek = {
  start: LocalDate;
  end: LocalDate;
  sets: number;
  /** Median weekly sets of the previous 4 weeks. */
  baselineSets: number;
};

/** Hard (non-warm-up) completed sets per 7-day block ending today; index 0 is the block ending today. */
export function weeklySetCounts(workouts: readonly StoredWorkout[], now: Now): number[] {
  const counts: number[] = [];
  for (const w of workouts) {
    const date = workoutDate(w, now.tz);
    if (!date || date > now.today) continue;
    const block = weekBlock(date, now.today);
    while (counts.length <= block) counts.push(0);
    for (const ex of w.exercises ?? []) counts[block] += countHardSets(ex.sets ?? []);
  }
  return counts;
}

/**
 * Deload weeks (02 §6.2): a 7-day block whose completed sets fall under 60%
 * of the median of the previous 4 blocks. Needs all 4 earlier blocks inside
 * the history. Empty blocks are weeks off, not deloads.
 */
export function deloadWeeks(workouts: readonly StoredWorkout[], now: Now): DeloadWeek[] {
  const counts = weeklySetCounts(workouts, now);
  const out: DeloadWeek[] = [];
  for (let k = 0; k + DELOAD_BASELINE_WEEKS < counts.length; k++) {
    const sets = counts[k];
    if (sets <= 0) continue;
    const baseline = median(counts.slice(k + 1, k + 1 + DELOAD_BASELINE_WEEKS));
    if (!(baseline > 0)) continue;
    if (sets < DELOAD_SET_RATIO * baseline) {
      out.push({ start: addDays(now.today, -(7 * k + 6)), end: addDays(now.today, -7 * k), sets, baselineSets: baseline });
    }
  }
  return out;
}

/**
 * Dates of the first 2 exposures after a lift's median working reps move by
 * more than 3 against the median of the previous 3 exposures (02 §6.2).
 */
export function repRangeChanges(exposures: readonly LiftExposure[]): LocalDate[] {
  const out: LocalDate[] = [];
  let skipUntil = -1;
  for (let i = 1; i < exposures.length; i++) {
    if (i <= skipUntil) continue;
    const prev = exposures.slice(Math.max(0, i - REP_RANGE_BASELINE_EXPOSURES), i).map((e) => e.medianReps);
    if (Math.abs(exposures[i].medianReps - median(prev)) > REP_RANGE_CHANGE_REPS) {
      for (let j = i; j < Math.min(exposures.length, i + REP_RANGE_EXCLUDED_SESSIONS); j++) out.push(exposures[j].date);
      skipUntil = i + REP_RANGE_EXCLUDED_SESSIONS - 1;
    }
  }
  return out;
}

export type ExclusionReason = SessionSleepExclusion | "deload" | "rep_range" | "early_cut";

export type Exclusion = { date: LocalDate; reason: ExclusionReason };

export type ExclusionContext = {
  deloads: readonly DeloadWeek[];
  nights: ReadonlyMap<LocalDate, NormalizedNight>;
  goal: PhysiqueGoal | null;
};

/** Which of a lift's exposures STR-1 ignores, and why (02 §6.2 exclusions and STR-3). */
export function liftExclusions(exposures: readonly LiftExposure[], ctx: ExclusionContext): Exclusion[] {
  const out: Exclusion[] = [];
  const repChange = new Set(repRangeChanges(exposures));
  for (const e of exposures) {
    const sleep = sessionSleepExclusion(ctx.nights, e.date);
    if (sleep) {
      out.push({ date: e.date, reason: sleep });
      continue;
    }
    if (ctx.deloads.some((d) => e.date >= d.start && e.date <= d.end)) {
      out.push({ date: e.date, reason: "deload" });
      continue;
    }
    if (repChange.has(e.date)) {
      out.push({ date: e.date, reason: "rep_range" });
      continue;
    }
    if (ctx.goal && ctx.goal.type === "lose") {
      const cutDay = dayDiff(ctx.goal.startDate, e.date);
      if (cutDay >= 0 && cutDay < STR_EARLY_CUT_EXCLUDED_DAYS) out.push({ date: e.date, reason: "early_cut" });
    }
  }
  return out;
}

// ── Change vs phase start ──

export type LiftChange = {
  key: string;
  name: string;
  /** (median of the last 3 post-phase exposures / median of the 3 before the phase − 1) × 100; null until both blocks exist. */
  changePct: number | null;
  preMedian: number | null;
  postMedian: number | null;
  /** Usable (non-excluded) exposures before and since the phase start. */
  preN: number;
  postN: number;
  preDates: LocalDate[];
  postDates: LocalDate[];
  excluded: Exclusion[];
};

/**
 * One lift's change against its pre-phase baseline (02 §6.2 STR-1): the
 * median e1RM_adj of its last 3 usable exposures versus the median of the
 * last 3 usable exposures before `phaseStart`.
 */
export function liftChangeVsPhaseStart(lift: LiftSeries, phaseStart: LocalDate, ctx: ExclusionContext): LiftChange {
  const excluded = liftExclusions(lift.exposures, ctx);
  const skip = new Set(excluded.map((x) => x.date));
  const usable = lift.exposures.filter((e) => !skip.has(e.date));
  const pre = usable.filter((e) => e.date < phaseStart);
  const post = usable.filter((e) => e.date >= phaseStart);
  const preBlock = pre.slice(-STR_BLOCK_EXPOSURES);
  const postBlock = post.slice(-STR_BLOCK_EXPOSURES);
  const preMedian = preBlock.length >= STR_BLOCK_EXPOSURES ? median(preBlock.map((e) => e.e1rm)) : null;
  const postMedian = postBlock.length >= STR_BLOCK_EXPOSURES ? median(postBlock.map((e) => e.e1rm)) : null;
  const changePct = preMedian !== null && postMedian !== null && preMedian > 0 ? (postMedian / preMedian - 1) * 100 : null;
  return {
    key: lift.key,
    name: lift.name,
    changePct,
    preMedian,
    postMedian,
    preN: pre.length,
    postN: post.length,
    preDates: preBlock.map((e) => e.date),
    postDates: postBlock.map((e) => e.date),
    excluded,
  };
}

// ── Status ──

export type StrengthReason =
  | "ok"
  | "no_goal"
  | "few_main_lifts"
  | "phase_too_young"
  | "no_baseline"
  | "few_post_exposures";

export type StrengthResult = {
  status: StrengthStatus;
  reason: StrengthReason;
  /** STR-OK: ≥2 lifts read and every one above −3% (LOSS-2 needs this). */
  strOk: boolean;
  /** Fewer than 2 main lifts have 3 pre-phase exposures ("No pre-cut baseline for your lifts yet"). */
  baselineMissing: boolean;
  mainLifts: number;
  /** Lifts that had both blocks and were compared. */
  liftsRead: number;
  lifts: LiftChange[];
  phaseAgeDays: number | null;
  deloads: DeloadWeek[];
};

export type StrengthInput = {
  workouts: readonly StoredWorkout[];
  /** The unit the workout weight strings are in. */
  weightUnit: WeightUnit;
  goal: PhysiqueGoal | null;
  sleepNights: readonly SleepNight[];
  now: Now;
};

/**
 * STR-1 / STR-2 / STR-OK (02 §6.2) as one status: `dropping` when ≥2 main
 * lifts are ≤ −5% against their pre-phase medians, `one-lift` when exactly
 * one is, `rising` when ≥2 are ≥ +2.5% and none is down, `holding`
 * otherwise, and `unclear` whenever the gates fail (no goal, <2 main lifts,
 * phase under 21 days, no pre-phase baseline, or <3 usable post exposures
 * on 2 lifts). Sessions after short nights, in deload weeks, after a
 * rep-range change and in cut days 0–13 are excluded before comparing.
 */
export function strengthStatus({ workouts, weightUnit, goal, sleepNights, now }: StrengthInput): StrengthResult {
  const mains = pickMainLifts(workouts, weightUnit, now);
  const deloads = deloadWeeks(workouts, now);
  const ctx: ExclusionContext = { deloads, nights: nightsByDate(sleepNights), goal };
  const phaseAgeDays = goal ? dayDiff(goal.startDate, now.today) : null;
  const lifts = goal ? mains.map((m) => liftChangeVsPhaseStart(m, goal.startDate, ctx)) : [];
  const base = { lifts, mainLifts: mains.length, phaseAgeDays, deloads, strOk: false, baselineMissing: false, liftsRead: 0 };
  const unclear = (reason: StrengthReason, extra: Partial<StrengthResult> = {}): StrengthResult => ({
    status: "unclear",
    reason,
    ...base,
    ...extra,
  });
  if (!goal || phaseAgeDays === null) return unclear("no_goal");
  if (mains.length < MAIN_LIFTS_MIN) return unclear("few_main_lifts");
  const withBaseline = lifts.filter((l) => l.preMedian !== null);
  if (withBaseline.length < MAIN_LIFTS_MIN) return unclear("no_baseline", { baselineMissing: true });
  if (phaseAgeDays < STR_MIN_PHASE_AGE_DAYS) return unclear("phase_too_young");
  const read = withBaseline.filter((l) => l.changePct !== null);
  if (read.length < MAIN_LIFTS_MIN) return unclear("few_post_exposures");
  const changes = read.map((l) => l.changePct as number);
  const down = changes.filter((c) => c <= STR_DROP_PCT).length;
  const up = changes.filter((c) => c >= STR_RISING_PCT).length;
  const strOk = changes.every((c) => c > -STR_OK_BAND_PCT);
  let status: StrengthStatus;
  if (down >= 2) status = "dropping";
  else if (down === 1) status = "one-lift";
  else if (up >= 2) status = "rising";
  else status = "holding";
  return { status, reason: "ok", ...base, strOk, liftsRead: read.length };
}

// ── Lift-derived training status (02 §5.2) ──

export type LiftSlope = { key: string; name: string; slopePctPerWeek: number; n: number };

export type LiftDerivedTrainingStatus = {
  status: TrainingStatus;
  /** Median of the per-lift slopes, %/wk. */
  medianSlopePctPerWeek: number;
  /** Main-lift exposures used, outside cuts and deload weeks. */
  exposures: number;
  lifts: LiftSlope[];
  windowDays: number;
  source: "lifts";
};

export type TrainingStatusInput = {
  workouts: readonly StoredWorkout[];
  weightUnit: WeightUnit;
  now: Now;
  /** Current and past goals; days inside any `lose` goal are excluded. */
  goals?: readonly PhysiqueGoal[];
};

function cutRanges(goals: readonly PhysiqueGoal[], now: Now): Array<{ start: LocalDate; end: LocalDate }> {
  const out: Array<{ start: LocalDate; end: LocalDate }> = [];
  for (const g of goals) {
    if (g.type !== "lose") continue;
    const end = g.completedAt ? localDateKey(new Date(g.completedAt), now.tz) : now.today;
    out.push({ start: g.startDate, end });
  }
  return out;
}

/**
 * Training status from data (02 §5.2): the median main-lift e1RM_adj slope
 * over the last 12 weeks, from ≥12 exposures outside cuts and deloads.
 * Null when the data gate fails, so the caller falls back to the
 * onboarding `yearsTrainingBand` (`targets.trainingStatus`).
 */
export function liftDerivedTrainingStatus({ workouts, weightUnit, now, goals = [] }: TrainingStatusInput): LiftDerivedTrainingStatus | null {
  const mains = pickMainLifts(workouts, weightUnit, now);
  if (mains.length < MAIN_LIFTS_MIN) return null;
  const windowDays = TRAINING_STATUS_WEEKS * 7;
  const from = addDays(now.today, -(windowDays - 1));
  const deloads = deloadWeeks(workouts, now);
  const cuts = cutRanges(goals, now);
  const excluded = (d: LocalDate) => cuts.some((c) => d >= c.start && d <= c.end) || deloads.some((w) => d >= w.start && d <= w.end);
  let exposures = 0;
  const lifts: LiftSlope[] = [];
  for (const m of mains) {
    const pts = m.exposures.filter((e) => e.date >= from && !excluded(e.date));
    exposures += pts.length;
    if (pts.length < TRAINING_STATUS_MIN_EXPOSURES_PER_LIFT) continue;
    const xs = pts.map((e) => dayDiff(from, e.date));
    const ys = pts.map((e) => e.e1rm);
    const fit = olsSlope(xs, ys);
    const level = mean(ys);
    if (!(level > 0)) continue;
    lifts.push({ key: m.key, name: m.name, slopePctPerWeek: (fit.slope * 7 * 100) / level, n: pts.length });
  }
  if (exposures < TRAINING_STATUS_MIN_EXPOSURES || lifts.length === 0) return null;
  const med = median(lifts.map((l) => l.slopePctPerWeek));
  const status: TrainingStatus = med >= TRAINING_STATUS_NOVICE_SLOPE ? "novice" : med >= TRAINING_STATUS_INTERMEDIATE_SLOPE ? "intermediate" : "advanced";
  return { status, medianSlopePctPerWeek: med, exposures, lifts, windowDays, source: "lifts" };
}
