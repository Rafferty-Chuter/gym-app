import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";

type SessionLike = {
  exercises?: Array<{ exerciseId?: string; exerciseName?: string }>;
};

function categoriesForSession(session: SessionLike): Set<string> {
  const set = new Set<string>();
  for (const e of session.exercises ?? []) {
    const meta = getExerciseByIdOrName(e.exerciseId ?? e.exerciseName ?? "");
    if (!meta) continue;
    if (meta.movementPattern.includes("push")) set.add("push");
    if (meta.movementPattern.includes("pull")) set.add("pull");
    if (meta.movementPattern.includes("squat") || meta.movementPattern.includes("knee_extension")) set.add("knee_dominant");
    if (meta.movementPattern.includes("hinge") || meta.movementPattern.includes("knee_flexion")) set.add("posterior_chain");
    if (meta.role === "isolation") set.add("isolation");
    if (meta.role.includes("compound")) set.add("compound");
  }
  return set;
}

export function getMissingMovementCategories(
  session: SessionLike,
  targetDayType: string
): string[] {
  const cats = categoriesForSession(session);
  const need: Record<string, string[]> = {
    push: ["push", "compound"],
    pull: ["pull", "compound"],
    upper: ["push", "pull", "compound"],
    legs: ["knee_dominant", "posterior_chain", "compound"],
    lower: ["knee_dominant", "posterior_chain", "compound"],
  };
  const required = need[targetDayType] ?? [];
  return required.filter((r) => !cats.has(r));
}

export function ensureDistinctCoverageAcrossSession(session: SessionLike): boolean {
  const cats = categoriesForSession(session);
  return cats.size >= 2;
}

export function validateExerciseCombination(
  session: SessionLike,
  targetDayType: string
): { ok: boolean; issues: string[] } {
  const missing = getMissingMovementCategories(session, targetDayType);
  const issues: string[] = [];
  if (missing.length) issues.push(`Missing movement categories: ${missing.join(", ")}.`);
  if (!ensureDistinctCoverageAcrossSession(session)) {
    issues.push("Session has low movement diversity and may be too repetitive.");
  }
  return { ok: issues.length === 0, issues };
}

export function suggestBetterExerciseMix(
  session: SessionLike,
  targetDayType: string
): string[] {
  const missing = getMissingMovementCategories(session, targetDayType);
  if (!missing.length) return [];
  return [`Add at least one movement covering: ${missing.join(", ")}.`];
}

