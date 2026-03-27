import type { ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";

export type IntRange = {
  min: number;
  max: number;
};

export type PrescriptionBucket =
  | "main_compound"
  | "secondary_compound"
  | "machine_compound"
  | "isolation"
  | "unilateral"
  | "calf"
  | "accessory";

export type PrescriptionRule = {
  bucket: PrescriptionBucket;
  sets: IntRange;
  repRange: IntRange;
  rirRange: IntRange;
  restSeconds: IntRange;
  notes: string;
};

export type GoalAdjustment =
  | "strength_emphasis"
  | "hypertrophy_emphasis"
  | "low_fatigue"
  | "upper_body_emphasis"
  | "chest_emphasis"
  | "bench_strength_emphasis";

export type PrescriptionAdjustmentRule = {
  id: GoalAdjustment;
  apply: (base: PrescriptionRule, exercise: ExerciseMetadata) => PrescriptionRule;
};

export type PrescriptionResult = {
  bucketUsed: PrescriptionBucket;
  base: PrescriptionRule;
  adjusted: PrescriptionRule;
  appliedAdjustments: GoalAdjustment[];
};

function cloneRule(rule: PrescriptionRule): PrescriptionRule {
  return {
    ...rule,
    sets: { ...rule.sets },
    repRange: { ...rule.repRange },
    rirRange: { ...rule.rirRange },
    restSeconds: { ...rule.restSeconds },
  };
}

function clampRange(range: IntRange, floor: number, ceil: number): IntRange {
  return {
    min: Math.max(floor, Math.min(range.min, ceil)),
    max: Math.max(floor, Math.min(range.max, ceil)),
  };
}

function hasTag(exercise: ExerciseMetadata, tag: string): boolean {
  return exercise.tags.includes(tag);
}

function isBenchPressLike(exercise: ExerciseMetadata): boolean {
  const n = exercise.name.toLowerCase();
  return n.includes("bench") && n.includes("press");
}

export const PRESCRIPTION_DEFAULTS: Record<PrescriptionBucket, PrescriptionRule> = {
  // hypertrophy-oriented defaults with practical strength compatibility
  main_compound: {
    bucket: "main_compound",
    sets: { min: 3, max: 3 },
    repRange: { min: 6, max: 10 },
    rirRange: { min: 1, max: 3 },
    restSeconds: { min: 120, max: 240 },
    notes: "Primary multi-joint lift. Keep quality high, full ROM, and avoid technical breakdown.",
  },
  secondary_compound: {
    bucket: "secondary_compound",
    sets: { min: 2, max: 4 },
    repRange: { min: 8, max: 12 },
    rirRange: { min: 1, max: 3 },
    restSeconds: { min: 90, max: 180 },
    notes: "Secondary builder movement. Add quality volume without excessive global fatigue.",
  },
  machine_compound: {
    bucket: "machine_compound",
    sets: { min: 2, max: 4 },
    repRange: { min: 8, max: 15 },
    rirRange: { min: 0, max: 2 },
    restSeconds: { min: 75, max: 150 },
    notes: "Stable compound volume. Good place to accumulate hard reps safely.",
  },
  isolation: {
    bucket: "isolation",
    sets: { min: 2, max: 4 },
    repRange: { min: 8, max: 15 },
    rirRange: { min: 0, max: 2 },
    restSeconds: { min: 45, max: 90 },
    notes: "Direct target-muscle work. Push close to failure with controlled tempo and full ROM.",
  },
  unilateral: {
    bucket: "unilateral",
    sets: { min: 2, max: 3 },
    repRange: { min: 8, max: 15 },
    rirRange: { min: 1, max: 2 },
    restSeconds: { min: 60, max: 120 },
    notes: "Perform sets per side. Keep left/right effort and tempo balanced.",
  },
  calf: {
    bucket: "calf",
    sets: { min: 3, max: 5 },
    repRange: { min: 6, max: 20 },
    rirRange: { min: 0, max: 2 },
    restSeconds: { min: 45, max: 90 },
    notes: "Use full ROM with pauses at stretch and peak contraction.",
  },
  accessory: {
    bucket: "accessory",
    sets: { min: 2, max: 3 },
    repRange: { min: 10, max: 20 },
    rirRange: { min: 1, max: 3 },
    restSeconds: { min: 45, max: 90 },
    notes: "Low-cost add-on work to improve weak links and session completeness.",
  },
};

export function resolvePrescriptionBucket(exercise: ExerciseMetadata): PrescriptionBucket {
  if (hasTag(exercise, "calf")) return "calf";
  if (hasTag(exercise, "unilateral")) return "unilateral";
  if (exercise.role === "main_compound") return "main_compound";
  if (exercise.role === "secondary_compound") return "secondary_compound";
  if (exercise.role === "machine_compound") return "machine_compound";
  if (exercise.role === "isolation") return "isolation";
  return "accessory";
}

export const PRESCRIPTION_ADJUSTMENTS: Record<GoalAdjustment, PrescriptionAdjustmentRule> = {
  strength_emphasis: {
    id: "strength_emphasis",
    apply: (base, exercise) => {
      const next = cloneRule(base);
      if (base.bucket === "main_compound" || base.bucket === "secondary_compound") {
        next.repRange = clampRange({ min: next.repRange.min - 2, max: next.repRange.max - 3 }, 3, 10);
        next.rirRange = clampRange({ min: Math.max(0, next.rirRange.min - 1), max: next.rirRange.max - 1 }, 0, 3);
        next.restSeconds = clampRange(
          { min: next.restSeconds.min + 30, max: next.restSeconds.max + 45 },
          60,
          360
        );
        next.notes += " Strength emphasis: lower reps on main lifts, slightly harder effort, longer rest.";
      } else if (base.bucket === "isolation" || base.bucket === "accessory") {
        next.sets = clampRange({ min: Math.max(1, next.sets.min - 1), max: next.sets.max - 1 }, 1, 4);
      }
      return next;
    },
  },
  hypertrophy_emphasis: {
    id: "hypertrophy_emphasis",
    apply: (base) => {
      const next = cloneRule(base);
      next.sets = clampRange({ min: next.sets.min, max: next.sets.max + 1 }, 2, 6);
      next.repRange = clampRange({ min: next.repRange.min, max: next.repRange.max + 2 }, 6, 30);
      if (base.bucket === "isolation" || base.bucket === "machine_compound") {
        next.rirRange = clampRange({ min: 0, max: Math.max(1, next.rirRange.max) }, 0, 3);
      }
      next.notes += " Hypertrophy emphasis: moderate reps, 1-2 RIR bias, enough weekly volume.";
      return next;
    },
  },
  low_fatigue: {
    id: "low_fatigue",
    apply: (base) => {
      const next = cloneRule(base);
      next.sets = clampRange({ min: Math.max(2, next.sets.min - 1), max: next.sets.max - 1 }, 2, 5);
      next.rirRange = clampRange({ min: next.rirRange.min + 1, max: next.rirRange.max + 1 }, 1, 5);
      next.restSeconds = clampRange(
        { min: Math.max(45, next.restSeconds.min - 15), max: Math.max(60, next.restSeconds.max - 15) },
        45,
        240
      );
      next.notes += " Low-fatigue mode: trim volume and keep more reps in reserve.";
      return next;
    },
  },
  upper_body_emphasis: {
    id: "upper_body_emphasis",
    apply: (base, exercise) => {
      const next = cloneRule(base);
      if (hasTag(exercise, "upper")) {
        next.sets = clampRange({ min: next.sets.min, max: next.sets.max + 1 }, 2, 6);
        next.notes += " Upper-body emphasis: allow extra set allocation to upper patterns.";
      }
      if (hasTag(exercise, "lower")) {
        next.sets = clampRange({ min: Math.max(2, next.sets.min - 1), max: next.sets.max - 1 }, 2, 5);
      }
      return next;
    },
  },
  chest_emphasis: {
    id: "chest_emphasis",
    apply: (base, exercise) => {
      const next = cloneRule(base);
      if (hasTag(exercise, "chest") || hasTag(exercise, "horizontal_push")) {
        next.sets = clampRange({ min: next.sets.min, max: next.sets.max + 1 }, 2, 6);
        next.rirRange = clampRange({ min: Math.max(0, next.rirRange.min - 1), max: Math.max(2, next.rirRange.max) }, 0, 4);
        next.notes += " Chest emphasis: allocate more work to chest press/fly slots.";
      }
      return next;
    },
  },
  bench_strength_emphasis: {
    id: "bench_strength_emphasis",
    apply: (base, exercise) => {
      const next = cloneRule(base);
      const benchLike = isBenchPressLike(exercise) || (hasTag(exercise, "chest") && hasTag(exercise, "horizontal_push"));
      if (benchLike) {
        next.repRange = clampRange({ min: 3, max: Math.min(next.repRange.max, 6) }, 3, 10);
        next.rirRange = clampRange({ min: 1, max: Math.max(2, next.rirRange.max) }, 0, 4);
        next.restSeconds = clampRange(
          { min: Math.max(next.restSeconds.min, 150), max: Math.max(next.restSeconds.max, 240) },
          90,
          360
        );
        if (base.bucket === "main_compound") {
          next.sets = clampRange({ min: 4, max: Math.max(4, next.sets.max) }, 3, 6);
        }
        next.notes += " Bench-strength emphasis: prioritize heavier bench-specific work quality.";
      }
      return next;
    },
  },
};

export function applyGoalAdjustments(
  base: PrescriptionRule,
  exercise: ExerciseMetadata,
  goalAdjustments: GoalAdjustment[] = []
): PrescriptionRule {
  return goalAdjustments.reduce((current, id) => {
    const rule = PRESCRIPTION_ADJUSTMENTS[id];
    return rule ? rule.apply(current, exercise) : current;
  }, cloneRule(base));
}

export function getPrescriptionForExercise(
  exercise: ExerciseMetadata,
  goalAdjustments: GoalAdjustment[] = []
): PrescriptionResult {
  const bucket = resolvePrescriptionBucket(exercise);
  const base = cloneRule(PRESCRIPTION_DEFAULTS[bucket]);
  const adjusted = applyGoalAdjustments(base, exercise, goalAdjustments);
  return {
    bucketUsed: bucket,
    base,
    adjusted,
    appliedAdjustments: [...goalAdjustments],
  };
}

