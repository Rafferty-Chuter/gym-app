export const SUPPORT_MAPPING: Record<
  string,
  { muscles: string[]; exercises: string[]; explanation: string }
> = {
  "Bench Press": {
    muscles: ["triceps", "delts", "lats"],
    exercises: ["tricep pushdowns", "lateral raises", "lat pulldowns"],
    explanation:
      "These muscles support lockout strength, shoulder control, and bar path consistency in pressing.",
  },
  Squat: {
    muscles: ["quads", "glutes"],
    exercises: ["leg press", "split squats"],
    explanation:
      "These muscles support knee and hip extension and help maintain strength out of the bottom of the squat.",
  },
  Deadlift: {
    muscles: ["hamstrings", "glutes", "erectors"],
    exercises: ["RDLs", "hip thrusts", "back extensions"],
    explanation:
      "These muscles support pulling strength and help maintain trunk and hip positioning through the lift.",
  },
};

function normalizeKey(name?: string): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function supportPhraseForExercise(exerciseName?: string): {
  hasMapping: boolean;
  primaryMuscle?: string;
  workLabel: string;
  exampleLabel?: string;
  explanation?: string;
} {
  const key = normalizeKey(exerciseName);
  const matched = Object.entries(SUPPORT_MAPPING).find(
    ([k]) => normalizeKey(k) === key
  )?.[1];
  if (!matched) return { hasMapping: false, workLabel: "supporting muscle work" };
  const workLabel = `${matched.muscles.join(" and ")} work`;
  const exampleLabel = matched.exercises.join(" or ");
  return {
    hasMapping: true,
    primaryMuscle: matched.muscles[0],
    workLabel,
    exampleLabel,
    explanation: matched.explanation,
  };
}
