/**
 * Goals and targets (Layer 1): rate bands and validation, training status,
 * the weekly calorie target, macros and floors.
 * Normative spec: docs/plan/02-engine-spec.md §5; research A §B2–B6.
 *
 * Pure. Rates are signed %BW/wk (−0.6 = lose 0.6%/wk). Weights are kg.
 */

import type { OnboardingYearsBand } from "@/lib/onboardingProfile";
import { ENERGY_DENSITY_KCAL_PER_KG } from "@/lib/physique/expenditure";
import type {
  BodyFatCategory,
  DietType,
  GoalType,
  PhysiqueGoal,
  ProgramTargets,
  ProteinLevel,
  Sex,
  TrainingStatus,
} from "@/lib/physique/types";

// ── Constants (tags per 02-engine-spec) ──

/** Default cut rate, %BW/wk. PUB (MacroFactor "moderate") / EVID (Helms 2014). */
export const CUT_DEFAULT_RATE = -0.6;
/** Cut green band, |%BW/wk|. PUB (MacroFactor conservative 0.25 to moderate 0.75). */
export const CUT_GREEN_MIN = 0.25;
export const CUT_GREEN_MAX = 0.75;
/** Cut green band ceiling when near goal or advanced. EVID (Garthe 2011; Mero 2010). */
export const CUT_GREEN_MAX_NEAR_GOAL = 0.7;
/** The "upper limit" label on the cut slider. PUB (MacroFactor: 1.0 = slightly aggressive). */
export const CUT_UPPER_LIMIT = 1.0;
/** Cuts faster than this can't be saved, even with confirmation. OURS. */
export const CUT_REFUSED_ABOVE = 1.25;
/** Absolute cut cap, kg/wk, whatever the bodyweight. PUB (MacroFactor cutting calculator). */
export const CUT_KG_PER_WEEK_CAP = 1.0;
/** Day-0 deficit refused above this share of TDEE₀. PUB (MacroFactor `deficit_aggressive`). */
export const DEFICIT_MAX_SHARE = 0.3;
/** Day-0 deficit refused above this, kcal/day. PUB (MacroFactor: "unpleasant and unsustainable"). */
export const DEFICIT_MAX_KCAL = 1000;
/** Lean-gain bands by training status, |%BW/wk|. EVID (research F §2); defaults at the band centre, OURS. */
export const GAIN_BANDS: Record<TrainingStatus, { default: number; greenMin: number; greenMax: number; kgPerWeekCap: number }> = {
  novice: { default: 0.35, greenMin: 0.25, greenMax: 0.5, kgPerWeekCap: 0.8 },
  intermediate: { default: 0.25, greenMin: 0.15, greenMax: 0.35, kgPerWeekCap: 0.64 },
  advanced: { default: 0.15, greenMin: 0.1, greenMax: 0.25, kgPerWeekCap: 0.48 },
};
/** Gains faster than this can't be saved. PUB (MacroFactor bulking "very aggressive" ceiling). */
export const GAIN_REFUSED_ABOVE = 1.0;
/** Maintain: hold trend weight within this of the target, kg. PUB (MacroFactor ±1.5 lb). */
export const MAINTAIN_BAND_KG = 0.68;
/** Maintain: the nudge toward the target outside the band, %BW/wk. PUB. */
export const MAINTAIN_NUDGE_PCT = 0.15;
/** A target within this of the trend is a maintain goal. PUB (same band). */
export const MAINTAIN_GOAL_THRESHOLD_KG = MAINTAIN_BAND_KG;
/** The default training status when nothing is known. PUB (MacroFactor defaults to intermediate). */
export const DEFAULT_TRAINING_STATUS: TrainingStatus = "intermediate";
/** Weekly target cap: the larger of this and WEEKLY_CAP_SHARE × tdee. OURS (MacroFactor's smoothing is unpublished). */
export const WEEKLY_CAP_MIN_KCAL = 100;
export const WEEKLY_CAP_SHARE = 0.05;
/** Days after `expenditureStartDate` during which targets are unsmoothed. OURS (the estimate is still calibrating). */
export const UNSMOOTHED_DAYS_AFTER_START = 28;
/** Calorie floors by sex, kcal/day. EVID (research F G7); the 1,200 figure is PUB (MacroFactor standard floor). */
export const CALORIE_FLOOR: Record<Sex, number> = { M: 1500, F: 1200, prefer_not_to_say: 1200 };
/** Fat floor: this plus FAT_FLOOR_PER_CM × (height − 150), g. PUB (MacroFactor KB#78). */
export const FAT_FLOOR_BASE_G = 30;
export const FAT_FLOOR_PER_CM = 0.5;
export const FAT_FLOOR_HEIGHT_REF_CM = 150;
/** Protein, g/kg FFM, lifter table. PUB (MacroFactor, Oct/Nov 2025). */
export const PROTEIN_PER_KG_FFM: Record<"cut" | "other", Record<ProteinLevel, number>> = {
  cut: { low: 2.0, moderate: 2.5, high: 3.0, extra: 3.5 },
  other: { low: 1.75, moderate: 2.35, high: 2.75, extra: 3.1 },
};
/** Protein floor per kg of reference bodyweight: cut / otherwise. EVID. */
export const PROTEIN_FLOOR_PER_KG = { cut: 1.8, other: 1.6 } as const;
/** Protein per kg of reference bodyweight when the body-fat category is unknown: cut / otherwise. EVID. */
export const PROTEIN_NO_CATEGORY_PER_KG = { cut: 2.0, other: 1.8 } as const;
/** BMI above which the protein reference weight is capped at the BMI-25 weight. EVID. */
export const PROTEIN_BWREF_BMI_CAP = 30;
export const PROTEIN_BWREF_BMI_TARGET = 25;
/** Protein is rounded to this, g. OURS. */
export const PROTEIN_ROUND_G = 5;
/** Body-fat category midpoints by sex, fraction. OURS (MacroFactor uses a visual picker). */
export const BODY_FAT_MIDPOINT: Record<BodyFatCategory, { M: number; F: number }> = {
  lean: { M: 0.1, F: 0.18 },
  athletic: { M: 0.15, F: 0.23 },
  average: { M: 0.21, F: 0.29 },
  above_average: { M: 0.28, F: 0.36 },
  high: { M: 0.35, F: 0.43 },
};
/** Low-carb diet: carbs capped at this share of kcal and this many grams. PUB (≈). */
export const LOWCARB_KCAL_SHARE = 0.3;
export const LOWCARB_MAX_G = 200;

// ── Helpers ──

/** kcal/day that moves `trendKg` by `ratePctPerWeek` %BW/wk. */
export function rateToKcalPerDay(ratePctPerWeek: number, trendKg: number): number {
  return ((ratePctPerWeek / 100) * trendKg * ENERGY_DENSITY_KCAL_PER_KG) / 7;
}

export function rateToKgPerWeek(ratePctPerWeek: number, trendKg: number): number {
  return (ratePctPerWeek / 100) * trendKg;
}

/** Goal type from the target and the trend (02 §5.1): within ±0.68 kg is maintain. */
export function goalTypeFor(targetKg: number, trendKg: number): GoalType {
  const diff = targetKg - trendKg;
  if (Math.abs(diff) <= MAINTAIN_GOAL_THRESHOLD_KG) return "maintain";
  return diff < 0 ? "lose" : "gain";
}

/** "Near goal" (02 §5.1): |trend − target| ≤ max(4 × weekly change in kg, 2% of BW). */
export function isNearGoal(goal: Pick<PhysiqueGoal, "targetKg" | "ratePctPerWeek">, trendKg: number): boolean {
  const weekly = Math.abs(rateToKgPerWeek(goal.ratePctPerWeek, trendKg));
  return Math.abs(trendKg - goal.targetKg) <= Math.max(4 * weekly, 0.02 * trendKg);
}

/** Weeks to reach the target at a constant %/wk rate; null when the rate can't get there. */
export function etaWeeks(fromKg: number, targetKg: number, ratePctPerWeek: number): number | null {
  if (!(fromKg > 0) || !(targetKg > 0) || ratePctPerWeek === 0) return null;
  const ratio = targetKg / fromKg;
  if ((ratio < 1 && ratePctPerWeek > 0) || (ratio > 1 && ratePctPerWeek < 0)) return null;
  if (ratio === 1) return 0;
  return Math.log(ratio) / Math.log(1 + ratePctPerWeek / 100);
}

// ── Training status ──

/**
 * Training status (02 §5.2). P3 uses the onboarding years band only; P4
 * passes a lift-derived status as `liftDerived`, which wins when present.
 */
export function trainingStatus(yearsTrainingBand: OnboardingYearsBand | undefined, liftDerived?: TrainingStatus | null): TrainingStatus {
  if (liftDerived) return liftDerived;
  switch (yearsTrainingBand) {
    case "new":
    case "1-2":
      return "novice";
    case "3-5":
      return "intermediate";
    case "5+":
      return "advanced";
    default:
      return DEFAULT_TRAINING_STATUS;
  }
}

// ── Rate bands and validation ──

export type RateBands = {
  status: TrainingStatus;
  cut: {
    default: number;
    /** Signed; `min` is the slower edge, `max` the faster edge. */
    green: { min: number; max: number };
    upperLimit: number;
    refusedBelow: number;
    kgPerWeekCap: number;
  };
  gain: {
    default: number;
    green: { min: number; max: number };
    /** GAIN-1's ceiling (the green max). */
    ceiling: number;
    refusedAbove: number;
    kgPerWeekCap: number;
  };
  maintain: { bandKg: number; nudgePct: number };
};

/** The slider bands for a training status (02 §5.2). `nearGoal` or advanced tops the cut green band at −0.7. */
export function rateBands(status: TrainingStatus, opts: { nearGoal?: boolean } = {}): RateBands {
  const cutMax = opts.nearGoal || status === "advanced" ? CUT_GREEN_MAX_NEAR_GOAL : CUT_GREEN_MAX;
  const g = GAIN_BANDS[status];
  return {
    status,
    cut: {
      default: CUT_DEFAULT_RATE,
      green: { min: -CUT_GREEN_MIN, max: -cutMax },
      upperLimit: -CUT_UPPER_LIMIT,
      refusedBelow: -CUT_REFUSED_ABOVE,
      kgPerWeekCap: CUT_KG_PER_WEEK_CAP,
    },
    gain: {
      default: g.default,
      green: { min: g.greenMin, max: g.greenMax },
      ceiling: g.greenMax,
      refusedAbove: GAIN_REFUSED_ABOVE,
      kgPerWeekCap: g.kgPerWeekCap,
    },
    maintain: { bandKg: MAINTAIN_BAND_KG, nudgePct: MAINTAIN_NUDGE_PCT },
  };
}

export type RateRefusal =
  | "wrong_sign"
  | "cut_rate_too_fast"
  | "cut_kg_per_week"
  | "deficit_share"
  | "deficit_kcal"
  | "gain_rate_too_fast"
  | "gain_kg_per_week";

export type RateValidation = {
  kgPerWeek: number;
  /** Signed day-0 change to expenditure, kcal/day. */
  dayZeroDeltaKcal: number;
} & (
  | { ok: true; band: "green" | "confirm"; outside: "slower" | "faster" | null }
  | { ok: false; reason: RateRefusal; message: string }
);

export type RateValidationInput = {
  type: GoalType;
  ratePctPerWeek: number;
  status: TrainingStatus;
  trendKg: number;
  /** Expenditure at goal start (TDEE₀). */
  tdee0: number;
  nearGoal?: boolean;
};

/**
 * Validate a goal rate (02 §5.2). Green needs nothing; `confirm` needs an
 * explicit confirmation; refused rates can't be saved. Recommended rates
 * (§8.2) go through the same check.
 */
export function validateRate(input: RateValidationInput): RateValidation {
  const { type, ratePctPerWeek: rate, trendKg, tdee0 } = input;
  const kgPerWeek = rateToKgPerWeek(rate, trendKg);
  const dayZeroDeltaKcal = rateToKcalPerDay(rate, trendKg);
  const base = { kgPerWeek, dayZeroDeltaKcal };
  const refuse = (reason: RateRefusal, message: string): RateValidation => ({ ...base, ok: false, reason, message });
  const bands = rateBands(input.status, { nearGoal: input.nearGoal });

  if (type === "maintain") return { ...base, ok: true, band: "green", outside: null };
  if (type === "lose") {
    if (rate >= 0) return refuse("wrong_sign", "A cut needs a negative rate.");
    const r = -rate;
    if (r > CUT_REFUSED_ABOVE) return refuse("cut_rate_too_fast", `Cuts faster than ${CUT_REFUSED_ABOVE} %/wk can't be set.`);
    if (-kgPerWeek > CUT_KG_PER_WEEK_CAP) return refuse("cut_kg_per_week", `That is more than ${CUT_KG_PER_WEEK_CAP} kg a week.`);
    const deficit = -dayZeroDeltaKcal;
    if (deficit > DEFICIT_MAX_KCAL) return refuse("deficit_kcal", `That is a deficit over ${DEFICIT_MAX_KCAL} kcal a day.`);
    if (tdee0 > 0 && deficit > DEFICIT_MAX_SHARE * tdee0) {
      return refuse("deficit_share", `That is a deficit over ${Math.round(DEFICIT_MAX_SHARE * 100)}% of your expenditure.`);
    }
    const slowEdge = -bands.cut.green.min;
    const fastEdge = -bands.cut.green.max;
    if (r < slowEdge) return { ...base, ok: true, band: "confirm", outside: "slower" };
    if (r > fastEdge) return { ...base, ok: true, band: "confirm", outside: "faster" };
    return { ...base, ok: true, band: "green", outside: null };
  }
  if (rate <= 0) return refuse("wrong_sign", "A gain needs a positive rate.");
  if (rate > GAIN_REFUSED_ABOVE) return refuse("gain_rate_too_fast", `Gains faster than ${GAIN_REFUSED_ABOVE} %/wk can't be set.`);
  if (kgPerWeek > bands.gain.kgPerWeekCap) {
    return refuse("gain_kg_per_week", `That is more than ${bands.gain.kgPerWeekCap} kg a week for your training status.`);
  }
  if (rate < bands.gain.green.min) return { ...base, ok: true, band: "confirm", outside: "slower" };
  if (rate > bands.gain.green.max) return { ...base, ok: true, band: "confirm", outside: "faster" };
  return { ...base, ok: true, band: "green", outside: null };
}

// ── Weekly target ──

/** The signed kcal/day the goal asks for on top of expenditure (02 §5.3; maintain: §5.2 nudge). */
export function goalDeltaKcal(goal: Pick<PhysiqueGoal, "type" | "ratePctPerWeek" | "targetKg">, trendKg: number): number {
  if (goal.type === "maintain") {
    const diff = trendKg - goal.targetKg;
    if (Math.abs(diff) <= MAINTAIN_BAND_KG) return 0;
    return -Math.sign(diff) * rateToKcalPerDay(MAINTAIN_NUDGE_PCT, trendKg);
  }
  return rateToKcalPerDay(goal.ratePctPerWeek, trendKg);
}

export type Floors = { kcal: number; fatG: number };

/** Fat floor in grams (02 §5.4). PUB. */
export function fatFloorG(heightCm: number): number {
  if (!(heightCm > FAT_FLOOR_HEIGHT_REF_CM)) return FAT_FLOOR_BASE_G;
  return FAT_FLOOR_BASE_G + FAT_FLOOR_PER_CM * (heightCm - FAT_FLOOR_HEIGHT_REF_CM);
}

/** Calorie and fat floors (02 §5.3–5.4). No "none" floor in M1. */
export function floors(sex: Sex | undefined, heightCm: number): Floors {
  return { kcal: CALORIE_FLOOR[sex ?? "prefer_not_to_say"], fatG: fatFloorG(heightCm) };
}

export type WeeklyTargetInput = {
  tdee: number;
  trendKg: number;
  goal: Pick<PhysiqueGoal, "type" | "ratePctPerWeek" | "targetKg">;
  /** The target in effect before this one; null for a first program. */
  prevTargetKcal: number | null;
  /** True for a new program, `refresh_targets`, the first 28 days, or a goal change (02 §5.3). */
  unsmoothed: boolean;
  sex: Sex | undefined;
};

export type WeeklyTarget = {
  kcal: number;
  /** tdee + goal delta, before the cap and floor. */
  raw: number;
  goalDeltaKcal: number;
  cap: number | null;
  capped: boolean;
  floor: number;
  /** The floor bound the target: SAFE-1. */
  floorBound: boolean;
};

/** The weekly calorie target (02 §5.3). Rounded to the kcal; no minimum step. */
export function weeklyTarget(input: WeeklyTargetInput): WeeklyTarget {
  const delta = goalDeltaKcal(input.goal, input.trendKg);
  const raw = input.tdee + delta;
  let target = raw;
  let cap: number | null = null;
  let capped = false;
  if (!input.unsmoothed && input.prevTargetKcal !== null) {
    cap = Math.max(WEEKLY_CAP_MIN_KCAL, WEEKLY_CAP_SHARE * input.tdee);
    const step = Math.max(-cap, Math.min(cap, raw - input.prevTargetKcal));
    capped = step !== raw - input.prevTargetKcal;
    target = input.prevTargetKcal + step;
  }
  const floor = CALORIE_FLOOR[input.sex ?? "prefer_not_to_say"];
  const floorBound = target < floor;
  if (floorBound) target = floor;
  return { kcal: Math.round(target), raw, goalDeltaKcal: delta, cap, capped, floor, floorBound };
}

// ── Macros ──

export type MacroInput = {
  kcal: number;
  trendKg: number;
  heightCm: number;
  sex: Sex | undefined;
  phase: GoalType;
  proteinLevel: ProteinLevel;
  dietType: DietType;
  bodyFatCategory?: BodyFatCategory;
  bodyFatPctMeasured?: number;
};

/** Body-fat fraction from a measurement, else the category midpoint, else null. */
export function bodyFatFraction(input: Pick<MacroInput, "sex" | "bodyFatCategory" | "bodyFatPctMeasured">): number | null {
  if (typeof input.bodyFatPctMeasured === "number" && input.bodyFatPctMeasured > 0 && input.bodyFatPctMeasured < 70) {
    return input.bodyFatPctMeasured / 100;
  }
  if (!input.bodyFatCategory) return null;
  const mid = BODY_FAT_MIDPOINT[input.bodyFatCategory];
  if (input.sex === "M") return mid.M;
  if (input.sex === "F") return mid.F;
  return (mid.M + mid.F) / 2;
}

/** Reference bodyweight for protein floors: BW, capped at the BMI-25 weight when BMI > 30 (02 §5.4). */
export function proteinReferenceKg(trendKg: number, heightCm: number): number {
  if (!(heightCm > 0)) return trendKg;
  const m2 = (heightCm / 100) ** 2;
  const bmi = trendKg / m2;
  return bmi > PROTEIN_BWREF_BMI_CAP ? PROTEIN_BWREF_BMI_TARGET * m2 : trendKg;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Protein target in grams (02 §5.4), rounded to 5 g. */
export function proteinTargetG(input: Omit<MacroInput, "kcal" | "dietType">): number {
  const phase = input.phase === "lose" ? "cut" : "other";
  const bwRef = proteinReferenceKg(input.trendKg, input.heightCm);
  const bf = bodyFatFraction(input);
  if (bf === null) return roundTo(PROTEIN_NO_CATEGORY_PER_KG[phase] * bwRef, PROTEIN_ROUND_G);
  const ffm = input.trendKg * (1 - bf);
  const fromTable = PROTEIN_PER_KG_FFM[phase][input.proteinLevel] * ffm;
  const floor = PROTEIN_FLOOR_PER_KG[phase] * bwRef;
  return roundTo(Math.max(fromTable, floor), PROTEIN_ROUND_G);
}

/**
 * Split a calorie target into protein, fat and carbs (02 §5.4). Balanced
 * splits the non-protein kcal 50/50; low-carb caps carbs at min(30% kcal,
 * 200 g). Fat never goes under the floor. At very low kcal the priority is
 * fat floor, then protein, then carbs.
 */
export function macros(input: MacroInput): ProgramTargets {
  const kcal = Math.max(0, Math.round(input.kcal));
  const fatFloor = fatFloorG(input.heightCm);
  let proteinG = proteinTargetG(input);
  let fatG: number;
  let carbsG: number;
  const remainder = kcal - 4 * proteinG;
  if (remainder < 9 * fatFloor) {
    // Very low kcal: fat floor first, then protein, then carbs.
    fatG = Math.min(fatFloor, kcal / 9);
    proteinG = Math.max(0, roundTo((kcal - 9 * fatG) / 4, PROTEIN_ROUND_G));
    while (proteinG > 0 && 4 * proteinG + 9 * fatG > kcal) proteinG -= PROTEIN_ROUND_G;
    carbsG = Math.max(0, (kcal - 4 * proteinG - 9 * fatG) / 4);
  } else if (input.dietType === "lowCarb") {
    carbsG = Math.min((LOWCARB_KCAL_SHARE * kcal) / 4, LOWCARB_MAX_G);
    fatG = Math.max(fatFloor, (remainder - 4 * carbsG) / 9);
    carbsG = Math.max(0, (kcal - 4 * proteinG - 9 * fatG) / 4);
  } else {
    fatG = Math.max(fatFloor, remainder / 2 / 9);
    carbsG = Math.max(0, (kcal - 4 * proteinG - 9 * fatG) / 4);
  }
  return { kcal, proteinG, fatG: Math.round(fatG), carbsG: Math.round(carbsG) };
}
