/**
 * Canonical per-lift trend status.
 *
 * This is the ONLY place in the codebase that decides whether a lift is
 * progressing / flat / declining / early. Every other consumer (Progress tab,
 * Plateau signal, home aggregation, AI coach context, plateau-detection
 * helpers) reads from `getLiftTrendStatus` so screens never disagree about
 * the same lift.
 *
 * Metric:  the best e1RM_adj of the session (02 §6.1, T2): Epley on
 *          reps + RIR, sets with reps + RIR > 12 skipped, warm-ups and
 *          drop sets out, failure sets at RIR 0. Computed in the stored
 *          unit, so values compare within a lift and never across units.
 * Window:  last 6 sessions logged for the lift.
 */

import { exerciseKey } from "@/lib/trainingMetrics";
import { bestSessionE1rm } from "@/lib/physique/strength";
import { leastSquaresSlope } from "@/lib/stats";
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
  /** Time-based slope, % of starting e1RM per week (T2). Null without session dates or under 7 days of span. */
  slopePctPerWeek: number | null;
};

export type E1rmPoint = { date: string; e1rm: number };

/** Least-squares slope of e1RM against time, as % of the first value per week. */
export function e1rmSlopePctPerWeek(points: readonly E1rmPoint[]): number | null {
  if (points.length < MIN_SESSIONS_FOR_TREND) return null;
  const t0 = new Date(points[0].date).getTime();
  const first = points[0].e1rm;
  if (!Number.isFinite(t0) || first <= 0) return null;
  const xs = points.map((p) => (new Date(p.date).getTime() - t0) / (7 * 86_400_000));
  const span = xs[xs.length - 1];
  if (!Number.isFinite(span) || span < 1) return null;
  const ys = points.map((p) => (p.e1rm / first) * 100);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}


/**
 * Classify an already-extracted e1RM series (oldest → newest).
 * Caller is responsible for ensuring the values come from the last
 * `TREND_WINDOW` sessions of the lift.
 */
export function classifyE1rmSeries(series: readonly number[], exerciseName = "", dates?: readonly string[]): LiftTrendStatus {
  const sessionsTracked = series.length;
  const slopePctPerWeek = dates && dates.length === series.length ? e1rmSlopePctPerWeek(series.map((e1rm, i) => ({ date: dates[i], e1rm }))) : null;
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
      slopePctPerWeek,
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
    slopePctPerWeek,
  };
}

/**
 * The last TREND_WINDOW sessions with a valid e1RM_adj, oldest → newest,
 * each with its date. The one series extractor: plateau detection and the
 * trend status both read from here (T2).
 */
export function recentE1rmPoints(workouts: readonly StoredWorkout[], exerciseName: string): E1rmPoint[] {
  const key = exerciseKey(exerciseName);
  const sortedDesc = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const newest: E1rmPoint[] = [];
  for (const w of sortedDesc) {
    const ex = w.exercises?.find((e) => exerciseKey(e.name) === key);
    if (!ex) continue;
    // Stored unit, unconverted: trends compare within a lift, never across units.
    const e1rm = bestSessionE1rm(ex.sets ?? [], "kg");
    if (e1rm == null || e1rm <= 0) continue;
    newest.push({ date: w.completedAt, e1rm: Number(e1rm.toFixed(1)) });
    if (newest.length >= TREND_WINDOW) break;
  }
  return newest.reverse();
}

/** The e1RM values of `recentE1rmPoints`, oldest → newest. */
export function recentE1rmSeries(workouts: readonly StoredWorkout[], exerciseName: string): number[] {
  return recentE1rmPoints(workouts, exerciseName).map((p) => p.e1rm);
}

/** Canonical trend status for a single lift from workout history. */
export function getLiftTrendStatus(
  workouts: readonly StoredWorkout[],
  exerciseName: string
): LiftTrendStatus {
  const points = recentE1rmPoints(workouts, exerciseName);
  return classifyE1rmSeries(points.map((p) => p.e1rm), exerciseName, points.map((p) => p.date));
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
