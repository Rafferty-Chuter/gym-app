import { parseBuilderStructuralIntent } from "@/lib/builderStructuralIntent";
import {
  getExerciseByIdOrName,
  type ExerciseMetadata,
  EXERCISE_METADATA_LIBRARY,
} from "@/lib/exerciseMetadataLibrary";
import {
  getPrescriptionForExercise,
  type GoalAdjustment,
} from "@/lib/prescriptionDefaults";
import { validateBuiltDayQuality } from "@/lib/dayQuality";
import { validateSessionVolumeV1 } from "@/lib/trainingKnowledge/volumeValidation";
import { validateExerciseCombination } from "@/lib/trainingKnowledge/sessionCoverageRules";
import { buildSessionFatigueReview, applyLowFatigueAdjustments } from "@/lib/trainingKnowledge/sessionFatigueReview";
import { getProgressionRulesForExercise } from "@/lib/trainingKnowledge/progressionEngine";
import type { SessionType } from "@/lib/sessionTemplates";
import {
  type BuiltWorkout,
  type WorkoutBuilderGoal,
  type RecoveryMode,
  type WeeklyFrequencyRecommendation,
} from "@/lib/workoutBuilder";
import {
  planSingleSessionWorkoutLLM,
  type PlannedSingleSessionLLMOutput,
} from "@/lib/planSingleSessionWorkoutLLM";
import { resolveSessionExerciseCountPolicy } from "@/lib/sessionExerciseCountPolicy";

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

function prescriptionAdjustments(
  goal: WorkoutBuilderGoal,
  recoveryMode: RecoveryMode,
  structuralIntent?: ReturnType<typeof parseBuilderStructuralIntent>
): GoalAdjustment[] {
  const out: GoalAdjustment[] = [];
  if (goal === "improve_overall_strength") out.push("strength_emphasis");
  if (goal === "build_overall_muscle") out.push("hypertrophy_emphasis");
  if (goal === "strength_hypertrophy") out.push("strength_emphasis", "hypertrophy_emphasis");
  if (goal === "upper_body_emphasis") out.push("upper_body_emphasis");
  if (goal === "chest_emphasis") out.push("chest_emphasis");
  if (goal === "bench_strength_emphasis") out.push("bench_strength_emphasis", "strength_emphasis");
  if (recoveryMode === "low_fatigue") out.push("low_fatigue");
  if (structuralIntent?.chestEmphasis) out.push("chest_emphasis");
  return [...new Set(out)];
}

function enforceRequestedExercises(
  plan: PlannedSingleSessionLLMOutput,
  requestedIds: string[],
  exerciseMax: number
): PlannedSingleSessionLLMOutput {
  if (requestedIds.length === 0) return plan;
  const validRequested = requestedIds.filter((id) => EXERCISE_METADATA_LIBRARY.some((e) => e.id === id));
  const present = new Set(plan.exercises.map((e) => e.exerciseId));
  const missing = validRequested.filter((id) => !present.has(id));
  if (missing.length === 0) return plan;
  const prepend: PlannedSingleSessionLLMOutput["exercises"] = missing.map((id) => {
    const meta = getExerciseByIdOrName(id);
    return {
      exerciseId: id,
      slotLabel: meta ? `Requested: ${meta.name}` : "Requested movement",
      rationaleLine: "Included because you asked for this exercise.",
    };
  });
  const merged = [...prepend, ...plan.exercises.filter((e) => !missing.includes(e.exerciseId))];
  const seen = new Set<string>();
  const deduped = merged.filter((e) => {
    if (seen.has(e.exerciseId)) return false;
    seen.add(e.exerciseId);
    return true;
  });
  return { ...plan, exercises: deduped.slice(0, exerciseMax) };
}

function filterPlanToConstraints(
  plan: PlannedSingleSessionLLMOutput,
  equipmentAvailable: string[],
  exclusions: string[],
  minExercises: number,
  maxExercises: number
): PlannedSingleSessionLLMOutput | null {
  const next: PlannedSingleSessionLLMOutput["exercises"] = [];
  for (const row of plan.exercises) {
    const meta = getExerciseByIdOrName(row.exerciseId);
    if (!meta) continue;
    if (excludedByUser(meta, exclusions)) continue;
    if (!equipmentCompatible(meta, equipmentAvailable)) continue;
    next.push(row);
  }
  if (next.length < minExercises) return null;
  return { ...plan, exercises: next.slice(0, maxExercises) };
}

function normalizeSlotLabel(label: string, fallback: string): string {
  const raw = label.trim();
  if (!raw) return fallback;
  if (/\s*\/\s*|\bor\b/i.test(raw)) return fallback;
  return raw;
}

function isMainCompound(meta: ExerciseMetadata): boolean {
  return (
    meta.role === "main_compound" ||
    meta.role === "secondary_compound" ||
    meta.role === "machine_compound"
  );
}

function isPushAccessory(meta: ExerciseMetadata): boolean {
  if (meta.tags.includes("triceps")) return true;
  if (meta.tags.includes("shoulders")) return true;
  if (meta.tags.includes("chest") && meta.role === "isolation") return true;
  return false;
}


/**
 * Strict equipment filter first; if that drops below minimum, retry with empty equipment
 * (any catalog movement) so coach plans still return — user sees a note to swap if needed.
 */
function filterPlanWithEquipmentFallback(
  plan: PlannedSingleSessionLLMOutput,
  equipmentAvailable: string[],
  exclusions: string[],
  issues: string[],
  minExercises: number,
  maxExercises: number
): { filtered: PlannedSingleSessionLLMOutput | null; usedEquipmentBypass: boolean } {
  const strict = filterPlanToConstraints(plan, equipmentAvailable, exclusions, minExercises, maxExercises);
  if (strict) return { filtered: strict, usedEquipmentBypass: false };
  if (equipmentAvailable.length === 0) {
    issues.push("filtered_below_minimum_after_constraints");
    return { filtered: null, usedEquipmentBypass: false };
  }
  issues.push("strict_equipment_filter_removed_too_many_moves");
  const relaxed = filterPlanToConstraints(plan, [], exclusions, minExercises, maxExercises);
  if (relaxed) {
    issues.push("equipment_bypass_applied_to_meet_minimum");
    return { filtered: relaxed, usedEquipmentBypass: true };
  }
  issues.push("filtered_below_minimum_after_constraints");
  return { filtered: null, usedEquipmentBypass: false };
}

export function builtWorkoutFromPlannedSession(params: {
  plan: PlannedSingleSessionLLMOutput;
  goal: WorkoutBuilderGoal;
  recoveryMode: RecoveryMode;
  userMessage?: string;
}): BuiltWorkout {
  const structuralIntent = params.userMessage ? parseBuilderStructuralIntent(params.userMessage) : {};
  const intent =
    Object.keys(structuralIntent).length > 0
      ? structuralIntent
      : undefined;
  const adjustments = prescriptionAdjustments(params.goal, params.recoveryMode, structuralIntent);
  const exercises: BuiltWorkout["exercises"] = [];
  const notes: string[] = [
    "Exercises and order were chosen by the coach model from your exercise library; sets, reps, RIR, and rest use app prescriptions.",
  ];

  for (const row of params.plan.exercises) {
    const meta = getExerciseByIdOrName(row.exerciseId);
    if (!meta) continue;
    const prescription = getPrescriptionForExercise(meta, adjustments).adjusted;
    const prog = getProgressionRulesForExercise(meta);
    const rawSlot = row.slotLabel?.trim() ?? "";
    const slotLabel = normalizeSlotLabel(rawSlot, meta.name);
    const rationaleBits = [
      row.rationaleLine?.trim() || "Coach-selected movement from the library for this session.",
      `Progression cue: ${prog.preferredProgressionStyle.replace("_", " ")} with ${prog.targetRIRRange.min}-${prog.targetRIRRange.max} RIR.`,
    ];
    exercises.push({
      slotLabel,
      exerciseId: meta.id,
      exerciseName: meta.name,
      sets: prescription.sets,
      repRange: prescription.repRange,
      rirRange: prescription.rirRange,
      restSeconds: prescription.restSeconds,
      rationale: rationaleBits.join(" "),
    });
  }

  const weeklyFrequency: BuiltWorkout["weeklyFrequency"] = params.plan.weeklyFrequency
    ? {
        timesPerWeek: params.plan.weeklyFrequency.timesPerWeek,
        restDaysBetween: params.plan.weeklyFrequency.restDaysBetween,
        rationale: params.plan.weeklyFrequency.rationale,
      }
    : undefined;

  let out: BuiltWorkout = {
    sessionType: params.plan.sessionType,
    purposeSummary: params.plan.purposeSummary,
    exercises,
    notes,
    warnings: [],
    weeklyFrequency,
  };

  if (params.recoveryMode === "low_fatigue") {
    out = applyLowFatigueAdjustments(out);
  }
  out.warnings = [
    ...out.warnings,
    ...buildSessionFatigueReview(out, { lowFatigueMode: params.recoveryMode === "low_fatigue" }),
  ];
  out.warnings = [
    ...out.warnings,
    ...validateSessionVolumeV1(
      {
        targetMuscles: [params.plan.sessionType],
        exercises: out.exercises.map((e) => ({
          exerciseName: e.exerciseName,
          sets: { min: e.sets.min, max: e.sets.max },
        })),
      },
      "trained"
    ),
  ];
  const combo = validateExerciseCombination(
    {
      exercises: out.exercises.map((e) => ({ exerciseId: e.exerciseId })),
    },
    params.plan.sessionType
  );
  if (!combo.ok) out.warnings.push(...combo.issues);

  const quality = validateBuiltDayQuality(out, intent);
  out.warnings = [...out.warnings, ...quality.warnings];
  return out;
}

export async function tryBuildSingleSessionWithLLMCoachPlan(params: {
  apiKey: string;
  userMessage: string;
  sessionTypeHint: SessionType;
  equipmentAvailable: string[];
  exclusions: string[];
  requestedExerciseIds: string[];
  recoveryMode: RecoveryMode;
  goal: WorkoutBuilderGoal;
  coachContextSnippet: string;
}): Promise<{ built: BuiltWorkout | null; issues: string[] }> {
  const builderGoalLabel = params.goal.replace(/_/g, " ");
  const recoveryLowFatigue = params.recoveryMode === "low_fatigue";
  const issues: string[] = [];
  const countPolicy = resolveSessionExerciseCountPolicy({
    recoveryLowFatigue,
    userMessage: params.userMessage,
  });
  const { min: minExercises, max: maxExercises } = countPolicy;

  const attemptPlan = async (retryIssues?: string[]) =>
    planSingleSessionWorkoutLLM({
      userMessage: params.userMessage,
      apiKey: params.apiKey,
      sessionTypeHint: params.sessionTypeHint,
      equipmentAvailable: params.equipmentAvailable,
      exclusions: params.exclusions,
      requestedExerciseIds: params.requestedExerciseIds,
      recoveryLowFatigue,
      builderGoalLabel,
      coachContextSnippet: params.coachContextSnippet,
      retryIssues,
    });

  let plan = await attemptPlan();
  if (!plan) {
    issues.push("initial_plan_empty_or_invalid");
    plan = await attemptPlan([
      `Return strict valid JSON with between ${minExercises} and ${maxExercises} exercises from the allowed exercise ids.`,
    ]);
  }
  if (!plan) return { built: null, issues };

  plan = enforceRequestedExercises(plan, params.requestedExerciseIds, maxExercises);
  let { filtered, usedEquipmentBypass } = filterPlanWithEquipmentFallback(
    plan,
    params.equipmentAvailable,
    params.exclusions,
    issues,
    minExercises,
    maxExercises
  );
  if (!filtered) {
    const retryPlan = await attemptPlan([
      "Previous plan was filtered below minimum after equipment/exclusion checks.",
      `User equipment tags (must match): ${JSON.stringify(params.equipmentAvailable)}`,
      `Return at least ${minExercises} movements whose equipment needs are satisfied by those tags, or common barbell/dumbbell/bench-only alternatives from the catalog.`,
    ]);
    if (retryPlan) {
      const retryEnforced = enforceRequestedExercises(retryPlan, params.requestedExerciseIds, maxExercises);
      const second = filterPlanWithEquipmentFallback(
        retryEnforced,
        params.equipmentAvailable,
        params.exclusions,
        issues,
        minExercises,
        maxExercises
      );
      filtered = second.filtered;
      usedEquipmentBypass = second.usedEquipmentBypass;
    }
  }
  if (!filtered) return { built: null, issues };

  let built = builtWorkoutFromPlannedSession({
    plan: filtered,
    goal: params.goal,
    recoveryMode: params.recoveryMode,
    userMessage: params.userMessage,
  });
  if (usedEquipmentBypass) {
    built.notes.unshift(
      "Your saved equipment list is narrow compared to this plan; some movements may need gear you do not have — swap for the closest option you can run safely."
    );
  }

  const intent = params.userMessage ? parseBuilderStructuralIntent(params.userMessage) : undefined;
  let quality = validateBuiltDayQuality(built, intent);
  const shouldRetryForQuality =
    !quality.ok &&
    quality.warnings.length > 0;
  if (shouldRetryForQuality) {
    issues.push(...quality.warnings.slice(0, 6));
    const retryPlan = await attemptPlan(quality.warnings.slice(0, 8));
    if (retryPlan) {
      const r1 = enforceRequestedExercises(retryPlan, params.requestedExerciseIds, maxExercises);
      const { filtered: rFiltered, usedEquipmentBypass: rBypass } = filterPlanWithEquipmentFallback(
        r1,
        params.equipmentAvailable,
        params.exclusions,
        issues,
        minExercises,
        maxExercises
      );
      if (rFiltered) {
        built = builtWorkoutFromPlannedSession({
          plan: rFiltered,
          goal: params.goal,
          recoveryMode: params.recoveryMode,
          userMessage: params.userMessage,
        });
        if (rBypass) {
          built.notes.unshift(
            "Your saved equipment list is narrow compared to this plan; some movements may need gear you do not have — swap for the closest option you can run safely."
          );
        }
        quality = validateBuiltDayQuality(built, intent);
      } else {
        issues.push("retry_filtered_below_minimum_after_constraints");
      }
    } else {
      issues.push("retry_plan_empty_or_invalid");
    }
  }

  if (built.exercises.length < minExercises) {
    issues.push("built_workout_below_minimum_exercises");
    return { built: null, issues };
  }
  return { built, issues };
}
