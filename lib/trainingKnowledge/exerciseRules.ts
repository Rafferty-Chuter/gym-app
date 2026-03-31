import { getExerciseByIdOrName, type ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";
import { mapExerciseToMuscleStimulus } from "@/lib/muscleGroupMapper";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";

export type ExerciseContribution = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  directStimulusMuscles: MuscleRuleId[];
  indirectStimulusMuscles: MuscleRuleId[];
  movementPattern: string;
  role: string;
  fatigueCost: string;
  lengthBias: string;
  redundancyGroup?: string;
  idealUseCases?: string[];
  typicalPlacementInSession?: string;
  recommendedRepRange: string;
  substitutes: string[];
};

export function toExerciseContribution(ex: ExerciseMetadata): ExerciseContribution {
  const stim = mapExerciseToMuscleStimulus(ex);
  return {
    id: ex.id,
    name: ex.name,
    primaryMuscles: ex.primaryMuscles,
    secondaryMuscles: ex.secondaryMuscles,
    directStimulusMuscles: stim.direct as MuscleRuleId[],
    indirectStimulusMuscles: stim.indirect as MuscleRuleId[],
    movementPattern: ex.movementPattern,
    role: ex.role,
    fatigueCost: ex.fatigueCost,
    lengthBias: ex.lengthBias,
    redundancyGroup: ex.redundancyGroup,
    idealUseCases: ex.idealUseCases,
    typicalPlacementInSession: ex.typicalPlacementInSession,
    recommendedRepRange: ex.recommendedRepRange,
    substitutes: ex.substitutes ?? [],
  };
}

export function getExerciseContribution(idOrName: string): ExerciseContribution | null {
  const ex = getExerciseByIdOrName(idOrName);
  if (!ex) return null;
  return toExerciseContribution(ex);
}

export function explainWhatExerciseContributes(
  idOrName: string,
  targetContext?: string
): string | null {
  const e = getExerciseContribution(idOrName);
  if (!e) return null;
  const direct = e.directStimulusMuscles.join(", ") || "none";
  const indirect = e.indirectStimulusMuscles.join(", ") || "none";
  const ctx = targetContext?.trim() ? ` in ${targetContext}` : "";
  return `${e.name}${ctx}: direct stimulus -> ${direct}; indirect stimulus -> ${indirect}; pattern=${e.movementPattern}; role=${e.role}; length bias=${e.lengthBias}.`;
}

