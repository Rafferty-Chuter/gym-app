/**
 * Per-muscle weekly volume classification. Shared between the home Volume
 * signal card and the detail page so they read the same numbers.
 *
 * MEV–MAV style hard-set ranges. Deliberately fuzzy; intent is to catch
 * "clearly under" or "clearly over", not to micro-optimise.
 */

import {
  DEFAULT_DETAILED_MUSCLE_GROUPS,
  getDetailedMuscleGroupsForLoggedExercise,
  getDetailedVolumeByMuscleGroup,
  type DetailedMuscleGroup,
} from "@/lib/trainingMetrics";
import { getWorkoutsFromLast7Days, type StoredWorkout } from "@/lib/trainingAnalysis";
import type { CoachStructuredAnalysis } from "@/lib/coachStructuredAnalysis";

export const VOLUME_GROUP_ORDER = DEFAULT_DETAILED_MUSCLE_GROUPS as readonly DetailedMuscleGroup[];
export type MuscleGroup = DetailedMuscleGroup;

export type ProgressionState = "good" | "poor" | "unclear";
export type VolumeStatus = "not-tracked" | "low" | "on-track" | "warning" | "excessive";

export const MUSCLE_RANGES: Record<MuscleGroup, { min: number; max: number }> = {
  chest: { min: 10, max: 20 },
  back: { min: 12, max: 22 },
  shoulders: { min: 8, max: 18 },
  biceps: { min: 8, max: 18 },
  triceps: { min: 8, max: 18 },
  quads: { min: 10, max: 20 },
  hamstrings: { min: 8, max: 16 },
  glutes: { min: 8, max: 16 },
  calves: { min: 8, max: 18 },
  abs: { min: 8, max: 16 },
  traps: { min: 6, max: 12 },
  "rear-delts": { min: 6, max: 14 },
};

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abs: "Abs",
  traps: "Traps",
  "rear-delts": "Rear delts",
};

/** Coach analysis still emits coarse group names; fan them out so a "low legs" focus highlights every detailed leg subgroup. */
export const COARSE_TO_DETAILED: Record<string, MuscleGroup[]> = {
  chest: ["chest"],
  back: ["back"],
  shoulders: ["shoulders"],
  arms: ["biceps", "triceps"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
};

export function getProgressionByMuscle(
  coach: CoachStructuredAnalysis
): Record<MuscleGroup, ProgressionState> {
  const out = Object.fromEntries(
    VOLUME_GROUP_ORDER.map((g) => [g, "unclear" as ProgressionState])
  ) as Record<MuscleGroup, ProgressionState>;

  const setState = (g: MuscleGroup | undefined | null, state: ProgressionState) => {
    if (!g || !(g in out)) return;
    if (state === "poor") {
      out[g] = "poor";
    } else if (state === "good" && out[g] !== "poor") {
      out[g] = "good";
    }
  };

  const setStateForExercise = (exName: string, state: ProgressionState) => {
    const groups = getDetailedMuscleGroupsForLoggedExercise({ name: exName });
    for (const g of groups) setState(g, state);
  };

  const setStateForCoarseOrDetailed = (raw: string, state: ProgressionState) => {
    const key = raw.trim().toLowerCase();
    const fan = COARSE_TO_DETAILED[key];
    if (fan) {
      for (const g of fan) setState(g, state);
      return;
    }
    if ((VOLUME_GROUP_ORDER as readonly string[]).includes(key)) {
      setState(key as MuscleGroup, state);
    }
  };

  if (coach.keyFocusType === "plateau" || coach.keyFocusType === "declining") {
    if (coach.keyFocusExercise) setStateForExercise(coach.keyFocusExercise, "poor");
    if (coach.keyFocusGroups) {
      for (const g of coach.keyFocusGroups) setStateForCoarseOrDetailed(g, "poor");
    }
  }

  if (coach.keyFocusType === "progressing" && coach.keyFocusExercise) {
    setStateForExercise(coach.keyFocusExercise, "good");
  }

  for (const text of coach.whatsGoingWell) {
    const cleaned = text.replace(/^\s*Early signal:\s*/i, "").trim();
    const match = cleaned.match(
      /^([A-Za-z][A-Za-z\s\-()'./]+?)\s+(?:is\s+)?(?:progressing|improving)\b/i
    );
    if (match) setStateForExercise(match[1].trim(), "good");
  }

  return out;
}

export function classifyMuscleVolume(
  group: MuscleGroup,
  sets: number,
  progression: ProgressionState,
  historicalSets: number
): VolumeStatus {
  // A muscle the user has never trained in the imported history is not "low" —
  // it's untracked. Painting it rose creates false positives that destroy trust
  // with users whose split simply doesn't cover that muscle.
  if (historicalSets === 0) return "not-tracked";
  const range = MUSCLE_RANGES[group];
  if (sets < range.min) return "low";
  if (sets <= range.max) return "on-track";
  if (progression === "good") return "warning";
  return "excessive";
}

export type VolumeRow = {
  group: MuscleGroup;
  sets: number;
  progression: ProgressionState;
  status: VolumeStatus;
};

/**
 * Build the per-muscle row table the Volume signal reasons about. The home
 * card and the detail page both call this so they classify the same way.
 */
export function buildVolumeRows(
  coach: CoachStructuredAnalysis,
  workouts: StoredWorkout[]
): VolumeRow[] {
  const weeklyWorkouts = getWorkoutsFromLast7Days(workouts);
  const weeklyVolume = getDetailedVolumeByMuscleGroup(weeklyWorkouts);
  const historicalVolume = getDetailedVolumeByMuscleGroup(workouts);
  const progressionByMuscle = getProgressionByMuscle(coach);

  return VOLUME_GROUP_ORDER.map((g) => {
    const sets = weeklyVolume[g] ?? 0;
    const historical = historicalVolume[g] ?? 0;
    return {
      group: g,
      sets,
      progression: progressionByMuscle[g],
      status: classifyMuscleVolume(g, sets, progressionByMuscle[g], historical),
    };
  });
}
