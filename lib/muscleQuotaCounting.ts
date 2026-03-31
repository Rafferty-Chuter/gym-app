import type { ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";

/**
 * Whether a metadata primary-muscle label counts toward a day target bucket.
 * Uses direct stimulus (primary line only); no secondary-muscle credit.
 */
export function primaryMuscleMatchesDayTarget(primary: string, dayTarget: string): boolean {
  const p = primary.toLowerCase().replace(/\s+/g, "_");
  const d = dayTarget.toLowerCase().replace(/\s+/g, "_");

  if (d === "chest") {
    return p.includes("chest");
  }
  if (d === "back") {
    return (
      p.includes("lat") ||
      p.includes("back") ||
      p.includes("trap") ||
      p === "lats" ||
      p === "upper_back" ||
      p === "mid_back"
    );
  }
  if (d === "shoulders") {
    return p.includes("delt") || p.includes("shoulder");
  }
  if (d === "biceps") {
    return p.includes("biceps") || p === "brachialis";
  }
  if (d === "triceps") {
    return p.includes("triceps");
  }
  if (d === "quads") {
    return p.includes("quad");
  }
  if (d === "hamstrings") {
    return p.includes("hamstring") || p === "hamstrings";
  }
  if (d === "glutes") {
    return p.includes("glute");
  }
  if (d === "calves") {
    return p.includes("calf") || p === "calves";
  }
  return p.includes(d);
}

/**
 * Assign this exercise to at most one day target: first primary in metadata order wins,
 * matched against day targets (direct stimulus — no "first target on the day" bias).
 */
export function assignExerciseToDayTarget(ex: ExerciseMetadata, dayTargets: string[]): string | null {
  for (const prim of ex.primaryMuscles) {
    for (const target of dayTargets) {
      if (primaryMuscleMatchesDayTarget(prim, target)) {
        return target;
      }
    }
  }
  return null;
}

const ROLE_RANK: Record<string, number> = {
  main_compound: 0,
  secondary_compound: 1,
  machine_compound: 2,
  isolation: 3,
  accessory: 4,
};

export function roleRank(role: ExerciseMetadata["role"]): number {
  return ROLE_RANK[role] ?? 9;
}
