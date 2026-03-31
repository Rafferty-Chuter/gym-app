import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { resolveLoggedExerciseMeta } from "@/lib/exerciseLibrary";
import { countCompletedLoggedSets } from "@/lib/completedSets";
import type { MuscleGroupId } from "@/lib/muscleGroupRules";
import { MUSCLE_GROUP_RULES } from "@/lib/muscleGroupRules";
import { mapExerciseToMuscleStimulus } from "@/lib/muscleGroupMapper";

function ensureBase(): Record<MuscleGroupId, number> {
  const out = {} as Record<MuscleGroupId, number>;
  (Object.keys(MUSCLE_GROUP_RULES) as MuscleGroupId[]).forEach((id) => (out[id] = 0));
  return out;
}

export type MuscleVolumeEstimate = {
  directSets: Record<MuscleGroupId, number>;
  totalSets: Record<MuscleGroupId, number>;
};

function isWithinLast7Days(iso: string, nowMs: number): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const cutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

export function estimateWeeklyMuscleVolumeFromWorkouts(params: {
  workouts: StoredWorkout[];
  nowMs?: number;
}): MuscleVolumeEstimate {
  const nowMs = params.nowMs ?? Date.now();
  const directSets = ensureBase();
  const totalSets = ensureBase();

  for (const w of params.workouts ?? []) {
    if (!w?.completedAt) continue;
    if (!isWithinLast7Days(w.completedAt, nowMs)) continue;
    for (const ex of w.exercises ?? []) {
      const setCount = countCompletedLoggedSets(ex.sets ?? []);
      if (!setCount) continue;

      const meta = resolveLoggedExerciseMeta({ name: ex.name });
      if (!meta) continue;

      const stim = mapExerciseToMuscleStimulus(meta);
      if (!stim.direct.length && !stim.indirect.length) continue;

      for (const g of stim.direct) directSets[g] += setCount / stim.direct.length;
      for (const g of stim.direct) totalSets[g] += setCount / stim.direct.length;
      for (const g of stim.indirect) totalSets[g] += (setCount / Math.max(1, stim.indirect.length)) * 0.5;
    }
  }

  return { directSets, totalSets };
}

export function muscleVolumeSummaryForAssistant(params: {
  workouts: StoredWorkout[];
  nowMs?: number;
  onlyIncludeNonZero?: boolean;
}): string {
  const { directSets } = estimateWeeklyMuscleVolumeFromWorkouts(params);
  const lines: string[] = [];
  for (const id of Object.keys(MUSCLE_GROUP_RULES) as MuscleGroupId[]) {
    const sets = directSets[id] ?? 0;
    if (params.onlyIncludeNonZero && sets <= 0) continue;
    const rule = MUSCLE_GROUP_RULES[id];
    const status =
      sets < rule.typicalWeeklySetRange.min
        ? "low"
        : sets > rule.typicalWeeklySetRange.high
          ? "high"
          : "target";
    lines.push(`- ${rule.displayName}: ~${Math.round(sets)} direct sets (${status}; practical ${rule.typicalWeeklySetRange.min}–${rule.typicalWeeklySetRange.high} high-band).`);
  }
  if (lines.length === 0) return "- (no recent volume data to estimate)";
  return `Muscle-aware hypertrophy volume estimate (direct sets, last 7 days):\n${lines.join("\n")}`;
}

