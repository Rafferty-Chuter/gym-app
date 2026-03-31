import type { ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";
import type { MuscleGroupId } from "@/lib/muscleGroupRules";

export type MuscleStimulus = {
  direct: MuscleGroupId[];
  indirect: MuscleGroupId[];
};

type MuscleStimulusSource = Pick<ExerciseMetadata, "primaryMuscles" | "secondaryMuscles" | "movementPattern"> & {
  tags?: string[];
  // `exerciseLibrary` has no tags/role/equipment; we only need these when metadata fallback is used.
  // Keeping them optional makes this mapper work with both libraries.
  role?: string;
  id?: string;
  name?: string;
};

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "_").trim();
}

function tokenToGroup(token: string): MuscleGroupId | null {
  const t = normalizeToken(token);

  if (t.includes("chest") || t.includes("pec")) return "chest";

  if (
    t.includes("lat") ||
    t.includes("lats") ||
    t.includes("upper_back") ||
    t.includes("mid_back") ||
    t.includes("rear_upper_back") ||
    t === "back" ||
    t.includes("rhomboid") ||
    t.includes("mid_trap") ||
    t.includes("trapezius")
  ) {
    return "lats_upper_back";
  }

  // Delts: includes side/front/rear + "shoulder".
  if (t.includes("delt") || t.includes("side_delts") || t.includes("side_delt") || t.includes("front_delts") || t.includes("rear_delts") || t.includes("shoulder"))
    return "delts";

  if (t.includes("biceps")) return "biceps";
  if (t.includes("triceps")) return "triceps";

  if (t.includes("quad")) return "quads";
  if (t.includes("hamstring")) return "hamstrings";
  if (t.includes("glute")) return "glutes";
  if (t.includes("calf") || t.includes("calves") || t.includes("gastrocnem") || t.includes("soleus")) return "calves";

  if (t === "core" || t.includes("abs") || t.includes("abdomen")) return "abs_core";

  return null;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Map exercise metadata muscles/tags to typed muscle-group stimulus sets.
 * Direct = primaryMuscles mapping. Indirect = secondaryMuscles mapping.
 */
export function mapExerciseToMuscleStimulus(ex: MuscleStimulusSource): MuscleStimulus {
  const direct = uniq(
    (ex.primaryMuscles ?? [])
      .map(tokenToGroup)
      .filter((x): x is MuscleGroupId => Boolean(x))
  );

  const indirect = uniq(
    (ex.secondaryMuscles ?? [])
      .map(tokenToGroup)
      .filter((x): x is MuscleGroupId => Boolean(x))
  );

  // If metadata is sparse, fall back to tags and movement pattern.
  const needFallback = direct.length === 0 && indirect.length === 0;
  const anyTags = ex.tags ?? [];
  if (needFallback) {
    const fromTags = anyTags.map(tokenToGroup).filter((x): x is MuscleGroupId => Boolean(x));
    const fromPattern = tokenToGroup(ex.movementPattern);
    const indirectFallback = uniq([...fromTags, ...(fromPattern ? [fromPattern] : [])]);
    return { direct: [], indirect: indirectFallback };
  }

  return { direct, indirect };
}

/**
 * Map a programme/builder day target string into our typed muscle-group id.
 * The programme pipeline uses tokens like "back", "shoulders", "legs" etc.
 */
export function mapTargetTokenToMuscleGroup(target: string): MuscleGroupId | null {
  const t = normalizeToken(target);
  if (t === "back") return "lats_upper_back";
  if (t === "shoulders" || t === "shoulder") return "delts";
  if (t === "arms" || t === "arm") {
    // Arms is a coarse token; treat as biceps+triceps when needed.
    return null;
  }
  if (t === "legs" || t === "lower") return null;
  return tokenToGroup(t);
}

