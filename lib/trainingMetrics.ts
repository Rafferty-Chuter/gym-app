import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { resolveLoggedExerciseMeta } from "@/lib/exerciseLibrary";

const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  chest: ["bench", "incline", "chest press", "fly"],
  back: [
    "row",
    "t-bar row",
    "seated cable row",
    "chest-supported row",
    "chest supported row",
    "pulldown",
    "lat pulldown",
    "pull up",
    "pull-up",
    "pullup",
    "lat",
  ],
  legs: ["squat", "leg press", "hack", "calf", "leg curl", "leg extension", "rdl"],
  shoulders: ["shoulder press", "overhead press", "lateral raise"],
  arms: ["curl", "hammer curl", "tricep", "pushdown", "jm press", "skullcrusher"],
};

/**
 * Normalize exercise names for consistent matching across sessions.
 */
export function exerciseKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Get unique exercise names from workouts, using first occurrence as display name.
 */
export function getUniqueExerciseNames(workouts: StoredWorkout[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const name = ex.name?.trim();
      if (!name) continue;
      const key = exerciseKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
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
  const meta = resolveLoggedExerciseMeta({ name: exerciseName });
  if (meta) {
    const pri = meta.primaryMuscles.map((m) => m.toLowerCase());
    const sec = meta.secondaryMuscles.map((m) => m.toLowerCase());
    const all = [...pri, ...sec];
    if (all.some((m) => m.includes("chest") || m.includes("pec"))) return "chest";
    if (
      all.some(
        (m) =>
          m.includes("lat") ||
          m.includes("upper back") ||
          m.includes("rear delt") ||
          m === "back"
      )
    )
      return "back";
    if (
      all.some(
        (m) =>
          m.includes("quad") ||
          m.includes("glute") ||
          m.includes("hamstring") ||
          m.includes("calf")
      )
    )
      return "legs";
    if (all.some((m) => m.includes("shoulder") || m.includes("delt"))) return "shoulders";
    if (all.some((m) => m.includes("tricep") || m.includes("bicep") || m.includes("forearm")))
      return "arms";
  }
  const name = exerciseName.trim().toLowerCase();
  for (const [group, keywords] of Object.entries(MUSCLE_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => name.includes(kw))) return group;
  }
  return null;
}

export function getMuscleGroupForLoggedExercise(exercise: {
  exerciseId?: string;
  name: string;
}): string | null {
  const byMeta = resolveLoggedExerciseMeta(exercise);
  if (byMeta) return getMuscleGroupForExercise(byMeta.name);
  return getMuscleGroupForExercise(exercise.name);
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
      const group = getMuscleGroupForLoggedExercise(ex);
      if (group && group in counts) {
        counts[group] += ex.sets?.length ?? 0;
      }
    }
  }
  return counts;
}

/** Best set = highest weight; if equal, highest reps. */
export function getBestSet(
  sets: { weight: string; reps: string }[]
): { weight: number; reps: number } | null {
  if (!sets?.length) return null;
  let best = { weight: 0, reps: 0 };
  for (const s of sets) {
    const w = parseFloat(String(s?.weight ?? 0)) || 0;
    const r = parseFloat(String(s?.reps ?? 0)) || 0;
    if (w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  }
  return best.weight > 0 || best.reps > 0 ? best : null;
}

/**
 * Estimate 1RM using Epley formula: 1RM = weight * (1 + reps/30)
 * Deterministic and safe for non-positive inputs.
 */
export function estimateE1RM(weight: number, reps: number): number {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  const est = w * (1 + r / 30);
  // Keep output stable for stringification.
  return Number(est.toFixed(1));
}

export type ExerciseSessionPerformance = {
  completedAt: string;
  weight: number;
  reps: number;
  e1rm: number;
};

export type ExerciseMetrics = {
  exercise: string;
  sessionsTracked: number;
  recentPerformances: ExerciseSessionPerformance[];
  recentE1RMs: number[];
  firstE1RM: number;
  lastE1RM: number;
  averageE1RM: number;
  bestE1RM: number;
  exposuresLast7Days: number;
  exposuresLast28Days: number;
  averageExposuresPerWeekLast4Weeks: number;
  frequencyLast28Days: number;
  daysSinceLastPerformed: number | null;
  averageHardSetsPerExposure: number;
};

/**
 * Deterministic per-exercise metrics from workout history.
 * - Uses best set per session (highest weight, then reps)
 * - Estimates e1RM via Epley (weight * (1 + reps/30))
 * - Returns recent session data oldest -> newest
 */
export function getExerciseMetrics(
  workouts: StoredWorkout[],
  exerciseName: string,
  options?: { maxSessions?: number }
): ExerciseMetrics {
  const maxSessions = Math.min(Math.max(options?.maxSessions ?? 5, 1), 12);
  const label = exerciseName.trim() || "Exercise";
  const key = exerciseKey(exerciseName);

  const sortedDesc = [...(workouts ?? [])].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  const newestPerformances: ExerciseSessionPerformance[] = [];
  for (const w of sortedDesc) {
    const ex = w.exercises?.find((e) => exerciseKey(e.name) === key);
    if (!ex?.sets?.length) continue;
    const best = getBestSet(ex.sets);
    if (!best) continue;
    newestPerformances.push({
      completedAt: w.completedAt,
      weight: best.weight,
      reps: best.reps,
      e1rm: estimateE1RM(best.weight, best.reps),
    });
    if (newestPerformances.length >= maxSessions) break;
  }

  const recentPerformances = newestPerformances.reverse();
  const recentE1RMs = recentPerformances.map((p) => p.e1rm);
  const sessionsTracked = recentPerformances.length;
  const firstE1RM = recentE1RMs[0] ?? 0;
  const lastE1RM = recentE1RMs[recentE1RMs.length - 1] ?? 0;
  const bestE1RM = recentE1RMs.length ? Math.max(...recentE1RMs) : 0;
  const averageE1RM = recentE1RMs.length
    ? Number((recentE1RMs.reduce((sum, n) => sum + n, 0) / recentE1RMs.length).toFixed(1))
    : 0;

  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const twentyEightDaysMs = 28 * 24 * 60 * 60 * 1000;
  const cutoff7Ms = nowMs - sevenDaysMs;
  const cutoffMs = nowMs - twentyEightDaysMs;
  let exposuresLast7Days = 0;
  let exposuresLast28Days = 0;
  let hardSetsLast28Days = 0;
  for (const w of workouts ?? []) {
    const wMs = new Date(w.completedAt).getTime();
    if (!Number.isFinite(wMs) || wMs < cutoffMs) continue;
    const matched = (w.exercises ?? []).find((e) => exerciseKey(e.name) === key);
    if (!matched) continue;
    exposuresLast28Days += 1;
    hardSetsLast28Days += matched.sets?.length ?? 0;
    if (wMs >= cutoff7Ms) exposuresLast7Days += 1;
  }
  const averageExposuresPerWeekLast4Weeks = Number((exposuresLast28Days / 4).toFixed(2));
  const averageHardSetsPerExposure =
    exposuresLast28Days > 0
      ? Number((hardSetsLast28Days / exposuresLast28Days).toFixed(2))
      : 0;

  const lastPerformedAt = newestPerformances[0]?.completedAt;
  const daysSinceLastPerformed =
    lastPerformedAt != null
      ? Math.max(0, Math.floor((nowMs - new Date(lastPerformedAt).getTime()) / (24 * 60 * 60 * 1000)))
      : null;

  return {
    exercise: label,
    sessionsTracked,
    recentPerformances,
    recentE1RMs,
    firstE1RM,
    lastE1RM,
    averageE1RM,
    bestE1RM,
    exposuresLast7Days,
    exposuresLast28Days,
    averageExposuresPerWeekLast4Weeks,
    frequencyLast28Days: exposuresLast28Days,
    daysSinceLastPerformed,
    averageHardSetsPerExposure,
  };
}

