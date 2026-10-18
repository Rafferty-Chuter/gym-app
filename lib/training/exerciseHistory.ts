/**
 * One exercise across all workouts (TR6): its sessions, its records and
 * the series its chart draws, as the exercise screens in Hevy and Strong.
 * Pure: callers pass the history. Weights are in the stored unit (see
 * `workoutSummary.ts`).
 */

import { getCompletedLoggedSets, getE1rmSets, setTypeOf, type SetType } from "@/lib/completedSets";
import { exerciseIdentity, resolveLoggedExerciseMeta, sameExercise } from "@/lib/exerciseLibrary";
import { estimateE1RM } from "@/lib/trainingMetrics";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { bestSet, setNumber, setsVolume, type BestSet } from "@/lib/training/workoutSummary";

// ── Thresholds ──

/** Rep counts the rep-records table covers. OURS: 1 to 12 is the strength and hypertrophy range people chase records in. */
export const REP_RECORD_MAX = 12;

/** Points a chart needs before it draws a line. OURS: two sessions make a direction, one is a dot. */
export const CHART_MIN_POINTS = 2;

// ── Sessions ──

export type ExerciseSet = { weight: number | null; reps: number; type: SetType };

export type ExerciseSession = {
  completedAt: string;
  workoutName?: string;
  sets: ExerciseSet[];
  best: BestSet | null;
  /** Best Epley e1RM over working and failure sets; null for bodyweight work. */
  e1rm: number | null;
  /** Heaviest working or failure set. */
  heaviest: number | null;
  volume: number;
};

/** Every session of this exercise, newest first. A workout that did it twice counts once, with all its sets. */
export function exerciseSessions(history: readonly StoredWorkout[], target: { name: string; exerciseId?: string }): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (const w of history) {
    const matches = (w.exercises ?? []).filter((ex) => sameExercise(ex, target));
    if (matches.length === 0) continue;
    const raw = matches.flatMap((ex) => getCompletedLoggedSets(ex.sets ?? []));
    if (raw.length === 0) continue;
    let e1rm = 0;
    let heaviest = 0;
    for (const s of getE1rmSets(raw)) {
      const wt = setNumber(s.weight) ?? 0;
      const r = setNumber(s.reps) ?? 0;
      if (wt <= 0 || r <= 0) continue;
      e1rm = Math.max(e1rm, estimateE1RM(wt, r));
      heaviest = Math.max(heaviest, wt);
    }
    out.push({
      completedAt: w.completedAt,
      ...(w.name ? { workoutName: w.name } : {}),
      sets: raw.map((s) => {
        const wt = setNumber(s.weight);
        return { weight: wt != null && wt > 0 ? wt : null, reps: setNumber(s.reps) ?? 0, type: setTypeOf(s) };
      }),
      best: bestSet(raw),
      e1rm: e1rm > 0 ? e1rm : null,
      heaviest: heaviest > 0 ? heaviest : null,
      volume: Math.round(setsVolume(raw)),
    });
  }
  return out.sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
}

// ── Records ──

export type Dated<T> = T & { completedAt: string };

export type ExerciseRecords = {
  e1rm: Dated<{ value: number; weight: number; reps: number }> | null;
  heaviest: Dated<{ value: number; reps: number }> | null;
  bestSetVolume: Dated<{ value: number; weight: number; reps: number }> | null;
  bestSessionVolume: Dated<{ value: number }> | null;
  mostReps: Dated<{ value: number }> | null;
  /** Heaviest weight done for exactly this many reps, 1 to REP_RECORD_MAX, only rep counts that were done. */
  repRecords: Dated<{ reps: number; weight: number }>[];
};

/** All-time bests for one exercise. Warm-ups and drop sets never set a record; the earliest session keeps a tie. */
export function exerciseRecords(sessions: readonly ExerciseSession[]): ExerciseRecords {
  const out: ExerciseRecords = { e1rm: null, heaviest: null, bestSetVolume: null, bestSessionVolume: null, mostReps: null, repRecords: [] };
  const reps = new Map<number, Dated<{ reps: number; weight: number }>>();
  const oldestFirst = [...sessions].sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0));
  for (const s of oldestFirst) {
    const at = s.completedAt;
    if (s.volume > 0 && (!out.bestSessionVolume || s.volume > out.bestSessionVolume.value)) out.bestSessionVolume = { value: s.volume, completedAt: at };
    for (const set of s.sets) {
      if (set.type === "warmup" || set.type === "drop" || set.reps <= 0) continue;
      const w = set.weight ?? 0;
      if (w <= 0) {
        if (!out.mostReps || set.reps > out.mostReps.value) out.mostReps = { value: set.reps, completedAt: at };
        continue;
      }
      const e = estimateE1RM(w, set.reps);
      if (!out.e1rm || e > out.e1rm.value) out.e1rm = { value: e, weight: w, reps: set.reps, completedAt: at };
      if (!out.heaviest || w > out.heaviest.value || (w === out.heaviest.value && set.reps > out.heaviest.reps)) out.heaviest = { value: w, reps: set.reps, completedAt: at };
      const v = w * set.reps;
      if (!out.bestSetVolume || v > out.bestSetVolume.value) out.bestSetVolume = { value: v, weight: w, reps: set.reps, completedAt: at };
      if (set.reps <= REP_RECORD_MAX) {
        const cur = reps.get(set.reps);
        if (!cur || w > cur.weight) reps.set(set.reps, { reps: set.reps, weight: w, completedAt: at });
      }
    }
  }
  out.repRecords = [...reps.values()].sort((a, b) => a.reps - b.reps);
  return out;
}

// ── Chart ──

export type ChartMetric = "e1rm" | "heaviest" | "volume" | "reps";

export const CHART_METRIC_LABEL: Record<ChartMetric, string> = {
  e1rm: "Estimated 1RM",
  heaviest: "Heaviest weight",
  volume: "Session volume",
  reps: "Most reps",
};

export type ChartPoint = { completedAt: string; value: number };

/** One point per session that has the metric, oldest first. */
export function chartSeries(sessions: readonly ExerciseSession[], metric: ChartMetric): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (const s of sessions) {
    const value =
      metric === "e1rm"
        ? s.e1rm
        : metric === "heaviest"
          ? s.heaviest
          : metric === "volume"
            ? s.volume || null
            : Math.max(0, ...s.sets.filter((x) => x.type !== "warmup" && x.type !== "drop").map((x) => x.reps)) || null;
    if (value != null && value > 0) out.push({ completedAt: s.completedAt, value });
  }
  return out.sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0));
}

/** The metrics worth offering: weighted work gets e1RM, heaviest and volume; bodyweight work gets reps. */
export function chartMetricsFor(sessions: readonly ExerciseSession[]): ChartMetric[] {
  const weighted = sessions.some((s) => s.e1rm != null);
  return weighted ? ["e1rm", "heaviest", "volume"] : ["reps"];
}

// ── Index ──

export type LoggedExercise = { name: string; exerciseId?: string; sessions: number; lastAt: string };

/**
 * Every exercise ever logged, one entry per movement (an old name joins its
 * library entry and shows the library name), most recent first.
 */
export function loggedExercises(history: readonly StoredWorkout[]): LoggedExercise[] {
  const byKey = new Map<string, LoggedExercise>();
  const newestFirst = [...history].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
  for (const w of newestFirst) {
    const seen = new Set<string>();
    for (const ex of w.exercises ?? []) {
      if (!ex.name?.trim() || getCompletedLoggedSets(ex.sets ?? []).length === 0) continue;
      const key = exerciseIdentity(ex);
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = byKey.get(key);
      if (cur) cur.sessions += 1;
      else {
        const meta = resolveLoggedExerciseMeta(ex);
        byKey.set(key, { name: meta?.name ?? ex.name.trim(), ...(meta?.id ?? ex.exerciseId ? { exerciseId: meta?.id ?? ex.exerciseId } : {}), sessions: 1, lastAt: w.completedAt });
      }
    }
  }
  return [...byKey.values()];
}
