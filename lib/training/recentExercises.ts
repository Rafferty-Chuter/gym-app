/**
 * The exercises a user did most recently (TR1): the picker's first section,
 * as Hevy's "Recent Exercises". Pure: the caller passes the workout history.
 */

import type { StoredWorkout } from "@/lib/trainingAnalysis";

/** How many recent exercises the picker shows before the full list. OURS: one screen on a phone. */
export const RECENT_EXERCISES_SHOWN = 8;

export type RecentExercise = { name: string; exerciseId?: string; lastAt: string; times: number };

/** Distinct exercises by name, most recent first, with how often each was done. */
export function recentExercises(workouts: readonly StoredWorkout[], limit = RECENT_EXERCISES_SHOWN): RecentExercise[] {
  const byKey = new Map<string, RecentExercise>();
  const sorted = [...workouts].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
  for (const w of sorted) {
    for (const ex of w.exercises ?? []) {
      const name = (ex.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = byKey.get(key);
      if (cur) cur.times += 1;
      else byKey.set(key, { name, ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}), lastAt: w.completedAt, times: 1 });
    }
  }
  return [...byKey.values()].slice(0, limit);
}
