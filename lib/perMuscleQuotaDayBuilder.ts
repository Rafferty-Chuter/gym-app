import {
  EXERCISE_METADATA_LIBRARY,
  getExerciseByIdOrName,
  type ExerciseMetadata,
} from "@/lib/exerciseMetadataLibrary";
import { getPrescriptionForExercise } from "@/lib/prescriptionDefaults";
import { assignExerciseToDayTarget, roleRank } from "@/lib/muscleQuotaCounting";
import { resolveSessionTypesForMuscles } from "@/lib/muscleDayBuilder";
import type { MuscleDayBuildResult } from "@/lib/muscleDayBuilder";
import type { RecoveryMode, WorkoutBuilderGoal, WorkoutExercise } from "@/lib/workoutBuilder";
import type { StructuralProgrammeConstraints } from "@/lib/parseStructuralProgrammeConstraints";

function n(s: string): string {
  return s.toLowerCase().trim();
}

function nList(items: string[]): string[] {
  return items.map(n);
}

function equipmentCompatible(exercise: ExerciseMetadata, available: string[]): boolean {
  if (available.length === 0) return true;
  const have = new Set(nList(available));
  const needed = nList(exercise.equipment);
  return needed.every((eq) => {
    if (have.has(eq)) return true;
    if (eq.includes("_or_")) {
      return eq
        .split("_or_")
        .map((x) => n(x))
        .some((part) => have.has(part));
    }
    if (eq.includes("or")) {
      return eq
        .split("or")
        .map((x) => n(x))
        .some((part) => have.has(part));
    }
    return false;
  });
}

function excludedByUser(exercise: ExerciseMetadata, exclusions: string[]): boolean {
  if (exclusions.length === 0) return false;
  const ex = new Set(nList(exclusions));
  if (ex.has(n(exercise.id)) || ex.has(n(exercise.name))) return true;
  if (exercise.primaryMuscles.some((m) => ex.has(n(m)))) return true;
  if (exercise.secondaryMuscles.some((m) => ex.has(n(m)))) return true;
  if (ex.has(n(exercise.movementPattern))) return true;
  if (exercise.tags.some((t) => ex.has(n(t)))) return true;
  return false;
}

function effectiveQuotaForTarget(
  target: string,
  uniform: number,
  structural: StructuralProgrammeConstraints
): number {
  const k = target.toLowerCase();
  let n = uniform;
  const mins = structural.perMuscleMinimums ?? {};
  const maxs = structural.perMuscleMaximums ?? {};
  if (mins[k] != null) n = Math.max(n, mins[k]!);
  if (maxs[k] != null) n = Math.min(n, maxs[k]!);
  return Math.max(1, Math.min(6, n));
}

/** Prefer movements that match the session template flavor so Pull day does not inherit Push shoulder work. */
function exerciseMatchesSessionFlavor(
  ex: ExerciseMetadata,
  bucket: string,
  flavor: string
): boolean {
  const tags = ex.tags;
  if (flavor === "push") {
    if (["chest", "shoulders", "triceps"].includes(bucket)) return tags.includes("push");
    return true;
  }
  if (flavor === "pull") {
    if (bucket === "back") return tags.includes("pull") || tags.includes("back");
    if (bucket === "biceps") return tags.includes("pull") || tags.includes("biceps");
    if (bucket === "shoulders")
      return tags.includes("pull") || tags.includes("back") || ex.primaryMuscles.some((p) => /rear_delt/i.test(p));
    return true;
  }
  if (flavor === "legs" || flavor === "lower") {
    return tags.includes("legs") || tags.includes("lower") || tags.includes("glute") || tags.includes("calf");
  }
  if (flavor === "upper") {
    return tags.includes("upper") || tags.includes("push") || tags.includes("pull");
  }
  return true;
}

function sortCandidatesForTarget(
  pool: ExerciseMetadata[],
  preferred: Set<string>,
  recentIds: Set<string>,
  recoveryMode: RecoveryMode
): ExerciseMetadata[] {
  return [...pool].sort((a, b) => {
    const ra = roleRank(a.role);
    const rb = roleRank(b.role);
    if (ra !== rb) return ra - rb;
    const pa = preferred.has(n(a.id)) || preferred.has(n(a.name)) ? 1 : 0;
    const pb = preferred.has(n(b.id)) || preferred.has(n(b.name)) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const la = recentIds.has(a.id) ? 1 : 0;
    const lb = recentIds.has(b.id) ? 1 : 0;
    if (la !== lb) return la - lb;
    if (recoveryMode === "low_fatigue") {
      const fa =
        a.fatigueCost === "very_high" ? 3 : a.fatigueCost === "high" ? 2 : a.fatigueCost === "moderate" ? 1 : 0;
      const fb =
        b.fatigueCost === "very_high" ? 3 : b.fatigueCost === "high" ? 2 : b.fatigueCost === "moderate" ? 1 : 0;
      if (fa !== fb) return fa - fb;
    }
    return a.name.localeCompare(b.name);
  });
}

export type UniformQuotaDayInput = {
  targetMuscles: string[];
  structural: StructuralProgrammeConstraints;
  uniformPerMuscle: number;
  goal: WorkoutBuilderGoal;
  recoveryMode: RecoveryMode;
  equipmentAvailable: string[];
  injuriesOrExclusions: string[];
  preferredExercises: string[];
  requestedExerciseIds: string[];
  recentExerciseIds: string[];
};

/**
 * Build one day by satisfying per-target exercise quotas first (primary-muscle counting),
 * before any template slot shell.
 */
export function buildUniformPerMuscleQuotaDay(input: UniformQuotaDayInput): MuscleDayBuildResult {
  const dayTargets = [...new Set(input.targetMuscles.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const uniform = Math.max(1, Math.min(6, input.uniformPerMuscle));
  const equipmentAvailable = input.equipmentAvailable ?? [];
  const exclusions = input.injuriesOrExclusions ?? [];
  const preferred = new Set(nList(input.preferredExercises ?? []));
  const recentIds = new Set(input.recentExerciseIds ?? []);

  const quotas = new Map<string, number>();
  for (const t of dayTargets) {
    quotas.set(t, effectiveQuotaForTarget(t, uniform, input.structural));
  }

  const selected: WorkoutExercise[] = [];
  const selectedIds = new Set<string>();
  const notes: string[] = [];
  const warnings: string[] = [];

  const countInBucket = (bucket: string): number => {
    return selected.filter((s) => {
      const m = getExerciseByIdOrName(s.exerciseId);
      return Boolean(m && assignExerciseToDayTarget(m, dayTargets) === bucket);
    }).length;
  };

  const slotIndexByTarget = new Map<string, number>();
  const nextSlotLabel = (target: string, need: number): string => {
    const k = target.toLowerCase();
    const prev = slotIndexByTarget.get(k) ?? 0;
    const next = prev + 1;
    slotIndexByTarget.set(k, next);
    const cap = k.charAt(0).toUpperCase() + k.slice(1);
    return `${cap} (${next}/${need})`;
  };

  const requestedMetas = Array.from(new Set(input.requestedExerciseIds ?? []))
    .map((id) => getExerciseByIdOrName(id))
    .filter((e): e is ExerciseMetadata => Boolean(e));

  const sessionTypes = resolveSessionTypesForMuscles(dayTargets);
  const displaySessionType = sessionTypes.join("+");
  const sessionFlavor =
    sessionTypes.length === 1
      ? sessionTypes[0]
      : displaySessionType.includes("push")
        ? "push"
        : displaySessionType.includes("pull")
          ? "pull"
          : sessionTypes[0];

  for (const ex of requestedMetas) {
    if (selectedIds.has(ex.id) || excludedByUser(ex, exclusions)) continue;
    const bucket = assignExerciseToDayTarget(ex, dayTargets);
    if (!bucket) continue;
    const need = quotas.get(bucket) ?? uniform;
    if (countInBucket(bucket) >= need) continue;
    if (!equipmentCompatible(ex, equipmentAvailable)) {
      warnings.push(`Requested ${ex.name} skipped for ${bucket} quota (equipment).`);
      continue;
    }
    selectedIds.add(ex.id);
    const prescription = getPrescriptionForExercise(ex).adjusted;
    selected.push({
      slotLabel: nextSlotLabel(bucket, need),
      exerciseId: ex.id,
      exerciseName: ex.name,
      sets: prescription.sets,
      repRange: prescription.repRange,
      rirRange: prescription.rirRange,
      restSeconds: prescription.restSeconds,
      rationale: "Placed to satisfy explicit request and structural muscle quota.",
    });
  }

  for (const target of dayTargets) {
    const need = quotas.get(target) ?? uniform;
    const countForTarget = (ex: ExerciseMetadata) => assignExerciseToDayTarget(ex, dayTargets) === target;
    const current = countInBucket(target);
    const deficit = need - current;
    if (deficit <= 0) continue;

    const basePool = EXERCISE_METADATA_LIBRARY.filter(
      (ex) =>
        !selectedIds.has(ex.id) &&
        !excludedByUser(ex, exclusions) &&
        equipmentCompatible(ex, equipmentAvailable) &&
        countForTarget(ex)
    );
    let pool = basePool.filter((ex) => exerciseMatchesSessionFlavor(ex, target, sessionFlavor));
    if (pool.length < deficit) {
      pool = basePool;
      warnings.push(
        `Structural quota: relaxed session-flavor filter for "${target}" to fill quota (catalog thin for ${sessionFlavor}).`
      );
    }
    const sorted = sortCandidatesForTarget(pool, preferred, recentIds, input.recoveryMode);
    const take = sorted.slice(0, deficit);
    if (take.length < deficit) {
      warnings.push(
        `Structural quota: could only find ${take.length}/${deficit} exercises for "${target}" with current equipment/exclusions.`
      );
    }
    for (const ex of take) {
      selectedIds.add(ex.id);
      const prescription = getPrescriptionForExercise(ex).adjusted;
      selected.push({
        slotLabel: nextSlotLabel(target, need),
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: prescription.sets,
        repRange: prescription.repRange,
        rirRange: prescription.rirRange,
        restSeconds: prescription.restSeconds,
        rationale: `Selected to satisfy structural quota (${need} exercise(s) for ${target}).`,
      });
    }
  }

  const purposeSummary = `${displaySessionType} — ${uniform} exercise(s) per target muscle (${dayTargets.join(", ")})`;

  if (input.structural.moreIsolationPerMuscle) {
    notes.push("User asked for more isolation per muscle; quotas use isolation-friendly ordering where possible.");
  }

  console.log("[structural-quota-day-built]", {
    dayTargets,
    quotas: Object.fromEntries(quotas),
    exerciseIds: selected.map((s) => s.exerciseId),
    warnings,
  });

  return {
    displaySessionType,
    purposeSummary,
    exercises: selected,
    notes,
    warnings,
  };
}
