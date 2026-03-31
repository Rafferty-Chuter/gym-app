import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";

type DraftExercise = {
  exerciseId?: string;
  exerciseName: string;
};

function rankForOrder(ex: DraftExercise, priorityIds: Set<string>): number {
  const meta = getExerciseByIdOrName(ex.exerciseId ?? ex.exerciseName);
  if (!meta) return 0;
  let score = 0;
  if (priorityIds.has(meta.id)) score += 20;
  if (meta.role === "main_compound") score += 16;
  if (meta.role === "secondary_compound") score += 10;
  if (meta.role === "machine_compound") score += 7;
  if (meta.role === "isolation") score -= 4;
  if (meta.movementPattern.includes("hip_hinge") || meta.movementPattern.includes("squat")) score += 4;
  return score;
}

export function shouldExerciseGoEarly(
  exercise: DraftExercise,
  context?: { priorityExerciseIds?: string[] }
): boolean {
  const score = rankForOrder(exercise, new Set(context?.priorityExerciseIds ?? []));
  return score >= 10;
}

export function orderExercisesForSession<T extends DraftExercise>(
  sessionDraft: T[],
  context?: { priorityExerciseIds?: string[] }
): T[] {
  const priority = new Set(context?.priorityExerciseIds ?? []);
  return [...sessionDraft].sort((a, b) => rankForOrder(b, priority) - rankForOrder(a, priority));
}

export function suggestBetterExerciseOrder<T extends DraftExercise>(
  session: T[],
  context?: { priorityExerciseIds?: string[] }
): string | null {
  const ordered = orderExercisesForSession(session, context);
  if (ordered.length < 2) return null;
  const changed = ordered.some((ex, i) => ex.exerciseName !== session[i]?.exerciseName);
  if (!changed) return null;
  return `Consider ordering compounds and priority lifts earlier, then accessories/isolations later for lower fatigue carryover.`;
}

