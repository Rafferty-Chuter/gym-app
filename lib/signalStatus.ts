/**
 * Canonical {state, status} for each home Signal card. Single source of truth
 * shared by the home page and the Signal detail pages so the card label and
 * the detail header header never disagree.
 *
 * Each function takes the same inputs and returns the same shape regardless
 * of caller. Per-page copy (explanation, prompts, charts) is composed on top.
 */

import type { CoachStructuredAnalysis } from "@/lib/coachStructuredAnalysis";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import {
  aggregateLiftTrends,
  getLiftTrendStatus,
  type AggregateLiftTrend,
} from "@/lib/liftTrend";
import { getUniqueExerciseNames } from "@/lib/trainingMetrics";
import { buildVolumeRows, type VolumeRow } from "@/lib/volumeAnalysis";

export type SignalState = "good" | "watch" | "attention" | "unknown";
export type SignalStatusResult = { state: SignalState; status: string };

const EARLY_THRESHOLD_WORKOUTS = 3;

/** Plateau: routes through coach.keyFocusType (already canonical via P0.1). */
export function computePlateauStatus(
  coach: CoachStructuredAnalysis,
  workoutsCount: number
): SignalStatusResult {
  if (workoutsCount === 0) return { state: "unknown", status: "No data yet" };
  if (coach.keyFocusType === "plateau" || coach.keyFocusType === "declining") {
    return { state: "attention", status: "Detected" };
  }
  if (workoutsCount < EARLY_THRESHOLD_WORKOUTS) {
    return { state: "unknown", status: "Early read" };
  }
  return { state: "good", status: "Clear" };
}

/** Progress: routes through aggregateLiftTrends (canonical per-lift e1RM). */
export function computeProgressStatus(workouts: StoredWorkout[]): SignalStatusResult & {
  aggregate: AggregateLiftTrend;
} {
  if (workouts.length === 0) {
    return { state: "unknown", status: "No data yet", aggregate: "limited" };
  }
  if (workouts.length < EARLY_THRESHOLD_WORKOUTS) {
    return { state: "unknown", status: "Early read", aggregate: "limited" };
  }
  const names = getUniqueExerciseNames(workouts);
  const statuses = names.map((n) => getLiftTrendStatus(workouts, n));
  const aggregate = aggregateLiftTrends(statuses);
  if (aggregate === "limited") {
    return { state: "unknown", status: "Limited data", aggregate };
  }
  if (aggregate === "improving") {
    // "Trending up" hedges honestly — it's a majority-of-readable-lifts
    // read, not a claim that every lift is improving. Same vocabulary the
    // assistant uses when describing single lifts.
    return { state: "good", status: "Trending up", aggregate };
  }
  if (aggregate === "declining") {
    return { state: "attention", status: "Trending down", aggregate };
  }
  return { state: "watch", status: "Mixed", aggregate };
}

/**
 * Volume: replicates the detail page's per-muscle classification so the home
 * card sees the same Excessive / Running low / Worth a look / On track verdict.
 */
export function computeVolumeStatus(
  coach: CoachStructuredAnalysis,
  workouts: StoredWorkout[]
): SignalStatusResult & { rows: VolumeRow[] } {
  const rowsRaw = buildVolumeRows(coach, workouts);
  // Render not-tracked rows at the bottom so callers can show them last.
  const rows: VolumeRow[] = [
    ...rowsRaw.filter((r) => r.status !== "not-tracked"),
    ...rowsRaw.filter((r) => r.status === "not-tracked"),
  ];

  if (workouts.length === 0) {
    return { state: "unknown", status: "No data yet", rows };
  }

  const muscleHasAnyHistory = (label: string): boolean => {
    // The detail page used to filter coach.volumeBalance summaries against
    // historical volume; we use buildVolumeRows' "not-tracked" classification
    // (which already encodes "user has never trained this muscle"), so any
    // label whose detailed groups all map to not-tracked rows is structural.
    const key = label.trim().toLowerCase();
    // Keep parity with the detail's COARSE_TO_DETAILED fan-out by checking
    // whether any row matching the label has tracked history.
    const matchingRows = rows.filter((r) => {
      const g = r.group.toLowerCase();
      return g === key || g.startsWith(key) || key.startsWith(g);
    });
    if (matchingRows.length === 0) return true; // Unknown label — let it through.
    return matchingRows.some((r) => r.status !== "not-tracked");
  };

  const lowEntries = coach.volumeBalance.filter(
    (v) =>
      /\b(low|missing|light|behind|below|needs?\s+more)\b/i.test(v.summary) &&
      muscleHasAnyHistory(v.label)
  );

  const lowRows = rows.filter((r) => r.status === "low" && r.sets >= 0);
  const excessiveRows = rows.filter((r) => r.status === "excessive");
  const warningRows = rows.filter((r) => r.status === "warning");

  if (excessiveRows.length > 0) {
    return { state: "attention", status: "Excessive", rows };
  }

  const isLowAttention =
    coach.keyFocusType === "low-volume" || lowEntries.length > 0 || lowRows.length > 0;
  if (isLowAttention) {
    return { state: "attention", status: "Running low", rows };
  }

  if (warningRows.length > 0) {
    return { state: "watch", status: "Worth a look", rows };
  }

  if (coach.volumeBalance.length > 0) {
    return { state: "watch", status: "Worth a look", rows };
  }

  if (workouts.length < EARLY_THRESHOLD_WORKOUTS) {
    return { state: "unknown", status: "Early read", rows };
  }

  return { state: "good", status: "On track", rows };
}
