export type DayType =
  | "push"
  | "pull"
  | "legs"
  | "upper"
  | "lower"
  | "chest_back"
  | "shoulders_arms"
  | "full_body"
  | "custom_day";

export type DayTypeRule = {
  dayType: DayType;
  targetMuscles: string[];
  requiredMovementPatterns: string[];
  requiredCompoundSlots: number;
  optionalAccessorySlots: number;
  typicalExerciseCountRange: { min: number; max: number };
  typicalPerMuscleExerciseCount: { min: number; target: number; max: number };
  commonOrderingRules: string[];
  underbuiltWarnings: string[];
  bloatedWarnings: string[];
  redundancyWarnings: string[];
  recoveryNotes: string[];
};

export const DAY_TYPE_RULES: Record<DayType, DayTypeRule> = {
  push: {
    dayType: "push",
    targetMuscles: ["chest", "shoulders", "triceps"],
    requiredMovementPatterns: ["horizontal_push", "vertical_push"],
    requiredCompoundSlots: 2,
    optionalAccessorySlots: 2,
    typicalExerciseCountRange: { min: 5, max: 7 },
    typicalPerMuscleExerciseCount: { min: 1, target: 2, max: 3 },
    commonOrderingRules: ["Pressing compounds first", "Isolation later (lateral raise / triceps extension)"],
    underbuiltWarnings: ["Push day missing either horizontal or vertical press often underdelivers."],
    bloatedWarnings: ["Push day beyond ~7 movements usually hurts quality unless very low fatigue."],
    redundancyWarnings: ["Multiple near-identical chest presses can become redundant quickly."],
    recoveryNotes: ["Hard chest/delt/triceps work typically needs ~48h before repeating hard efforts."],
  },
  pull: {
    dayType: "pull",
    targetMuscles: ["back", "biceps", "rear_delts"],
    requiredMovementPatterns: ["vertical_pull", "horizontal_pull"],
    requiredCompoundSlots: 2,
    optionalAccessorySlots: 2,
    typicalExerciseCountRange: { min: 5, max: 7 },
    typicalPerMuscleExerciseCount: { min: 1, target: 2, max: 3 },
    commonOrderingRules: ["Heavy pulls/rows first", "Curls/rear-delt isolation later"],
    underbuiltWarnings: ["Pull days usually need both vertical and horizontal pulling."],
    bloatedWarnings: ["Too many similar rows can bloat fatigue with little extra stimulus."],
    redundancyWarnings: ["Repeated same-angle rows/pulldowns in one day are often redundant."],
    recoveryNotes: ["Back-heavy sessions normally need ~48h recovery spacing."],
  },
  legs: {
    dayType: "legs",
    targetMuscles: ["quads", "hamstrings", "glutes", "calves"],
    requiredMovementPatterns: ["squat_or_lunge", "hip_hinge"],
    requiredCompoundSlots: 2,
    optionalAccessorySlots: 3,
    typicalExerciseCountRange: { min: 5, max: 8 },
    typicalPerMuscleExerciseCount: { min: 1, target: 2, max: 3 },
    commonOrderingRules: ["Main squat/press first", "Hinge second", "Isolations later"],
    underbuiltWarnings: ["Leg day should include both quad and posterior-chain patterns."],
    bloatedWarnings: ["Very long leg sessions often compromise execution quality."],
    redundancyWarnings: ["Stacking too many near-identical quad compounds can be wasteful."],
    recoveryNotes: ["Large lower-body sessions usually need ~48-72h before repeating hard."],
  },
  upper: {
    dayType: "upper",
    targetMuscles: ["chest", "back", "shoulders", "biceps", "triceps"],
    requiredMovementPatterns: ["horizontal_push", "vertical_pull_or_horizontal_pull"],
    requiredCompoundSlots: 3,
    optionalAccessorySlots: 2,
    typicalExerciseCountRange: { min: 5, max: 8 },
    typicalPerMuscleExerciseCount: { min: 1, target: 1, max: 2 },
    commonOrderingRules: ["Alternate push/pull compounds early", "Arms and delt isolation later"],
    underbuiltWarnings: ["Upper day with <4 meaningful movements is usually underbuilt."],
    bloatedWarnings: ["Upper day >8 movements tends to become bloated."],
    redundancyWarnings: ["Balance chest and back patterns before adding extra overlap."],
    recoveryNotes: ["Upper-body compounds and arm accessories usually recover in ~48h."],
  },
  lower: {
    dayType: "lower",
    targetMuscles: ["quads", "hamstrings", "glutes", "calves"],
    requiredMovementPatterns: ["squat_or_lunge", "hip_hinge"],
    requiredCompoundSlots: 2,
    optionalAccessorySlots: 2,
    typicalExerciseCountRange: { min: 4, max: 7 },
    typicalPerMuscleExerciseCount: { min: 1, target: 1, max: 2 },
    commonOrderingRules: ["Primary compound before hinge/accessory work"],
    underbuiltWarnings: ["Lower day missing hinge or squat pattern is usually incomplete."],
    bloatedWarnings: ["Lower day can become too long when both volume and fatigue are high."],
    redundancyWarnings: ["Use one or two key compounds, then complementary accessories."],
    recoveryNotes: ["Hard lower sessions generally benefit from 48-72h spacing."],
  },
  chest_back: {
    dayType: "chest_back",
    targetMuscles: ["chest", "back"],
    requiredMovementPatterns: ["horizontal_push", "vertical_pull_or_horizontal_pull"],
    requiredCompoundSlots: 3,
    optionalAccessorySlots: 2,
    typicalExerciseCountRange: { min: 5, max: 8 },
    typicalPerMuscleExerciseCount: { min: 2, target: 2, max: 3 },
    commonOrderingRules: ["Alternate push and pull compounds", "Do isolation/accessory after compounds"],
    underbuiltWarnings: ["Chest+back day should include at least one major push and one major pull."],
    bloatedWarnings: ["Too many compounds in one chest/back day can blow up fatigue."],
    redundancyWarnings: ["Avoid stacking only one pull or press angle repeatedly."],
    recoveryNotes: ["Antagonist pairing can be efficient but still watch total fatigue."],
  },
  shoulders_arms: {
    dayType: "shoulders_arms",
    targetMuscles: ["shoulders", "biceps", "triceps"],
    requiredMovementPatterns: ["vertical_push_or_lateral_raise", "elbow_flexion", "elbow_extension"],
    requiredCompoundSlots: 1,
    optionalAccessorySlots: 4,
    typicalExerciseCountRange: { min: 4, max: 7 },
    typicalPerMuscleExerciseCount: { min: 1, target: 2, max: 3 },
    commonOrderingRules: ["One compound shoulder press early, then isolation circuits"],
    underbuiltWarnings: ["Shoulders/arms day needs direct work for all three groups."],
    bloatedWarnings: ["Too many arm isolations often become junk volume."],
    redundancyWarnings: ["Use different elbow paths for biceps/triceps variety."],
    recoveryNotes: ["Small-muscle sessions recover faster but still need quality sets."],
  },
  full_body: {
    dayType: "full_body",
    targetMuscles: ["chest", "back", "quads", "hamstrings", "shoulders"],
    requiredMovementPatterns: ["push", "pull", "squat_or_lunge", "hip_hinge"],
    requiredCompoundSlots: 3,
    optionalAccessorySlots: 2,
    typicalExerciseCountRange: { min: 5, max: 7 },
    typicalPerMuscleExerciseCount: { min: 1, target: 1, max: 2 },
    commonOrderingRules: ["Use 1-2 key moves per region", "Keep accessories selective"],
    underbuiltWarnings: ["Full body should still hit upper + lower patterns each session."],
    bloatedWarnings: ["Full body above ~7 exercises is often bloated for quality output."],
    redundancyWarnings: ["Avoid duplicate patterns; cover regions efficiently."],
    recoveryNotes: ["Full body works best when fatigue is controlled across sessions."],
  },
  custom_day: {
    dayType: "custom_day",
    targetMuscles: [],
    requiredMovementPatterns: [],
    requiredCompoundSlots: 1,
    optionalAccessorySlots: 3,
    typicalExerciseCountRange: { min: 4, max: 8 },
    typicalPerMuscleExerciseCount: { min: 1, target: 1, max: 2 },
    commonOrderingRules: ["Compounds first", "Accessories after", "Cap session size when many groups are merged"],
    underbuiltWarnings: ["Custom day should still cover all declared target groups."],
    bloatedWarnings: ["Multi-group custom days need volume caps to stay coherent."],
    redundancyWarnings: ["Custom days should avoid repeating near-identical movement patterns."],
    recoveryNotes: ["Custom splits should still preserve recovery spacing between similar hard days."],
  },
};

export function inferDayTypeFromTargets(targetMuscles: string[]): DayType {
  const set = new Set(targetMuscles.map((x) => x.toLowerCase()));
  if (set.has("chest") && set.has("back")) return "chest_back";
  if (set.has("shoulders") && (set.has("biceps") || set.has("triceps"))) return "shoulders_arms";
  if (set.has("chest") && set.has("back") && set.has("quads")) return "full_body";
  if (set.has("chest") && set.has("back") && set.has("biceps") && set.has("triceps")) return "upper";
  if (set.has("quads") || set.has("hamstrings") || set.has("glutes") || set.has("calves")) {
    if (set.size <= 4 && !set.has("chest") && !set.has("back")) return "lower";
  }
  if (set.has("chest") && set.has("shoulders") && set.has("triceps")) return "push";
  if (set.has("back") && set.has("biceps")) return "pull";
  if (set.has("quads") && set.has("hamstrings")) return "legs";
  return "custom_day";
}

