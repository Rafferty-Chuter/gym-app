export type MuscleGroupId =
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

export type WeeklySetRange = { min: number; target: number; high: number };
export type RepRange = { min: number; max: number };
export type RecoveryWindowHours = { min: number; max: number };

export type MuscleGroupRule = {
  id: MuscleGroupId;
  displayName: string;

  primaryFunctions: string[];
  keyMovementPatterns: string[];

  effectiveExerciseCategories: string[];

  directWorkUsuallyNeeded: boolean;
  multiplePatternsRecommended: boolean;

  longLengthBias: "low" | "moderate" | "high";
  typicalRepRange: RepRange;
  typicalPerSessionSetRange: WeeklySetRange;
  typicalWeeklySetRange: WeeklySetRange;
  typicalRecoveryWindowHours: RecoveryWindowHours;

  overlapMuscles: MuscleGroupId[];
  commonUndercoverageWarnings: string[];
  commonOverstackingWarnings: string[];
  practicalProgrammingNotes: string[];
};

const DEFAULT_WEEKLY_TARGET = 12; // "10+ weekly sets is often useful baseline"
const DEFAULT_WEEKLY_MIN = 8;
const DEFAULT_WEEKLY_HIGH = 20; // keep conservative; avoid dogma

export const MUSCLE_GROUP_RULES: Record<MuscleGroupId, MuscleGroupRule> = {
  chest: {
    id: "chest",
    displayName: "Chest",
    primaryFunctions: ["horizontal pressing", "pectoralis tension control"],
    keyMovementPatterns: ["horizontal press", "incline press", "fly/isolation"],
    effectiveExerciseCategories: ["bench/incline presses", "cable/dumbbell fly", "pec deck"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "moderate",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalWeeklySetRange: { min: DEFAULT_WEEKLY_MIN, target: DEFAULT_WEEKLY_TARGET, high: DEFAULT_WEEKLY_HIGH },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["triceps", "delts"],
    commonUndercoverageWarnings: ["If chest volume is low, add 1–2 direct press/fly movements.", "Pressing alone sometimes under-delivers chest isolation stimulus."],
    commonOverstackingWarnings: ["If chest sessions are back-to-back hard, expect soreness/rep quality drop.", "Too many similar presses can reduce variety without adding new stimulus."],
    practicalProgrammingNotes: ["A practical default is 6–12 reps per set.", "Mix at least two angles (flat + incline or press + fly)."],
  },

  lats_upper_back: {
    id: "lats_upper_back",
    displayName: "Lats / Upper back",
    primaryFunctions: ["vertical pulling", "horizontal rowing", "scapular retraction/stability"],
    keyMovementPatterns: ["vertical pull", "horizontal pull/row", "rear-upper-back isolation"],
    effectiveExerciseCategories: ["pull-ups/pulldowns", "rows", "face pulls/rear delt fly"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "moderate",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalWeeklySetRange: { min: DEFAULT_WEEKLY_MIN, target: DEFAULT_WEEKLY_TARGET, high: DEFAULT_WEEKLY_HIGH },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["biceps", "delts"],
    commonUndercoverageWarnings: ["If pull volume is low, add both a vertical pull and a row.", "Rear-upper-back isolation often boosts the stimulus quality."],
    commonOverstackingWarnings: ["If rows + pulldowns stack too many similar sets, recovery can slip.", "If your back is always hard, vary fatigue (RIR/effort) between days."],
    practicalProgrammingNotes: ["Best back hypertrophy usually comes from vertical + horizontal pulling.", "Aim to train near failure with clean reps (usually ~0–2 RIR)."],
  },

  delts: {
    id: "delts",
    displayName: "Delts",
    primaryFunctions: ["shoulder elevation/abduction/adduction control", "shoulder pressing support"],
    keyMovementPatterns: ["vertical press", "lateral/abduction isolation", "rear delt isolation", "face pull"],
    effectiveExerciseCategories: ["overhead press", "lateral raise variants", "rear delt fly/face pull"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "moderate",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalWeeklySetRange: { min: DEFAULT_WEEKLY_MIN, target: DEFAULT_WEEKLY_TARGET, high: 20 },
    typicalRecoveryWindowHours: { min: 36, max: 60 },
    overlapMuscles: ["chest", "lats_upper_back", "triceps"],
    commonUndercoverageWarnings: ["If delts are under-covered, add one dedicated isolation pattern.", "Pressing alone can miss side/rear-delts stimulus."],
    commonOverstackingWarnings: ["If delts are always sore, add more RIR and reduce isolation stacking.", "Lateral/abduction isolation can be disproportionately fatiguing if overdone."],
    practicalProgrammingNotes: ["Rear/front delts can be built without lateral raises by using press + face pull/rear fly.", "Still keep at least two delt patterns across the week when possible."],
  },

  biceps: {
    id: "biceps",
    displayName: "Biceps",
    primaryFunctions: ["elbow flexion", "forearm supination", "pulling assistance"],
    keyMovementPatterns: ["curl patterns", "chin/pull assistance"],
    effectiveExerciseCategories: ["hammer curls", "cable curls", "biceps curl variants", "chin-up/pulldown assistance"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "low",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalWeeklySetRange: { min: 8, target: 10, high: 16 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: ["lats_upper_back", "abs_core"],
    commonUndercoverageWarnings: ["If biceps sets are low, add 2 curl-pattern movements across the week.", "Indirect pulling sometimes isn’t enough for biceps hypertrophy."],
    commonOverstackingWarnings: ["If elbow/biceps pain appears, reduce curl frequency and keep RIR higher.", "Avoid stacking curls without spacing between hard days."],
    practicalProgrammingNotes: ["6–12 reps is a strong default for curls.", "Overhead triceps volume can trade off with curl comfort—adjust based on symptoms."],
  },

  triceps: {
    id: "triceps",
    displayName: "Triceps",
    primaryFunctions: ["elbow extension", "lockout stability", "pressing support"],
    keyMovementPatterns: ["pressing (indirect)", "pushdowns", "overhead extension (long head)"],
    effectiveExerciseCategories: ["pushdowns/rope extensions", "overhead extensions", "JM press/accessories"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "high",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalWeeklySetRange: { min: 8, target: 12, high: 18 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: ["chest", "delts"],
    commonUndercoverageWarnings: ["If triceps are under-covered, add one direct extension after pressing.", "For full growth, overhead extension variants are especially useful."],
    commonOverstackingWarnings: ["If elbows feel cranky, reduce isolation fatigue and keep effort controlled (RIR 1–3).", "Don’t stack too many long-head positions back-to-back."],
    practicalProgrammingNotes: ["If you only do pushdowns, overhead extension often fills a key long-length gap.", "Train extensions near failure with full ROM (usually ~0–2 RIR)."],
  },

  quads: {
    id: "quads",
    displayName: "Quads",
    primaryFunctions: ["knee extension", "squat/leg press power", "knee stability"],
    keyMovementPatterns: ["squat/leg press", "knee extension/leg extension", "split squats"],
    effectiveExerciseCategories: ["back/front squat", "hack squat/leg press", "leg extension"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "moderate",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalWeeklySetRange: { min: 10, target: 14, high: 22 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["glutes", "calves", "hamstrings"],
    commonUndercoverageWarnings: ["If quads are low, add leg extension or quad-biased split squats.", "Squat/press patterns alone sometimes underserve quad isolation stimulus."],
    commonOverstackingWarnings: ["If quads are consistently sore, reduce one quad-focused set block and vary fatigue.", "Overstacking knee extension after hard squats can be too fatiguing."],
    practicalProgrammingNotes: ["Squat + leg extension is a very effective quad pairing for hypertrophy.", "Most quad work benefits from 6–12 reps; isolation can go higher."],
  },

  hamstrings: {
    id: "hamstrings",
    displayName: "Hamstrings",
    primaryFunctions: ["hip hinge", "knee flexion", "posterior-chain control"],
    keyMovementPatterns: ["RDL/hinge patterns", "knee-curl patterns", "glute-ham strategies"],
    effectiveExerciseCategories: ["RDL", "stiff-leg deadlift", "leg curl", "slider/nordic variants (if available)"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "high",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 4, target: 6, high: 10 },
    typicalWeeklySetRange: { min: 10, target: 14, high: 22 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["glutes", "calves"],
    commonUndercoverageWarnings: ["If hamstrings are low, include both a hinge and a knee-curl pattern.", "Over-relying on only one pattern often leaves growth on the table."],
    commonOverstackingWarnings: ["If your hinge work is always max effort, hamstrings can fatigue and rep quality drops.", "Dial back volume when hinge soreness lingers."],
    practicalProgrammingNotes: ["RDL-style work creates a valuable long-length stimulus for many people.", "Aim for 6–12 reps on hinge compounds; curls can be slightly higher rep."],
  },

  glutes: {
    id: "glutes",
    displayName: "Glutes",
    primaryFunctions: ["hip extension", "posterior hip output", "pelvic stability"],
    keyMovementPatterns: ["hip thrust/bridge", "lunge/split patterns", "hinge support"],
    effectiveExerciseCategories: ["hip thrust/glute bridge", "bulgarian split squat", "deadlift/hinge family"],
    directWorkUsuallyNeeded: false,
    multiplePatternsRecommended: true,
    longLengthBias: "moderate",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalWeeklySetRange: { min: 8, target: 12, high: 18 },
    typicalRecoveryWindowHours: { min: 48, max: 72 },
    overlapMuscles: ["hamstrings", "quads"],
    commonUndercoverageWarnings: ["If glutes are low, add one direct hip-thrust or bridge block.", "Split squats can be a useful bridge between quads and glutes."],
    commonOverstackingWarnings: ["If glutes are overworked, reduce direct hip-thrust volume and keep hinge effort controlled."],
    practicalProgrammingNotes: ["Glutes often respond to both thrust/bridge and lunge/split squat styles.", "Long-length glute bias can be built with controlled eccentric on hinges."],
  },

  calves: {
    id: "calves",
    displayName: "Calves",
    primaryFunctions: ["ankle plantarflexion", "standing endurance/ankle stability"],
    keyMovementPatterns: ["standing calf raise", "seated calf raise"],
    effectiveExerciseCategories: ["standing calf raise", "seated calf raise", "leg-press calf raise"],
    directWorkUsuallyNeeded: true,
    multiplePatternsRecommended: true,
    longLengthBias: "high",
    typicalRepRange: { min: 6, max: 20 },
    typicalPerSessionSetRange: { min: 3, target: 5, high: 8 },
    typicalWeeklySetRange: { min: 8, target: 12, high: 18 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: ["quads", "hamstrings"],
    commonUndercoverageWarnings: ["If calves are low, add both standing and seated work at least once weekly."],
    commonOverstackingWarnings: ["Calves can be stubborn: if you’re getting no progression, consider fatigue management not total elimination."],
    practicalProgrammingNotes: ["Many people grow calves best with 8–20 reps.", "Use a full stretch and controlled tempo where possible."],
  },

  abs_core: {
    id: "abs_core",
    displayName: "Abs / Core",
    primaryFunctions: ["anti-extension", "anti-rotation", "bracing/stability"],
    keyMovementPatterns: ["bracing variations", "cable crunch patterns (if available)"],
    effectiveExerciseCategories: ["core bracing/accessory movements", "cable crunch/leg raises (if available)"],
    directWorkUsuallyNeeded: false,
    multiplePatternsRecommended: false,
    longLengthBias: "low",
    typicalRepRange: { min: 8, max: 20 },
    typicalPerSessionSetRange: { min: 2, target: 3, high: 6 },
    typicalWeeklySetRange: { min: 6, target: 8, high: 12 },
    typicalRecoveryWindowHours: { min: 24, max: 48 },
    overlapMuscles: [],
    commonUndercoverageWarnings: ["Core is often under-recruited indirectly; add direct work only if you want it."],
    commonOverstackingWarnings: ["If core recovery is poor, reduce direct core sets and focus on bracing quality in compounds."],
    practicalProgrammingNotes: ["Core sets don’t need to be massive for hypertrophy; keep them controllable and repeatable."],
  },
};

