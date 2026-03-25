export type LoggedSetLike = {
  weight?: string | number | null;
  reps?: string | number | null;
  notes?: string | null;
  rir?: number | null;
};

function parseMetric(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * A completed logged set must have a valid reps value (> 0).
 * Weight may be blank for bodyweight-style rows.
 */
export function isCompletedLoggedSet(set: LoggedSetLike | null | undefined): boolean {
  if (!set || typeof set !== "object") return false;
  const reps = parseMetric(set.reps);
  return reps != null && reps > 0;
}

export function getCompletedLoggedSets<T extends LoggedSetLike>(sets: T[] | null | undefined): T[] {
  if (!Array.isArray(sets)) return [];
  return sets.filter((s) => isCompletedLoggedSet(s));
}

export function countCompletedLoggedSets(sets: LoggedSetLike[] | null | undefined): number {
  return getCompletedLoggedSets(sets).length;
}

