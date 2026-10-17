/**
 * The judge (Layer 2): composes the weight, intake, expenditure, targets,
 * strength and sleep engines into one `PhysiqueAnalysis` with exactly one
 * primary verdict, up to three flags, at most one recommendation and a
 * home-tile status.
 * Normative spec: docs/plan/02-engine-spec.md §7.3, §8 (rules, changes A–D,
 * suppression, ordering), §10 (copy). Evidence: research/F-evidence-rules.md.
 *
 * Pure. Everything arrives as data plus `now = {today, tz}`; nothing here
 * reads storage or the clock. The LLM never does the maths: every number
 * in the copy comes from this module.
 */

import { addDays, dayDiff, weekday, type LocalDate, type Now } from "@/lib/dates";
import type { OnboardingYearsBand } from "@/lib/onboardingProfile";
import { mean } from "@/lib/stats";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";
import { recommendationLabel, verdictCopy, type LiftFact, type VerdictFacts } from "@/lib/physique/copy";
import { RULE_EVIDENCE } from "@/lib/physique/evidence";
import { computeExpenditure, ENERGY_DENSITY_KCAL_PER_KG, type ExpenditureResult } from "@/lib/physique/expenditure";
import {
  ADHERENCE_TOLERANCE_KCAL,
  ADHERENCE_WINDOW_DAYS,
  adherence,
  countsAsLogged,
  dailyIntakeSeries,
  intakeMean,
  loggedShare,
  macroMeans,
  targetInEffect,
  unresolvedPartialDays,
  type Adherence,
} from "@/lib/physique/intake";
import { nightsByDate, sleepCorroboration, sleepStatus, type SleepRead } from "@/lib/physique/sleep";
import { statusFor } from "@/lib/physique/status";
import { liftDerivedTrainingStatus, mainLiftSeries, strengthStatus, type StrengthResult } from "@/lib/physique/strength";
import {
  isNearGoal,
  macros,
  rateBands,
  rateToKcalPerDay,
  trainingStatus,
  validateRate,
  WEEKLY_CAP_MIN_KCAL,
  WEEKLY_CAP_SHARE,
  weeklyTarget,
  type RateBands,
} from "@/lib/physique/targets";
import {
  displayRate,
  isConfidentlyAbove,
  isConfidentlyBelow,
  MIN_DAYS_FOR_RATE,
  MIN_WEIGHIN_RATIO,
  MIN_WEIGHINS_FOR_RATE,
  notConfidentlyOutside,
  periodAtWindowEdge,
  phaseMaskActive,
  pickWindow,
  segmentStart,
  trendSeries,
  weighInDates,
  weighInsByDate,
  type RateResult,
  type TrendPoint,
} from "@/lib/physique/weight";
import type {
  CheckInRecord,
  DailyIntake,
  DayFlags,
  ExpenditureMaturity,
  FoodEntry,
  PhysiqueAnalysis,
  PhysiqueGoal,
  PhysiqueProfile,
  PhysiqueProgram,
  ProgramTargets,
  Recommendation,
  RuleId,
  SleepNight,
  Verdict,
  WaistEntry,
  WeighIn,
} from "@/lib/physique/types";

// ── Constants (tags per 02-engine-spec) ──

/** LOSS-3: confidently losing faster than this, |%BW/wk|. EVID (Mero 2010; Garthe 2011). */
export const LOSS3_RATE = 1.5;
/** LOSS-1 and LOSS-2: confidently losing faster than this with lifts dropping (LOSS-1) or holding (LOSS-2). EVID (Helms 2014; Garthe 2011). */
export const LOSS1_RATE = 1.0;
/** LOSS-4: the faster edge near goal or for advanced lifters. EVID (Garthe 2011; Roberts 2020). */
export const LOSS4_RATE = 0.7;
/** LOSS-1/3 in-range goal, and the rate a too-fast goal is eased to. PUB (MacroFactor moderate) / EVID (Helms 2014). */
export const LOSS1_IN_RANGE = 0.75;
export const LOSS1_CHANGE_TO = 0.6;
/** LOSS-4 and near-goal LOSS-2 in-range goal, and the eased rate. EVID (Garthe 2011; Mero 2010). */
export const LOSS4_IN_RANGE = 0.6;
export const LOSS4_CHANGE_TO = 0.5;
/** LOSS-6 / GAIN-2 goal-relative thresholds: confidently slower than this share of the goal, point estimate under this share. OURS (02 §8.2 B). */
export const STALL_CONFIDENT_SHARE = 0.6;
export const STALL_POINT_SHARE = 0.5;
/** GAIN-2: every main lift within this of its pre-phase median, |%|. EVID (research F GAIN-2). */
export const GAIN2_LIFT_FLAT_PCT = 2;
/** GAIN-2: the goal is raised by this, never above the status default. OURS (02 §8.2 A). */
export const GAIN2_CHANGE_STEP = 0.1;
/** GAIN-1 must hold on this many consecutive weekly evaluations. OURS (sim: on-plan false positives ≤2%). */
export const GAIN1_CONSECUTIVE_EVALUATIONS = 2;
/** Days between weekly evaluations. PUB (weekly check-in). */
export const EVALUATION_INTERVAL_DAYS = 7;
/** GAIN-4: waist up at least this vs the 3-measure baseline over at least this many weeks. EVID (Verweij 2013; Ross 2020). */
export const GAIN4_WAIST_CM = 2.0;
export const GAIN4_MIN_WEEKS = 4;
/** RECOMP-1: waist down at least this (last 2 vs first 3 in the window), |rate| under this. EVID (research F §10 noise band). */
export const RECOMP_WAIST_DROP_CM = 2.0;
export const RECOMP_FLAT_RATE = 0.25;
/** Waist entries a window needs before waist can be read, and the block sizes compared. EVID (research F §10). */
export const WAIST_MIN_ENTRIES = 4;
export const WAIST_BASELINE_N = 3;
export const WAIST_RECENT_N = 2;
/** ON-TRACK: the rate is not confidently outside goal ± this. OURS (02 §8.2 D). */
export const ON_TRACK_TOLERANCE = 0.25;
/** Kcal-based rules need at least this share of logged days (G4). EVID/OURS (research F G4). */
export const MIN_LOGGED_SHARE = 0.8;
/** DB-1: cut at least this old, over target on this many days a week for this many weeks. EVID (Peos 2021; Byrne 2018). */
export const DB1_MIN_PHASE_DAYS = 42;
export const DB1_OVER_DAYS_PER_WEEK = 3;
export const DB1_WEEKS = 2;
/** DB-1: a day counts as over target beyond this, kcal (the adherence tolerance). OURS. */
export const DB1_OVER_KCAL = ADHERENCE_TOLERANCE_KCAL;
/** DB-1 offers a break of this many weeks. EVID (ICECAP used 1-week breaks). */
export const DB1_BREAK_WEEKS: 1 | 2 = 1;
/** G-EXP-2: logged intake down this share over 14 days with less than this share of the matching trend change. OURS (research F G-EXP-2). */
export const GEXP2_INTAKE_DROP_SHARE = 0.15;
export const GEXP2_TREND_MATCH_SHARE = 0.5;
export const GEXP2_WINDOW_DAYS = 14;
/** SLEEP-1: the sleep target is the goal, approached by at most this much per night. OURS (02 §7.3: +45–60 min). */
export const SLEEP1_STEP_H = 1.0;
/** SLEEP-2: intake after short nights at least this above intake after long nights; days each side; flat segment rate. OURS (02 §7.3). */
export const SLEEP2_INTAKE_DIFF_KCAL = 250;
export const SLEEP2_MIN_DAYS_EACH = 4;
export const SLEEP2_FLAT_RATE = 0.15;
/** SLEEP-2: a "long" night. EVID (Watson 2015: ≥7 h). */
export const SLEEP2_LONG_NIGHT_H = 7;
/** PRO-1: cut protein under this g/kg BW in at least this many of the last 3 weeks; complete days a week needs. EVID (Helms 2014) / OURS (days). */
export const PRO1_MIN_G_PER_KG = 1.8;
export const PRO1_WEEKS_LOW = 2;
export const PRO1_MIN_COMPLETE_DAYS_PER_WEEK = 4;
/** PRO-2: maintenance or bulk protein under this g/kg over 14 days. EVID (Morton 2018). */
export const PRO2_MIN_G_PER_KG = 1.6;
/** Complete days a 14-day macro read needs. OURS. */
export const MACRO_MIN_COMPLETE_DAYS_14 = 10;
/** FAT-1: fat under this g/kg and this share of kcal. EVID (Iraki 2019; Helms 2014). */
export const FAT1_MIN_G_PER_KG = 0.5;
export const FAT1_MAX_SHARE = 0.15;
/** SAFE-0: no deficit targets under this age. PUB (MacroFactor) / EVID (Mountjoy 2023). */
export const SAFE0_MIN_AGE = 18;
/** SAFE-4: a goal weight under this BMI is not coached. PUB (WHO). */
export const SAFE4_MIN_BMI = 18.5;
/** SAFE-4: LOSS-3's condition on this many consecutive weekly evaluations ("for ≥3 weeks despite LOSS-3"). EVID (Mero 2010) / OURS (the proxy). */
export const SAFE4_RATE_EVALUATIONS = 3;
/** Cooldown after an accepted `change_rate` or `refresh_targets`: the rate family stays silent this long. EVID (research F G5). */
export const COOLDOWN_DAYS = 14;
/** Rule windows and their weigh-in minimums (02 §2.2 table). EVID. */
export const WINDOWS_MID = [28, 21] as const;
export const WINDOWS_MID_MIN_WEIGHINS = 12;
export const WINDOWS_SHORT = [21, 14] as const;
export const WINDOWS_SHORT_MIN_WEIGHINS = 8;
export const WINDOWS_LONG = [42, 28] as const;
export const WINDOWS_LONG_ADVANCED = [42] as const;
export const WINDOWS_LONG_MIN_WEIGHINS = 16;
export const WINDOWS_RECOMP = [28] as const;
/** RECOMP-1 weigh-in minimum: the display ratio over 28 days. OURS. */
export const WINDOWS_RECOMP_MIN_WEIGHINS = 12;
/** G-NOISE-4: a period at a window's edge needs a window at least this long. EVID (White 2011, weak). */
export const PERIOD_MIN_WINDOW_DAYS = 28;
/** Flags shown beside the primary verdict. PUB (02 §8.1). */
export const MAX_FLAGS = 3;
/** Days of intake history the judge builds. OURS: covers the 42-day windows plus the partial-day lookback. */
export const INTAKE_LOOKBACK_DAYS = 70;
/** A weigh-in is "recent" for the check-in prompt within this many days. PUB (02 §9: last 3 days plus today). */
export const WEIGH_IN_PROMPT_DAYS = 3;

// ── Inputs ──

export type JudgeInputs = {
  /** The active goal (null when none, or when it is completed). */
  goal: PhysiqueGoal | null;
  /** Every goal, past and present; defaults to `[goal]`. Replays rate changes and cut ranges. */
  goals?: readonly PhysiqueGoal[];
  program: PhysiqueProgram | null;
  profile: PhysiqueProfile;
  onboarding?: { yearsTrainingBand?: OnboardingYearsBand; daysPerWeek?: number; bodyweightKg?: number };
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  waist: readonly WaistEntry[];
  workouts: readonly StoredWorkout[];
  /** The unit the workout weight strings are in. */
  weightUnit: WeightUnit;
  checkIns?: readonly CheckInRecord[];
};

// ── Internal types ──

type Group = 1 | 2 | 3 | 4 | 5;

type Fired = {
  id: RuleId;
  group: Group;
  verdict: Verdict;
  recommendation: Recommendation | null;
  /** The rule's own rate window, when it has one. */
  rate?: RateResult;
};

/** Primary order (02 §8.3 step 2). SAFE rules run from the most to the least serious; the rest as written. */
export const PRIMARY_ORDER: readonly RuleId[] = [
  "SAFE-5",
  "SAFE-3",
  "SAFE-0",
  "SAFE-4",
  "SAFE-2",
  "SAFE-1",
  "NO-GOAL",
  "DATA-PARTIAL",
  "DATA-HOLD",
  "DATA-RATE",
  "DATA-EXP",
  "G-EXP-2",
  "DB-1",
  "ADH-1",
  "LOSS-3",
  "LOSS-1",
  "LOSS-4",
  "GAIN-1",
  "SLEEP-1",
  "LOSS-6",
  "GAIN-2",
  "LOSS-2",
  "LOSS-2u",
  "RECOMP-1",
  "RECOMP-WAIST",
  "GAIN-3",
  "ON-TRACK",
  "NO-CHANGE",
];

/** Flag-only rules, after the remaining group 1–4 rules (02 §8.3 step 3). */
export const FLAG_ONLY_ORDER: readonly RuleId[] = ["SLEEP-1i", "SLEEP-2", "PRO-1", "PRO-2", "STR-2", "FAT-1", "GAIN-4"];

const RATE_FAMILY: ReadonlySet<RuleId> = new Set(["LOSS-1", "LOSS-2", "LOSS-2u", "LOSS-3", "LOSS-4", "LOSS-6", "GAIN-1", "GAIN-2", "GAIN-3"]);

const CONFIDENCE: Readonly<Record<RuleId, Verdict["confidence"]>> = {
  "SAFE-0": "high",
  "SAFE-1": "medium",
  "SAFE-2": "medium",
  "SAFE-3": "medium",
  "SAFE-4": "medium",
  "SAFE-5": "medium",
  "NO-GOAL": "high",
  "DATA-PARTIAL": "high",
  "DATA-HOLD": "high",
  "DATA-RATE": "high",
  "DATA-EXP": "high",
  "G-EXP-2": "medium",
  "DB-1": "medium",
  "ADH-1": "high",
  "LOSS-1": "medium",
  "LOSS-2": "medium",
  "LOSS-2u": "low",
  "LOSS-3": "medium",
  "LOSS-4": "low",
  "LOSS-6": "medium",
  "GAIN-1": "medium",
  "GAIN-2": "low",
  "GAIN-3": "medium",
  "GAIN-4": "low",
  "RECOMP-1": "low",
  "RECOMP-WAIST": "low",
  "STR-1": "low",
  "STR-2": "medium",
  "SLEEP-1": "medium",
  "SLEEP-1i": "medium",
  "SLEEP-2": "medium",
  "SLEEP-3": "medium",
  "PRO-1": "high",
  "PRO-2": "high",
  "FAT-1": "low",
  "ON-TRACK": "medium",
  "NO-CHANGE": "medium",
};

// ── Helpers ──

function isActive(goal: PhysiqueGoal | null, today: LocalDate): goal is PhysiqueGoal {
  if (!goal) return false;
  if (goal.completedAt && goal.completedAt.slice(0, 10) <= today) return false;
  return goal.startDate <= today;
}

function roundQuarter(h: number): number {
  return Math.round(h * 4) / 4;
}

/** The trend on `date`, or the last trend point at or before it. */
function trendAtOrBefore(series: readonly TrendPoint[], date: LocalDate): number | null {
  let best: number | null = null;
  for (const p of series) {
    if (p.date > date) break;
    best = p.trendKg;
  }
  return best;
}

/** Mean of (intake − target) per day over a week block, with the count of days over target by more than DB1_OVER_KCAL. */
function overTargetDays(intake: readonly DailyIntake[], program: PhysiqueProgram | null, from: LocalDate, to: LocalDate): number {
  let over = 0;
  for (const d of intake) {
    if (d.date < from || d.date > to || !countsAsLogged(d.status)) continue;
    const t = targetInEffect(program, d.date);
    if (t && d.kcal - t.kcal > DB1_OVER_KCAL) over++;
  }
  return over;
}

/** A program entry inside (from, to] whose change against the previous entry exceeds the weekly cap. */
function bigTargetChangeInside(program: PhysiqueProgram | null, from: LocalDate, to: LocalDate): boolean {
  if (!program) return false;
  const h = [...program.history].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.acceptedAt < b.acceptedAt ? -1 : 1));
  for (let i = 1; i < h.length; i++) {
    const e = h[i];
    if (e.startDate <= from || e.startDate > to) continue;
    const cap = Math.max(WEEKLY_CAP_MIN_KCAL, WEEKLY_CAP_SHARE * e.tdeeAtAccept);
    if (Math.abs(e.kcal - h[i - 1].kcal) > cap) return true;
  }
  return false;
}

/** An accepted `change_rate` (goal rate history) or `refresh_targets` (program entry) inside the cooldown. */
export function rateFamilyInCooldown(goal: PhysiqueGoal | null, program: PhysiqueProgram | null, today: LocalDate): boolean {
  for (const c of goal?.rateHistory ?? []) {
    if (c.reason === "recommendation" && c.date <= today && dayDiff(c.date, today) < COOLDOWN_DAYS) return true;
  }
  for (const e of program?.history ?? []) {
    if ((e.source === "refresh" || e.source === "apply_now") && e.startDate <= today && dayDiff(e.startDate, today) < COOLDOWN_DAYS) return true;
  }
  return false;
}

/** The check-in week start (the latest check-in weekday on or before today). */
export function checkInWeekStart(today: LocalDate, checkInWeekday: number): LocalDate {
  const back = (weekday(today) - checkInWeekday + 7) % 7;
  return addDays(today, -back);
}

/** True from the check-in weekday until a check-in record for that week exists (02 §9). */
export function isCheckInDue(goal: PhysiqueGoal | null, program: PhysiqueProgram | null, checkIns: readonly CheckInRecord[], today: LocalDate, checkInWeekday: number): boolean {
  if (!goal || !program) return false;
  const weekStart = checkInWeekStart(today, checkInWeekday);
  if (weekStart <= goal.startDate) return false;
  return !checkIns.some((c) => c.weekStart === weekStart || (c.date >= weekStart && c.date <= today));
}

type WaistRead = { entries: number; baselineCm: number | null; recentCm: number | null; deltaCm: number | null; weeks: number };

/** Waist entries inside [from, to]: the mean of the first 3 against the mean of the last 2 (research F §10). */
export function waistChange(waist: readonly WaistEntry[], from: LocalDate, to: LocalDate): WaistRead {
  const inWindow = waist
    .filter((w) => w.date >= from && w.date <= to && Number.isFinite(w.cm) && w.cm > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = inWindow.length;
  if (n < WAIST_MIN_ENTRIES) return { entries: n, baselineCm: null, recentCm: null, deltaCm: null, weeks: 0 };
  const baseline = mean(inWindow.slice(0, WAIST_BASELINE_N).map((w) => w.cm));
  const recent = mean(inWindow.slice(-WAIST_RECENT_N).map((w) => w.cm));
  const weeks = dayDiff(inWindow[0].date, inWindow[n - 1].date) / 7;
  return { entries: n, baselineCm: baseline, recentCm: recent, deltaCm: recent - baseline, weeks };
}

// ── The judge ──

/**
 * Build the analysis for `now.today` (02 §8). Always returns exactly one
 * primary verdict; NO-CHANGE is the floor.
 */
export function buildPhysiqueAnalysis(inputs: JudgeInputs, now: Now): PhysiqueAnalysis {
  const { today } = now;
  const profile = inputs.profile;
  const goal = isActive(inputs.goal, today) ? inputs.goal : null;
  const goals = (() => {
    const list = [...(inputs.goals ?? [])];
    if (inputs.goal && !list.some((g) => g.id === inputs.goal!.id)) list.push(inputs.goal);
    return list;
  })();
  const program = goal && inputs.program && inputs.program.goalId === goal.id ? inputs.program : null;
  const phase: PhysiqueAnalysis["phase"] = goal ? goal.type : "none";
  const dayFlags = inputs.dayFlags;
  const weighIns = inputs.weighIns.filter((w) => w.date <= today);
  const checkIns = inputs.checkIns ?? [];

  // ── Weight ──
  const trend = trendSeries(weighIns);
  const trendKg = trend.length ? trend[trend.length - 1].trendKg : null;
  const byDate = weighInsByDate(weighIns);
  const latestDate = [...byDate.keys()].sort().pop();
  const latestKg = latestDate ? (byDate.get(latestDate) ?? null) : null;
  const weighIns14 = weighInDates(weighIns, addDays(today, -13), today).length;
  const segment = segmentStart({ goal, dayFlags, today });
  const masked = phaseMaskActive(goal, today);
  const display = goal && !masked ? displayRate(weighIns, today, segment, dayFlags) : null;

  const rateAt = (endDate: LocalDate, candidates: readonly number[], minWeighIns: number): RateResult | null => {
    if (!goal || masked) return null;
    const pick = pickWindow(
      weighIns.filter((w) => w.date <= endDate),
      endDate,
      candidates,
      { segmentStart: segment, minWeighIns, dayFlags }
    );
    if (!pick) return null;
    // G-NOISE-4: a period at the edge of a short window needs 28 days or more.
    if (pick.windowDays < PERIOD_MIN_WINDOW_DAYS && periodAtWindowEdge(dayFlags, pick.result.windowStart, pick.result.windowEnd)) return null;
    return pick.result;
  };
  const advanced = goal?.trainingStatusAtCreation === "advanced";
  const rMid = rateAt(today, WINDOWS_MID, WINDOWS_MID_MIN_WEIGHINS);
  const rShort = rateAt(today, WINDOWS_SHORT, WINDOWS_SHORT_MIN_WEIGHINS);
  const longCandidates = advanced ? WINDOWS_LONG_ADVANCED : WINDOWS_LONG;
  const rLong = rateAt(today, longCandidates, WINDOWS_LONG_MIN_WEIGHINS);
  const rRecomp = rateAt(today, WINDOWS_RECOMP, WINDOWS_RECOMP_MIN_WEIGHINS);

  const weighInsNeeded = (() => {
    if (!goal || display) return 0;
    const first = [...byDate.keys()].sort()[0] ?? null;
    const floor = segment && first ? (segment > first ? segment : first) : (segment ?? first ?? today);
    const segDays = Math.max(0, dayDiff(floor, today) + 1);
    const daysShort = Math.max(0, MIN_DAYS_FOR_RATE - segDays);
    const from = addDays(today, -(MIN_DAYS_FOR_RATE - 1));
    const have = weighInDates(weighIns, floor > from ? floor : from, today).length;
    const need = Math.max(MIN_WEIGHINS_FOR_RATE, Math.ceil(MIN_DAYS_FOR_RATE * MIN_WEIGHIN_RATIO));
    return Math.max(1, daysShort, need - have);
  })();

  // ── Intake, adherence, macros ──
  const intakeFrom = addDays(today, -(INTAKE_LOOKBACK_DAYS - 1));
  const intake = dailyIntakeSeries(inputs.foodEntries, dayFlags, intakeFrom, today);
  const adhWindowStart = addDays(today, -(ADHERENCE_WINDOW_DAYS - 1));
  const unresolved = unresolvedPartialDays(intake, adhWindowStart, today);
  const adh: Adherence = adherence(intake, program, today);
  const logged14 = loggedShare(intake, today, ADHERENCE_WINDOW_DAYS);
  const bwForMacros = trendKg ?? latestKg ?? goal?.startTrendKg ?? null;
  const macro14 = macroMeans(intake, today, 14, bwForMacros);
  const macro7 = macroMeans(intake, today, 7, bwForMacros);

  // ── Expenditure ──
  const exp: ExpenditureResult | null = computeExpenditure(
    { profile, weighIns, foodEntries: inputs.foodEntries, dayFlags, goals, workouts: inputs.workouts, onboarding: inputs.onboarding },
    now
  );
  const maturity: ExpenditureMaturity = exp?.maturity ?? { state: "calibrating", kcal: null, updatingDays: 0, plusMinus: null, resume: null };
  const tdee = maturity.kcal;

  // ── Targets ──
  const current = targetInEffect(program, today);
  let targets: ProgramTargets | null = current ? { kcal: current.kcal, proteinG: current.proteinG, fatG: current.fatG, carbsG: current.carbsG } : null;

  // ── Strength, sleep, training status ──
  const str: StrengthResult = strengthStatus({ workouts: inputs.workouts, weightUnit: inputs.weightUnit, goal, sleepNights: inputs.sleepNights, now });
  const slp: SleepRead = sleepStatus({ nights: inputs.sleepNights, now, sleepGoalH: profile.sleepGoalH });
  const corr = sleepCorroboration(mainLiftSeries(inputs.workouts, inputs.weightUnit, now), now);
  const liftStatus = liftDerivedTrainingStatus({ workouts: inputs.workouts, weightUnit: inputs.weightUnit, now, goals });
  const trainingNow = trainingStatus(inputs.onboarding?.yearsTrainingBand, liftStatus?.status ?? null);
  const trainingSource: PhysiqueAnalysis["training"]["source"] = liftStatus ? "lifts" : inputs.onboarding?.yearsTrainingBand ? "onboarding" : "default";
  const sleepOk = str.status === "dropping" && slp.status === "ok";

  const nearGoal = !!goal && trendKg !== null && goal.type !== "maintain" && isNearGoal(goal, trendKg);
  const bands: RateBands | null = goal ? rateBands(goal.trainingStatusAtCreation, { nearGoal }) : null;
  const goalRate = goal ? goal.ratePctPerWeek : null;
  const phaseAgeDays = goal ? dayDiff(goal.startDate, today) : null;
  const liftsDown: LiftFact[] = str.lifts.filter((l) => l.changePct !== null && l.changePct <= -5).map((l) => ({ name: l.name, changePct: l.changePct as number }));
  const liftsUp: LiftFact[] = str.lifts.filter((l) => l.changePct !== null && l.changePct >= 2.5).map((l) => ({ name: l.name, changePct: l.changePct as number }));
  const liftsRead = str.lifts.filter((l) => l.changePct !== null);
  const liftsFlat = liftsRead.length >= 2 && liftsRead.every((l) => Math.abs(l.changePct as number) <= GAIN2_LIFT_FLAT_PCT);

  const baseFacts: VerdictFacts = {
    phase,
    goalRate,
    strength: str.status,
    nearGoal,
    advanced,
    adherent: adh.onTarget,
    adherenceDeltaKcal: adh.deltaKcal,
    trendKg,
    targetKg: goal?.targetKg ?? null,
    phaseAgeDays,
    sleepMeanH: slp.mean14h,
    sleepNights: slp.nightsValid14,
  };

  const fired: Fired[] = [];
  const suppressed: Array<{ id: RuleId; by: string }> = [];

  const fire = (id: RuleId, group: Group, facts: Partial<VerdictFacts>, recommendation: Recommendation | null = null, rate?: RateResult): Fired => {
    const f: VerdictFacts = { ...baseFacts, ...facts, recommendation, rate: rate ? { ratePctPerWeek: rate.ratePctPerWeek, windowDays: rate.windowDays, n: rate.n } : (facts.rate ?? null) };
    const copy = verdictCopy(id, f);
    const verdict: Verdict = {
      id,
      title: copy.title,
      detail: copy.detail,
      windowDays: rate?.windowDays,
      n: rate?.n,
      evidenceIds: [...RULE_EVIDENCE[id]],
      confidence: CONFIDENCE[id],
    };
    const entry: Fired = { id, group, verdict, recommendation, rate };
    fired.push(entry);
    return entry;
  };

  // ── Recommendation choice for rate rules (02 §8.2 A) ──
  type RateRule = "LOSS-1" | "LOSS-2" | "LOSS-2u" | "LOSS-3" | "LOSS-4" | "LOSS-6" | "GAIN-1" | "GAIN-2";
  const rateRecommendation = (rule: RateRule, r: RateResult): { rec: Recommendation | null; goalOutOfRange: boolean } => {
    if (!goal || !bands) return { rec: null, goalOutOfRange: false };
    const from = goal.ratePctPerWeek;
    const g = Math.abs(from);
    let outOfRange = false;
    let to: number | null = null;
    switch (rule) {
      case "LOSS-1":
      case "LOSS-3":
        outOfRange = g > LOSS1_IN_RANGE;
        to = -Math.min(g, LOSS1_CHANGE_TO);
        break;
      case "LOSS-4":
        outOfRange = g > LOSS4_IN_RANGE;
        to = -Math.min(g, LOSS4_CHANGE_TO);
        break;
      case "LOSS-2":
      case "LOSS-2u":
        if (!(nearGoal || advanced)) return { rec: null, goalOutOfRange: false };
        outOfRange = g > LOSS4_IN_RANGE;
        to = -Math.min(g, LOSS4_CHANGE_TO);
        break;
      case "LOSS-6":
        outOfRange = false;
        break;
      case "GAIN-1":
        outOfRange = from > bands.gain.ceiling;
        to = bands.gain.default;
        break;
      case "GAIN-2":
        outOfRange = from < bands.gain.green.min;
        to = Math.min(from + GAIN2_CHANGE_STEP, bands.gain.default);
        break;
    }
    const wantsLess = rule !== "GAIN-2";
    if (outOfRange && to !== null && trendKg !== null) {
      // Direction checks: LOSS-* |to| < |from|; GAIN-1 to < from; GAIN-2 to > from.
      const okDirection = rule === "GAIN-2" ? to > from : rule === "GAIN-1" ? to < from : Math.abs(to) < Math.abs(from);
      const valid = validateRate({ type: goal.type, ratePctPerWeek: to, status: goal.trainingStatusAtCreation, trendKg, tdee0: tdee ?? 0, nearGoal });
      if (okDirection && valid.ok) {
        const kcalDeltaAtCurrentBW = rateToKcalPerDay(to, trendKg) - rateToKcalPerDay(from, trendKg);
        return { rec: { kind: "change_rate", fromPctPerWeek: from, toPctPerWeek: to, kcalDeltaAtCurrentBW }, goalOutOfRange: true };
      }
      return { rec: null, goalOutOfRange: true };
    }
    // Goal in range: refresh the targets when the user is adherent and the coach is lagging.
    if (adh.onTarget === true && maturity.state === "stable" && current && tdee !== null && trendKg !== null && !bigTargetChangeInside(program, r.windowStart, r.windowEnd)) {
      const raw = weeklyTarget({ tdee, trendKg, goal, prevTargetKcal: null, unsmoothed: true, sex: profile.sex });
      const fromKcal = current.kcal;
      const toKcal = raw.kcal;
      // Direction checks: LOSS-1/2/3/4 raise kcal; LOSS-6 and GAIN-1 lower it; GAIN-2 raises it.
      const okDirection = rule === "LOSS-6" || rule === "GAIN-1" ? toKcal < fromKcal : toKcal > fromKcal;
      if (okDirection) return { rec: { kind: "refresh_targets", fromKcal, toKcal }, goalOutOfRange: false };
    }
    void wantsLess;
    return { rec: null, goalOutOfRange: false };
  };

  // ── Group 1: safety ──
  const age = profile.age ?? null;
  const heightCm = profile.heightCm ?? 0;
  if (age !== null && age < SAFE0_MIN_AGE && goal && goal.type === "lose") fire("SAFE-0", 1, {});
  if (profile.safety?.pregnantOrEdHistory === true && goal && goal.type === "lose") fire("SAFE-5", 1, {}, { kind: "pause_and_seek_help" });
  if ((profile.safety?.redFlags ?? []).length > 0 && goal && goal.type === "lose") fire("SAFE-3", 1, {}, { kind: "pause_and_seek_help" });
  if (goal && goal.type === "lose" && heightCm > 0) {
    const bmiTarget = goal.targetKg / (heightCm / 100) ** 2;
    if (bmiTarget < SAFE4_MIN_BMI) fire("SAFE-4", 1, { safeReason: "bmi", bmiTarget, targetKg: goal.targetKg }, { kind: "pause_and_seek_help" });
  }
  if (goal && goal.type === "lose" && tdee !== null && trendKg !== null) {
    const wt = weeklyTarget({ tdee, trendKg, goal, prevTargetKcal: null, unsmoothed: true, sex: profile.sex });
    if (wt.floorBound) fire("SAFE-1", 1, { floorKcal: wt.floor });
  }

  // ── Group 2: data ──
  if (!goal) fire("NO-GOAL", 2, {});
  if (goal && unresolved.length > 0) {
    const partialDays = unresolved.map((date) => ({ date, kcal: intake.find((d) => d.date === date)?.kcal ?? 0 }));
    fire("DATA-PARTIAL", 2, { partialDays }, { kind: "confirm_days", dates: [...unresolved] });
  }
  if (goal && maturity.state === "holding") {
    const foodDaysNeeded = maturity.resume?.foodDaysNeeded ?? 0;
    const weighInNeeded = maturity.resume?.weighInNeeded ?? false;
    const rec: Recommendation = foodDaysNeeded > 0 ? { kind: "log_more", what: "food", needed: foodDaysNeeded } : { kind: "log_more", what: "weight", needed: 1 };
    fire("DATA-HOLD", 2, { foodDaysNeeded, weighInNeeded }, rec);
  }
  if (goal && !display) fire("DATA-RATE", 2, { weighInsNeeded }, { kind: "log_more", what: "weight", needed: weighInsNeeded });
  if (goal && maturity.state === "calibrating") fire("DATA-EXP", 2, { updatingDays: maturity.updatingDays });
  // G-EXP-2: a logging gap, not a metabolism change (02 §8.2 C).
  if (goal && maturity.state !== "holding" && segment && dayDiff(segment, today) >= 2 * GEXP2_WINDOW_DAYS - 1) {
    const last = intakeMean(intake, today, GEXP2_WINDOW_DAYS);
    const prevEnd = addDays(today, -GEXP2_WINDOW_DAYS);
    const prev = intakeMean(intake, prevEnd, GEXP2_WINDOW_DAYS);
    const sharesOk = loggedShare(intake, today, GEXP2_WINDOW_DAYS) >= MIN_LOGGED_SHARE && loggedShare(intake, prevEnd, GEXP2_WINDOW_DAYS) >= MIN_LOGGED_SHARE;
    if (last !== null && prev !== null && prev > 0 && sharesOk) {
      const drop = (prev - last) / prev;
      if (drop >= GEXP2_INTAKE_DROP_SHARE) {
        const expectedKg = ((prev - last) * GEXP2_WINDOW_DAYS) / ENERGY_DENSITY_KCAL_PER_KG;
        const t0 = trendAtOrBefore(trend, prevEnd);
        const t1 = trendAtOrBefore(trend, today);
        const observedKg = t0 !== null && t1 !== null ? t0 - t1 : 0;
        if (observedKg < GEXP2_TREND_MATCH_SHARE * expectedKg) fire("G-EXP-2", 2, { intakeDropShare: drop });
      }
    }
  } else if (goal && maturity.state === "holding") {
    fire("G-EXP-2", 2, {});
  }

  // ── Group 3: adherence ──
  let adh1: Fired | null = null;
  if (goal && adh.onTarget === false && adh.unresolved.length === 0 && logged14 >= MIN_LOGGED_SHARE && adh.deltaKcal !== null) {
    adh1 = fire("ADH-1", 3, {}, { kind: "eat_to_target", deltaKcal: adh.deltaKcal });
  }
  if (goal && goal.type === "lose" && phaseAgeDays !== null && phaseAgeDays >= DB1_MIN_PHASE_DAYS && adh1 && (adh.deltaKcal ?? 0) > 0) {
    let weeksOver = 0;
    for (let k = 0; k < DB1_WEEKS; k++) {
      const to = addDays(today, -7 * k);
      const from = addDays(to, -6);
      if (overTargetDays(intake, program, from, to) >= DB1_OVER_DAYS_PER_WEEK) weeksOver++;
    }
    if (weeksOver >= DB1_WEEKS) fire("DB-1", 3, {}, { kind: "diet_break", weeks: DB1_BREAK_WEEKS });
  }

  // ── Group 4: outcome ──
  const lose = !!goal && goal.type === "lose";
  const gain = !!goal && goal.type === "gain";
  const sleepShort = slp.status === "short" || slp.status === "severe";

  if (lose && rShort && isConfidentlyBelow(rShort, -LOSS3_RATE)) {
    const { rec, goalOutOfRange } = rateRecommendation("LOSS-3", rShort);
    fire("LOSS-3", 4, { goalOutOfRange }, rec, rShort);
    // SAFE-4: the same condition on three consecutive weekly evaluations.
    let held = 1;
    for (let k = 1; k < SAFE4_RATE_EVALUATIONS; k++) {
      const r = rateAt(addDays(today, -EVALUATION_INTERVAL_DAYS * k), WINDOWS_SHORT, WINDOWS_SHORT_MIN_WEIGHINS);
      if (r && isConfidentlyBelow(r, -LOSS3_RATE)) held++;
    }
    if (held >= SAFE4_RATE_EVALUATIONS) fire("SAFE-4", 1, { safeReason: "rate" }, { kind: "pause_and_seek_help" }, rShort);
  }
  if (lose && rMid && isConfidentlyBelow(rMid, -LOSS1_RATE) && str.status === "dropping") {
    const { rec, goalOutOfRange } = rateRecommendation("LOSS-1", rMid);
    fire("LOSS-1", 4, { goalOutOfRange, lifts: liftsDown }, rec, rMid);
  }
  if (lose && (nearGoal || advanced) && rMid && isConfidentlyBelow(rMid, -LOSS4_RATE) && str.status === "dropping") {
    const { rec, goalOutOfRange } = rateRecommendation("LOSS-4", rMid);
    fire("LOSS-4", 4, { goalOutOfRange, lifts: liftsDown }, rec, rMid);
  }
  if (lose && rMid && isConfidentlyBelow(rMid, -LOSS1_RATE) && str.strOk) {
    const { rec, goalOutOfRange } = rateRecommendation("LOSS-2", rMid);
    fire("LOSS-2", 4, { goalOutOfRange }, rec, rMid);
  }
  if (lose && rMid && isConfidentlyBelow(rMid, -LOSS1_RATE) && str.status === "unclear") {
    const { rec, goalOutOfRange } = rateRecommendation("LOSS-2u", rMid);
    fire("LOSS-2u", 4, { goalOutOfRange }, rec, rMid);
  }

  // Waist, for RECOMP-1 / RECOMP-WAIST / GAIN-4.
  const waistWindowFrom = rRecomp ? rRecomp.windowStart : addDays(today, -27);
  const waist28 = waistChange(inputs.waist, waistWindowFrom, today);
  const waistLong = rLong ? waistChange(inputs.waist, rLong.windowStart, today) : waist28;

  // Stall conditions (goal-relative, 02 §8.2 B), shared by LOSS-6 / GAIN-2 / RECOMP-WAIST.
  const stallLoss = lose && rLong && goalRate !== null && isConfidentlyAbove(rLong, STALL_CONFIDENT_SHARE * goalRate) && rLong.ratePctPerWeek > STALL_POINT_SHARE * goalRate;
  const stallGain = gain && rLong && goalRate !== null && isConfidentlyBelow(rLong, STALL_CONFIDENT_SHARE * goalRate) && rLong.ratePctPerWeek < STALL_POINT_SHARE * goalRate;
  const loggedLong = rLong ? loggedShare(intake, today, rLong.windowDays) >= MIN_LOGGED_SHARE : false;

  const recompFires = !!rRecomp && Math.abs(rRecomp.ratePctPerWeek) < RECOMP_FLAT_RATE && str.status === "rising" && waist28.deltaCm !== null && waist28.deltaCm <= -RECOMP_WAIST_DROP_CM;
  const recompWaistFires = !recompFires && (stallLoss || stallGain) && str.status === "rising" && waistLong.entries < WAIST_MIN_ENTRIES;

  if (stallLoss && loggedLong && rLong) {
    const { rec } = rateRecommendation("LOSS-6", rLong);
    fire("LOSS-6", 4, {}, rec, rLong);
  }

  // GAIN-1 on two consecutive weekly evaluations.
  if (gain && rLong && bands && isConfidentlyAbove(rLong, bands.gain.ceiling)) {
    let held = 1;
    for (let k = 1; k < GAIN1_CONSECUTIVE_EVALUATIONS; k++) {
      const r = rateAt(addDays(today, -EVALUATION_INTERVAL_DAYS * k), longCandidates, WINDOWS_LONG_MIN_WEIGHINS);
      if (r && isConfidentlyAbove(r, bands.gain.ceiling)) held++;
    }
    if (held >= GAIN1_CONSECUTIVE_EVALUATIONS) {
      const { rec, goalOutOfRange } = rateRecommendation("GAIN-1", rLong);
      fire("GAIN-1", 4, { goalOutOfRange }, rec, rLong);
    }
  }
  if (stallGain && loggedLong && rLong && liftsFlat) {
    const { rec, goalOutOfRange } = rateRecommendation("GAIN-2", rLong);
    fire("GAIN-2", 4, { goalOutOfRange }, rec, rLong);
  }
  if (gain && rLong && bands && rLong.ratePctPerWeek < bands.gain.green.min && str.status === "rising") {
    fire("GAIN-3", 4, { lifts: liftsUp }, null, rLong);
  }
  if (gain && rLong && bands && waistLong.deltaCm !== null && waistLong.deltaCm >= GAIN4_WAIST_CM && waistLong.weeks >= GAIN4_MIN_WEEKS && rLong.ratePctPerWeek >= bands.gain.ceiling) {
    fire("GAIN-4", 5, { waistDeltaCm: waistLong.deltaCm, waistWeeks: Math.round(waistLong.weeks) }, null, rLong);
  }
  if (recompFires && rRecomp) fire("RECOMP-1", 4, { lifts: liftsUp, waistDeltaCm: waist28.deltaCm }, null, rRecomp);
  if (recompWaistFires) fire("RECOMP-WAIST", 4, {}, { kind: "log_more", what: "waist", needed: Math.max(1, WAIST_MIN_ENTRIES - waistLong.entries) });

  // SLEEP-1 / SLEEP-1i (02 §7.3).
  if (lose && sleepShort && slp.mean14h !== null) {
    const liftsCorr: LiftFact[] = corr.lifts.filter((l) => l.eligible && l.changePct !== null && l.changePct <= -2.5).map((l) => ({ name: l.name, changePct: l.changePct as number }));
    if (corr.corroborated) {
      const targetHours = Math.min(slp.goalH, roundQuarter(slp.mean14h + SLEEP1_STEP_H));
      fire("SLEEP-1", 4, { lifts: liftsCorr }, { kind: "sleep", targetHours });
    } else {
      fire("SLEEP-1i", 5, {});
    }
  }
  // SLEEP-2: bigger days after short nights, on a flat segment.
  if (lose && sleepShort && display && Math.abs(display.result.ratePctPerWeek) <= SLEEP2_FLAT_RATE && display.windowDays >= MIN_DAYS_FOR_RATE) {
    const nights = nightsByDate(inputs.sleepNights);
    const afterShort: number[] = [];
    const afterLong: number[] = [];
    for (const d of intake) {
      if (d.date < display.result.windowStart || d.date > today || d.status !== "complete") continue;
      const n = nights.get(d.date);
      if (!n || !n.valid) continue;
      if (n.asleepH < slp.thresholds.shortH) afterShort.push(d.kcal);
      else if (n.asleepH >= SLEEP2_LONG_NIGHT_H) afterLong.push(d.kcal);
    }
    if (afterShort.length >= SLEEP2_MIN_DAYS_EACH && afterLong.length >= SLEEP2_MIN_DAYS_EACH) {
      const diff = mean(afterShort) - mean(afterLong);
      if (diff >= SLEEP2_INTAKE_DIFF_KCAL) {
        const targetHours = Math.min(slp.goalH, roundQuarter((slp.mean14h ?? slp.goalH - 1) + SLEEP1_STEP_H));
        fire("SLEEP-2", 5, { sleepIntakeDiffKcal: diff }, { kind: "sleep", targetHours });
      }
    }
  }

  // STR-2: one lift down (a flag, not a nutrition verdict).
  if (goal && str.status === "one-lift") fire("STR-2", 5, { lifts: liftsDown.slice(0, 1) });

  // PRO-1 / PRO-2 / FAT-1.
  if (lose && bwForMacros) {
    let weeksLow = 0;
    const lows: number[] = [];
    for (let k = 0; k < 3; k++) {
      const m = macroMeans(intake, addDays(today, -7 * k), 7, bwForMacros);
      if (m.n >= PRO1_MIN_COMPLETE_DAYS_PER_WEEK && m.proteinGPerKg !== null && m.proteinGPerKg < PRO1_MIN_G_PER_KG) {
        weeksLow++;
        lows.push(m.proteinGPerKg);
      }
    }
    if (weeksLow >= PRO1_WEEKS_LOW) {
      const toG = current?.proteinG ?? Math.round((PRO1_MIN_G_PER_KG * bwForMacros) / 5) * 5;
      fire("PRO-1", 5, { proteinGPerKg: mean(lows), proteinWeeksLow: weeksLow, proteinTargetG: toG }, { kind: "protein", toG });
    }
  }
  if (goal && !lose && macro14.n >= MACRO_MIN_COMPLETE_DAYS_14 && macro14.proteinGPerKg !== null && macro14.proteinGPerKg < PRO2_MIN_G_PER_KG && bwForMacros) {
    const toG = current?.proteinG ?? Math.round((PRO2_MIN_G_PER_KG * bwForMacros) / 5) * 5;
    fire("PRO-2", 5, { proteinGPerKg: macro14.proteinGPerKg, proteinTargetG: toG }, { kind: "protein", toG });
  }
  if (goal && macro14.n >= MACRO_MIN_COMPLETE_DAYS_14 && macro14.fatGPerKg !== null && macro14.fatG !== null) {
    const kcal14 = intakeMean(intake, today, 14);
    const share = kcal14 && kcal14 > 0 ? (macro14.fatG * 9) / kcal14 : null;
    if (macro14.fatGPerKg < FAT1_MIN_G_PER_KG && share !== null && share < FAT1_MAX_SHARE) fire("FAT-1", 5, { fatGPerKg: macro14.fatGPerKg, fatShare: share });
  }

  // ON-TRACK: no group 1–3 rule, and the rate is not confidently outside goal ± 0.25 (maintain: inside the band).
  const anyGroup123 = fired.some((f) => f.group <= 3 && f.id !== "DATA-EXP" && f.id !== "G-EXP-2");
  if (goal && !anyGroup123) {
    if (goal.type === "maintain") {
      if (trendKg !== null && bands && Math.abs(trendKg - goal.targetKg) <= bands.maintain.bandKg) fire("ON-TRACK", 4, {});
    } else if (rMid && goalRate !== null && notConfidentlyOutside(rMid, goalRate, ON_TRACK_TOLERANCE)) {
      fire("ON-TRACK", 4, { strength: liftsRead.length >= 2 ? str.status : "unclear" }, null, rMid);
    }
  }
  fire("NO-CHANGE", 4, {});

  // ── Suppression (02 §8.3 step 1) ──
  const remove = (id: RuleId, by: string) => {
    const i = fired.findIndex((f) => f.id === id);
    if (i >= 0) {
      fired.splice(i, 1);
      suppressed.push({ id, by });
    }
  };
  if (recompFires) {
    remove("LOSS-6", "RECOMP-1");
    remove("GAIN-2", "RECOMP-1");
  }
  if (recompWaistFires) {
    remove("LOSS-6", "RECOMP-WAIST");
    remove("GAIN-2", "RECOMP-WAIST");
  }
  if (fired.some((f) => f.id === "GAIN-3")) remove("GAIN-2", "GAIN-3");
  if (rateFamilyInCooldown(goal, program, today)) {
    for (const id of [...fired.map((f) => f.id)]) if (RATE_FAMILY.has(id)) remove(id, "cooldown");
  }
  // SAFE-0 / SAFE-5: targets fall back to maintenance; no deficit coaching.
  const safeFired = fired.filter((f) => f.group === 1);
  if (safeFired.some((f) => f.id === "SAFE-0" || f.id === "SAFE-5") && tdee !== null && trendKg !== null && goal) {
    targets = macros({
      kcal: tdee,
      trendKg,
      heightCm,
      sex: profile.sex,
      phase: "maintain",
      proteinLevel: profile.proteinLevel,
      dietType: profile.dietType,
      bodyFatCategory: profile.bodyFatCategory,
      bodyFatPctMeasured: profile.bodyFatPctMeasured,
    });
  }
  // G8 and the SLEEP-1 block: drop every recommendation that deepens a deficit.
  const deepens = (rec: Recommendation | null): boolean => {
    if (!rec) return false;
    if (rec.kind === "refresh_targets") return rec.toKcal < rec.fromKcal;
    if (rec.kind === "change_rate") return lose ? Math.abs(rec.toPctPerWeek) > Math.abs(rec.fromPctPerWeek) : false;
    return false;
  };
  const blockDeepening = safeFired.length > 0 || fired.some((f) => f.id === "SLEEP-1");
  if (blockDeepening) {
    for (const f of fired) {
      if (f.id !== "SLEEP-1" && deepens(f.recommendation)) {
        f.recommendation = null;
        suppressed.push({ id: f.id, by: safeFired.length > 0 ? "G8" : "SLEEP-1 block" });
      }
    }
  }

  // ── Primary and flags (02 §8.3 steps 2–3) ──
  const rank = (id: RuleId) => {
    const p = PRIMARY_ORDER.indexOf(id);
    if (p >= 0) return p;
    const q = FLAG_ONLY_ORDER.indexOf(id);
    return q >= 0 ? PRIMARY_ORDER.length + q : PRIMARY_ORDER.length + FLAG_ONLY_ORDER.length;
  };
  const ordered = [...fired].sort((a, b) => rank(a.id) - rank(b.id));
  const outcomeFired = fired.some((f) => (f.group === 3 || f.group === 4) && f.id !== "NO-CHANGE");
  let primary: Fired | null = null;
  for (const f of ordered) {
    if (f.group === 5) continue;
    // DATA-EXP is primary only when nothing in group 3 or 4 could be judged.
    if (f.id === "DATA-EXP" && outcomeFired) continue;
    primary = f;
    break;
  }
  if (!primary) primary = ordered[ordered.length - 1];
  const flags = ordered.filter((f) => f !== primary && f.id !== "NO-CHANGE").slice(0, MAX_FLAGS);
  const status = statusFor(primary.id, flags.map((f) => f.id));
  const recommendation = primary.recommendation;

  return {
    asOf: today,
    phase,
    data: {
      weighIns14,
      loggedShare14: logged14,
      nightsLogged14: slp.nightsLogged14,
      expenditureState: maturity.state,
      unresolvedPartialDays: unresolved,
      updatingDays: maturity.updatingDays,
    },
    weight: {
      trendKg,
      latestKg,
      ratePctPerWeek: display ? display.result.ratePctPerWeek : null,
      rateWindowDays: display ? display.windowDays : null,
      rateN: display ? display.result.n : null,
      margin: display ? display.result.margin : null,
      weighInsNeeded,
    },
    expenditure: { kcal: tdee, state: maturity.state, plusMinus: maturity.plusMinus },
    targets,
    adherence: { deltaKcal: adh.deltaKcal, onTarget: adh.onTarget, proteinGPerKg: macro7.proteinGPerKg, daysLogged: adh.n },
    strength: {
      status: str.status,
      lifts: str.lifts.map((l) => ({ name: l.name, changePct: l.changePct })),
      baselineMissing: str.baselineMissing,
      strOk: str.strOk,
      mainLifts: str.mainLifts,
      liftsRead: str.liftsRead,
    },
    sleep: {
      mean14h: slp.mean14h,
      nightsLogged14: slp.nightsLogged14,
      status: slp.status,
      acute: slp.acute,
      source: slp.source,
      debt7h: slp.debt7h,
      lastNightH: slp.lastNightH,
      sleepOk,
    },
    training: { status: trainingNow, source: trainingSource, medianSlopePctPerWeek: liftStatus?.medianSlopePctPerWeek ?? null },
    goal,
    verdict: primary.verdict,
    flags: flags.map((f) => f.verdict),
    recommendation,
    recommendationLabel: recommendationLabel(recommendation, { sleepGoalH: slp.goalH }),
    status,
    checkInDue: isCheckInDue(goal, program, checkIns, today, profile.checkInWeekday),
    rules: { fired: ordered.map((f) => f.id), suppressed },
  };
}
