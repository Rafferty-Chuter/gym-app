"use client";

/**
 * Starting a session (TR3): the logger reads what to start from
 * sessionStorage on mount, so a routine or an empty workout is queued here
 * and the caller navigates to /workout. The only client io for starting.
 */

import { draftHasMeaningfulContent, getActiveWorkout } from "@/lib/activeWorkout";
import type { WorkoutTemplate } from "@/lib/templateStorage";

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
