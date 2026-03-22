import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { PriorityGoal } from "@/lib/priorityGoal";

export type UserProfile = {
  goals: {
    primaryGoal: string;
    secondaryGoals: string[];
    priorityExercises: string[];
    priorityMuscles: string[];
    phase: "cut" | "maintain" | "bulk" | "strength_block" | "peaking";
  };
  constraints: {
    daysPerWeekAvailable: number;
    sessionLengthMinutes: number;
    equipmentAvailable: string[];
    excludedExercises: string[];
    injuriesOrLimitations: string[];
  };
  training: {
    experienceLevel: ExperienceLevel;
    preferredSplit: "full_body" | "upper_lower" | "push_pull_legs" | "other";
    recoveryCapacity: "low" | "medium" | "high";
  };
};

const STORAGE_KEY = "userCoachingProfile";

function uniqueLower(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function profileFromGoal(goal: PriorityGoal): {
  primaryGoal: string;
  priorityExercises: string[];
  priorityMuscles: string[];
} {
  if (goal === "Increase Bench Press") {
    return {
      primaryGoal: goal,
      priorityExercises: ["Bench Press", "Incline Bench Press"],
      priorityMuscles: ["chest", "triceps", "shoulders"],
    };
  }
  if (goal === "Increase Squat") {
    return {
      primaryGoal: goal,
      priorityExercises: ["Squat", "Front Squat"],
      priorityMuscles: ["legs", "glutes"],
    };
  }
  if (goal === "Increase Deadlift") {
    return {
      primaryGoal: goal,
      priorityExercises: ["Deadlift", "Romanian Deadlift"],
      priorityMuscles: ["back", "legs", "glutes"],
    };
  }
  if (goal === "Build Chest") {
    return {
      primaryGoal: goal,
      priorityExercises: ["Bench Press", "Incline Bench Press", "Chest Press"],
      priorityMuscles: ["chest"],
    };
  }
  if (goal === "Build Back") {
    return {
      primaryGoal: goal,
      priorityExercises: ["Barbell Row", "Lat Pulldown", "Pull Up"],
      priorityMuscles: ["back"],
    };
  }
  if (goal === "Build Overall Muscle") {
    return {
      primaryGoal: goal,
      priorityExercises: [],
      priorityMuscles: ["chest", "back", "legs", "shoulders", "arms"],
    };
  }
  return {
    primaryGoal: goal,
    priorityExercises: ["Squat", "Bench Press", "Deadlift"],
    priorityMuscles: ["chest", "back", "legs"],
  };
}

export function createDefaultUserProfile(
  focus: TrainingFocus,
  experienceLevel: ExperienceLevel,
  goal: PriorityGoal
): UserProfile {
  const goalDefaults = profileFromGoal(goal);
  return {
    goals: {
      primaryGoal: goalDefaults.primaryGoal,
      secondaryGoals: focus === "General Fitness" ? ["Consistency"] : [],
      priorityExercises: goalDefaults.priorityExercises,
      priorityMuscles: goalDefaults.priorityMuscles,
      phase: "maintain",
    },
    constraints: {
      daysPerWeekAvailable: 3,
      sessionLengthMinutes: 60,
      equipmentAvailable: ["barbell", "dumbbell", "machine"],
      excludedExercises: [],
      injuriesOrLimitations: [],
    },
    training: {
      experienceLevel,
      preferredSplit: "full_body",
      recoveryCapacity: experienceLevel === "Beginner" ? "medium" : "high",
    },
  };
}

export function getStoredUserProfile(
  focus: TrainingFocus,
  experienceLevel: ExperienceLevel,
  goal: PriorityGoal
): UserProfile {
  const fallback = createDefaultUserProfile(focus, experienceLevel, goal);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      goals: {
        primaryGoal: parsed.goals?.primaryGoal ?? fallback.goals.primaryGoal,
        secondaryGoals: uniqueLower(parsed.goals?.secondaryGoals ?? fallback.goals.secondaryGoals),
        priorityExercises: uniqueLower(parsed.goals?.priorityExercises ?? fallback.goals.priorityExercises),
        priorityMuscles: uniqueLower(parsed.goals?.priorityMuscles ?? fallback.goals.priorityMuscles),
        phase: parsed.goals?.phase ?? fallback.goals.phase,
      },
      constraints: {
        daysPerWeekAvailable: parsed.constraints?.daysPerWeekAvailable ?? fallback.constraints.daysPerWeekAvailable,
        sessionLengthMinutes: parsed.constraints?.sessionLengthMinutes ?? fallback.constraints.sessionLengthMinutes,
        equipmentAvailable: uniqueLower(parsed.constraints?.equipmentAvailable ?? fallback.constraints.equipmentAvailable),
        excludedExercises: uniqueLower(parsed.constraints?.excludedExercises ?? fallback.constraints.excludedExercises),
        injuriesOrLimitations: uniqueLower(parsed.constraints?.injuriesOrLimitations ?? fallback.constraints.injuriesOrLimitations),
      },
      training: {
        experienceLevel: parsed.training?.experienceLevel ?? fallback.training.experienceLevel,
        preferredSplit: parsed.training?.preferredSplit ?? fallback.training.preferredSplit,
        recoveryCapacity: parsed.training?.recoveryCapacity ?? fallback.training.recoveryCapacity,
      },
    };
  } catch {
    return fallback;
  }
}

