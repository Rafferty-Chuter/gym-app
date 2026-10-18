/**
 * What a finished workout added up to (TR4): the stats line, each
 * exercise's best set and the records it set, as Hevy's "Workout complete"
 * and Strong's history cards. Pure: callers pass the workout and the
 * history.
 *
 * Weights are read in the stored unit. Workout history is converted in
 * place when the display unit changes (`lib/unit-preference.tsx`), so every
 * stored weight is already in the user's unit and callers only label it.
 */

import { getE1rmSets, getHardSets, setTypeOf, type LoggedSetLike } from "@/lib/completedSets";
import { exerciseIdentity } from "@/lib/exerciseLibrary";
import { estimateE1RM } from "@/lib/trainingMetrics";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

// ── Thresholds ──

/** A new best must beat the old one by more than this. OURS: ignores float noise from unit conversion (0.1 kg rounding). */
export const RECORD_EPSILON = 0.05;

// ── Sets ──

/** A number from a stored weight or reps text, or null. */
export function setNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type BestSet = { weight: number; reps: number };

/**
 * The set that shows the most strength: highest Epley e1RM among working
 * and failure sets with a weight, heavier first on ties. With no weighted
 * set (bodyweight work), the set with the most reps. Warm-ups never count.
 */
export function bestSet(sets: readonly LoggedSetLike[] | null | undefined): BestSet | null {
  let best: (BestSet & { e1rm: number }) | null = null;
  for (const s of getE1rmSets([...(sets ?? [])])) {
    const weight = setNumber(s.weight) ?? 0;
    const reps = setNumber(s.reps) ?? 0;
    if (weight <= 0 || reps <= 0) continue;
    const e1rm = estimateE1RM(weight, reps);
    if (!best || e1rm > best.e1rm || (e1rm === best.e1rm && weight > best.weight)) best = { weight, reps, e1rm };
  }
  if (best) return { weight: best.weight, reps: best.reps };
  let most: BestSet | null = null;
  for (const s of getHardSets([...(sets ?? [])])) {
    const reps = setNumber(s.reps) ?? 0;
    if (reps > 0 && (!most || reps > most.reps)) most = { weight: 0, reps };
  }
  return most;
}

/** A weight as people write it: no trailing ".0", one decimal at most. */
export function formatLoad(weight: number): string {
  const r = Math.round(weight * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "80 kg × 8", or "12 reps" for a set with no weight. */
export function formatSet(set: BestSet | null, unit: string): string {
  if (!set) return "—";
  return set.weight > 0 ? `${formatLoad(set.weight)} ${unit} × ${set.reps}` : `${set.reps} reps`;
}

/** Weight × reps over working, drop and failure sets. Warm-ups and unweighted sets add nothing. */
export function setsVolume(sets: readonly LoggedSetLike[] | null | undefined): number {
  let v = 0;
  for (const s of getHardSets([...(sets ?? [])])) {
    const w = setNumber(s.weight) ?? 0;
    const r = setNumber(s.reps) ?? 0;
    if (w > 0 && r > 0) v += w * r;
  }
  return v;
}

// ── Workout stats ──

export type WorkoutStats = {
  durationSec: number | null;
  /** Total weight × reps over hard sets, in the stored unit. */
  volume: number;
  /** Hard sets (warm-ups are not counted, as in the volume engine). */
  sets: number;
  exercises: number;
};

/** The numbers on a finished workout's card. */
export function workoutStats(w: StoredWorkout): WorkoutStats {
  let volume = 0;
  let sets = 0;
  let exercises = 0;
  for (const ex of w.exercises ?? []) {
    const hard = getHardSets(ex.sets ?? []);
    if (hard.length === 0) continue;
    exercises += 1;
    sets += hard.length;
    volume += setsVolume(ex.sets);
  }
  const d = typeof w.durationSec === "number" && Number.isFinite(w.durationSec) && w.durationSec > 0 ? Math.round(w.durationSec) : null;
  return { durationSec: d, volume: Math.round(volume), sets, exercises };
}

/** "52 min", "1 h 05 min". */
export function formatDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return "—";
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** "12,450 kg". */
export function formatVolume(volume: number, unit: string): string {
  return `${Math.round(volume).toLocaleString("en-GB")} ${unit}`;
}

// ── Records ──

export type RecordKind = "weight" | "e1rm" | "reps";

/** What each kind of record is called on screen. */
export const RECORD_LABEL: Record<RecordKind, string> = {
  weight: "Heaviest weight",
  e1rm: "Best estimated 1RM",
  reps: "Most reps",
};

export type WorkoutRecord = { name: string; exerciseId?: string; kind: RecordKind; value: number; previous: number };

type Bests = { weight: number; e1rm: number; reps: number };

/** The bests one session of one exercise reached. Reps count only for sets with no weight (bodyweight work). */
function bestsOf(sets: readonly LoggedSetLike[] | null | undefined): Bests {
  const out: Bests = { weight: 0, e1rm: 0, reps: 0 };
  for (const s of getE1rmSets([...(sets ?? [])])) {
    const w = setNumber(s.weight) ?? 0;
    const r = setNumber(s.reps) ?? 0;
    if (r <= 0) continue;
    if (w > 0) {
      out.weight = Math.max(out.weight, w);
      out.e1rm = Math.max(out.e1rm, estimateE1RM(w, r));
    }
  }
  for (const s of getHardSets([...(sets ?? [])])) {
    const w = setNumber(s.weight) ?? 0;
    const r = setNumber(s.reps) ?? 0;
    if (w <= 0 && r > 0 && setTypeOf(s) !== "drop") out.reps = Math.max(out.reps, r);
  }
  return out;
}

function beats(now: number, before: number): boolean {
  return now > 0 && before > 0 && now > before + RECORD_EPSILON;
}

/**
 * Records this session set against every earlier one. Silence beats false
 * positives: an exercise's first session sets no records (everything would
 * be a "record"), and a kind only counts once the old best exists.
 */
function recordsAgainst(name: string, exerciseId: string | undefined, now: Bests, before: Bests): WorkoutRecord[] {
  const out: WorkoutRecord[] = [];
  const base = { name, ...(exerciseId ? { exerciseId } : {}) };
  if (beats(now.weight, before.weight)) out.push({ ...base, kind: "weight", value: now.weight, previous: before.weight });
  if (beats(now.e1rm, before.e1rm)) out.push({ ...base, kind: "e1rm", value: now.e1rm, previous: before.e1rm });
  if (beats(now.reps, before.reps)) out.push({ ...base, kind: "reps", value: now.reps, previous: before.reps });
  return out;
}

function merge(a: Bests | undefined, b: Bests): Bests {
  return a ? { weight: Math.max(a.weight, b.weight), e1rm: Math.max(a.e1rm, b.e1rm), reps: Math.max(a.reps, b.reps) } : b;
}

function byTime(a: StoredWorkout, b: StoredWorkout): number {
  return a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0;
}

/** Records one workout set against the history before it. `history` may include the workout itself. */
export function workoutRecords(w: StoredWorkout, history: readonly StoredWorkout[]): WorkoutRecord[] {
  const earlier = history.filter((h) => h !== w && h.completedAt < w.completedAt);
  const prior = new Map<string, Bests>();
  for (const h of earlier) {
    for (const ex of h.exercises ?? []) {
      const key = exerciseIdentity(ex);
      prior.set(key, merge(prior.get(key), bestsOf(ex.sets)));
    }
  }
  const out: WorkoutRecord[] = [];
  const seen = new Map<string, Bests>();
  for (const ex of w.exercises ?? []) {
    const key = exerciseIdentity(ex);
    const before = prior.get(key);
    if (!before) continue;
    // The same exercise twice in one session: compare its best, once.
    seen.set(key, merge(seen.get(key), bestsOf(ex.sets)));
  }
  for (const ex of w.exercises ?? []) {
    const key = exerciseIdentity(ex);
    const now = seen.get(key);
    const before = prior.get(key);
    if (!now || !before) continue;
    seen.delete(key);
    out.push(...recordsAgainst(ex.name, ex.exerciseId, now, before));
  }
  return out;
}

/**
 * Records for every workout in one chronological pass, keyed by
 * `completedAt`, for the history list.
 */
export function recordsByWorkout(history: readonly StoredWorkout[]): Map<string, WorkoutRecord[]> {
  const out = new Map<string, WorkoutRecord[]>();
  const running = new Map<string, Bests>();
  for (const w of [...history].sort(byTime)) {
    const session = new Map<string, { name: string; exerciseId?: string; bests: Bests }>();
    for (const ex of w.exercises ?? []) {
      const key = exerciseIdentity(ex);
      const cur = session.get(key);
      session.set(key, { name: cur?.name ?? ex.name, exerciseId: cur?.exerciseId ?? ex.exerciseId, bests: merge(cur?.bests, bestsOf(ex.sets)) });
    }
    const recs: WorkoutRecord[] = [];
    for (const [key, s] of session) {
      const before = running.get(key);
      if (before) recs.push(...recordsAgainst(s.name, s.exerciseId, s.bests, before));
      running.set(key, merge(before, s.bests));
    }
    if (recs.length > 0) out.set(w.completedAt, recs);
  }
  return out;
}

/** Record kinds per exercise identity, for marking exercise rows. */
export function recordKindsByExercise(records: readonly WorkoutRecord[]): Map<string, RecordKind[]> {
  const out = new Map<string, RecordKind[]>();
  for (const r of records) {
    const key = exerciseIdentity(r);
    out.set(key, [...(out.get(key) ?? []), r.kind]);
  }
  return out;
}

/** "Heaviest weight 82.5 kg, was 80" for one record. */
export function recordLine(r: WorkoutRecord, unit: string): string {
  if (r.kind === "reps") return `${RECORD_LABEL.reps} ${r.value}, was ${r.previous}`;
  return `${RECORD_LABEL[r.kind]} ${formatLoad(r.value)} ${unit}, was ${formatLoad(r.previous)}`;
}

// ── History list ──

export type MonthGroup<T> = { key: string; label: string; items: T[] };

/**
 * Group workouts by the calendar month of `completedAt`, newest first. The
 * caller passes a label function so the month name is formatted on the
 * client in the user's locale and zone.
 */
export function groupByMonth<T extends { completedAt: string }>(items: readonly T[], monthKey: (iso: string) => string, label: (key: string) => string): MonthGroup<T>[] {
  const sorted = [...items].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
  const groups: MonthGroup<T>[] = [];
  for (const it of sorted) {
    const key = monthKey(it.completedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, label: label(key), items: [it] });
  }
  return groups;
}
