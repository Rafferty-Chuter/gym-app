export type GoalSupportProfile = {
  goal: string;
  driverExercise?: string;
  primaryMuscles: string[];
  supportMuscles: string[];
  explanation: string;
};

export const GOAL_SUPPORT_PROFILES: GoalSupportProfile[] = [
  {
    goal: "Increase Bench Press",
    driverExercise: "Bench Press",
    primaryMuscles: ["chest"],
    supportMuscles: ["triceps", "shoulders", "back"],
    explanation:
      "Bench strength usually depends on chest output plus triceps lockout, shoulder control, and upper-back stability.",
  },
  {
    goal: "Increase Squat",
    driverExercise: "Squat",
    primaryMuscles: ["quads", "glutes"],
    supportMuscles: ["hamstrings", "glutes", "back"],
    explanation:
      "Squat progression depends on leg drive and hip extension, with posterior-chain support keeping position stable.",
  },
  {
    goal: "Increase Deadlift",
    driverExercise: "Deadlift",
    primaryMuscles: ["hamstrings", "glutes", "back"],
    supportMuscles: ["hamstrings", "glutes", "back"],
    explanation:
      "Deadlift performance is constrained by posterior-chain strength and trunk/back capacity to hold position.",
  },
  {
    goal: "Build Chest",
    primaryMuscles: ["chest"],
    supportMuscles: ["triceps", "shoulders", "back"],
    explanation:
      "Chest growth is helped by enough pressing support from triceps and shoulders, plus back stability for quality reps.",
  },
  {
    goal: "Build Back",
    primaryMuscles: ["back"],
    supportMuscles: ["biceps", "rear delts", "hamstrings"],
    explanation:
      "Back hypertrophy is often limited by elbow flexors and rear-delt contribution, with hinge support for heavier pulls.",
  },
  {
    goal: "Build Overall Muscle",
    primaryMuscles: ["chest", "back", "legs", "shoulders", "arms"],
    supportMuscles: ["legs", "back", "shoulders", "arms", "chest"],
    explanation:
      "Overall hypertrophy stalls when one or more major muscle groups are under-dosed relative to the rest.",
  },
  {
    goal: "Improve Overall Strength",
    primaryMuscles: ["legs", "back", "chest"],
    supportMuscles: ["back", "legs", "shoulders", "arms"],
    explanation:
      "Global strength progress is typically limited by weak support groups that cap force transfer on key lifts.",
  },
];

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getGoalSupportProfile(goal: string): GoalSupportProfile | null {
  const key = normalizeGoal(goal);
  if (!key) return null;
  return (
    GOAL_SUPPORT_PROFILES.find((p) => normalizeGoal(p.goal) === key) ?? null
  );
}

export type SupportGapResult = {
  limitingMuscle: string | null;
  rationale: string | null;
};

function toPositiveNumberOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export function detectLimitingSupportMuscle(params: {
  goal: string;
  volumeByMuscle: Record<string, number>;
}): SupportGapResult {
  const profile = getGoalSupportProfile(params.goal);
  if (!profile) {
    return {
      limitingMuscle: null,
      rationale: null,
    };
  }

  const candidates = profile.supportMuscles
    .map((muscle) => ({
      muscle,
      volume: toPositiveNumberOrZero(params.volumeByMuscle[muscle]),
    }))
    .sort((a, b) => a.volume - b.volume || a.muscle.localeCompare(b.muscle));

  const lowest = candidates[0];
  if (!lowest) {
    return {
      limitingMuscle: null,
      rationale: null,
    };
  }

  return {
    limitingMuscle: lowest.muscle,
    rationale: `${lowest.muscle[0].toUpperCase()}${lowest.muscle.slice(1)} appears to be the lowest-volume support muscle for ${profile.goal}. ${profile.explanation}`,
  };
}
