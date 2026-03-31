import { getExerciseById, getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";

/**
 * Expand excluded ids to include known substitute variants.
 * Example: excluding `lateral_raise` also excludes cable/machine lateral raise variants.
 */
export function expandExcludedExerciseIds(seedIds: string[]): string[] {
  const queue = [...new Set(seedIds.map((x) => x.trim()).filter(Boolean))];
  const out = new Set<string>(queue);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const ex = getExerciseById(id);
    if (!ex) continue;
    for (const sub of ex.substitutes ?? []) {
      const subMeta = getExerciseByIdOrName(sub);
      if (!subMeta) continue;
      if (!out.has(subMeta.id)) {
        out.add(subMeta.id);
        queue.push(subMeta.id);
      }
    }
  }
  return [...out];
}
