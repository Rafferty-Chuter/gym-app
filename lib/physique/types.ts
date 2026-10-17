/**
 * Physique engine entities and outputs. Normative source: docs/plan/02-engine-spec.md
 * §1.1 (entities), §5.1 (goal), §8.1 (analysis output).
 *
 * Canonical units: kg, cm, kcal, g, minutes. Dates are local `YYYY-MM-DD`.
 */

import type { LocalDate, Now } from "@/lib/dates";

export type { LocalDate, Now };

export type Source = "manual" | "healthkit" | "import" | "seed";

type Record_ = {
  id: string;
  date: LocalDate;
  loggedAt: string;
  source: Source;
  schemaVersion: 1;
};

export type WeighIn = Record_ & { kg: number };

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
};

export type WaistEntry = Record_ & { cm: number };

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
  sleepGoalH: number;
  /** Safety screen answers (U3). */
  safety?: { pregnantOrEdHistory?: boolean; answeredAt?: string };
  schemaVersion: 1;
};

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
    unresolvedPartialDays: LocalDate[];
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
  strength: { status: StrengthStatus; lifts: Array<{ name: string; changePct: number | null }>; baselineMissing: boolean };
  sleep: {
    mean14h: number | null;
    nightsLogged14: number;
    status: SleepStatus;
    acute: boolean;
    source: "manual" | "wearable" | "mixed" | null;
    debt7h: number | null;
    lastNightH: number | null;
  };
  goal: PhysiqueGoal | null;
  verdict: Verdict;
  flags: Verdict[];
  recommendation: Recommendation | null;
  status: { state: SignalState; label: string };
  /** True from the check-in weekday until the check-in is done. */
  checkInDue: boolean;
};
