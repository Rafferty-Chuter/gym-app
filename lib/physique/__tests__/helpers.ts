/**
 * Hand-built records for the strength and sleep tests, for the cases
 * `makeScenario` can't express (dip-and-recover lifts, exact night counts).
 */

import { addDays, weekday, type LocalDate } from "@/lib/dates";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { SleepNight } from "@/lib/physique/types";

export function night(date: LocalDate, asleepH: number, source: SleepNight["source"] = "manual"): SleepNight {
  return {
    id: `n-${source}-${date}`,
    date,
    loggedAt: `${date}T07:10:00.000Z`,
    source,
    schemaVersion: 1,
    asleepMin: Math.round(asleepH * 60),
  };
}

/** `count` nights ending on `endDate`, each `asleepH` long, skipping any `skip` dates. */
export function nightsRun(
  endDate: LocalDate,
  count: number,
  asleepH: number | ((date: LocalDate) => number),
  source: SleepNight["source"] = "manual",
  skip: readonly LocalDate[] = []
): SleepNight[] {
  const out: SleepNight[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    if (skip.includes(date)) continue;
    out.push(night(date, typeof asleepH === "function" ? asleepH(date) : asleepH, source));
  }
  return out;
}

export type LiftPath = {
  name: string;
  exerciseId?: string;
  /** e1RM_adj (kg) on day index `d`, or null to skip that session. */
  e1rmOnDay: (d: number, date: LocalDate) => number | null;
  /** Reps and RIR of the top set; default 5 reps at RIR 2 like the fixtures. */
  reps?: number;
  rir?: number;
  /** Extra back-off sets per session (default 2), lighter and higher-rep. */
  backoffSets?: number;
  /** Weight text override, e.g. "BW" for bodyweight sets. */
  weightText?: string;
};

/**
 * Workouts on the given weekdays (0 = Sunday) from `startDate` for `days`
 * days, with every lift's top set sized so its e1RM_adj equals the path.
 */
export function liftWorkouts(opts: { startDate: LocalDate; days: number; weekdays?: readonly number[]; lifts: readonly LiftPath[]; name?: string }): StoredWorkout[] {
  const weekdays = opts.weekdays ?? [1, 4];
  const out: StoredWorkout[] = [];
  for (let d = 0; d < opts.days; d++) {
    const date = addDays(opts.startDate, d);
    if (!weekdays.includes(weekday(date))) continue;
    const exercises: StoredWorkout["exercises"] = [];
    for (const lift of opts.lifts) {
      const e1 = lift.e1rmOnDay(d, date);
      if (e1 === null) continue;
      const reps = lift.reps ?? 5;
      const rir = lift.rir ?? 2;
      const topKg = e1 / (1 + (reps + rir) / 30);
      const sets: StoredWorkout["exercises"][number]["sets"] = [{ weight: lift.weightText ?? topKg.toFixed(4), reps: String(reps), rir }];
      for (let b = 0; b < (lift.backoffSets ?? 2); b++) {
        sets.push({ weight: lift.weightText ?? (topKg * 0.9).toFixed(4), reps: String(reps + 3), rir });
      }
      exercises.push({ name: lift.name, exerciseId: lift.exerciseId, sets });
    }
    if (exercises.length === 0) continue;
    out.push({ completedAt: `${date}T18:00:00.000Z`, name: opts.name ?? "[seed] Session", durationSec: 3600, exercises });
  }
  return out;
}

/** A constant-e1RM path with an optional multiplier window, e.g. a dip on days 20–33. */
export function pathWith(base: number, segments: Array<{ from: number; to: number; mult: number }> = []): (d: number) => number {
  return (d: number) => {
    for (const s of segments) if (d >= s.from && d <= s.to) return base * s.mult;
    return base;
  };
}
