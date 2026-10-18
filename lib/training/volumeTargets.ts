/**
 * Muscle priorities and weekly set targets (T5), after RP's Emphasise /
 * Grow / Maintain and its volume landmarks (research B, RP-5 and RP-6).
 * A priority per muscle turns the landmarks into a weekly band of hard
 * sets; a week's count is read against the band only on evidence: over
 * at any time, in range once reached, under only when the week is done.
 * Pure: no storage, no clock.
 */

import { MUSCLE_RANGES, VOLUME_GROUP_ORDER, type MuscleGroup } from "@/lib/volumeAnalysis";
import type { Phase } from "@/lib/training/progression";

export type Priority = "maintain" | "grow" | "emphasise";
export type Priorities = Partial<Record<MuscleGroup, Priority>>;
export type Band = { low: number; high: number };
export type Landmarks = { mv: number; mev: number; mrv: number };
export type VolumeRead = "under" | "in_range" | "over" | "pending" | "untracked";

/** A muscle nobody has set a priority for grows: the middle setting, closer to MEV than MRV. PUB (RP-5). */
export const DEFAULT_PRIORITY: Priority = "grow";
/** Emphasise slots are limited; three is what a week can carry. OURS, after RP's limited slots and MacroFactor's five focus points. */
export const EMPHASISE_MAX = 3;
/** Maintenance volume: about 6 hard sets a week keeps a muscle. PUB (RP-6). */
export const MV_SETS = 6;
/** Grow stays within a few sets of MEV. Inferred (research B §8). */
export const GROW_CEILING_ABOVE_MEV = 4;
/** Emphasise starts a little above MEV so it reads differently from Grow. OURS. */
export const EMPHASISE_FLOOR_ABOVE_MEV = 2;
/** On a cut the ceiling comes down: recovery is lower in a deficit. Inferred (research B §8). */
export const CUT_MRV_FACTOR = 0.8;
/** On a lean bulk Grow is allowed a little further up, since the surplus carries more volume (research B §5: push volume to the ceiling). Inferred. */
export const BULK_GROW_CEILING_BONUS = 2;

/** MV, MEV and MRV for a muscle: MV from RP, MEV and MRV seeded from the ranges the Volume signal already used. Read at call time, not module load, so import order never matters. */
export function landmarks(group: MuscleGroup): Landmarks {
  const range = MUSCLE_RANGES[group];
  return { mv: MV_SETS, mev: range.min, mrv: range.max };
}

export const PRIORITY_LABEL: Record<Priority, string> = { maintain: "Maintain", grow: "Grow", emphasise: "Emphasise" };

export function priorityOf(priorities: Priorities | null | undefined, group: MuscleGroup): Priority {
  return priorities?.[group] ?? DEFAULT_PRIORITY;
}

/** How many muscles are set to Emphasise. */
export function emphasisedCount(priorities: Priorities | null | undefined): number {
  return emphasisedGroups(priorities).length;
}

/** The muscles set to Emphasise: the "priority muscles" a lean gain is read on (B3). */
export function emphasisedGroups(priorities: Priorities | null | undefined): MuscleGroup[] {
  if (!priorities) return [];
  return (Object.entries(priorities) as Array<[MuscleGroup, Priority]>).filter(([, p]) => p === "emphasise").map(([g]) => g);
}

/**
 * The weekly band of hard sets for a muscle at a priority:
 * Maintain sits between MV and MEV, Grow between MEV and a few sets
 * above it (two more on a lean bulk), Emphasise from a little above MEV
 * up to MRV (lowered on a cut).
 */
export function targetBand(group: MuscleGroup, priority: Priority, phase: Phase = "maintain"): Band {
  const { mv, mev, mrv } = landmarks(group);
  const ceiling = phase === "cut" ? Math.round(mrv * CUT_MRV_FACTOR) : mrv;
  switch (priority) {
    case "maintain":
      return { low: mv, high: mev };
    case "emphasise":
      return { low: Math.min(mev + EMPHASISE_FLOOR_ABOVE_MEV, ceiling), high: ceiling };
    default:
      return { low: mev, high: Math.min(mev + GROW_CEILING_ABOVE_MEV + (phase === "lean_bulk" ? BULK_GROW_CEILING_BONUS : 0), ceiling) };
  }
}

/** Every muscle's band for a set of priorities. */
export function bandsFor(priorities: Priorities | null | undefined, phase: Phase = "maintain"): Record<MuscleGroup, Band> {
  return Object.fromEntries(VOLUME_GROUP_ORDER.map((g) => [g, targetBand(g, priorityOf(priorities, g), phase)])) as Record<MuscleGroup, Band>;
}

/**
 * A week's hard sets against the band, on evidence only: over the band
 * is over at any time, inside it is in range, below it is under only once
 * the week is complete (before that it is pending), and a muscle never
 * trained in the history is untracked rather than under.
 */
export function readVolume(sets: number, band: Band, opts: { tracked: boolean; complete: boolean }): VolumeRead {
  if (!opts.tracked) return "untracked";
  if (sets > band.high) return "over";
  if (sets >= band.low) return "in_range";
  return opts.complete ? "under" : "pending";
}

/** "10 to 14", or "12" when the band is one number. */
export function bandLabel(b: Band): string {
  return b.low === b.high ? `${b.low}` : `${b.low} to ${b.high}`;
}

export const READ_LABEL: Record<VolumeRead, string> = { under: "Under", in_range: "In range", over: "Over", pending: "So far", untracked: "Not trained" };
