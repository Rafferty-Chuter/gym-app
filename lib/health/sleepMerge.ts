/**
 * One night from several uploads (S11). Health Auto Export's "Since Last
 * Sync" sends what arrived since its last run, so a run in the small hours
 * splits a night in two: the first half in one upload, the rest in the
 * next. The server kept one row per day and the last upload won, so the
 * night became its second half (a 7h 38m night stored as 5h 22m from
 * 03:52). Now each sleep row is merged with the one already stored:
 * adjacent halves of a night add up, a part sent again never replaces the
 * whole, and a fuller or corrected night replaces a partial one. Pure.
 */

import { MAX_SEGMENTS } from "@/lib/health/hae";
import type { SleepSegment } from "@/lib/physique/types";

/** A night as the ingest route stores it (the `value` of a sleep row). */
export type StoredNight = {
  asleepMin: number;
  inBedMin: number | null;
  bedtime: string | null;
  wakeTime: string | null;
  stages: { coreMin: number | null; deepMin: number | null; remMin: number | null; awakeMin: number | null };
  segments?: SleepSegment[];
};

/** Two parts of one night may overlap this much where the upload boundary cut them (rounding at the boundary). OURS. */
export const SPLIT_OVERLAP_TOLERANCE_MIN = 10;
/** Parts further apart than this are separate sleeps (a nap, a night broken by an hour up), not one night cut by an upload. OURS. */
export const SPLIT_MAX_GAP_MIN = 60;

function clockMin(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The night's span in minutes from midnight of its wake day; the bedtime is the evening before when it is later than the wake time. */
export function nightSpan(n: StoredNight): { start: number; end: number } | null {
  const end = clockMin(n.wakeTime);
  const bed = clockMin(n.bedtime);
  if (end == null || bed == null) return null;
  return { start: bed <= end ? bed : bed - 1440, end };
}

const add = (a: number | null, b: number | null): number | null => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));

/** Two adjacent halves of one night as one: minutes and stages added, the earlier bedtime and the later wake, stage segments laid end to end. */
function combine(first: StoredNight, firstStart: number, second: StoredNight, secondStart: number): StoredNight {
  const segments =
    first.segments?.length && second.segments?.length
      ? [...first.segments, ...second.segments.map((s) => ({ ...s, o: s.o + (secondStart - firstStart) }))].sort((a, b) => a.o - b.o).slice(0, MAX_SEGMENTS)
      : undefined;
  return {
    asleepMin: first.asleepMin + second.asleepMin,
    inBedMin: first.inBedMin != null && second.inBedMin != null ? first.inBedMin + second.inBedMin : null,
    bedtime: first.bedtime,
    wakeTime: second.wakeTime,
    stages: {
      coreMin: add(first.stages.coreMin, second.stages.coreMin),
      deepMin: add(first.stages.deepMin, second.stages.deepMin),
      remMin: add(first.stages.remMin, second.stages.remMin),
      awakeMin: add(first.stages.awakeMin, second.stages.awakeMin),
    },
    ...(segments ? { segments } : {}),
  };
}

/**
 * The night to store when `incoming` arrives for a day that already has
 * `existing`:
 * - no times on either: the longer one (a partial night is never longer);
 * - apart, within SPLIT_MAX_GAP_MIN and overlapping at most
 *   SPLIT_OVERLAP_TOLERANCE_MIN: one night cut by an upload, so combined;
 * - further apart: separate sleeps, so the longer one, which is the night;
 * - overlapping: the incoming night when it is at least as long (a fuller
 *   or corrected night), otherwise the stored one (a part sent again).
 */
export function mergeNight(existing: StoredNight | null, incoming: StoredNight): StoredNight {
  if (!existing) return incoming;
  const a = nightSpan(existing);
  const b = nightSpan(incoming);
  if (!a || !b) return incoming.asleepMin >= existing.asleepMin ? incoming : existing;
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (overlap <= SPLIT_OVERLAP_TOLERANCE_MIN) {
    const gap = -overlap;
    if (gap > SPLIT_MAX_GAP_MIN) return incoming.asleepMin >= existing.asleepMin ? incoming : existing;
    return a.start <= b.start ? combine(existing, a.start, incoming, b.start) : combine(incoming, b.start, existing, a.start);
  }
  return incoming.asleepMin >= existing.asleepMin ? incoming : existing;
}
