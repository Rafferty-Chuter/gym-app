export type MovementPattern =
  | "horizontal_push"
  | "horizontal_pull"
  | "vertical_push"
  | "vertical_pull"
  | "hinge"
  | "squat"
  | "arm_flexion"
  | "arm_extension"
  | "lateral_raise"
  | "other";

export type ExerciseProfile = {
  name: string;
  aliases?: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementPattern: MovementPattern;
  category: "compound" | "isolation";
  stability: "high" | "moderate" | "low";
  fatigueCost: "high" | "moderate" | "low";
  goodForGoals: Array<"strength" | "hypertrophy" | "support_volume" | "technique">;
};

export const EXERCISE_PROFILES: ExerciseProfile[] = [
  {
    name: "Bench Press",
    aliases: ["Flat Bench Press", "Barbell Bench Press", "BB Bench"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "horizontal_push",
    category: "compound",
    stability: "moderate",
    fatigueCost: "moderate",
    goodForGoals: ["strength", "hypertrophy", "technique"],
  },
  {
    name: "Incline Dumbbell Press",
    aliases: ["Incline DB Press", "Incline Press"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "horizontal_push",
    category: "compound",
    stability: "moderate",
    fatigueCost: "moderate",
    goodForGoals: ["hypertrophy", "strength", "support_volume"],
  },
  {
    name: "Chest Press",
    aliases: ["Machine Chest Press", "Seated Chest Press", "Plate-Loaded Chest Press"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "horizontal_push",
    category: "compound",
    stability: "high",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Chest Fly",
    aliases: ["Dumbbell Fly", "Cable Fly", "Pec Fly"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "horizontal_push",
    category: "isolation",
    stability: "moderate",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Barbell Row",
    aliases: ["BB Row", "Bent-Over Row", "Bent Over Row", "T-Bar Row", "T Bar Row"],
    primaryMuscles: ["lats", "upper back"],
    secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "horizontal_pull",
    category: "compound",
    stability: "moderate",
    fatigueCost: "moderate",
    goodForGoals: ["strength", "hypertrophy", "support_volume"],
  },
  {
    name: "Chest-Supported Row",
    aliases: ["Chest Supported Row", "Incline Row", "Spider Row"],
    primaryMuscles: ["lats", "upper back"],
    secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "horizontal_pull",
    category: "compound",
    stability: "high",
    fatigueCost: "moderate",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Seated Cable Row",
    aliases: ["Cable Row", "Seated Row"],
    primaryMuscles: ["lats", "upper back"],
    secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "horizontal_pull",
    category: "compound",
    stability: "high",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Lat Pulldown",
    aliases: ["Lat Pull Down", "Wide-Grip Pulldown", "Cable Pulldown"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "vertical_pull",
    category: "compound",
    stability: "high",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Pull-Up",
    aliases: ["Pull Up", "Pullup", "Chin-Up", "Chin Up"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "vertical_pull",
    category: "compound",
    stability: "moderate",
    fatigueCost: "moderate",
    goodForGoals: ["strength", "hypertrophy", "support_volume"],
  },
  {
    name: "Shoulder Press",
    aliases: ["Overhead Press", "OHP", "Military Press", "Dumbbell Shoulder Press"],
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "vertical_push",
    category: "compound",
    stability: "moderate",
    fatigueCost: "moderate",
    goodForGoals: ["strength", "hypertrophy", "support_volume"],
  },
  {
    name: "Lateral Raise",
    aliases: ["Side Raise", "Dumbbell Lateral Raise", "Cable Lateral Raise"],
    primaryMuscles: ["side delts"],
    secondaryMuscles: ["traps"],
    movementPattern: "lateral_raise",
    category: "isolation",
    stability: "moderate",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Barbell Curl",
    aliases: ["BB Curl", "Standing Barbell Curl"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "arm_flexion",
    category: "isolation",
    stability: "moderate",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Hammer Curl",
    aliases: ["DB Hammer Curl", "Neutral-Grip Curl"],
    primaryMuscles: ["biceps", "brachialis"],
    secondaryMuscles: ["forearms"],
    movementPattern: "arm_flexion",
    category: "isolation",
    stability: "moderate",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Tricep Pushdown",
    aliases: ["Triceps Pushdown", "Cable Pushdown", "Rope Pushdown"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    movementPattern: "arm_extension",
    category: "isolation",
    stability: "high",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Overhead Tricep Extension",
    aliases: ["Overhead Cable Extension", "French Press"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    movementPattern: "arm_extension",
    category: "isolation",
    stability: "moderate",
    fatigueCost: "low",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "Squat",
    aliases: ["Back Squat", "Barbell Squat", "BB Squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "lower back"],
    movementPattern: "squat",
    category: "compound",
    stability: "moderate",
    fatigueCost: "high",
    goodForGoals: ["strength", "hypertrophy", "technique"],
  },
  {
    name: "Leg Press",
    aliases: ["45 Leg Press", "Machine Leg Press"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    movementPattern: "squat",
    category: "compound",
    stability: "high",
    fatigueCost: "moderate",
    goodForGoals: ["hypertrophy", "support_volume", "technique"],
  },
  {
    name: "RDL",
    aliases: ["Romanian Deadlift", "Barbell RDL"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower back", "traps"],
    movementPattern: "hinge",
    category: "compound",
    stability: "moderate",
    fatigueCost: "moderate",
    goodForGoals: ["strength", "hypertrophy", "support_volume"],
  },
  {
    name: "Deadlift",
    aliases: ["Conventional Deadlift", "BB Deadlift", "Barbell Deadlift"],
    primaryMuscles: ["hamstrings", "glutes", "lower back"],
    secondaryMuscles: ["traps", "lats"],
    movementPattern: "hinge",
    category: "compound",
    stability: "moderate",
    fatigueCost: "high",
    goodForGoals: ["strength", "hypertrophy", "technique"],
  },
];

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a logged exercise name to a profile. Matches canonical `name` or any `aliases` (case-insensitive, collapsed whitespace).
 */
export function getExerciseProfile(name: string): ExerciseProfile | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;

  for (const profile of EXERCISE_PROFILES) {
    if (normalizeExerciseName(profile.name) === key) {
      return profile;
    }
    for (const alias of profile.aliases ?? []) {
      if (normalizeExerciseName(alias) === key) {
        return profile;
      }
    }
  }

  return null;
}
