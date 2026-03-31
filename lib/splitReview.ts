import type { SplitDefinition } from "@/lib/splitDefinition";

/** Rough fatigue weight for sequencing and crowding heuristics. */
const MUSCLE_FATIGUE: Record<string, number> = {
  legs: 3,
  back: 2,
  chest: 2,
  shoulders: 2,
  arms: 1,
  biceps: 1,
  triceps: 1,
  glutes: 2,
  hamstrings: 2,
  quads: 2,
  calves: 1,
  core: 1,
};

function dayFatigueScore(muscles: string[]): number {
  let s = 0;
  for (const m of muscles) {
    s += MUSCLE_FATIGUE[m] ?? 1.5;
  }
  return s;
}

export type SplitReviewResult = {
  ok: boolean;
  warnings: string[];
  confirmations: string[];
  /** Optional auto-adjusted split (e.g. merge overcrowded days). */
  adjusted?: SplitDefinition;
};

/**
 * Validate split structure for crowding, recovery sequencing, and frequency hints.
 */
export function reviewSplit(split: SplitDefinition): SplitReviewResult {
  const warnings: string[] = [];
  const confirmations: string[] = [];

  const n = split.days.length;
  if (n === 0) {
    return { ok: false, warnings: ["Split has no training days."], confirmations: [] };
  }

  for (let i = 0; i < split.days.length; i++) {
    const d = split.days[i];
    const unique = new Set(d.targetMuscles);
    if (unique.size >= 6) {
      warnings.push(
        `${d.dayLabel}: many muscle targets (${unique.size}) — session may run long; consider trimming accessories.`
      );
    }
    const fs = dayFatigueScore(d.targetMuscles);
    if (fs >= 9) {
      warnings.push(
        `${d.dayLabel}: high combined fatigue (${d.targetMuscles.join(", ")}) — watch total sets and leg/back stacking.`
      );
    }
    if (d.targetMuscles.includes("legs") && d.targetMuscles.includes("shoulders")) {
      warnings.push(
        `${d.dayLabel}: shoulders + legs same day can be long — acceptable if volume per muscle is moderate.`
      );
    }
  }

  const muscleToDays = new Map<string, number[]>();
  split.days.forEach((d, idx) => {
    for (const m of d.targetMuscles) {
      const arr = muscleToDays.get(m) ?? [];
      arr.push(idx);
      muscleToDays.set(m, arr);
    }
  });

  for (const [muscle, dayIdxs] of muscleToDays) {
    if (dayIdxs.length >= 2) {
      const sorted = [...dayIdxs].sort((a, b) => a - b);
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] === sorted[j - 1] + 1) {
          warnings.push(
            `${muscle} appears on consecutive days (${split.days[sorted[j - 1]].dayLabel} → ${split.days[sorted[j]].dayLabel}) — consider spacing for recovery.`
          );
        }
      }
    }
    if (["chest", "back", "legs"].includes(muscle) && dayIdxs.length === 1 && n >= 4) {
      warnings.push(
        `${muscle} only once per week across ${n} days — if this muscle is a priority, frequency may be low.`
      );
    }
  }

  if (warnings.length === 0) {
    confirmations.push("Split structure looks workable for typical weekly volume.");
  } else {
    confirmations.push("Review warnings below — the split can still work with sensible volume.");
  }

  return {
    ok: warnings.length < 4,
    warnings,
    confirmations,
  };
}
