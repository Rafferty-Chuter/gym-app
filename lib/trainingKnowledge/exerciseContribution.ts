export {
  type ExerciseContribution,
  getExerciseContribution,
  toExerciseContribution,
  explainWhatExerciseContributes,
} from "@/lib/trainingKnowledge/exerciseRules";

import { getExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";

const SECONDARY_SET_CREDIT = 0.4;

export function getPrimarySetCredit(exerciseIdOrName: string, muscle: string): number {
  const ex = getExerciseIntelligence(exerciseIdOrName);
  if (!ex) return 0;
  const m = muscle.toLowerCase();
  if (ex.directStimulusMuscles.some((x) => x.toLowerCase() === m)) return 1;
  if (ex.primaryMuscles.some((x) => x.toLowerCase().includes(m))) return 1;
  return 0;
}

export function getSecondarySetCredit(exerciseIdOrName: string, muscle: string): number {
  const ex = getExerciseIntelligence(exerciseIdOrName);
  if (!ex) return 0;
  const m = muscle.toLowerCase();
  if (ex.indirectStimulusMuscles.some((x) => x.toLowerCase() === m)) return SECONDARY_SET_CREDIT;
  if (ex.secondaryMuscles.some((x) => x.toLowerCase().includes(m))) return SECONDARY_SET_CREDIT;
  return 0;
}

export function getStimulusContribution(exerciseIdOrName: string, muscle: string): number {
  return getPrimarySetCredit(exerciseIdOrName, muscle) + getSecondarySetCredit(exerciseIdOrName, muscle);
}

type SessionLike = {
  exercises?: Array<{ exerciseId?: string; exerciseName?: string; sets?: string | { min: number; max: number } }>;
};

type SetLike = string | { min: number; max: number } | undefined;

function parseSetCount(sets: SetLike): number {
  if (!sets) return 0;
  if (typeof sets === "string") {
    const nums = sets.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
    return nums.length ? Math.max(...nums) : 0;
  }
  return Math.max(sets.min ?? 0, sets.max ?? 0);
}

function sessions(input: SessionLike | { days?: SessionLike[] }): SessionLike[] {
  return Array.isArray((input as any).days) ? (input as any).days : [input as SessionLike];
}

export function getDirectWorkForMuscle(
  sessionOrProgramme: SessionLike | { days?: SessionLike[] },
  muscle: string
): number {
  let total = 0;
  for (const s of sessions(sessionOrProgramme)) {
    for (const ex of s.exercises ?? []) {
      const key = ex.exerciseId ?? ex.exerciseName ?? "";
      total += parseSetCount(ex.sets) * getPrimarySetCredit(key, muscle);
    }
  }
  return total;
}

export function getIndirectWorkForMuscle(
  sessionOrProgramme: SessionLike | { days?: SessionLike[] },
  muscle: string
): number {
  let total = 0;
  for (const s of sessions(sessionOrProgramme)) {
    for (const ex of s.exercises ?? []) {
      const key = ex.exerciseId ?? ex.exerciseName ?? "";
      total += parseSetCount(ex.sets) * getSecondarySetCredit(key, muscle);
    }
  }
  return total;
}

