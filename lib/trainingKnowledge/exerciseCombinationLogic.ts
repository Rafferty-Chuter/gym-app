import { getExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";
import { ruleForMuscle } from "@/lib/trainingKnowledge/exerciseSelectionRules";

export function doesExerciseAddDistinctStimulus(
  candidateExercise: string,
  currentExercises: string[]
): boolean {
  const c = getExerciseIntelligence(candidateExercise);
  if (!c) return false;
  for (const cur of currentExercises) {
    const e = getExerciseIntelligence(cur);
    if (!e) continue;
    const samePattern = e.movementPattern === c.movementPattern;
    const sameAngle = e.lengthBias === c.lengthBias;
    const samePrimary = e.directStimulusMuscles.some((m) => c.directStimulusMuscles.includes(m));
    if (samePattern && sameAngle && samePrimary) return false;
  }
  return true;
}

export function shouldAddSecondExerciseForMuscle(
  muscle: string,
  currentExercises: string[],
  context?: { priority?: boolean }
): boolean {
  const rule = ruleForMuscle(muscle as any);
  if (!rule) return context?.priority ?? false;
  if (currentExercises.length === 0) return true;
  if (currentExercises.length >= 2 && !context?.priority) return false;
  return true;
}

export function chooseBestPrimaryExerciseForMuscle(
  muscle: string,
  context: { candidates: string[] }
): string | null {
  const list = context.candidates.map((c) => getExerciseIntelligence(c)).filter(Boolean) as any[];
  const direct = list.filter((e) => e.directStimulusMuscles.includes(muscle));
  const compounds = direct.filter((e) =>
    ["primary_compound", "secondary_compound", "machine_compound"].includes(e.exerciseRole)
  );
  return (compounds[0] ?? direct[0] ?? list[0])?.name ?? null;
}

export function chooseBestSecondaryExerciseForMuscle(
  muscle: string,
  currentExercises: string[],
  context: { candidates: string[] }
): string | null {
  const cands = context.candidates.filter((c) => doesExerciseAddDistinctStimulus(c, currentExercises));
  if (!cands.length) return null;
  return chooseBestPrimaryExerciseForMuscle(muscle, { candidates: cands });
}

