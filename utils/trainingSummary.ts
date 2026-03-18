const WORKOUT_HISTORY_KEY = "workoutHistory";

export type StoredWorkout = {
  completedAt: string;
  name?: string;
  durationSec?: number;
  exercises: { name: string; sets: { weight: string; reps: string; notes?: string }[] }[];
};

const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  chest: ["bench", "incline", "chest press", "fly"],
  back: ["row", "pulldown", "pull up", "pull-up", "lat"],
  legs: ["squat", "leg press", "hack", "calf", "leg curl", "leg extension", "rdl"],
  shoulders: ["shoulder press", "overhead press", "lateral raise"],
  arms: ["curl", "hammer curl", "tricep", "pushdown", "jm press", "skullcrusher"],
};

export type WeeklyVolume = Record<string, number>;

const DEFAULT_WEEKLY_VOLUME: WeeklyVolume = {
  chest: 0,
  back: 0,
  legs: 0,
  shoulders: 0,
  arms: 0,
};

export type TrainingSummary = {
  totalWorkouts: number;
  totalExercises: number;
  totalSets: number;
  weeklyVolume: WeeklyVolume;
  recentWorkouts: StoredWorkout[];
};

function getWorkoutHistory(): StoredWorkout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getWorkoutsFromLast7Days(workouts: StoredWorkout[]): StoredWorkout[] {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - sevenDaysMs;
  return workouts.filter((w) => new Date(w.completedAt).getTime() >= cutoff);
}

function getMuscleGroupForExercise(exerciseName: string): string | null {
  const name = exerciseName.trim().toLowerCase();
  for (const [group, keywords] of Object.entries(MUSCLE_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => name.includes(kw))) return group;
  }
  return null;
}

function getVolumeByMuscleGroup(workouts: StoredWorkout[]): WeeklyVolume {
  const counts = { ...DEFAULT_WEEKLY_VOLUME };
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      const group = getMuscleGroupForExercise(ex.name);
      if (group && group in counts) {
        counts[group] += ex.sets?.length ?? 0;
      }
    }
  }
  return counts;
}

/**
 * Reads workoutHistory from localStorage and returns a summary with
 * total counts, weekly volume by muscle group, and the last 5 workouts.
 * Safe to call in browser only; returns default values when localStorage is unavailable.
 */
export function getTrainingSummary(): TrainingSummary {
  const workouts = getWorkoutHistory();

  let totalExercises = 0;
  let totalSets = 0;
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      totalExercises += 1;
      totalSets += ex.sets?.length ?? 0;
    }
  }

  const recentWorkouts = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  ).slice(0, 5);

  const last7Days = getWorkoutsFromLast7Days(workouts);
  const weeklyVolume = getVolumeByMuscleGroup(last7Days);

  return {
    totalWorkouts: workouts.length,
    totalExercises,
    totalSets,
    weeklyVolume,
    recentWorkouts,
  };
}
