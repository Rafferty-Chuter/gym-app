/**
 * Rep-range and RIR targets per routine exercise (T3). A routine says how
 * many sets; this says how hard each set should be. Defaults come from the
 * movement's role so an old routine gets sensible targets the first time
 * it is read; the editor can change any of them.
 */

import { getExerciseProfile } from "@/lib/exerciseProfiles";

export type RepTargets = { repMin: number; repMax: number; rir: number };

/** Compounds: 6 to 10 at RIR 2. EVID: growth is similar from 6 to 30 reps when sets stop near failure; heavy compounds stop two short to keep fatigue and form in hand. */
export const COMPOUND_TARGETS: RepTargets = { repMin: 6, repMax: 10, rir: 2 };
/** Isolations: 10 to 15 at RIR 1. EVID: lighter loads can go closer to failure with less systemic fatigue and joint cost. */
export const ISOLATION_TARGETS: RepTargets = { repMin: 10, repMax: 15, rir: 1 };
/** A movement the library does not know: the middle of the road. OURS. */
export const DEFAULT_TARGETS: RepTargets = { repMin: 8, repMax: 12, rir: 2 };

export const REP_MIN = 1;
export const REP_MAX = 50;
export const RIR_MIN = 0;
export const RIR_MAX = 5;

/** The role default for a movement, by its profile category. */
export function targetsForExercise(name: string): RepTargets {
  const profile = getExerciseProfile(name);
  if (!profile) return DEFAULT_TARGETS;
  return profile.category === "isolation" ? ISOLATION_TARGETS : COMPOUND_TARGETS;
}

const clamp = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};

/**
 * Whole, clamped targets from whatever was stored, with the role default
 * filling anything missing; min and max are swapped when reversed.
 */
export function normaliseTargets(input: { repMin?: unknown; repMax?: unknown; rir?: unknown }, fallback: RepTargets): RepTargets {
  let repMin = clamp(input.repMin, REP_MIN, REP_MAX) ?? fallback.repMin;
  let repMax = clamp(input.repMax, REP_MIN, REP_MAX) ?? fallback.repMax;
  if (repMin > repMax) [repMin, repMax] = [repMax, repMin];
  const rir = clamp(input.rir, RIR_MIN, RIR_MAX) ?? fallback.rir;
  return { repMin, repMax, rir };
}

/** "6 to 10 · RIR 2", or "8 · RIR 2" when the range is one number. */
export function targetLabel(t: RepTargets): string {
  const reps = t.repMin === t.repMax ? `${t.repMin}` : `${t.repMin} to ${t.repMax}`;
  return `${reps} · RIR ${t.rir}`;
}

/** "6 to 10", "6-10", "6–10", "8": the editor's rep field, or null when it is not a range. */
export function parseRepRange(text: string): { repMin: number; repMax: number } | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2})\s*(?:-|–|—|to)?\s*(\d{1,2})?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  if (a < REP_MIN || b < REP_MIN || a > REP_MAX || b > REP_MAX) return null;
  return a <= b ? { repMin: a, repMax: b } : { repMin: b, repMax: a };
}

/** The editor's rep field text for a target. */
export function repRangeText(t: { repMin: number; repMax: number }): string {
  return t.repMin === t.repMax ? `${t.repMin}` : `${t.repMin}-${t.repMax}`;
}
