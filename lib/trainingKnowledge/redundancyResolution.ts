import { areExercisesRedundant } from "@/lib/trainingKnowledge/exerciseRedundancy";
import { suggestNonRedundantAlternative } from "@/lib/trainingKnowledge/exerciseRedundancy";

type SessionLike = {
  exercises?: Array<{ exerciseId?: string; exerciseName?: string }>;
};

export function detectSessionRedundancy(session: SessionLike): string[] {
  const ex = (session.exercises ?? []).map((e) => e.exerciseId ?? e.exerciseName ?? "");
  const out: string[] = [];
  for (let i = 0; i < ex.length; i++) {
    for (let j = i + 1; j < ex.length; j++) {
      const r = areExercisesRedundant(ex[i], ex[j]);
      if (r.redundant) out.push(`${ex[i]} and ${ex[j]} overlap heavily.`);
    }
  }
  return [...new Set(out)];
}

export function suggestNonRedundantReplacement(
  exerciseIdOrName: string,
  context: { currentExerciseIdsOrNames: string[] }
): string | null {
  return suggestNonRedundantAlternative(exerciseIdOrName, context.currentExerciseIdsOrNames);
}

export function resolveRedundantExerciseConflicts(
  session: SessionLike
): { kept: string[]; removed: string[]; suggestions: string[] } {
  const ex = (session.exercises ?? []).map((e) => e.exerciseId ?? e.exerciseName ?? "");
  const kept: string[] = [];
  const removed: string[] = [];
  const suggestions: string[] = [];
  for (const cur of ex) {
    const conflict = kept.find((k) => areExercisesRedundant(k, cur).redundant);
    if (conflict) {
      removed.push(cur);
      const alt = suggestNonRedundantAlternative(cur, kept);
      if (alt) suggestions.push(`${cur} -> ${alt}`);
      continue;
    }
    kept.push(cur);
  }
  return { kept, removed, suggestions };
}

