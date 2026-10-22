/**
 * Physique engine entities and outputs. Normative source: docs/plan/02-engine-spec.md
 * §1.1 (entities), §5.1 (goal), §8.1 (analysis output).
 *
 * Canonical units: kg, cm, kcal, g, minutes. Dates are local `YYYY-MM-DD`.
 */

import type { LocalDate, Now } from "@/lib/dates";
import type { RecipeIngredient } from "@/lib/food/recipe";

export type { LocalDate, Now };

export type Source = "manual" | "healthkit" | "import" | "seed";

type Record_ = {
  id: string;
  date: LocalDate;
  loggedAt: string;
  source: Source;
  schemaVersion: 1;
};

export type WeighIn = Record_ & {
  kg: number;
  /** IN1: HH:MM local when the scale read it (Apple Health), or when it was typed for today. Absent when unknown: older records, back-dated entries, day totals. */
  time?: string;
  /** Optional body-fat reading logged with the weigh-in (R4). Display only; the engine ignores it. */
  bodyFatPct?: number;
};

export type FoodMethod = "quick" | "saved" | "ai_text" | "ai_photo" | "barcode" | "search";

export type FoodEntry = Record_ & {
  label: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  method: FoodMethod;
  confidence?: "high" | "medium" | "low";
  savedFoodId?: string;
  /** Local meal time `HH:MM` (R2). When absent the timeline uses `loggedAt`. */
  time?: string;
  /** Free-text serving description ("1 bowl", "150 g"). */
  serving?: string;
  /** Dietary fibre (AOAC) in g, when the food's source had it (B3). Absent means unknown, not zero. */
  fibreG?: number;
  /** IN6: sodium (mg), total sugars, saturated fat and alcohol (g), when the source had them. Absent means unknown. */
  sodiumMg?: number;
  sugarG?: number;
  satFatG?: number;
  alcoholG?: number;
  /** IN6: grams eaten, when the amount was a weight. */
  grams?: number;
  /** IN6: the database food it came from (`cofid:<code>`, `off:<barcode>`), so nutrients can be filled in later. */
  sourceId?: string;
};

export type SavedFood = {
  id: string;
  label: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Free-text serving description shown on re-log ("1 scoop", "150 g"). */
  serving?: string;
  /** Fibre in g for the same amount, when known (B3). */
  fibreG?: number;
  /** IN6: the extras for the same amount, when known. */
  sodiumMg?: number;
  sugarG?: number;
  satFatG?: number;
  alcoholG?: number;
  /** IN6: grams in the serving and the database food, when known. */
  grams?: number;
  sourceId?: string;
  /** Starred in the logger's Saved tab (R2). */
  favourite?: boolean;
  /** When the food is a recipe (M4b): what it makes and what went in, so a serving can be re-logged or edited. The macros above are one serving. */
  recipe?: {
    servings: number;
    ingredients: RecipeIngredient[];
    /** Weight of the whole recipe once cooked, when weighed (F6): one serving is this divided by `servings`, so it can be logged in grams. */
    totalGrams?: number;
  };
  lastUsedAt: string;
  useCount: number;
  schemaVersion: 1;
};

export type DayEventType = "creatine_start" | "carb_switch" | "illness" | "travel" | "period";

export type DayEvent = { type: DayEventType; creatineLoading?: boolean };

export type DayFlags = {
  date: LocalDate;
  /** Set only by the user (or the check-in). */
  status?: "partial" | "fasting";
  /** "Edit Day": overrides the sum of food entries. */
  kcalOverride?: number;
  /** A suggested-partial day the user dismissed ("no, that was a full day"). */
  partialDismissed?: boolean;
  events?: DayEvent[];
  note?: string;
};

export type SleepNight = Record_ & {
  /** HH:MM local, optional for manual entries. */
  bedtime?: string;
  wakeTime?: string;
  asleepMin: number;
  inBedMin?: number;
  wakeups?: "0" | "1-2" | "3+";
  /** 1–5, manual. */
  quality?: number;
  /** M3: HealthKit extras. */
  hrvMs?: number;
  hrvMethod?: "sdnn" | "rmssd";
  restingHr?: number;
  /** S6: stage minutes from the wearable, shown and never scored (research C §4.2). */
  stages?: { coreMin?: number; deepMin?: number; remMin?: number; awakeMin?: number };
  /** S8: the night's stage segments when Health Auto Export sends sleep unaggregated, for the stage chart. `o` is minutes after `bedtime`, `d` the length in minutes. */
  segments?: SleepSegment[];
};

export type SleepStage = "awake" | "rem" | "core" | "deep" | "asleep";

export type SleepSegment = { s: SleepStage; o: number; d: number };

export type WaistEntry = Record_ & { cm: number };

/** One day's step count from Apple Health (B3), id `hk-s-<date>`. Read only after the day is over. */
export type DailySteps = Record_ & { steps: number };

/** IN8: the groups Apple Health workouts are told apart by, from HealthKit's activity types and Health Auto Export's names. */
export type HealthActivity = "run" | "walk" | "cycle" | "swim" | "row" | "strength" | "cardio" | "mobility" | "sport" | "other";

/** IN8: one workout recorded in Apple Health (a run, a ride, a match), on the local day it started. */
export type HealthWorkout = {
  activity: HealthActivity;
  /** The name it came with ("Outdoor Run", "traditionalStrengthTraining"), for display. */
  name: string;
  /** HH:MM local start. */
  start: string;
  durationMin: number;
  activeKcal?: number;
  distanceM?: number;
  /** The app that recorded it ("Strava", "Hevy"), so a session also logged here can be told apart. */
  app?: string;
};

/** IN8: menstrual flow as Apple Health records it. */
export type MenstrualFlow = "none" | "unspecified" | "light" | "medium" | "heavy";

/**
 * IN1: one day's readings from Apple Health, id `hk-v-<date>`, kept whether
 * or not a night was recorded. HRV and resting heart rate are the wake
 * day's; the night of the same date carries the same values, which is what
 * the engines read today. IN8 adds the day's totals and workouts and, only
 * when the person opts in, wrist temperature and cycle. Every field is
 * optional: absent means unknown, never zero.
 */
export type DailyVitals = Record_ & {
  hrvMs?: number;
  hrvMethod?: "sdnn" | "rmssd";
  restingHr?: number;
  /** IN8: active energy burned (Apple's Move), kcal. Explains stalls; never an input to the maintenance estimate, which is worked back from intake and the trend. */
  activeKcal?: number;
  /** IN8: workouts that started this day, as Apple Health has them. */
  workouts?: HealthWorkout[];
  /** IN8: logged in Apple Health by other apps, day totals: water ml, caffeine mg, sodium mg. */
  waterMl?: number;
  caffeineMg?: number;
  sodiumMg?: number;
  /** IN8: alcoholic drinks logged in Apple Health, a count as logged (Apple sets no size, so no grams). */
  alcoholDrinks?: number;
  /** IN8, opt-in: sleeping wrist temperature for the night ending this day, °C (an absolute reading, not Apple's change from baseline). */
  wristTempC?: number;
  /** IN8, opt-in: the day's menstrual flow, and whether it was marked as a cycle's start. */
  menstrualFlow?: MenstrualFlow;
  cycleStart?: boolean;
};

export type GoalType = "lose" | "maintain" | "gain";
export type TrainingStatus = "novice" | "intermediate" | "advanced";

export type PhysiqueGoal = {
  id: string;
  createdAt: string;
  type: GoalType;
  startDate: LocalDate;
  startTrendKg: number;
  targetKg: number;
  /** Signed %BW/week: −0.6 = lose 0.6%/wk. 0 for maintain. */
  ratePctPerWeek: number;
  trainingStatusAtCreation: TrainingStatus;
  phaseStartConfirmedAt?: string;
  completedAt?: string;
  /** Rate-change history (user edits and accepted recommendations), newest last. */
  rateHistory?: Array<{ date: LocalDate; fromPctPerWeek: number; toPctPerWeek: number; reason: "user" | "recommendation" }>;
  schemaVersion: 1;
};

export type Sex = "M" | "F" | "prefer_not_to_say";
export type BodyFatCategory = "lean" | "athletic" | "average" | "above_average" | "high";
export type GeneralActivity = "low" | "moderate" | "high";
export type ProteinLevel = "low" | "moderate" | "high" | "extra";
export type DietType = "balanced" | "lowCarb";

/**
 * The expenditure seed, snapshotted once at `expenditureStartDate` (02 §4.2).
 * Stored on the profile so later profile or goal edits never rewrite past
 * expenditure. `lib/physique/expenditure.ts` builds and consumes it.
 */
export type ExpenditureSeed = {
  date: LocalDate;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPctMeasured?: number;
  generalActivity: GeneralActivity;
  sessionsPerWeek: number;
  /** Signed %BW/wk of the goal active on the seed date; 0 when none. */
  goalRatePctPerWeek: number;
  manualInitialTdee?: number;
  schemaVersion: 1;
};

export type PhysiqueProfile = {
  sex?: Sex;
  age?: number;
  heightCm?: number;
  bodyFatCategory?: BodyFatCategory;
  bodyFatPctMeasured?: number;
  generalActivity: GeneralActivity;
  manualInitialTdee?: number;
  expenditureStartDate?: LocalDate;
  /** Fixed once at `expenditureStartDate`; see `ExpenditureSeed`. */
  expenditureSeed?: ExpenditureSeed;
  /** 0 = Sunday … 6 = Saturday. */
  checkInWeekday: number;
  proteinLevel: ProteinLevel;
  dietType: DietType;
  /** Unused since C8: the sleep goal setting went; nights read against SLEEP_REFERENCE_H. Kept so stored profiles still parse. */
  sleepGoalH: number;
  /** The bedtime planner's wake time (R3) and one-off override (S8). Unused since S9 removed the planner; kept so stored profiles still type-check. */
  wakeTimeHHMM?: string;
  wakeOverride?: { date: LocalDate; hhmm: string };
  /** Safety screen answers (U3). `redFlags` feeds SAFE-3 (research F §9); nothing writes it in M1. */
  safety?: { pregnantOrEdHistory?: boolean; answeredAt?: string; redFlags?: SafetyRedFlag[] };
  schemaVersion: 1;
};

/** User-reported under-fuelling signs (research F SAFE-3). */
export type SafetyRedFlag = "missed_periods" | "low_libido" | "dizziness" | "recurrent_illness" | "low_mood";

export type ProgramSource = "goal_start" | "check_in" | "refresh" | "apply_now";

export type ProgramTargets = { kcal: number; proteinG: number; fatG: number; carbsG: number };

export type ProgramEntry = ProgramTargets & {
  startDate: LocalDate;
  source: ProgramSource;
  acceptedAt: string;
  /** Expenditure used to compute these targets. */
  tdeeAtAccept: number;
};

export type PhysiqueProgram = {
  id: string;
  goalId: string;
  history: ProgramEntry[];
  schemaVersion: 1;
};

export type CheckInRecord = {
  id: string;
  date: LocalDate;
  weekStart: LocalDate;
  accepted: boolean;
  fast: boolean;
  completedAt: string;
  schemaVersion: 1;
};

// ── Derived ──

export type DayStatus = "complete" | "partial" | "fasting" | "unlogged";

export type DailyIntake = {
  date: LocalDate;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  status: DayStatus;
  /** Engine-suggested partial day awaiting the user's answer. */
  suggestedPartial: boolean;
  entries: number;
};

export type ExpenditureState = "holding" | "calibrating" | "settling" | "stable";

export type ExpenditurePoint = {
  date: LocalDate;
  /** Displayed expenditure: `base + offset`, rounded. */
  tdee: number;
  state: "holding" | "updating";
  /** Why a holding day holds: the first week, or a logging pause (02 §4.1). */
  holdReason?: "warmup" | "paused";
  trendKg: number | null;
  /** The EMA term before the predictive goal offset. */
  base: number;
  /** The predictive goal adjustment in effect on this day (02 §4.1). */
  offset: number;
  /** The observed expenditure this day moved toward (updating days only). */
  obs?: number;
  /** Updating days so far, including this one. */
  updatingDays: number;
};

/** What the UI shows about expenditure confidence (02 §4.3). */
export type ExpenditureMaturity = {
  state: ExpenditureState;
  kcal: number | null;
  updatingDays: number;
  plusMinus: 400 | 300 | null;
  /** While holding: what it takes to resume (3 consecutive complete days plus a weigh-in). */
  resume: { foodDaysNeeded: number; weighInNeeded: boolean } | null;
};

// ── Judge ──

export type RuleId =
  | "SAFE-0"
  | "SAFE-1"
  | "SAFE-2"
  | "SAFE-3"
  | "SAFE-4"
  | "SAFE-5"
  | "NO-GOAL"
  | "DATA-PARTIAL"
  | "DATA-HOLD"
  | "DATA-RATE"
  | "DATA-EXP"
  | "G-EXP-2"
  | "DB-1"
  | "ADH-1"
  | "LOSS-1"
  | "LOSS-2"
  | "LOSS-2u"
  | "LOSS-3"
  | "LOSS-4"
  | "LOSS-6"
  | "GAIN-1"
  | "GAIN-2"
  | "GAIN-3"
  | "GAIN-4"
  | "RECOMP-1"
  | "RECOMP-WAIST"
  | "STR-1"
  | "STR-2"
  | "SLEEP-1"
  | "SLEEP-1i"
  | "SLEEP-2"
  | "SLEEP-3"
  | "PRO-1"
  | "PRO-2"
  | "FAT-1"
  | "ON-TRACK"
  | "NO-CHANGE";

export type Verdict = {
  id: RuleId;
  title: string;
  detail: string;
  windowDays?: number;
  n?: number;
  evidenceIds: string[];
  confidence: "high" | "medium" | "low";
};

export type Recommendation =
  | { kind: "change_rate"; fromPctPerWeek: number; toPctPerWeek: number; kcalDeltaAtCurrentBW: number }
  | { kind: "refresh_targets"; fromKcal: number; toKcal: number }
  | { kind: "eat_to_target"; deltaKcal: number }
  | { kind: "protein"; toG: number }
  | { kind: "sleep"; targetHours: number }
  | { kind: "diet_break"; weeks: 1 | 2 }
  | { kind: "maintenance_first"; weeks: number }
  | { kind: "log_more"; what: "weight" | "food" | "sleep" | "waist"; needed: number }
  | { kind: "confirm_days"; dates: LocalDate[] }
  | { kind: "pause_and_seek_help" };

export type SignalState = "good" | "watch" | "attention" | "unknown";

export type StrengthStatus = "dropping" | "holding" | "rising" | "one-lift" | "unclear";
export type SleepStatus = "severe" | "short" | "ok" | "unknown";

export type PhysiqueAnalysis = {
  asOf: LocalDate;
  phase: GoalType | "none";
  data: {
    weighIns14: number;
    loggedShare14: number;
    nightsLogged14: number;
    expenditureState: ExpenditureState;
    /** Days in the adherence window left out as suspected partial days (C11). */
    partialDaysLeftOut: LocalDate[];
    /** Updating days so far (expenditure maturity). */
    updatingDays: number;
  };
  weight: {
    trendKg: number | null;
    latestKg: number | null;
    ratePctPerWeek: number | null;
    rateWindowDays: number | null;
    rateN: number | null;
    margin: number | null;
    /** Weigh-ins still needed before a first rate read (0 when a rate exists). */
    weighInsNeeded: number;
  };
  expenditure: { kcal: number | null; state: ExpenditureState; plusMinus: 400 | 300 | null };
  targets: ProgramTargets | null;
  adherence: { deltaKcal: number | null; onTarget: boolean | null; proteinGPerKg: number | null; daysLogged: number };
  strength: {
    status: StrengthStatus;
    lifts: Array<{ name: string; changePct: number | null }>;
    baselineMissing: boolean;
    /** STR-OK: ≥2 lifts read and every one above −3%. */
    strOk: boolean;
    mainLifts: number;
    liftsRead: number;
  };
  sleep: {
    mean14h: number | null;
    nightsLogged14: number;
    status: SleepStatus;
    acute: boolean;
    source: "manual" | "wearable" | "mixed" | null;
    debt7h: number | null;
    lastNightH: number | null;
    /** SLEEP-OK (02 §7.3): lifts are dropping while sleep is `ok`, so sleep is not to blame. */
    sleepOk: boolean;
  };
  /** Training status today (02 §5.2): from lifts when the data gate passes, else onboarding, else the default. */
  training: { status: TrainingStatus; source: "lifts" | "onboarding" | "default"; medianSlopePctPerWeek: number | null };
  goal: PhysiqueGoal | null;
  verdict: Verdict;
  flags: Verdict[];
  recommendation: Recommendation | null;
  /** The recommendation row's copy (05-design §7), null when there is no recommendation. */
  recommendationLabel: string | null;
  status: { state: SignalState; label: string };
  /** True from the check-in weekday until the check-in is done. */
  checkInDue: boolean;
  /** Every rule that fired before suppression, and what removed the suppressed ones (02 §8.3). */
  rules: { fired: RuleId[]; suppressed: Array<{ id: RuleId; by: string }> };
};
