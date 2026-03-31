/**
 * Canonical representation for user-defined weekly splits.
 * Standard names (PPL, upper/lower, etc.) map to this shape as muscle groupings only;
 * exercise selection happens downstream via muscle-target day building.
 */

export type SplitEmphasis =
  | "balanced"
  | "upper_emphasis"
  | "lower_emphasis"
  | "strength"
  | "hypertrophy";

export type SplitDayDef = {
  dayLabel: string;
  /** Normalized muscle / region tokens (e.g. chest, back, legs, arms). */
  targetMuscles: string[];
  notes?: string;
};

export type SplitDefinition = {
  title: string;
  days: SplitDayDef[];
  emphasis?: SplitEmphasis;
  /** e.g. user said "4 day split" */
  weeklyFrequencyHint?: number;
  source: "preset" | "parsed" | "adjusted";
};

/** Tags used across exercise metadata + parser output. */
export const CANONICAL_MUSCLE_TOKENS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "biceps",
  "triceps",
  "glutes",
  "hamstrings",
  "quads",
  "calves",
  "core",
] as const;

export type CanonicalMuscleToken = (typeof CANONICAL_MUSCLE_TOKENS)[number];
