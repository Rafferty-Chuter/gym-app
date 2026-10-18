/**
 * Routine editing helpers (TR2): the planned rows of an exercise, rest
 * labels, a one-line summary and an estimated duration, as Hevy shows on
 * its routine cards. Pure; the editor and the Train tab render these.
 */

import type { TemplateExercise, TemplateSet, WorkoutTemplate } from "@/lib/templateStorage";

/** Rest choices offered in the editor and the logger, in seconds. OURS: Hevy's steps up to five minutes. */
export const REST_PRESETS: readonly number[] = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
/** Rest given to a newly added exercise. OURS: the middle of the common 1 to 3 minute range. */
export const DEFAULT_REST_SEC = 90;
/** Working sets given to a newly added exercise. OURS: the most common prescription. */
export const DEFAULT_WORKING_SETS = 3;
/** Most rows one exercise can plan. OURS: matches the logger's cap. */
export const MAX_ROWS = 20;
/** Seconds one set takes, for the duration estimate. OURS: a typical set of 8 to 12 reps with setup. */
export const SET_WORK_SEC = 45;
/** Seconds between exercises, for the duration estimate. OURS: walking over and loading the bar. */
export const CHANGEOVER_SEC = 60;

/** The planned rows: the stored ones, or `targetSets` empty working sets for an older routine. */
export function plannedRows(ex: Pick<TemplateExercise, "sets" | "targetSets">): TemplateSet[] {
  if (ex.sets && ex.sets.length > 0) return ex.sets.map((r) => ({ ...r }));
  return Array.from({ length: Math.max(1, ex.targetSets || DEFAULT_WORKING_SETS) }, () => ({}));
}

/** The exercise with new rows, warm-ups kept first, and `targetSets` set to the working rows. */
export function withRows<T extends TemplateExercise>(ex: T, rows: TemplateSet[]): T {
  const capped = rows.slice(0, MAX_ROWS);
  const ordered = [...capped.filter((r) => r.type === "warmup"), ...capped.filter((r) => r.type !== "warmup")];
  const working = ordered.filter((r) => r.type !== "warmup").length;
  return { ...ex, sets: ordered, targetSets: Math.max(1, working) };
}

/** Add a row like the last working one (its plan copied), or a warm-up before the working sets. */
export function addRow<T extends TemplateExercise>(ex: T, kind: "working" | "warmup" = "working"): T {
  const rows = plannedRows(ex);
  if (kind === "warmup") return withRows(ex, [{ type: "warmup" }, ...rows]);
  const last = [...rows].reverse().find((r) => r.type !== "warmup");
  return withRows(ex, [...rows, last ? { ...(last.kg != null ? { kg: last.kg } : {}), ...(last.reps != null ? { reps: last.reps } : {}) } : {}]);
}

/** Remove one row; the last working set cannot go (remove the exercise instead). */
export function removeRow<T extends TemplateExercise>(ex: T, index: number): T {
  const rows = plannedRows(ex);
  const next = rows.filter((_, i) => i !== index);
  if (next.filter((r) => r.type !== "warmup").length === 0) return ex;
  return withRows(ex, next);
}

/** Move an item from one index to another. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/** "Off", "45s", "1:30", "2:00". */
export function restLabel(sec: number | undefined): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  if (s === 0) return "Off";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Working sets across the routine. */
export function workingSetCount(t: Pick<WorkoutTemplate, "exercises">): number {
  return t.exercises.reduce((n, ex) => n + plannedRows(ex).filter((r) => r.type !== "warmup").length, 0);
}

/** Estimated minutes: every set's work, the rest after all but each exercise's last set, and a changeover per exercise. */
export function estimateMinutes(t: Pick<WorkoutTemplate, "exercises">): number {
  let sec = 0;
  for (const ex of t.exercises) {
    const rows = plannedRows(ex);
    sec += rows.length * SET_WORK_SEC + Math.max(0, rows.length - 1) * Math.max(0, ex.restSec ?? DEFAULT_REST_SEC) + CHANGEOVER_SEC;
  }
  return Math.max(5, Math.round(sec / 300) * 5);
}

/** "Bench Press, Overhead Press and 2 more". */
export function routineSummary(t: Pick<WorkoutTemplate, "exercises">, shown = 3): string {
  const names = t.exercises.map((e) => e.name);
  if (names.length === 0) return "No exercises yet";
  if (names.length <= shown) return names.join(", ");
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}

/** A routine id that will not collide. */
export function newRoutineId(now: number, rand: () => number): string {
  return `tpl_${now.toString(36)}_${Math.floor(rand() * 1e8).toString(36)}`;
}
