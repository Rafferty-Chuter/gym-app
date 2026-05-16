/**
 * Persisted draft (active) workout so user can leave and resume.
 */

export const ACTIVE_WORKOUT_KEY = "activeWorkout";

/** Fired after save/clear so UI (e.g. resume bar) can refresh in the same tab. */
export const ACTIVE_WORKOUT_CHANGED_EVENT = "gym:activeWorkoutChanged";

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
  /** Bumped on every saveActiveWorkout() — used to detect stale-in-progress sessions. */
  lastSavedAt?: number;
  workoutName: string;
  templateName: string | null;
  exercises: DraftExercise[];
  restTimerByExercise?: Record<
    number,
    {
      timerRunning: boolean;
      restDurationSec: number;
      timerStartedAt?: number;
      timerTargetEndAt?: number;
    }
  >;
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
    const stamped: DraftWorkout = { ...draft, lastSavedAt: Date.now() };
    localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(stamped));
    window.dispatchEvent(new Event(ACTIVE_WORKOUT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Count of sets the user has confirmed (green check) across all exercises. */
export function countConfirmedSets(draft: DraftWorkout | null | undefined): number {
  if (!draft?.exercises) return 0;
  let n = 0;
  for (const ex of draft.exercises) {
    for (const s of ex.sets ?? []) {
      if (s.done === true) n += 1;
    }
  }
  return n;
}

export type SessionLifecycleState =
  | "none"
  | "in-progress"
  | "abandoned-start"
  | "stale-in-progress";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STALE_HOURS = 18;
const ABANDONED_DISCARD_HOURS = 24;

/**
 * Derive the lifecycle state from an active draft. Inputs:
 *   - none → no draft (or no meaningful content)
 *   - in-progress → recent activity, normal resume case
 *   - abandoned-start → ≤1 confirmed set AND idle ≥24h → silent discard
 *   - stale-in-progress → ≥2 confirmed sets AND idle ≥18h → resume modal
 */
export function getSessionLifecycleState(
  draft: DraftWorkout | null | undefined,
  now: number = Date.now()
): SessionLifecycleState {
  if (!draft || !draftHasMeaningfulContent(draft)) return "none";
  const lastActivity = draft.lastSavedAt ?? draft.startedAt;
  const idleMs = Math.max(0, now - lastActivity);
  const confirmed = countConfirmedSets(draft);
  if (idleMs >= ABANDONED_DISCARD_HOURS * HOUR_MS && confirmed <= 1) {
    return "abandoned-start";
  }
  if (idleMs >= STALE_HOURS * HOUR_MS && confirmed >= 2) {
    return "stale-in-progress";
  }
  return "in-progress";
}

/** Human-friendly "N hours/days ago" snapshot of the draft's last activity. */
export function formatIdleDuration(
  draft: DraftWorkout | null | undefined,
  now: number = Date.now()
): string {
  if (!draft) return "";
  const lastActivity = draft.lastSavedAt ?? draft.startedAt;
  const idleMs = Math.max(0, now - lastActivity);
  if (idleMs < HOUR_MS) {
    const mins = Math.max(1, Math.round(idleMs / (60 * 1000)));
    return `${mins} min ago`;
  }
  if (idleMs < DAY_MS) {
    const hours = Math.round(idleMs / HOUR_MS);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(idleMs / DAY_MS);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Strip draft sets (values entered but not confirmed) from an active draft.
 * Used when the user picks "Resume logging" on a stale-session modal —
 * stale drafts may not reflect what the user actually did.
 */
export function stripDraftSets(draft: DraftWorkout): DraftWorkout {
  return {
    ...draft,
    exercises: draft.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) =>
        s.done === true ? s : { weight: "", reps: "", done: false, notes: "" }
      ),
    })),
  };
}

export function clearActiveWorkout(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_WORKOUT_KEY);
    window.dispatchEvent(new Event(ACTIVE_WORKOUT_CHANGED_EVENT));
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
