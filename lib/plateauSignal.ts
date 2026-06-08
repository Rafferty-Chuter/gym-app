/**
 * Plateau Signal — strict detector layered on top of the canonical lift
 * trend (P0.1). The canonical "flat"/"declining" classification is fine for
 * the per-lift Progress chart, but the home Plateau signal needs to avoid
 * false positives from a peak-then-pullback inside the 6-session window —
 * e.g. bench 109 → 117 peak → 113 end is NOT a plateau.
 *
 * Rules (P0.8): both must hold over the canonical 6-session window.
 *   1) latest e1RM ≤ starting e1RM × 1.01 (no net forward progress; small
 *      tolerance for rounding).
 *   2) Linear regression slope ≤ 0 (full-window, not trailing).
 *
 * If both hold the signal fires "Detected" and we sub-classify the kind so
 * the detail page can pick the right copy variant.
 */

import {
  classifyE1rmSeries,
  TREND_WINDOW,
} from "@/lib/liftTrend";
import {
  estimateE1RM,
  exerciseKey,
  getBestSet,
  getUniqueExerciseNames,
} from "@/lib/trainingMetrics";
import { getCompletedLoggedSets } from "@/lib/completedSets";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

export type PlateauKind = "flat" | "net-flat-with-variance" | "declining";

export type PlateauDetection = {
  exercise: string;
  kind: PlateauKind;
  sessionsTracked: number;
  startingE1rm: number;
  latestE1rm: number;
};

/** No net progress tolerance: latest e1RM must be at most start × 1.01. */
const LATEST_TOLERANCE_RATIO = 1.01;
/** Truly declining = latest at least 2% below start. */
const TRULY_DECLINING_RATIO = 0.98;
/** Flat copy = window's max−min within 1% of start. */
const FLAT_VARIANCE_PCT = 0.01;
/** Minimum sessions to claim a plateau at all (matches P0.1 PLATEAU_MIN_FLAT_SESSIONS). */
const MIN_SESSIONS_FOR_PLATEAU = 4;

/** Extract the last TREND_WINDOW heaviest-set e1RMs for an exercise, oldest → newest. */
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

export function detectPlateauForLift(
  workouts: readonly StoredWorkout[],
  exerciseName: string
): PlateauDetection | null {
  const series = extractRecentE1rmSeries(workouts, exerciseName);
  if (series.length < MIN_SESSIONS_FOR_PLATEAU) return null;

  const startingE1rm = series[0];
  const latestE1rm = series[series.length - 1];
  if (startingE1rm <= 0) return null;

  const status = classifyE1rmSeries(series, exerciseName);

  // BOTH conditions required.
  const noNetProgress = latestE1rm <= startingE1rm * LATEST_TOLERANCE_RATIO;
  const slopeNonPositive = status.slopePerSession <= 0;
  if (!noNetProgress || !slopeNonPositive) return null;

  // Sub-classify the kind for copy.
  let kind: PlateauKind;
  if (latestE1rm <= startingE1rm * TRULY_DECLINING_RATIO) {
    kind = "declining";
  } else {
    const min = Math.min(...series);
    const max = Math.max(...series);
    const variancePct = (max - min) / startingE1rm;
    kind = variancePct < FLAT_VARIANCE_PCT ? "flat" : "net-flat-with-variance";
  }

  return {
    exercise: exerciseName,
    kind,
    sessionsTracked: series.length,
    startingE1rm,
    latestE1rm,
  };
}

const KIND_PRIORITY: Record<PlateauKind, number> = {
  declining: 0,
  "net-flat-with-variance": 1,
  flat: 2,
};

/**
 * Pick the loudest plateau across all the user's tracked lifts.
 * Priority: declining > net-flat-with-variance > flat — and within a
 * kind, ties broken by the largest drop or longest tracked window.
 */
export function detectPlateauAcrossLifts(
  workouts: StoredWorkout[]
): PlateauDetection | null {
  if (workouts.length === 0) return null;
  const names = getUniqueExerciseNames(workouts);
  const detections: PlateauDetection[] = [];
  for (const name of names) {
    const d = detectPlateauForLift(workouts, name);
    if (d) detections.push(d);
  }
  if (detections.length === 0) return null;
  return detections.sort((a, b) => {
    const byKind = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (byKind !== 0) return byKind;
    const aDrop = (a.startingE1rm - a.latestE1rm) / Math.max(a.startingE1rm, 1);
    const bDrop = (b.startingE1rm - b.latestE1rm) / Math.max(b.startingE1rm, 1);
    if (aDrop !== bDrop) return bDrop - aDrop;
    return b.sessionsTracked - a.sessionsTracked;
  })[0];
}
