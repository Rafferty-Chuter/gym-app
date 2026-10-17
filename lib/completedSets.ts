/**
 * Set helpers shared by the logger, history, volume and the e1RM engines.
 *
 * Set types (M5 T1, research B §8 data model): `working` (default when
 * absent), `warmup`, `drop` and `failure`.
 *   - Warm-ups never count: not toward volume, e1RM or PRs.
 *   - Drop sets count as hard sets for volume but not for e1RM (the load
 *     was chosen by fatigue, not by capacity).
 *   - Failure sets count for both and imply RIR 0.
 * A set with no `type` is a working set, so stored history needs no migration.
 */

export type SetType = "working" | "warmup" | "drop" | "failure";

/** The order the logger cycles through on tap: working → warm-up → drop → failure → working. */
export const SET_TYPE_CYCLE: readonly SetType[] = ["working", "warmup", "drop", "failure"];

/** One-letter marks for the set number column (Hevy's "W"). Working sets show their number. */
export const SET_TYPE_MARK: Record<SetType, string> = { working: "", warmup: "W", drop: "D", failure: "F" };

export const SET_TYPE_LABEL: Record<SetType, string> = { working: "Working set", warmup: "Warm-up", drop: "Drop set", failure: "To failure" };

export type LoggedSetLike = {
  weight?: string | number | null;
  reps?: string | number | null;
  notes?: string | null;
  rir?: number | null;
  type?: SetType | string | null;
};

function parseMetric(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** The set's type, `working` when absent or unknown. */
export function setTypeOf(set: LoggedSetLike | null | undefined): SetType {
  const t = set?.type;
  return t === "warmup" || t === "drop" || t === "failure" ? t : "working";
}

export function nextSetType(current: SetType): SetType {
  const i = SET_TYPE_CYCLE.indexOf(current);
  return SET_TYPE_CYCLE[(i + 1) % SET_TYPE_CYCLE.length];
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

/** Every completed set, warm-ups included (what was done). */
export function getCompletedLoggedSets<T extends LoggedSetLike>(sets: T[] | null | undefined): T[] {
  if (!Array.isArray(sets)) return [];
  return sets.filter((s) => isCompletedLoggedSet(s));
}

export function countCompletedLoggedSets(sets: LoggedSetLike[] | null | undefined): number {
  return getCompletedLoggedSets(sets).length;
}

/** Completed sets that count toward volume: working, drop and failure. Warm-ups are out. */
export function getHardSets<T extends LoggedSetLike>(sets: T[] | null | undefined): T[] {
  return getCompletedLoggedSets(sets).filter((s) => setTypeOf(s) !== "warmup");
}

export function countHardSets(sets: LoggedSetLike[] | null | undefined): number {
  return getHardSets(sets).length;
}

/** Completed sets that may feed e1RM and PRs: working and failure only. */
export function getE1rmSets<T extends LoggedSetLike>(sets: T[] | null | undefined): T[] {
  return getCompletedLoggedSets(sets).filter((s) => {
    const t = setTypeOf(s);
    return t === "working" || t === "failure";
  });
}
