import type { ExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";
import {
  getAllExerciseIntelligence,
  getExerciseIntelligence,
} from "@/lib/trainingKnowledge/exerciseMetadata";

function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a.map((x) => x.toLowerCase()));
  return b.filter((x) => set.has(x.toLowerCase())).length;
}

export function areExercisesRedundant(aIdOrName: string, bIdOrName: string): {
  redundant: boolean;
  score: number;
  reason: string;
} {
  const a = getExerciseIntelligence(aIdOrName);
  const b = getExerciseIntelligence(bIdOrName);
  if (!a || !b) return { redundant: false, score: 0, reason: "Exercise metadata unavailable." };
  let score = 0;
  if (a.redundancyGroup === b.redundancyGroup) score += 45;
  if (a.movementPattern === b.movementPattern) score += 30;
  if (a.lengthBias === b.lengthBias) score += 10;
  score += Math.min(15, overlapCount(a.directStimulusMuscles, b.directStimulusMuscles) * 8);
  return {
    redundant: score >= 55,
    score,
    reason:
      score >= 55
        ? "High overlap in movement pattern and target profile."
        : "Partial overlap but likely acceptable variation.",
  };
}

type SessionLike = {
  exercises?: Array<{ exerciseId?: string; exerciseName?: string }>;
};

export function detectRedundantExerciseStacking(sessionOrProgramme: SessionLike | { days?: SessionLike[] }): string[] {
  const sessions = Array.isArray((sessionOrProgramme as any).days)
    ? (sessionOrProgramme as any).days
    : [sessionOrProgramme];
  const out: string[] = [];
  for (const s of sessions) {
    const chosen: ExerciseIntelligence[] = (s.exercises ?? [])
      .map((e: { exerciseId?: string; exerciseName?: string }) =>
        getExerciseIntelligence(e.exerciseId ?? e.exerciseName ?? "")
      )
      .filter((x: ExerciseIntelligence | null): x is ExerciseIntelligence => Boolean(x));
    for (let i = 0; i < chosen.length; i++) {
      for (let j = i + 1; j < chosen.length; j++) {
        const r = areExercisesRedundant(chosen[i].id, chosen[j].id);
        if (r.redundant) {
          out.push(`${chosen[i].name} and ${chosen[j].name} are highly overlapping for this session.`);
        }
      }
    }
  }
  return [...new Set(out)];
}

export function suggestNonRedundantAlternative(
  exerciseIdOrName: string,
  contextExerciseIdsOrNames: string[]
): string | null {
  const ex = getExerciseIntelligence(exerciseIdOrName);
  if (!ex) return null;
  const context = contextExerciseIdsOrNames
    .map((x: string) => getExerciseIntelligence(x))
    .filter((x: ExerciseIntelligence | null): x is ExerciseIntelligence => Boolean(x));
  const all = getAllExerciseIntelligence();
  const candidate = all.find((c) => {
    if (c.id === ex.id) return false;
    if (!overlapCount(c.directStimulusMuscles, ex.directStimulusMuscles)) return false;
    if (context.some((k) => areExercisesRedundant(k.id, c.id).redundant)) return false;
    return c.movementPattern !== ex.movementPattern || c.lengthBias !== ex.lengthBias;
  });
  return candidate?.name ?? null;
}

