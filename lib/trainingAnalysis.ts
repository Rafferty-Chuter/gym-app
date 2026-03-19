/**
 * Shared training analysis utilities.
 * Used by the Coach page and can be reused for AI analysis.
 */

import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";

const WORKOUT_HISTORY_KEY = "workoutHistory";

const SBD_NAMES = ["squat", "bench", "deadlift", "bench press", "squat", "dead lift"];
function isSBD(exerciseName: string): boolean {
  const n = exerciseName.trim().toLowerCase();
  return SBD_NAMES.some((s) => n.includes(s)) || n.includes("bench") || n.includes("squat") || n.includes("deadlift");
}

export type StoredWorkout = {
  completedAt: string;
  name?: string;
  durationSec?: number;
  exercises: { name: string; restSec?: number; sets: { weight: string; reps: string; notes?: string }[] }[];
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

// --- Exercise trend analysis (deterministic, no AI) ---

export type ExerciseTrend = "progressing" | "stable" | "plateau" | "declining";

export type RecentPerformance = {
  completedAt: string;
  weight: number;
  reps: number;
};

export type ExerciseTrendResult = {
  exercise: string;
  trend: ExerciseTrend;
  recentPerformances: RecentPerformance[];
};

const DEFAULT_MAX_SESSIONS = 5;
const MIN_SESSIONS_FOR_PLATEAU = 3;

function performanceBetter(
  a: { weight: number; reps: number },
  b: { weight: number; reps: number }
): boolean {
  return a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);
}

function performanceWorse(
  a: { weight: number; reps: number },
  b: { weight: number; reps: number }
): boolean {
  return a.weight < b.weight || (a.weight === b.weight && a.reps < b.reps);
}

/** Normalize for matching: trim, lowercase, collapse whitespace. */
function exerciseKey(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Get unique exercise names from workouts, using first occurrence as display name.
 */
function getUniqueExerciseNames(workouts: StoredWorkout[]): string[] {
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

/**
 * Deterministic trend analysis per exercise using last 3–5 sessions.
 * Compares best set per session (highest weight, then reps) to classify:
 * progressing, stable, plateau, or declining.
 */
export function getExerciseTrends(
  workouts: StoredWorkout[],
  options?: { maxSessions?: number }
): ExerciseTrendResult[] {
  const maxSessions = Math.min(
    Math.max(options?.maxSessions ?? DEFAULT_MAX_SESSIONS, 3),
    5
  );
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const exerciseNames = getUniqueExerciseNames(sorted);
  const results: ExerciseTrendResult[] = [];

  for (const exerciseName of exerciseNames) {
    const key = exerciseKey(exerciseName);
    const performances: RecentPerformance[] = [];
    for (const w of sorted) {
      const ex = w.exercises?.find((e) => exerciseKey(e.name) === key);
      if (!ex?.sets?.length) continue;
      const best = getBestSet(ex.sets);
      if (!best) continue;
      performances.push({
        completedAt: w.completedAt,
        weight: best.weight,
        reps: best.reps,
      });
      if (performances.length >= maxSessions) break;
    }

    let trend: ExerciseTrend = "stable";
    if (performances.length >= 2) {
      const ordered = [...performances].reverse();
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      if (performanceBetter(last, first)) {
        trend = "progressing";
      } else if (performanceWorse(last, first)) {
        trend = "declining";
      } else {
        let noImprovementCount = 0;
        for (let i = ordered.length - 1; i > 0; i--) {
          if (!performanceBetter(ordered[i], ordered[i - 1])) noImprovementCount += 1;
          else break;
        }
        trend = noImprovementCount >= MIN_SESSIONS_FOR_PLATEAU - 1 ? "plateau" : "stable";
      }
    }

    results.push({
      exercise: exerciseName,
      trend,
      recentPerformances: performances.reverse(),
    });
  }

  return results;
}

/**
 * Format exercise trend results as human-readable progression lines for Coach.
 */
export function formatExerciseTrendsForDisplay(
  trends: ExerciseTrendResult[],
  unit: "kg" | "lb" = "kg"
): string[] {
  const lines: string[] = [];
  for (const { exercise, trend, recentPerformances } of trends) {
    if (recentPerformances.length < 2) continue;
    const n = recentPerformances.length;
    const first = recentPerformances[0];
    const last = recentPerformances[recentPerformances.length - 1];
    const firstStr = `${first.weight} ${unit} × ${first.reps}`;
    const lastStr = `${last.weight} ${unit} × ${last.reps}`;
    if (trend === "progressing") {
      lines.push(`${exercise}: progressing over last ${n} sessions — best set improved from ${firstStr} to ${lastStr}.`);
    } else if (trend === "declining") {
      lines.push(`${exercise}: declining over last ${n} sessions — best set went from ${firstStr} to ${lastStr}. Consider recovery or deload.`);
    } else if (trend === "plateau") {
      lines.push(`${exercise}: plateau over last ${n} sessions (best set ${lastStr}). No improvement recently — try small load or rep progression.`);
    } else {
      lines.push(`${exercise}: stable over last ${n} sessions (best set ${lastStr}).`);
    }
  }
  return lines;
}

function getProgressionFeedback(workouts: StoredWorkout[], unit: "kg" | "lb" = "kg"): string[] {
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

    const prevStr = `${previousBest.weight}${unit} × ${previousBest.reps}`;
    const recentStr = `${recentBest.weight}${unit} × ${recentBest.reps}`;

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
  weeklyVolume: Record<string, number>,
  unit: "kg" | "lb" = "kg",
  focus: TrainingFocus = "General Fitness",
  experienceLevel: ExperienceLevel = "Intermediate"
): CoachFeedbackSections {
  const volume: string[] = [];
  const progression: string[] = [];
  const recommendations: string[] = [];

  if (allWorkouts.length === 0) {
    recommendations.push(
      experienceLevel === "Beginner"
        ? "Log a few workouts to get started — we’ll give you tailored feedback as you go."
        : "There isn't enough data yet. Log some workouts to get feedback."
    );
    return { volume, progression, recommendations };
  }

  const workoutsLast7Days = recentWorkouts.length;
  if (workoutsLast7Days <= 1) {
    if (focus === "General Fitness") {
      recommendations.push("Staying consistent helps. Aim for 2–3 sessions per week when you can.");
    } else if (experienceLevel === "Beginner") {
      recommendations.push("Building a habit is key. Try to get in 2–3 sessions per week when you can.");
    } else {
      recommendations.push("Training frequency may be low. Aim for at least 2–3 sessions per week if you can.");
    }
  }

  const groupLabels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };
  const volumeOrder = ["chest", "back", "legs", "shoulders", "arms"] as const;
  const chest = weeklyVolume.chest ?? 0;
  const back = weeklyVolume.back ?? 0;
  const legs = weeklyVolume.legs ?? 0;
  const upperTotal = chest + back;

  if (focus === "Hypertrophy") {
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      if (sets < 8) {
        volume.push(`${label}: ${sets} sets → low for muscle growth, consider increasing volume`);
      } else if (sets <= 20) {
        volume.push(`${label}: ${sets} sets → good range for hypertrophy`);
      } else {
        volume.push(`${label}: ${sets} sets → on the higher side; ensure recovery`);
      }
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg volume is low vs upper body. For balance and growth, add more squat, hinge, or leg work.");
    }
    if (back > 0 && chest > 0 && back > chest * 1.5) {
      volume.push("Back volume is high relative to chest. Balancing push and pull supports hypertrophy.");
    }
  } else if (focus === "Powerlifting") {
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      volume.push(`${label}: ${sets} sets this week`);
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg volume is low vs upper body. Squat and deadlift frequency matters for powerlifting.");
    }
  } else if (focus === "General Fitness") {
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      volume.push(`${label}: ${sets} sets this week`);
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg work is a bit low vs upper body. Adding some squat or hinge work can help balance.");
    }
  } else {
    // General Strength
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
  }

  const exerciseTrends = getExerciseTrends(allWorkouts, { maxSessions: 5 });
  const progressionLines = formatExerciseTrendsForDisplay(exerciseTrends, unit);
  if (progressionLines.length > 0) {
    if (focus === "Powerlifting") {
      const sbd: string[] = [];
      const other: string[] = [];
      for (const line of progressionLines) {
        const name = line.split(":")[0]?.trim() ?? "";
        if (isSBD(name)) sbd.push(line);
        else other.push(line);
      }
      if (sbd.length > 0) {
        progression.push("Squat, bench, deadlift: progression is key for powerlifting.");
        progression.push(...sbd);
      }
      progression.push(...other);
    } else if (focus === "Hypertrophy") {
      progression.push(...progressionLines);
      progression.push("For hypertrophy, both volume and progression matter.");
    } else if (focus === "General Fitness") {
      progression.push(...progressionLines);
      progression.push("Any progression is a win; consistency matters most.");
    } else {
      progression.push(...progressionLines);
    }
  }

  if (allWorkouts.length > 0 && recommendations.length === 0) {
    const beginnerTail = experienceLevel === "Beginner" ? " Take it at your own pace." : "";
    if (focus === "Hypertrophy") {
      recommendations.push("For hypertrophy, aim for balanced volume across muscle groups and progressive overload." + beginnerTail);
    } else if (focus === "Powerlifting") {
      recommendations.push("For powerlifting, prioritize squat, bench, and deadlift performance; support with accessory volume." + beginnerTail);
    } else if (focus === "General Strength") {
      if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2) {
        recommendations.push("Your recent training looks consistent. Keep progressing on compound lifts and volume." + beginnerTail);
      } else {
        recommendations.push("Keep logging workouts. Compound lifts and reasonable volume support general strength." + beginnerTail);
      }
    } else {
      if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2) {
        recommendations.push("Your routine looks consistent and balanced. Keep it up." + beginnerTail);
      } else {
        recommendations.push("Staying consistent and keeping a balanced routine is what matters most." + beginnerTail);
      }
    }
  }

  return { volume, progression, recommendations };
}
