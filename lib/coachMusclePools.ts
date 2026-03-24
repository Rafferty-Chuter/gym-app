/**
 * Coarse muscle buckets (matches weekly volume keys) → example exercises for coach copy.
 * Names are chosen to read naturally in sentences; user may log different spellings.
 */
const SUGGESTED_EXERCISES: Record<string, string[]> = {
  legs: [
    "Back Squat",
    "Hack Squat",
    "Leg Press",
    "Romanian Deadlift",
    "Leg Curl",
    "Calf Raise",
  ],
  back: [
    "Barbell Row",
    "Cable Row",
    "Lat Pulldown",
    "Pull-Up",
    "Machine Row",
  ],
  chest: [
    "Bench Press",
    "Incline Press",
    "Chest Press Machine",
    "Cable Fly",
  ],
  triceps: ["Tricep Pushdown", "Overhead Extension", "JM Press", "Dips"],
  biceps: ["Barbell Curl", "Hammer Curl", "Preacher Curl", "Cable Curl"],
  shoulders: ["Shoulder Press", "Lateral Raise", "Rear Delt Fly", "Face Pull"],
  arms: [
    "Tricep Pushdown",
    "Overhead Tricep Extension",
    "Barbell Curl",
    "Hammer Curl",
  ],
};

/** Map fine-grained support labels from goal profiles → weekly volume bucket. */
export function mapFineSupportMuscleToCoarseGroup(muscle: string): string | null {
  const m = muscle.trim().toLowerCase();
  const table: Record<string, keyof typeof SUGGESTED_EXERCISES> = {
    triceps: "arms",
    biceps: "arms",
    forearms: "arms",
    arms: "arms",
    hamstrings: "legs",
    quads: "legs",
    glutes: "legs",
    calves: "legs",
    legs: "legs",
    back: "back",
    lats: "back",
    erectors: "back",
    "rear delts": "shoulders",
    delts: "shoulders",
    shoulders: "shoulders",
    chest: "chest",
    pecs: "chest",
  };
  return table[m] ?? null;
}

export function plainCoachNameForCoarseGroup(group: string): string {
  const g = group.trim().toLowerCase();
  if (g === "legs") return "lower body";
  if (g === "arms") return "arms";
  if (g === "back") return "back";
  if (g === "chest") return "chest";
  if (g === "shoulders") return "shoulders";
  return group;
}

export function getSuggestedExercisesForCoarseGroup(group: string | undefined): string[] {
  if (!group) return [];
  const g = group.trim().toLowerCase();
  if (g === "triceps") return [...SUGGESTED_EXERCISES.triceps];
  if (g === "biceps") return [...SUGGESTED_EXERCISES.biceps];
  const pool = SUGGESTED_EXERCISES[g];
  return pool ? [...pool] : [];
}
