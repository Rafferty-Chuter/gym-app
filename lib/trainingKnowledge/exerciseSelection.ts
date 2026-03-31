import { getAllExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";
import { getExerciseContribution } from "@/lib/trainingKnowledge/exerciseContribution";
import { getExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";

export function suggestExerciseForMuscle(
  muscle: string,
  sessionContext: { fatigueMode?: "normal" | "low_fatigue"; avoidIds?: string[] },
  goal: "hypertrophy" | "strength" | "balanced" = "hypertrophy"
): string | null {
  const avoid = new Set((sessionContext.avoidIds ?? []).map((x) => x.toLowerCase()));
  const all = getAllExerciseIntelligence()
    .filter((e) => !avoid.has(e.id.toLowerCase()))
    .filter((e) =>
      e.directStimulusMuscles.includes(muscle as any) || e.primaryMuscles.some((m) => m.toLowerCase().includes(muscle.toLowerCase()))
    );
  const sorted = all.sort((a, b) => {
    let sa = 0;
    let sb = 0;
    if (goal === "hypertrophy") {
      if (a.exerciseRole === "isolation" || a.exerciseRole === "secondary_compound") sa += 10;
      if (b.exerciseRole === "isolation" || b.exerciseRole === "secondary_compound") sb += 10;
    }
    if (sessionContext.fatigueMode === "low_fatigue") {
      if (a.fatigueCost === "low") sa += 10;
      if (b.fatigueCost === "low") sb += 10;
    }
    if (a.lengthBias === "lengthened") sa += 4;
    if (b.lengthBias === "lengthened") sb += 4;
    return sb - sa;
  });
  return sorted[0]?.name ?? null;
}

export function chooseBetweenRedundantExercises(
  candidateIdsOrNames: string[],
  context: { fatigueMode?: "normal" | "low_fatigue" }
): string | null {
  const all = candidateIdsOrNames
    .map((x) => getAllExerciseIntelligence().find((e) => e.id === x || e.name.toLowerCase() === x.toLowerCase()))
    .filter(Boolean);
  if (!all.length) return null;
  const best = all.sort((a: any, b: any) => {
    const fatigueA = context.fatigueMode === "low_fatigue" ? (a.fatigueCost === "low" ? 1 : 0) : 0;
    const fatigueB = context.fatigueMode === "low_fatigue" ? (b.fatigueCost === "low" ? 1 : 0) : 0;
    const roleA = a.exerciseRole === "primary_compound" ? 2 : a.exerciseRole === "secondary_compound" ? 1 : 0;
    const roleB = b.exerciseRole === "primary_compound" ? 2 : b.exerciseRole === "secondary_compound" ? 1 : 0;
    return fatigueB + roleB - (fatigueA + roleA);
  })[0];
  return best?.name ?? null;
}

export function getExerciseRole(exerciseIdOrName: string): string | null {
  return getExerciseIntelligence(exerciseIdOrName)?.exerciseRole ?? null;
}

export function shouldExerciseCountAsDirectWork(exerciseIdOrName: string, muscle: string): boolean {
  const ex = getExerciseIntelligence(exerciseIdOrName);
  if (!ex) return false;
  const m = muscle.toLowerCase();
  return (
    ex.directStimulusMuscles.some((x) => x.toLowerCase() === m) ||
    ex.primaryMuscles.some((x) => x.toLowerCase().includes(m))
  );
}

export function isExerciseAppropriateForTargetMuscle(
  exerciseIdOrName: string,
  targetMuscle: string,
  goal: "hypertrophy" | "strength" | "balanced"
): boolean {
  const ex = getExerciseIntelligence(exerciseIdOrName);
  if (!ex) return false;
  const target = targetMuscle.toLowerCase();
  const direct = shouldExerciseCountAsDirectWork(exerciseIdOrName, target);
  if (goal === "hypertrophy") return direct || ex.exerciseRole === "isolation";
  if (goal === "strength") return direct && ex.exerciseRole !== "isolation";
  return direct || ex.indirectStimulusMuscles.some((m) => m.toLowerCase() === target);
}

export function explainWhatExerciseContributes(
  exerciseIdOrName: string,
  targetContext?: string
): string | null {
  const c = getExerciseContribution(exerciseIdOrName);
  if (!c) return null;
  const ctx = targetContext ? ` for ${targetContext}` : "";
  return `${c.name}${ctx}: primary muscles ${c.primaryMuscles.join(", ")}, secondary ${c.secondaryMuscles.join(
    ", "
  )}.`;
}

