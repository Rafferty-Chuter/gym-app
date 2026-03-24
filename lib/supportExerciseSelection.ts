import { getSuggestedExercisesForCoarseGroup } from "@/lib/coachMusclePools";
import { getExerciseProfile } from "@/lib/exerciseProfiles";
import { resolveLoggedExerciseMeta } from "@/lib/exerciseLibrary";

const GROUP_ALIASES: Record<string, string[]> = {
  back: ["back", "lats", "upper back", "rear delts"],
  chest: ["chest", "pecs"],
  shoulders: ["shoulders", "delts", "front delts", "side delts", "rear delts"],
  arms: ["arms", "biceps", "triceps", "forearms"],
  legs: ["legs", "quads", "glutes", "hamstrings", "calves"],
  quads: ["quads"],
  glutes: ["glutes"],
  hamstrings: ["hamstrings"],
  triceps: ["triceps"],
  delts: ["delts", "shoulders", "front delts", "side delts", "rear delts"],
  lats: ["lats", "back"],
  erectors: ["erectors", "lower back", "spinal erectors"],
};

const GROUP_KEYWORDS: Record<string, string[]> = {
  back: ["row", "pulldown", "pull-up", "pull up", "pullup", "lat"],
  quads: ["squat", "leg press", "split squat", "lunge", "hack squat", "leg extension"],
  glutes: ["hip thrust", "glute bridge", "rdl", "romanian deadlift", "split squat", "squat"],
  hamstrings: ["rdl", "romanian deadlift", "leg curl", "good morning"],
  triceps: ["tricep", "pushdown", "skullcrusher", "jm press", "dip", "overhead extension"],
  delts: ["lateral raise", "shoulder press", "overhead press", "rear delt", "face pull"],
  lats: ["pulldown", "pull-up", "pull up", "pullup", "lat", "row"],
  erectors: ["back extension", "good morning", "deadlift", "rdl"],
  chest: ["bench", "incline", "chest press", "fly"],
  shoulders: ["shoulder press", "overhead press", "lateral raise", "rear delt", "face pull"],
  arms: ["curl", "tricep", "pushdown", "extension"],
  legs: ["squat", "leg press", "hack", "rdl", "curl", "extension", "lunge", "calf"],
};

function normalizeGroup(group?: string): string {
  return (group ?? "").trim().toLowerCase();
}

export function matchesSupportGroup(exerciseName: string, supportGroup?: string): boolean {
  const group = normalizeGroup(supportGroup);
  if (!group) return false;
  const n = exerciseName.toLowerCase();
  // Avoid classifying leg curls / hamstring work as "arms" via bare "curl"
  if (group === "arms" && (n.includes("leg curl") || n.includes("hamstring curl") || n.includes("ham curl"))) {
    return false;
  }
  if (group === "legs" && (n.includes("leg curl") || n.includes("hamstring curl") || n.includes("ham curl"))) {
    return true;
  }
  const meta = resolveLoggedExerciseMeta({ name: exerciseName });
  console.log("[support selection] resolved metadata", {
    exerciseName,
    resolvedExerciseId: meta?.id ?? null,
    supportGroup: group,
  });
  if (meta) {
    const mus = [...meta.primaryMuscles, ...meta.secondaryMuscles].map((m) =>
      m.toLowerCase()
    );
    const aliases = GROUP_ALIASES[group] ?? [group];
    if (aliases.some((a) => mus.includes(a))) return true;
  }
  const profile = getExerciseProfile(exerciseName);
  if (profile) {
    const mus = [...profile.primaryMuscles, ...profile.secondaryMuscles].map((m) =>
      m.toLowerCase()
    );
    const aliases = GROUP_ALIASES[group] ?? [group];
    if (aliases.some((a) => mus.includes(a))) return true;
  }
  const kws = GROUP_KEYWORDS[group] ?? [];
  return kws.some((kw) => n.includes(kw));
}

export function selectSupportExercises(
  recentExercises: string[],
  supportExercises: string[] | undefined,
  supportGroup?: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushFrom = (candidates: string[]) => {
    for (const ex of candidates) {
      const label = ex.trim();
      if (!label) continue;
      const key = label.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      if (supportGroup && !matchesSupportGroup(label, supportGroup)) continue;
      seen.add(key);
      out.push(label);
    }
  };

  if (supportExercises && supportExercises.length > 0) {
    pushFrom(supportExercises);
  }
  if (out.length === 0) {
    pushFrom(recentExercises);
  }
  if (out.length === 0 && supportGroup) {
    pushFrom(getSuggestedExercisesForCoarseGroup(supportGroup));
  }
  return out;
}
