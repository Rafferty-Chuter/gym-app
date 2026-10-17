/**
 * Mesocycles and deloads (T6), after RP's block structure (research B,
 * RP-1), Dr. Muscle's auto-deload numbers (DM-1) and the spec in research
 * B §8 part 4. A deload is due on schedule, by training status, or early
 * when most lifts could not match the previous week. One is active for
 * seven days from the day it is started. During it the logger halves the
 * sets and lightens the load; the strength engine already drops such
 * weeks from its trend. Pure: no storage, no clock.
 */

import { deloadWeeks, liftSeries, weeklySetCounts } from "@/lib/physique/strength";
import type { TrainingStatus } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { addDays, type LocalDate, type Now } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";
import { snapLoad, type Equipment, type Suggestion } from "@/lib/training/progression";

export type DeloadReason = "scheduled" | "triggered" | "manual";
export type DeloadRecord = { startDate: LocalDate; reason: DeloadReason; startedAt: string };

export type DeloadRead =
  | { state: "active"; startDate: LocalDate; endDate: LocalDate; reason: DeloadReason; daysLeft: number }
  | { state: "due"; reason: "scheduled" | "triggered"; weeksAccumulated: number; liftsDown: number; liftsCompared: number }
  | { state: "none"; weeksAccumulated: number; weeksUntilDue: number }
  /** Fewer than two training weeks logged: nothing to say yet. */
  | { state: "early" };

// ── Constants ──

/** Accumulation weeks before a scheduled deload, by training status. PUB (RP-1: beginners up to 8, intermediates 4 to 7, advanced 3 to 6; research B §8 picks the middle). */
export const ACCUMULATION_WEEKS: Record<TrainingStatus, number> = { novice: 6, intermediate: 5, advanced: 4 };
/** A deload week: half the sets, loads 10 % lighter, every set four or more in reserve. PUB (DM-1 numbers, RP's MV floor). */
export const DELOAD_SETS_FACTOR = 0.5;
export const DELOAD_LOAD_FACTOR = 0.9;
export const DELOAD_RIR_MIN = 4;
export const DELOAD_DAYS = 7;
/** A lift "could not match last week" when its best e1RM is this much under the week before. PUB (research B §8, the 1.5 % flat band). */
export const MATCH_DROP_PCT = 1.5;
/** The share of compared lifts that must be down to trigger early. PUB (research B §8 perfScore 4). */
export const TRIGGER_SHARE = 0.5;
/** Lifts that must be compared, and sessions this week, before an early trigger is trusted. OURS. */
export const TRIGGER_MIN_LIFTS = 3;
export const TRIGGER_MIN_SESSIONS = 2;
/** Training weeks logged before any deload read is made. OURS. */
export const MIN_TRAINING_WEEKS = 2;

// ── Helpers ──

const daysBetween = (from: LocalDate, to: LocalDate): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** 0 for the 7-day block ending today, 1 for the one before, and so on. */
const blockOf = (date: LocalDate, today: LocalDate): number => Math.floor(daysBetween(date, today) / 7);

/**
 * Weeks trained since the last deload or week off. Blocks of seven days
 * ending today are counted back until one is empty (a week off counts as
 * the deload, RP-7) or is a detected deload week.
 */
export function weeksAccumulated(workouts: readonly StoredWorkout[], now: Now, record: DeloadRecord | null): number {
  const counts = weeklySetCounts(workouts, now);
  const deloadStarts = new Set(deloadWeeks(workouts, now).map((d) => blockOf(d.end, now.today)));
  const recordBlock = record ? blockOf(addDays(record.startDate, DELOAD_DAYS - 1), now.today) : null;
  let weeks = 0;
  for (let k = 0; k < counts.length; k++) {
    if (k > 0 && counts[k] <= 0) break;
    if (deloadStarts.has(k) || recordBlock === k) break;
    if (counts[k] > 0) weeks += 1;
  }
  return weeks;
}

/** Lifts whose best e1RM this block is under the previous block's by more than the band. */
export function liftsDownOnLastWeek(workouts: readonly StoredWorkout[], unit: WeightUnit, now: Now): { down: number; compared: number } {
  let down = 0;
  let compared = 0;
  for (const lift of liftSeries(workouts, unit, now)) {
    let thisWeek: number | null = null;
    let lastWeek: number | null = null;
    for (const e of lift.exposures) {
      const b = blockOf(e.date, now.today);
      if (b === 0) thisWeek = Math.max(thisWeek ?? 0, e.e1rm);
      else if (b === 1) lastWeek = Math.max(lastWeek ?? 0, e.e1rm);
    }
    if (thisWeek == null || lastWeek == null) continue;
    compared += 1;
    if (thisWeek < lastWeek * (1 - MATCH_DROP_PCT / 100)) down += 1;
  }
  return { down, compared };
}

function sessionsInBlock(workouts: readonly StoredWorkout[], now: Now, block: number): number {
  let n = 0;
  for (const w of workouts) {
    const ms = Date.parse(w.completedAt);
    if (!Number.isFinite(ms)) continue;
    const date = new Date(ms).toISOString().slice(0, 10) as LocalDate;
    if (date <= now.today && blockOf(date, now.today) === block) n += 1;
  }
  return n;
}

// ── The read ──

export type DeloadInput = {
  workouts: readonly StoredWorkout[];
  unit: WeightUnit;
  now: Now;
  status: TrainingStatus;
  record: DeloadRecord | null;
};

/** Whether a deload is active, due, or not yet. */
export function readDeload({ workouts, unit, now, status, record }: DeloadInput): DeloadRead {
  if (record) {
    const endDate = addDays(record.startDate, DELOAD_DAYS - 1);
    if (record.startDate <= now.today && now.today <= endDate) {
      return { state: "active", startDate: record.startDate, endDate, reason: record.reason, daysLeft: daysBetween(now.today, endDate) };
    }
  }
  const weeks = weeksAccumulated(workouts, now, record);
  const trained = weeklySetCounts(workouts, now).filter((n) => n > 0).length;
  if (trained < MIN_TRAINING_WEEKS) return { state: "early" };
  const { down, compared } = liftsDownOnLastWeek(workouts, unit, now);
  if (compared >= TRIGGER_MIN_LIFTS && sessionsInBlock(workouts, now, 0) >= TRIGGER_MIN_SESSIONS && down / compared >= TRIGGER_SHARE) {
    return { state: "due", reason: "triggered", weeksAccumulated: weeks, liftsDown: down, liftsCompared: compared };
  }
  const due = ACCUMULATION_WEEKS[status];
  if (weeks >= due) return { state: "due", reason: "scheduled", weeksAccumulated: weeks, liftsDown: down, liftsCompared: compared };
  return { state: "none", weeksAccumulated: weeks, weeksUntilDue: due - weeks };
}

// ── Prescription ──

/** Sets for a deload session: half, never below one. */
export function deloadSets(planned: number): number {
  return Math.max(1, Math.ceil(planned * DELOAD_SETS_FACTOR));
}

/** The progression suggestion made light: load down 10 % and snapped, reps kept, four or more in reserve. */
export function deloadSuggestion(s: Suggestion, equipment: Equipment): Suggestion {
  if (s.kind !== "next") return s;
  return { ...s, loadKg: snapLoad(s.loadKg * DELOAD_LOAD_FACTOR, equipment), rir: Math.max(s.rir, DELOAD_RIR_MIN) };
}

/** "Deload week · 4 days left", "Deload due · 5 weeks since the last", "Deload suggested · 3 of 4 lifts down on last week". */
export function deloadLine(r: DeloadRead): string | null {
  switch (r.state) {
    case "active":
      return `Deload week · ${r.daysLeft === 0 ? "last day" : `${r.daysLeft} ${r.daysLeft === 1 ? "day" : "days"} left`}`;
    case "due":
      return r.reason === "triggered"
        ? `Deload suggested · ${r.liftsDown} of ${r.liftsCompared} lifts down on last week`
        : `Deload due · ${r.weeksAccumulated} weeks since the last`;
    default:
      return null;
  }
}
