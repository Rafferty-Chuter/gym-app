import { EXERCISE_METADATA_LIBRARY } from "@/lib/exerciseMetadataLibrary";

/** Compact catalog for constraint extraction (id + display name). */
export function getExerciseCatalogForLLM(): Array<{ id: string; name: string }> {
  return EXERCISE_METADATA_LIBRARY.map((e) => ({ id: e.id, name: e.name }));
}

export function exerciseIdWhitelist(): Set<string> {
  return new Set(EXERCISE_METADATA_LIBRARY.map((e) => e.id));
}
