export type MuscleRuleId =
  | "chest"
  | "lats_upper_back"
  | "delts"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs_core";

export type NumericRange = { min: number; target: number; high: number };
export type RepRange = { min: number; max: number };
export type RecoveryWindow = { min: number; max: number };

export type MuscleRule = {
  id: MuscleRuleId;
  displayName: string;
  primaryFunctions: string[];
  keyMovementPatterns: string[];
  effectiveExerciseCategories: string[];
  requiredPatternCount: number;
  multiplePatternsRecommended: boolean;
  directWorkUsuallyNeeded: boolean;
  longLengthBias: "high" | "moderate" | "low";
  typicalWeeklySetRange: NumericRange;
  typicalPerSessionSetRange: NumericRange;
  typicalRepRange: RepRange;
  typicalFrequencyPerWeek: NumericRange;
  typicalRecoveryWindowHours: RecoveryWindow;
  overlapMuscles: MuscleRuleId[];
  undercoverageWarnings: string[];
  overstackingWarnings: string[];
  programmingNotes: string[];
};

const W_SMALL: NumericRange = { min: 8, target: 10, high: 16 };
const W_MED: NumericRange = { min: 8, target: 12, high: 20 };
const W_LARGE: NumericRange = { min: 10, target: 14, high: 22 };

export const MUSCLE_RULES: Record<MuscleRuleId, MuscleRule> = {
  chest: {
    id: "chest",
    displayName: "Chest",
    primaryFunctions: ["horizontal adduction", "pressing force production"],
    keyMovementPatterns: ["horizontal_press", "incline_press", "fly/isolation"],
    effectiveExerciseCategories: ["bench/incline press", "fly/pec-deck"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "moderate",
    typicalWeeklySetRange: W_MED,
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["triceps", "delts"],
    undercoverageWarnings: ["Chest tends to need direct pressing/fly volume, not only indirect pressing carryover."],
    overstackingWarnings: ["Repeated high-chest sessions can crowd recovery and reduce useful set quality."],
    programmingNotes: ["Use full ROM and vary angle (flat + incline) across the week."],
  },
  lats_upper_back: {
    id: "lats_upper_back",
    displayName: "Lats / Upper Back",
    primaryFunctions: ["shoulder extension/adduction", "scapular control/retraction"],
    keyMovementPatterns: ["vertical_pull", "horizontal_pull"],
    effectiveExerciseCategories: ["pull-up/pulldown", "rows", "rear-upper-back accessories"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "moderate",
    typicalWeeklySetRange: W_LARGE,
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["biceps", "delts"],
    undercoverageWarnings: ["Back days are usually better with both vertical and horizontal pulling."],
    overstackingWarnings: ["Too many similar pulls can add fatigue without adding much new stimulus."],
    programmingNotes: ["Use multiple grips/elbow paths over the week."],
  },
  delts: {
    id: "delts",
    displayName: "Delts",
    primaryFunctions: ["abduction", "flexion", "horizontal abduction/extension"],
    keyMovementPatterns: ["vertical_press", "lateral_raise", "rear_delt"],
    effectiveExerciseCategories: ["overhead press", "lateral raise", "rear-delt isolation"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "moderate",
    typicalWeeklySetRange: W_MED,
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 36, max: 60 },
    overlapMuscles: ["chest", "triceps", "lats_upper_back"],
    undercoverageWarnings: ["Pressing alone often under-covers side/rear delts for hypertrophy."],
    overstackingWarnings: ["Delt isolation can accumulate local fatigue fast if layered heavily."],
    programmingNotes: ["Combine press + lateral/rear-delt work for fuller coverage."],
  },
  biceps: {
    id: "biceps",
    displayName: "Biceps",
    primaryFunctions: ["elbow flexion", "supination"],
    keyMovementPatterns: ["curl_variations", "supinated_pull_assistance"],
    effectiveExerciseCategories: ["barbell/db/cable curls", "chin-up variants"],
    requiredPatternCount: 1,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "low",
    typicalWeeklySetRange: W_SMALL,
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: ["lats_upper_back"],
    undercoverageWarnings: ["Indirect pulling may not be enough if biceps are a growth priority."],
    overstackingWarnings: ["Excess curl stacking can irritate elbows and reduce quality."],
    programmingNotes: ["Mix curl variations; incline/preacher can change emphasis."],
  },
  triceps: {
    id: "triceps",
    displayName: "Triceps",
    primaryFunctions: ["elbow extension", "press lockout support"],
    keyMovementPatterns: ["pressing_support", "pushdown", "overhead_extension"],
    effectiveExerciseCategories: ["close-grip/dip style compound", "pushdown", "overhead extension"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "high",
    typicalWeeklySetRange: W_MED,
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: ["chest", "delts"],
    undercoverageWarnings: ["At least one overhead extension is often useful for long-head triceps growth."],
    overstackingWarnings: ["Too much extension volume can beat up elbows quickly."],
    programmingNotes: ["Use both neutral and overhead extension positions across the week."],
  },
  quads: {
    id: "quads",
    displayName: "Quads",
    primaryFunctions: ["knee extension", "squat/press force"],
    keyMovementPatterns: ["squat_or_press", "knee_extension"],
    effectiveExerciseCategories: ["squat/leg press family", "leg extension"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "moderate",
    typicalWeeklySetRange: W_LARGE,
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["glutes", "hamstrings", "calves"],
    undercoverageWarnings: ["Quads are often better served with both squat/press and knee-extension work."],
    overstackingWarnings: ["High quad volume can outpace recovery, especially if all sets are hard."],
    programmingNotes: ["Full ROM compounds plus extension is a strong default."],
  },
  hamstrings: {
    id: "hamstrings",
    displayName: "Hamstrings",
    primaryFunctions: ["hip extension", "knee flexion"],
    keyMovementPatterns: ["hip_hinge", "knee_curl"],
    effectiveExerciseCategories: ["RDL/hinge", "leg curl"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "high",
    typicalWeeklySetRange: W_LARGE,
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["glutes", "calves"],
    undercoverageWarnings: ["Hamstrings are often underbuilt when only hinge OR curl is used."],
    overstackingWarnings: ["Stacking heavy hinge stress repeatedly can impair session quality."],
    programmingNotes: ["Long-length loading (RDL-style) is especially useful here."],
  },
  glutes: {
    id: "glutes",
    displayName: "Glutes",
    primaryFunctions: ["hip extension", "pelvic control"],
    keyMovementPatterns: ["hip_thrust_bridge", "squat_lunge_hinge"],
    effectiveExerciseCategories: ["hip thrust/bridge", "squat/lunge/deadlift family"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: false,
    longLengthBias: "moderate",
    typicalWeeklySetRange: W_MED,
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalRepRange: { min: 6, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 3 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["quads", "hamstrings"],
    undercoverageWarnings: ["If glute growth is a goal, direct thrust/bridge style work is usually helpful."],
    overstackingWarnings: ["Glute-heavy compounds plus thrust accessories can overstack quickly."],
    programmingNotes: ["Mix single-joint thrusting with multi-joint lower patterns."],
  },
  calves: {
    id: "calves",
    displayName: "Calves",
    primaryFunctions: ["plantarflexion (gastroc + soleus)"],
    keyMovementPatterns: ["standing_calf_raise", "seated_calf_raise"],
    effectiveExerciseCategories: ["standing calf raise", "seated calf raise"],
    requiredPatternCount: 2,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: true,
    longLengthBias: "high",
    typicalWeeklySetRange: W_MED,
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalRepRange: { min: 8, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 4 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: ["quads", "hamstrings"],
    undercoverageWarnings: ["Calves often need direct work; standing + seated can improve coverage."],
    overstackingWarnings: ["Very high calf volume can be junky if effort quality drops."],
    programmingNotes: ["Use full ROM and controlled stretch for calf work."],
  },
  abs_core: {
    id: "abs_core",
    displayName: "Abs / Core",
    primaryFunctions: ["anti-extension", "anti-rotation", "trunk flexion support"],
    keyMovementPatterns: ["flexion", "anti_extension", "anti_rotation"],
    effectiveExerciseCategories: ["cable crunch/leg raise", "plank/rollout/pallof"],
    requiredPatternCount: 1,
    multiplePatternsRecommended: true,
    directWorkUsuallyNeeded: false,
    longLengthBias: "low",
    typicalWeeklySetRange: { min: 6, target: 8, high: 12 },
    typicalPerSessionSetRange: { min: 2, target: 3, high: 6 },
    typicalRepRange: { min: 8, max: 20 },
    typicalFrequencyPerWeek: { min: 1, target: 2, high: 4 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: [],
    undercoverageWarnings: ["Core often gets indirect work, but direct sets may help if it is a priority."],
    overstackingWarnings: ["Very high direct core volume can reduce performance in big lifts."],
    programmingNotes: ["Progressive overload still applies to abs/core work."],
  },
};

// Compatibility aliases for prior naming conventions.
export const MUSCLE_ID_ALIASES: Record<string, MuscleRuleId> = {
  upper_back_lats: "lats_upper_back",
  shoulders_delts: "delts",
};

