/**
 * Shared training analysis utilities.
 * Used by the Coach page and can be reused for AI analysis.
 */

const WORKOUT_HISTORY_KEY = "workoutHistory";

export type StoredWorkout = {
  completedAt: string;
  name?: string;
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

/** Best set = highest weight; if equal, highest reps. */
function getBestSet(sets: { weight: string; reps: string }[]): { weight: number; reps: number } | null {
  if (!sets?.length) return null;
  let best = { weight: 0, reps: 0 };
  for (const s of sets) {
    const w = parseFloat(String(s?.weight ?? 0)) || 0;
    const r = parseFloat(String(s?.reps ?? 0)) || 0;
    if (w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  }
  return best.weight > 0 || best.reps > 0 ? best : null;
}

function getProgressionFeedback(workouts: StoredWorkout[]): string[] {
  const lines: string[] = [];
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const recent = sorted[0];
  const previous = sorted[1];
  if (!recent?.exercises?.length || !previous?.exercises?.length) return lines;

  const prevByName: Record<string, { name: string; sets: { weight: string; reps: string }[] }> = {};
  for (const ex of previous.exercises) {
    const key = ex.name?.trim().toLowerCase() ?? "";
    if (key && !prevByName[key]) prevByName[key] = ex;
  }

  for (const ex of recent.exercises) {
    const name = ex.name?.trim() || "Exercise";
    const key = name.toLowerCase();
    const prevEx = prevByName[key];
    if (!prevEx?.sets?.length) continue;

    const recentBest = getBestSet(ex.sets ?? []);
    const previousBest = getBestSet(prevEx.sets ?? []);
    if (!recentBest || !previousBest) continue;

    const prevStr = `${previousBest.weight}kg × ${previousBest.reps}`;
    const recentStr = `${recentBest.weight}kg × ${recentBest.reps}`;

    if (recentBest.weight > previousBest.weight || (recentBest.weight === previousBest.weight && recentBest.reps > previousBest.reps)) {
      lines.push(`${name}: improved from ${prevStr} to ${recentStr}. Progressing well.`);
    } else if (recentBest.weight === previousBest.weight && recentBest.reps === previousBest.reps) {
      lines.push(`${name}: unchanged (${recentStr}). Try adding 1 rep next session.`);
    } else {
      lines.push(`${name}: declined slightly. Maintain weight, check recovery.`);
    }
  }

  return lines;
}

export type CoachFeedbackSections = {
  volume: string[];
  progression: string[];
  recommendations: string[];
};

export function generateFeedback(
  allWorkouts: StoredWorkout[],
  recentWorkouts: StoredWorkout[],
  weeklyVolume: Record<string, number>
): CoachFeedbackSections {
  const volume: string[] = [];
  const progression: string[] = [];
  const recommendations: string[] = [];

  if (allWorkouts.length === 0) {
    recommendations.push("There isn't enough data yet. Log some workouts to get feedback.");
    return { volume, progression, recommendations };
  }

  const workoutsLast7Days = recentWorkouts.length;
  if (workoutsLast7Days <= 1) {
    recommendations.push("Training frequency may be low. Aim for at least 2–3 sessions per week if you can.");
  }

  const groupLabels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };
  const volumeOrder = ["chest", "back", "legs", "shoulders", "arms"] as const;
  for (const group of volumeOrder) {
    const sets = weeklyVolume[group] ?? 0;
    const label = groupLabels[group];
    if (sets < 8) {
      volume.push(`${label}: ${sets} sets → low, consider increasing volume`);
    } else if (sets <= 20) {
      volume.push(`${label}: ${sets} sets → good range`);
    } else {
      volume.push(`${label}: ${sets} sets → slightly high, monitor recovery`);
    }
  }

  const chest = weeklyVolume.chest ?? 0;
  const back = weeklyVolume.back ?? 0;
  const legs = weeklyVolume.legs ?? 0;
  const upperTotal = chest + back;

  if (upperTotal > 0 && legs < upperTotal * 0.5) {
    volume.push("Leg volume is low compared to upper body. Consider adding more squat, hinge, or leg work.");
  }

  if (chest >= 10 && chest <= 20) {
    volume.push("Chest volume looks reasonable for the week.");
  } else if (chest > 20) {
    volume.push("Chest volume is on the higher side. Ensure you're recovering well.");
  }

  if (back > 0 && chest > 0 && back > chest * 1.5) {
    volume.push("Back volume is high relative to chest. Consider balancing push and pull for upper body.");
  }

  const progressionLines = getProgressionFeedback(allWorkouts);
  if (progressionLines.length > 0) {
    progression.push(...progressionLines);
  }

  if (allWorkouts.length > 0 && recommendations.length === 0) {
    if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2) {
      recommendations.push("Your recent training looks consistent. Keep progressing your main lifts.");
    } else {
      recommendations.push("Keep logging workouts. More data will allow better feedback.");
    }
  }

  return { volume, progression, recommendations };
}
