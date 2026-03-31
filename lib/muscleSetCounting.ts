import type { AssistantStructuredProgramme, AssistantStructuredProgrammeDebugSource } from "@/lib/programmePipeline/types";
import type { BuiltWorkout } from "@/lib/workoutBuilder";
import { EXERCISE_METADATA_LIBRARY, getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import type { MuscleGroupId } from "@/lib/muscleGroupRules";
import { mapExerciseToMuscleStimulus, mapTargetTokenToMuscleGroup } from "@/lib/muscleGroupMapper";
import { MUSCLE_GROUP_RULES } from "@/lib/muscleGroupRules";

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function ensureBaseRecord(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(MUSCLE_GROUP_RULES)) out[id] = 0;
  return out;
}

export function parseSetRangeMaxFromText(setsText: string | undefined | null): number {
  if (!setsText) return 0;
  const nums = String(setsText).match(/\d+/g)?.map((n) => parseInt(n, 10)).filter(Number.isFinite) ?? [];
  if (!nums.length) return 0;
  return Math.max(...nums);
}

export function parseSetRangeAverageFromText(setsText: string | undefined | null): number {
  if (!setsText) return 0;
  const nums = String(setsText).match(/\d+/g)?.map((n) => parseInt(n, 10)).filter(Number.isFinite) ?? [];
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Count sets by muscle from a built day (single session).
 * Uses max(setMin,setMax) as a conservative “how many sets” approximation.
 */
export function countMuscleSetsByStimulusForBuiltDay(built: BuiltWorkout): Record<MuscleGroupId, number> {
  const out = ensureBaseRecord() as Record<MuscleGroupId, number>;
  for (const ex of built.exercises ?? []) {
    const meta = getExerciseByIdOrName(ex.exerciseId ?? ex.exerciseName);
    if (!meta) continue;
    const setCount = Math.max(ex.sets?.min ?? 0, ex.sets?.max ?? 0);
    const stim = mapExerciseToMuscleStimulus(meta);
    for (const g of stim.direct) out[g] += setCount / Math.max(1, stim.direct.length);
    // Indirect credit is intentionally conservative: we add indirect at half weight.
    for (const g of stim.indirect) out[g] += (setCount / Math.max(1, stim.indirect.length)) * 0.5;
  }
  return out;
}

export function countDirectMuscleSetsByStimulusForBuiltDay(built: BuiltWorkout): Record<MuscleGroupId, number> {
  const out = ensureBaseRecord() as Record<MuscleGroupId, number>;
  for (const ex of built.exercises ?? []) {
    const meta = getExerciseByIdOrName(ex.exerciseId ?? ex.exerciseName);
    if (!meta) continue;
    const setCount = Math.max(ex.sets?.min ?? 0, ex.sets?.max ?? 0);
    const stim = mapExerciseToMuscleStimulus(meta);
    for (const g of stim.direct) out[g] += setCount / Math.max(1, stim.direct.length);
  }
  return out;
}

export function countDirectMuscleSetsByStimulusForStructuredProgramme(
  programme: AssistantStructuredProgramme
): Record<MuscleGroupId, number> {
  const out = ensureBaseRecord() as Record<MuscleGroupId, number>;
  for (const day of programme.days ?? []) {
    for (const ex of day.exercises ?? []) {
      const meta = getExerciseByIdOrName(ex.exerciseName);
      if (!meta) continue;
      const setCount = parseSetRangeMaxFromText(ex.sets);
      const stim = mapExerciseToMuscleStimulus(meta);
      for (const g of stim.direct) out[g] += setCount / Math.max(1, stim.direct.length);
    }
  }
  return out;
}

export function countMuscleSetsByStimulusForStructuredProgramme(
  programme: AssistantStructuredProgramme
): Record<MuscleGroupId, number> {
  const out = ensureBaseRecord() as Record<MuscleGroupId, number>;
  for (const day of programme.days ?? []) {
    for (const ex of day.exercises ?? []) {
      const meta = getExerciseByIdOrName(ex.exerciseName);
      if (!meta) continue;
      const setCount = parseSetRangeMaxFromText(ex.sets);
      const stim = mapExerciseToMuscleStimulus(meta);
      for (const g of stim.direct) out[g] += setCount / Math.max(1, stim.direct.length);
      for (const g of stim.indirect) out[g] += (setCount / Math.max(1, stim.indirect.length)) * 0.5;
    }
  }
  return out;
}

export function countMuscleSetsByStimulusForProgrammeDay(
  programme: AssistantStructuredProgramme,
  dayIndex: number
): Record<MuscleGroupId, number> {
  const out = ensureBaseRecord() as Record<MuscleGroupId, number>;
  const day = programme.days?.[dayIndex];
  if (!day) return out;
  for (const ex of day.exercises ?? []) {
    const meta = getExerciseByIdOrName(ex.exerciseName);
    if (!meta) continue;
    const setCount = parseSetRangeMaxFromText(ex.sets);
    const stim = mapExerciseToMuscleStimulus(meta);
    for (const g of stim.direct) out[g] += setCount / Math.max(1, stim.direct.length);
    for (const g of stim.indirect) out[g] += (setCount / Math.max(1, stim.indirect.length)) * 0.5;
  }
  return out;
}

export function countDirectMuscleSetsByStimulusForProgrammeDay(
  programme: AssistantStructuredProgramme,
  dayIndex: number
): Record<MuscleGroupId, number> {
  const out = ensureBaseRecord() as Record<MuscleGroupId, number>;
  const day = programme.days?.[dayIndex];
  if (!day) return out;
  for (const ex of day.exercises ?? []) {
    const meta = getExerciseByIdOrName(ex.exerciseName);
    if (!meta) continue;
    const setCount = parseSetRangeMaxFromText(ex.sets);
    const stim = mapExerciseToMuscleStimulus(meta);
    for (const g of stim.direct) out[g] += setCount / Math.max(1, stim.direct.length);
  }
  return out;
}

export function getIntendedMuscleGroupsForDay(dayTargetMuscles: string[] | undefined): MuscleGroupId[] {
  if (!dayTargetMuscles?.length) return [];
  const mapped = dayTargetMuscles
    .map((t) => mapTargetTokenToMuscleGroup(t))
    .filter((x): x is MuscleGroupId => Boolean(x));
  // If upper/down tokens come through coarse (e.g. "back"), we keep them; if unknown, drop.
  return uniq(mapped);
}

