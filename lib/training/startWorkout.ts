"use client";

/**
 * Starting a session (TR3): the logger reads what to start from
 * sessionStorage on mount, so a routine or an empty workout is queued here
 * and the caller navigates to /workout. The only client io for starting.
 */

import { draftHasMeaningfulContent, getActiveWorkout } from "@/lib/activeWorkout";
import type { WorkoutTemplate } from "@/lib/templateStorage";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { routineExercisesFromWorkout } from "@/lib/training/routine";
import type { WeightUnit } from "@/lib/units";

/** The key the logger reads on mount. */
export const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

/** A session with something logged is in progress. */
export function workoutInProgress(): boolean {
  if (typeof window === "undefined") return false;
  const d = getActiveWorkout();
  return !!d && draftHasMeaningfulContent(d);
}

/** Queue a routine for the logger. */
export function queueRoutine(t: WorkoutTemplate): boolean {
  try {
    sessionStorage.setItem(TEMPLATE_FOR_WORKOUT_KEY, JSON.stringify({ templateId: t.id, templateName: t.name, exercises: t.exercises }));
    return true;
  } catch {
    return false;
  }
}

/** Queue an empty workout for the logger. */
export function queueEmptyWorkout(name = ""): boolean {
  try {
    sessionStorage.setItem(TEMPLATE_FOR_WORKOUT_KEY, JSON.stringify({ emptyWorkout: true, workoutName: name }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Queue a finished workout to do again (TR5): same exercises, sets, weights
 * and reps as planned rows. It is not a routine, so finishing it offers
 * Save as routine rather than Update routine.
 */
export function queueRepeat(w: StoredWorkout, unit: WeightUnit): boolean {
  const exercises = routineExercisesFromWorkout(w, unit);
  if (exercises.length === 0) return false;
  try {
    sessionStorage.setItem(TEMPLATE_FOR_WORKOUT_KEY, JSON.stringify({ templateName: w.name?.trim() || "Workout", exercises }));
    return true;
  } catch {
    return false;
  }
}
