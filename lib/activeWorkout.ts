/**
 * Persisted draft (active) workout so user can leave and resume.
 */

export const ACTIVE_WORKOUT_KEY = "activeWorkout";

export type DraftExercise = {
  id: number;
  exerciseId?: string;
  name: string;
  sets: { weight: string; reps: string; done?: boolean; notes?: string; rir?: number }[];
  targetSets?: number;
  restSec: number;
};

export type DraftWorkout = {
  startedAt: number;
  workoutName: string;
  templateName: string | null;
  exercises: DraftExercise[];
};

export function getActiveWorkout(): DraftWorkout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as DraftWorkout).exercises))
      return null;
    const d = parsed as DraftWorkout;
    if (
      typeof d.startedAt !== "number" ||
      typeof d.workoutName !== "string" ||
      !Array.isArray(d.exercises)
    )
      return null;
    return d;
  } catch {
    return null;
  }
}

export function saveActiveWorkout(draft: DraftWorkout): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearActiveWorkout(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_WORKOUT_KEY);
  } catch {
    /* ignore */
  }
}

/** True if there is a draft worth resuming (exercises, name, or template context). */
export function hasActiveWorkout(): boolean {
  const w = getActiveWorkout();
  if (!w) return false;
  return (
    w.exercises.length > 0 ||
    w.workoutName.trim().length > 0 ||
    Boolean(w.templateName && String(w.templateName).trim().length > 0)
  );
}

export function draftHasMeaningfulContent(d: DraftWorkout): boolean {
  return (
    d.exercises.length > 0 ||
    d.workoutName.trim().length > 0 ||
    Boolean(d.templateName && String(d.templateName).trim().length > 0)
  );
}
