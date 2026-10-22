/**
 * When a workout started (IN1). Sessions logged in the app stamp
 * `completedAt` when they finish; Hevy, Strong and Rep Count imports stamp
 * it at the start. From IN1 every new session also saves `startedAt`, so
 * time-of-day reads (session hour, hours awake) use the start whatever the
 * source. Pure.
 */

/** Longest duration trusted to work a start back from the end. OURS: a stale session finished from Home before IN1 carried the whole gap as its duration. */
export const MAX_SESSION_SEC = 6 * 3600;

type Timed = { completedAt: string; startedAt?: string; durationSec?: number };

/**
 * The session's start as an ISO instant: the saved `startedAt`; for a
 * session saved before IN1, `completedAt` less a plausible `durationSec`;
 * else `completedAt` itself (an import, already the start). Null when
 * `completedAt` is malformed.
 */
export function workoutStartedAt(w: Timed): string | null {
  if (w.startedAt && Number.isFinite(Date.parse(w.startedAt))) return w.startedAt;
  const end = Date.parse(w.completedAt);
  if (!Number.isFinite(end)) return null;
  const d = w.durationSec;
  if (typeof d === "number" && Number.isFinite(d) && d > 0 && d <= MAX_SESSION_SEC) return new Date(end - d * 1000).toISOString();
  return w.completedAt;
}
