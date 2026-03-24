import type { UserProfile } from "@/lib/userProfile";
import {
  getTrainingInsights,
  getExerciseTrends,
  getWorkoutHistory,
  type StoredWorkout,
} from "@/lib/trainingAnalysis";
import { buildCoachStructuredAnalysis } from "@/lib/coachStructuredAnalysis";
import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { PriorityGoal } from "@/lib/priorityGoal";

export type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: Array<{
    exerciseId?: string;
    name: string;
    targetSets?: number;
    restSec?: number;
  }>;
};

export type CoachingContext = {
  profile: UserProfile | null;
  recentWorkouts: StoredWorkout[];
  templates: WorkoutTemplate[];
  /** Compact coach review lines for assistant prompt (mirrors Coach tab, avoids re-deriving on server). */
  coachReviewBrief?: {
    keyFocus: string | null;
    nextSessionTitle: string | null;
    topSuggestions: string[];
    whatsGoingWell: string[];
  };
  inferred: {
    split?: string;
    weakMuscles: string[];
    progressingExercises: string[];
    plateauExercises: string[];
    avgRIR?: number;
    volumeByMuscle: Record<string, number>;
    frequency: number;
    coachInsight?: string | null;
  };
};

const TEMPLATE_STORAGE_KEY = "workoutTemplates";

function readTemplates(): WorkoutTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t, i) => {
        if (!t || typeof t !== "object") return null;
        const obj = t as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : `Template ${i + 1}`;
        const exercisesRaw = Array.isArray(obj.exercises) ? obj.exercises : [];
        const exercises = exercisesRaw
          .map((ex) => {
            if (!ex || typeof ex !== "object") return null;
            const e = ex as Record<string, unknown>;
            const exName = typeof e.name === "string" ? e.name.trim() : "";
            if (!exName) return null;
            return {
              ...(typeof e.exerciseId === "string" && e.exerciseId.trim()
                ? { exerciseId: e.exerciseId.trim() }
                : {}),
              name: exName,
              ...(Number.isFinite(Number(e.targetSets)) ? { targetSets: Number(e.targetSets) } : {}),
              ...(Number.isFinite(Number(e.restSec)) ? { restSec: Number(e.restSec) } : {}),
            };
          })
          .filter(Boolean) as WorkoutTemplate["exercises"];
        const id =
          typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `tpl_${i}_${name.toLowerCase()}`;
        return { id, name, exercises };
      })
      .filter(Boolean) as WorkoutTemplate[];
  } catch {
    return [];
  }
}

function inferSplitFromFrequency(frequency: number): string {
  if (frequency <= 2) return "full_body";
  if (frequency <= 4) return "upper_lower";
  if (frequency <= 6) return "push_pull_legs";
  return "mixed";
}

export function buildCoachingContext(params: {
  profile: UserProfile | null;
  focus: TrainingFocus;
  experienceLevel: ExperienceLevel;
  goal: PriorityGoal;
  unit: "kg" | "lb";
}): CoachingContext {
  const workouts = getWorkoutHistory();
  const recentWorkouts = [...workouts]
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 10);
  const templates = readTemplates();
  const insights = getTrainingInsights(workouts);
  const trends = getExerciseTrends(workouts, { maxSessions: 5 });
  const coach = buildCoachStructuredAnalysis(workouts, {
    focus: params.focus,
    experienceLevel: params.experienceLevel,
    goal: params.goal,
    unit: params.unit,
  });
  const weakMuscles = Object.entries(insights.weeklyVolume ?? {})
    .filter(([, sets]) => sets > 0 && sets < 8)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([group]) => group);
  const progressingExercises = trends
    .filter((t) => t.trend === "progressing")
    .slice(0, 4)
    .map((t) => t.exercise);
  const plateauExercises = trends
    .filter((t) => t.trend === "plateau" || t.trend === "declining")
    .slice(0, 4)
    .map((t) => t.exercise);

  return {
    profile: params.profile,
    recentWorkouts,
    templates,
    coachReviewBrief: {
      keyFocus: coach.keyFocus,
      nextSessionTitle: coach.nextSessionAdjustmentPlan?.title ?? null,
      topSuggestions: coach.actionableSuggestions.slice(0, 4),
      whatsGoingWell: coach.whatsGoingWell.slice(0, 3),
    },
    inferred: {
      split: inferSplitFromFrequency(insights.frequency),
      weakMuscles,
      progressingExercises,
      plateauExercises,
      avgRIR: insights.averageRIR,
      volumeByMuscle: insights.weeklyVolume,
      frequency: insights.frequency,
      coachInsight: coach.keyFocus,
    },
  };
}
