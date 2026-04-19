import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import { getRankedSubstitutes } from "@/lib/exerciseSubstitutions";
import { getExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";

export function findExercisesInSameCategory(exerciseIdOrName: string): string[] {
  const ex = getExerciseIntelligence(exerciseIdOrName);
  if (!ex) return [];
  return ex.substitutions ?? [];
}

export function preserveExerciseIntentOnSubstitution(
  exerciseIdOrName: string,
  substituteIdOrName: string,
  context?: { goal?: "strength" | "hypertrophy" | "balanced"; lowFatigue?: boolean }
): boolean {
  const a = getExerciseIntelligence(exerciseIdOrName);
  const b = getExerciseIntelligence(substituteIdOrName);
  if (!a || !b) return false;
  const samePattern = a.movementPattern === b.movementPattern;
  const directOverlap = b.directStimulusMuscles.some((m) => a.directStimulusMuscles.includes(m));
  if (!(samePattern || directOverlap)) return false;
  if (context?.lowFatigue && a.fatigueCost === "high" && b.fatigueCost === "high") return false;
  return true;
}

export function findBestEquipmentAlternative(
  exerciseIdOrName: string,
  availableEquipment: string[]
): string | null {
  const source = getExerciseByIdOrName(exerciseIdOrName);
  if (!source) return null;
  const ranked = getRankedSubstitutes(source.id, availableEquipment, undefined, {
    minScore: 12,
    maxResults: 6,
  });
  return ranked[0]?.exercise?.name ?? null;
}

export function suggestSubstitute(
  exerciseIdOrName: string,
  availableEquipment: string[],
  context?: { goal?: "strength" | "hypertrophy" | "balanced"; lowFatigue?: boolean }
): string | null {
  const alt = findBestEquipmentAlternative(exerciseIdOrName, availableEquipment);
  if (!alt) return null;
  if (!preserveExerciseIntentOnSubstitution(exerciseIdOrName, alt, context)) return null;
  return alt;
}

