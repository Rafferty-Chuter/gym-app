import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";

/**
 * Returns exercise ids still present in the programme that the user asked to exclude.
 */
export function findExcludedExercisesPresentInProgramme(
  programme: AssistantStructuredProgramme,
  excludedExerciseIds: string[]
): string[] {
  if (!excludedExerciseIds.length) return [];
  const banned = new Set(excludedExerciseIds);
  const seen = new Set<string>();
  for (const day of programme.days ?? []) {
    for (const row of day.exercises ?? []) {
      const name = row.exerciseName?.trim();
      if (!name) continue;
      const meta = getExerciseByIdOrName(name);
      if (meta && banned.has(meta.id)) seen.add(meta.id);
    }
  }
  return [...seen];
}
