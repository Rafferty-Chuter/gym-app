/**
 * Shared training analysis utilities.
 * Used by the Coach page and can be reused for AI analysis.
 */

const WORKOUT_HISTORY_KEY = "workoutHistory";

export type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
};

const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  chest: ["bench", "incline", "chest press", "fly"],
  back: ["row", "pulldown", "pull up", "pull-up", "lat"],
  legs: ["squat", "leg press", "hack", "calf", "leg curl", "leg extension", "rdl"],
  shoulders: ["shoulder press", "overhead press", "lateral raise"],
  arms: ["curl", "hammer curl", "tricep", "pushdown", "jm press", "skullcrusher"],
};

export function getWorkoutHistory(): StoredWorkout[] {
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

export function getStats(workouts: StoredWorkout[]) {
  let totalExercises = 0;
  let totalSets = 0;
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      totalExercises += 1;
      totalSets += ex.sets?.length ?? 0;
    }
  }
  return {
    totalWorkouts: workouts.length,
    totalExercises,
    totalSets,
  };
}

export function getWorkoutsFromLast7Days(workouts: StoredWorkout[]): StoredWorkout[] {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - sevenDaysMs;
  return workouts.filter((w) => new Date(w.completedAt).getTime() >= cutoff);
}

export function getMuscleGroupForExercise(exerciseName: string): string | null {
  const name = exerciseName.trim().toLowerCase();
  for (const [group, keywords] of Object.entries(MUSCLE_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => name.includes(kw))) return group;
  }
  return null;
}

export function getVolumeByMuscleGroup(workouts: StoredWorkout[]): Record<string, number> {
  const counts: Record<string, number> = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
  };
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

export function generateFeedback(
  allWorkouts: StoredWorkout[],
  recentWorkouts: StoredWorkout[],
  weeklyVolume: Record<string, number>
): string[] {
  const feedback: string[] = [];

  if (allWorkouts.length === 0) {
    feedback.push("There isn't enough data yet. Log some workouts to get feedback.");
    return feedback;
  }

  const workoutsLast7Days = recentWorkouts.length;
  if (workoutsLast7Days <= 1) {
    feedback.push("Training frequency may be low. Aim for at least 2–3 sessions per week if you can.");
  }

  const chest = weeklyVolume.chest ?? 0;
  const back = weeklyVolume.back ?? 0;
  const legs = weeklyVolume.legs ?? 0;
  const upperTotal = chest + back;

  if (upperTotal > 0 && legs < upperTotal * 0.5) {
    feedback.push("Leg volume is low compared to upper body. Consider adding more squat, hinge, or leg work.");
  }

  if (chest >= 10 && chest <= 20) {
    feedback.push("Chest volume looks reasonable for the week.");
  } else if (chest > 20) {
    feedback.push("Chest volume is on the higher side. Ensure you're recovering well.");
  }

  if (back > 0 && chest > 0 && back > chest * 1.5) {
    feedback.push("Back volume is high relative to chest. Consider balancing push and pull for upper body.");
  }

  if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2 && feedback.length === 0) {
    feedback.push("Your recent training looks consistent. Keep progressing your main lifts.");
  }

  if (feedback.length === 0 && allWorkouts.length > 0) {
    feedback.push("Keep logging workouts. More data will allow better feedback.");
  }

  return feedback;
}
