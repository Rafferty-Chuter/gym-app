/**
 * Canonical per-lift trend status.
 *
 * This is the ONLY place in the codebase that decides whether a lift is
 * progressing / flat / declining / early. Every other consumer (Progress tab,
 * Plateau signal, home aggregation, AI coach context, plateau-detection
 * helpers) reads from `getLiftTrendStatus` so screens never disagree about
 * the same lift.
 *
 * Metric:  estimated 1RM (Epley: weight × (1 + reps/30)) of the heaviest set
 *          per session.
 * Window:  last 6 sessions logged for the lift.
 */

import {
  estimateE1RM,
  exerciseKey,
  getBestSet,
} from "@/lib/trainingMetrics";
import { getCompletedLoggedSets } from "@/lib/completedSets";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

export const TREND_WINDOW = 6;
/** A lift needs at least this many logged sessions before we'll commit to a direction. */
export const MIN_SESSIONS_FOR_TREND = 3;
/** Within ±1.5% of starting e1RM over the window → Flat. */
export const FLAT_BANDWIDTH = 0.015;
/** Flat for at least this many sessions → Plateau. */
export const PLATEAU_MIN_FLAT_SESSIONS = 4;

export type LiftTrend = "early" | "progressing" | "flat" | "declining";

export type LiftTrendStatus = {
  exercise: string;
  status: LiftTrend;
  /** Sessions actually used in the window (≤ TREND_WINDOW). */
  sessionsTracked: number;
  startingE1rm: number;
  latestE1rm: number;
  /** Least-squares slope of e1RM against session index, in e1RM units per session. */
  slopePerSession: number;
  /** Total change implied by the slope across the window, as a fraction of starting e1RM. */
  windowChangePct: number;
};

function leastSquaresSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Classify an already-extracted e1RM series (oldest → newest).
 * Caller is responsible for ensuring the values come from the last
 * `TREND_WINDOW` sessions of the lift.
 */
export function classifyE1rmSeries(series: readonly number[], exerciseName = ""): LiftTrendStatus {
  const sessionsTracked = series.length;
  const startingE1rm = series[0] ?? 0;
  const latestE1rm = series[sessionsTracked - 1] ?? 0;

  if (sessionsTracked < MIN_SESSIONS_FOR_TREND) {
    return {
      exercise: exerciseName,
      status: "early",
      sessionsTracked,
      startingE1rm,
      latestE1rm,
      slopePerSession: 0,
      windowChangePct: 0,
    };
  }

  const slopePerSession = leastSquaresSlope(series);
  const denom = startingE1rm > 0 ? startingE1rm : 1;
  const windowChangePct = (slopePerSession * (sessionsTracked - 1)) / denom;

  let status: LiftTrend;
  if (Math.abs(windowChangePct) <= FLAT_BANDWIDTH) {
    status = "flat";
  } else if (windowChangePct > FLAT_BANDWIDTH && latestE1rm >= startingE1rm) {
    status = "progressing";
  } else if (windowChangePct < -FLAT_BANDWIDTH && latestE1rm < startingE1rm) {
    status = "declining";
  } else {
    // Slope direction conflicts with endpoint direction (noisy ends) — call it flat.
    status = "flat";
  }

  return {
    exercise: exerciseName,
    status,
    sessionsTracked,
    startingE1rm,
    latestE1rm,
    slopePerSession,
    windowChangePct,
  };
}

/** Take the last TREND_WINDOW sessions with a valid best set, oldest → newest. */
function extractRecentE1rmSeries(
  workouts: readonly StoredWorkout[],
  exerciseName: string
): number[] {
  const key = exerciseKey(exerciseName);
  const sortedDesc = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const newest: number[] = [];
  for (const w of sortedDesc) {
    const ex = w.exercises?.find((e) => exerciseKey(e.name) === key);
    const completedSets = getCompletedLoggedSets(ex?.sets ?? []);
    if (!completedSets.length) continue;
    const best = getBestSet(completedSets);
    if (!best) continue;
    newest.push(estimateE1RM(best.weight, best.reps));
    if (newest.length >= TREND_WINDOW) break;
  }
  return newest.reverse();
}

/** Canonical trend status for a single lift from workout history. */
export function getLiftTrendStatus(
  workouts: readonly StoredWorkout[],
  exerciseName: string
): LiftTrendStatus {
  const series = extractRecentE1rmSeries(workouts, exerciseName);
  return classifyE1rmSeries(series, exerciseName);
}

/** A lift is on a plateau when it's been Flat for at least PLATEAU_MIN_FLAT_SESSIONS sessions. */
export function isPlateau(status: LiftTrendStatus): boolean {
  return status.status === "flat" && status.sessionsTracked >= PLATEAU_MIN_FLAT_SESSIONS;
}

export type AggregateLiftTrend = "improving" | "mixed" | "declining" | "limited";

/**
 * Honest aggregation across many lifts. We never pick a directional verdict
 * unless a clear majority of the readable lifts supports it.
 *
 * - majority of all statuses Early → "limited"
 * - majority of readable Progressing → "improving"
 * - majority of readable Declining → "declining"
 * - otherwise → "mixed"
 */
export function aggregateLiftTrends(statuses: readonly LiftTrendStatus[]): AggregateLiftTrend {
  if (statuses.length === 0) return "limited";
  const earlyCount = statuses.filter((s) => s.status === "early").length;
  if (earlyCount * 2 > statuses.length) return "limited";

  const reads = statuses.filter((s) => s.status !== "early");
  if (reads.length === 0) return "limited";

  const progressing = reads.filter((s) => s.status === "progressing").length;
  const declining = reads.filter((s) => s.status === "declining").length;

  if (progressing * 2 > reads.length) return "improving";
  if (declining * 2 > reads.length) return "declining";
  return "mixed";
}
