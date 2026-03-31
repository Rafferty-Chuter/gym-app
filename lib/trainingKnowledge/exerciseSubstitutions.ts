import { getRankedSubstitutes } from "@/lib/exerciseSubstitutions";
import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import { suggestNonRedundantAlternative } from "@/lib/trainingKnowledge/exerciseRedundancy";

export function suggestSubstitute(
  exerciseIdOrName: string,
  equipment: string[],
  contextExerciseIdsOrNames: string[]
): string | null {
  const source = getExerciseByIdOrName(exerciseIdOrName);
  if (!source) return null;
  const ranked = getRankedSubstitutes(source.id, equipment, undefined, { minScore: 15, maxResults: 5 });
  const nonRedundant = ranked.find(
    (r) => !contextExerciseIdsOrNames.some((x) => x.toLowerCase() === r.exercise.name.toLowerCase())
  );
  if (nonRedundant) return nonRedundant.exercise.name;
  return suggestNonRedundantAlternative(source.id, contextExerciseIdsOrNames);
}

