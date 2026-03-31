import {
  buildWorkoutWithQualityPasses,
  type BuiltWorkout,
  type RecoveryMode,
  type WorkoutBuilderGoal,
  type WorkoutBuilderInput,
} from "@/lib/workoutBuilder";
import type { SessionType } from "@/lib/sessionTemplates";
import type { ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";

export type MuscleDayBuildInput = Omit<WorkoutBuilderInput, "sessionType"> & {
  targetMuscles: string[];
};

export type MuscleDayBuildResult = {
  /** Underlying template driver(s); may be composite. */
  displaySessionType: string;
  purposeSummary: string;
  exercises: BuiltWorkout["exercises"];
  notes: string[];
  warnings: string[];
  requestedPlacements?: BuiltWorkout["requestedPlacements"];
};

function normalizeTargets(raw: string[]): string[] {
  const u = new Set<string>();
  for (const r of raw) {
    const x = r.trim().toLowerCase();
    if (x) u.add(x);
  }
  return [...u];
}

function hasAny(set: Set<string>, keys: string[]): boolean {
  return keys.some((k) => set.has(k));
}

/**
 * Map normalized muscle targets to one or more session templates, then build.
 */
export function resolveSessionTypesForMuscles(targets: string[]): SessionType[] {
  const set = new Set(normalizeTargets(targets));

  if (set.size === 1 && set.has("chest")) return ["chest"];
  if (set.size === 1 && set.has("back")) return ["back"];
  if (set.size === 1 && set.has("shoulders")) return ["shoulders"];
  if (set.size === 1 && set.has("legs")) return ["legs"];
  if (hasAny(set, ["quads", "hamstrings", "glutes", "calves"]) && !set.has("chest") && !set.has("back")) {
    return ["legs"];
  }

  if (set.has("shoulders") && set.has("legs")) return ["shoulders", "legs"];

  if (set.has("chest") && set.has("back") && !set.has("legs")) return ["upper"];

  if (
    hasAny(set, ["chest", "shoulders", "triceps"]) &&
    !set.has("back") &&
    !set.has("biceps") &&
    !set.has("legs")
  ) {
    return ["push"];
  }

  if (hasAny(set, ["back", "biceps"]) && !set.has("chest") && !set.has("triceps") && !set.has("legs")) {
    return ["pull"];
  }

  // Arms-only template: must NOT run before upper/push/pull — upper/lower "Upper" days list biceps+triceps with chest+back.
  if (
    !set.has("chest") &&
    !set.has("back") &&
    !set.has("legs") &&
    !hasAny(set, ["quads", "hamstrings", "glutes", "calves"]) &&
    (set.has("arms") || (set.has("biceps") && set.has("triceps")))
  ) {
    return ["arms"];
  }

  if (hasAny(set, ["chest", "back", "shoulders", "arms", "biceps", "triceps"]) && !set.has("legs")) {
    return ["upper"];
  }

  if (set.has("legs") && !hasAny(set, ["chest", "back", "shoulders", "arms", "biceps", "triceps"])) {
    return ["legs"];
  }

  if (hasAny(set, ["chest", "back", "legs"])) return ["full_body"];

  return ["upper"];
}

function mergeBuilt(parts: BuiltWorkout[], labels: string[]): MuscleDayBuildResult {
  const exercises = parts.flatMap((p, i) =>
    p.exercises.map((ex) => ({
      ...ex,
      slotLabel: parts.length > 1 ? `${labels[i]}: ${ex.slotLabel}` : ex.slotLabel,
    }))
  );
  const notes = parts.flatMap((p) => p.notes ?? []);
  const warnings = parts.flatMap((p) => p.warnings ?? []);
  const requestedPlacements = parts.flatMap((p) => p.requestedPlacements ?? []);
  return {
    displaySessionType: labels.join("+"),
    purposeSummary: parts.map((p) => p.purposeSummary).join(" · "),
    exercises,
    notes,
    warnings,
    requestedPlacements: requestedPlacements.length ? requestedPlacements : undefined,
  };
}

/**
 * Build a single day's workout from target muscles using exercise metadata + session templates
 * (movement coverage, fatigue, prescriptions) — not from a named "split type" exercise list.
 */
export function buildWorkoutForMuscleTargets(input: MuscleDayBuildInput): MuscleDayBuildResult {
  const targets = normalizeTargets(input.targetMuscles);
  const sessionTypes = resolveSessionTypesForMuscles(targets);
  const base: Omit<WorkoutBuilderInput, "sessionType"> = {
    goal: input.goal,
    equipmentAvailable: input.equipmentAvailable,
    injuriesOrExclusions: input.injuriesOrExclusions,
    recentTrainingContext: input.recentTrainingContext,
    preferredExercises: input.preferredExercises,
    requestedExerciseIds: input.requestedExerciseIds,
    recoveryMode: input.recoveryMode,
    includeOptionalSlots: input.includeOptionalSlots,
  };

  if (sessionTypes.length === 1) {
    const st = sessionTypes[0];
    const count =
      st === "full_body"
        ? 7
        : st === "upper"
          ? 6
          : st === "legs" || st === "lower"
            ? 6
            : st === "arms"
              ? 5
              : input.targetExerciseCount;
    const built = buildWorkoutWithQualityPasses({
      ...base,
      sessionType: st,
      targetExerciseCount: count ?? undefined,
      userMessage: input.userMessage,
      structuralIntent: input.structuralIntent,
    });
    return {
      displaySessionType: st,
      purposeSummary: built.purposeSummary,
      exercises: built.exercises,
      notes: built.notes,
      warnings: built.warnings,
      requestedPlacements: built.requestedPlacements,
    };
  }

  const parts: BuiltWorkout[] = [];
  const labels: string[] = [];
  for (const st of sessionTypes) {
    const half =
      st === "shoulders" || st === "legs"
        ? 4
        : input.targetExerciseCount ?? 4;
    parts.push(
      buildWorkoutWithQualityPasses({
        ...base,
        sessionType: st,
        targetExerciseCount: half,
        userMessage: input.userMessage,
        structuralIntent: input.structuralIntent,
      })
    );
    labels.push(st);
  }
  return mergeBuilt(parts, labels);
}

export type ProgrammeBuilderParams = {
  goal: WorkoutBuilderGoal;
  recoveryMode: RecoveryMode;
  equipmentAvailable: string[];
  injuriesOrExclusions?: string[];
  recentExerciseIds?: string[];
  preferredExercises?: string[];
  requestedExerciseIds?: string[];
};

/** Route requested exercises to the best-matching day when `targetMuscles` is set on programme days. */
export function scoreDayForExercise(
  targetMuscles: string[] | undefined,
  ex: ExerciseMetadata
): number {
  if (!targetMuscles?.length) return 0;
  let score = 0;
  const targets = new Set(targetMuscles.map((m) => m.toLowerCase()));

  const matchesLeg = () =>
    targets.has("legs") &&
    ex.tags.some((t) => ["legs", "lower", "quad_dominant", "hip_hinge"].includes(t) || t.includes("leg"));
  const matchesBack = () =>
    targets.has("back") &&
    (ex.tags.includes("back") ||
      ex.tags.includes("pull") ||
      ex.primaryMuscles.some((p) => /lat|back|trap|rhom/i.test(p)));
  const matchesChest = () =>
    targets.has("chest") && (ex.tags.includes("chest") || ex.primaryMuscles.some((p) => p.includes("chest")));
  const matchesShoulders = () =>
    targets.has("shoulders") &&
    (ex.tags.includes("shoulders") || ex.primaryMuscles.some((p) => /delt|shoulder/i.test(p)));
  const matchesArms = () =>
    targets.has("arms") &&
    (ex.tags.includes("arms") || ex.primaryMuscles.some((p) => /biceps|triceps/i.test(p)));

  for (const p of ex.primaryMuscles) {
    const pl = p.toLowerCase();
    if (targets.has("chest") && pl.includes("chest")) score += 3;
    if (targets.has("back") && (pl.includes("lat") || pl.includes("back") || pl.includes("trap"))) score += 3;
    if (targets.has("shoulders") && (pl.includes("delt") || pl.includes("shoulder"))) score += 3;
    if (targets.has("biceps") && pl.includes("biceps")) score += 3;
    if (targets.has("triceps") && pl.includes("triceps")) score += 3;
    if (targets.has("legs") && (pl.includes("quad") || pl.includes("ham") || pl.includes("glute") || pl.includes("calf")))
      score += 3;
  }

  if (matchesLeg()) score += 2;
  if (matchesBack()) score += 2;
  if (matchesChest()) score += 2;
  if (matchesShoulders()) score += 2;
  if (matchesArms()) score += 2;

  for (const tag of ex.tags) {
    if (targets.has(tag)) score += 1;
  }

  return score;
}
