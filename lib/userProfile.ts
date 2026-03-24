import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { PriorityGoal } from "@/lib/priorityGoal";

export type UserProfile = {
  goal: string;
  trainingDaysAvailable: number;
  equipment: string[];
  injuries?: string[];
  availableSessionTime?: number;
};

const STORAGE_KEY = "userCoachingProfile";

function uniqueLower(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

export function createDefaultUserProfile(
  _focus: TrainingFocus,
  _experienceLevel: ExperienceLevel,
  goal: PriorityGoal
): UserProfile {
  return {
    goal,
    trainingDaysAvailable: 3,
    equipment: ["barbell", "dumbbell", "machine"],
    injuries: [],
    availableSessionTime: 60,
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
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const legacy = parsed as {
      goals?: { primaryGoal?: string };
      constraints?: {
        daysPerWeekAvailable?: number;
        equipmentAvailable?: string[];
        injuriesOrLimitations?: string[];
        sessionLengthMinutes?: number;
      };
    };
    return {
      goal:
        (typeof parsed.goal === "string" ? parsed.goal : legacy.goals?.primaryGoal) ??
        fallback.goal,
      trainingDaysAvailable:
        (typeof parsed.trainingDaysAvailable === "number"
          ? parsed.trainingDaysAvailable
          : legacy.constraints?.daysPerWeekAvailable) ?? fallback.trainingDaysAvailable,
      equipment: uniqueLower(
        (Array.isArray(parsed.equipment) ? (parsed.equipment as string[]) : legacy.constraints?.equipmentAvailable) ??
          fallback.equipment
      ),
      injuries: uniqueLower(
        (Array.isArray(parsed.injuries) ? (parsed.injuries as string[]) : legacy.constraints?.injuriesOrLimitations) ??
          fallback.injuries ??
          []
      ),
      availableSessionTime:
        (typeof parsed.availableSessionTime === "number"
          ? parsed.availableSessionTime
          : legacy.constraints?.sessionLengthMinutes) ?? fallback.availableSessionTime,
    };
  } catch {
    return fallback;
  }
}

