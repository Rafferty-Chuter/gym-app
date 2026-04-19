import { splitDefinitionFromStructuredProgramme } from "@/lib/assistantProgrammeFlow";
import { formatIntRange } from "@/lib/formatPrescriptionDisplay";
import type { SplitDayDef } from "@/lib/splitDefinition";
import type { SplitDefinition } from "@/lib/splitDefinition";
import { buildWorkoutForMuscleTargets } from "@/lib/muscleDayBuilder";
import { buildUniformPerMuscleQuotaDay } from "@/lib/perMuscleQuotaDayBuilder";
import { validateUniformPerMuscleStructure } from "@/lib/programmeStructuralValidation";
import { reviewSplit } from "@/lib/splitReview";
import type { RecoveryMode, WorkoutBuilderGoal } from "@/lib/workoutBuilder";
import { resolveMuscleGroupingsOnly } from "./resolveMuscleGroupingsOnly";
import { splitDefinitionFromStandardType } from "./splitGroupings";
import { randomUUID } from "crypto";
import { buildSplitFromGrouping } from "@/lib/trainingKnowledge/splitLogic";
import { validateDayStructure } from "@/lib/trainingKnowledge/dayValidity";
import { detectUnrealisticSplit } from "@/lib/trainingKnowledge/splitValidation";

import type { AssistantStructuredProgramme, ParsedProgrammeRequest } from "./types";
import { assertLegacyWorkoutPathsAllowed } from "@/lib/workoutGenerationPathGuard";

/** Sorted muscle set per day — used to compare weekly shapes (PPL vs upper/lower vs full body, etc.). */
function normalizedDayMuscleKey(targetMuscles: string[]): string {
  return [...new Set(targetMuscles.map((m) => m.toLowerCase().trim()).filter(Boolean))]
    .sort()
    .join(",");
}

function splitGroupingFingerprints(def: SplitDefinition): string {
  return def.days.map((d) => normalizedDayMuscleKey(d.targetMuscles)).join("||");
}

/** True when two splits have the same number of days and the same target-muscle sets per day (order of days must match). */
function splitGroupingsEquivalent(a: SplitDefinition, b: SplitDefinition): boolean {
  if (a.days.length !== b.days.length) return false;
  return splitGroupingFingerprints(a) === splitGroupingFingerprints(b);
}

export type BuildProgrammeUserContext = {
  message: string;
  priorityGoal?: string;
  goal: WorkoutBuilderGoal;
  recoveryMode: RecoveryMode;
  equipmentAvailable: string[];
  injuriesOrExclusions: string[];
  recentExerciseIds: string[];
  preferredExercises: string[];
  requestedExerciseIds: string[];
  /** When set (e.g. from route pre-resolution), wins over `resolveMuscleGroupingsOnly`. */
  forcedSplitDefinition?: SplitDefinition | null;
  programmeModification?: boolean;
  activeProgramme?: AssistantStructuredProgramme | null;
  /** One id per assistant programme request; echoed on the programme object. */
  debugRequestId?: string;
};

function mapSplitDayToCard(
  d: SplitDayDef,
  dayIndex: number,
  parsed: ParsedProgrammeRequest,
  ctx: BuildProgrammeUserContext,
  equipmentAvailable: string[]
): AssistantStructuredProgramme["days"][0] {
  assertLegacyWorkoutPathsAllowed(
    "mapSplitDayToCard (deterministic muscle-target / uniform quota → buildWorkoutForMuscleTargets)"
  );
  const uniform = parsed.structuralConstraints?.uniformPerMuscleExerciseCount;
  const built =
    uniform != null && uniform > 0 && parsed.structuralConstraints
      ? buildUniformPerMuscleQuotaDay({
          targetMuscles: d.targetMuscles,
          structural: parsed.structuralConstraints,
          uniformPerMuscle: uniform,
          goal: ctx.goal,
          recoveryMode: ctx.recoveryMode,
          equipmentAvailable,
          injuriesOrExclusions: ctx.injuriesOrExclusions,
          preferredExercises: ctx.preferredExercises,
          requestedExerciseIds: ctx.requestedExerciseIds,
          recentExerciseIds: ctx.recentExerciseIds,
        })
      : buildWorkoutForMuscleTargets({
          targetMuscles: d.targetMuscles,
          goal: ctx.goal,
          recoveryMode: ctx.recoveryMode,
          equipmentAvailable,
          injuriesOrExclusions: ctx.injuriesOrExclusions,
          preferredExercises: ctx.preferredExercises,
          requestedExerciseIds: ctx.requestedExerciseIds,
          userMessage: ctx.message,
          recentTrainingContext: { recentExerciseIds: ctx.recentExerciseIds },
        });

  const dayValidity = validateDayStructure({
    dayLabel: d.dayLabel,
    targetMuscles: d.targetMuscles,
    exercises: built.exercises.map((ex) => ({
      exerciseName: ex.exerciseName,
      exerciseId: ex.exerciseId,
    })),
  });
  const dayValidityNote =
    dayValidity.issues.length > 0
      ? ` Day validity: ${dayValidity.issues.slice(0, 1).join(" ")}`
      : dayValidity.warnings.length > 0
        ? ` Day validity: ${dayValidity.warnings.slice(0, 1).join(" ")}`
        : "";

  return {
    dayLabel: `Day ${dayIndex + 1} - ${d.dayLabel}`,
    sessionType: built.displaySessionType,
    purposeSummary: [built.purposeSummary, d.notes, dayValidityNote].filter(Boolean).join(" — "),
    debugDayGenerator: "ui_builder_path",
    targetMuscles: d.targetMuscles,
    exercises: built.exercises.map((ex) => ({
      slotLabel: ex.slotLabel,
      exerciseName: ex.exerciseName,
      sets: formatIntRange(ex.sets),
      reps: formatIntRange(ex.repRange),
      rir: formatIntRange(ex.rirRange),
      rest: `${formatIntRange(ex.restSeconds)}s`,
      rationale: ex.rationale,
    })),
  };
}

/**
 * Resolve weekly split (muscle groupings per day) before exercise selection.
 * Used by both deterministic day building and the unified LLM-per-day programme path.
 */
export function resolveProgrammeSplitDefinition(
  parsed: ParsedProgrammeRequest,
  ctx: BuildProgrammeUserContext
): SplitDefinition {
  let split: SplitDefinition | null =
    ctx.forcedSplitDefinition && ctx.forcedSplitDefinition.days.length > 0
      ? ctx.forcedSplitDefinition
      : null;

  if (!split?.days.length && ctx.programmeModification && ctx.activeProgramme?.days.length) {
    const inheritedSplit = splitDefinitionFromStructuredProgramme(ctx.activeProgramme);
    const messageSplit = resolveMuscleGroupingsOnly(parsed, ctx.message);
    if (
      messageSplit?.days.length &&
      !splitGroupingsEquivalent(inheritedSplit, messageSplit)
    ) {
      split = messageSplit;
      console.log("[programme-split-override]", {
        reason: "modify_path_user_requested_split_shape_differs_from_active",
        activeDayCount: inheritedSplit.days.length,
        resolvedDayCount: messageSplit.days.length,
        resolvedTitle: messageSplit.title,
      });
    } else {
      split = inheritedSplit;
    }
  }

  if (!split?.days.length) {
    split = buildSplitFromGrouping(parsed, ctx.message) ?? resolveMuscleGroupingsOnly(parsed, ctx.message);
  }

  if (!split?.days.length) {
    if (process.env.NODE_ENV === "development") {
      console.error("[old-split-path-blocked]", {
        reason:
          "resolveMuscleGroupingsOnly_returned_empty — retired legacy session-template (toDay) split paths",
        messagePreview: ctx.message.slice(0, 160),
      });
    }
    split = splitDefinitionFromStandardType("full_body");
  }

  const resolved =
    split && split.days.length > 0 ? split : splitDefinitionFromStandardType("full_body");
  if (!resolved || resolved.days.length === 0) {
    throw new Error("resolveProgrammeSplitDefinition: could not resolve a non-empty split");
  }
  return resolved;
}

/**
 * Single entry: structured constraints → muscle split → per-day `buildWorkoutForMuscleTargets` → card shape.
 * Fallback when the unified LLM programme path is unavailable or unsuitable (e.g. uniform-per-muscle quotas).
 */
export function buildProgramme(
  parsed: ParsedProgrammeRequest,
  ctx: BuildProgrammeUserContext
): AssistantStructuredProgramme | null {
  console.log("[programme-builder-called]", {
    intent: parsed.intent,
    programmeModification: Boolean(ctx.programmeModification),
    hasForcedSplit: Boolean(ctx.forcedSplitDefinition?.days.length),
  });

  const split = resolveProgrammeSplitDefinition(parsed, ctx);

  if (!split.days.length) return null;

  const review = reviewSplit(split);
  const reviewNote =
    review.warnings.length > 0 ? ` Split review: ${review.warnings.join(" ")}` : "";

  const uniformStructural = parsed.structuralConstraints?.uniformPerMuscleExerciseCount;
  let days: AssistantStructuredProgramme["days"];

  if (uniformStructural != null && uniformStructural > 0) {
    let equipmentPass: string[] = ctx.equipmentAvailable;
    days = split.days.map((d, i) => mapSplitDayToCard(d, i, parsed, ctx, equipmentPass));
    let assembled: AssistantStructuredProgramme = {
      programmeTitle: split.title,
      programmeGoal:
        "Each day is built from your target muscle groups using movement templates, fatigue rules, and your context — split names are groupings only.",
      notes: `Muscle-target construction.${reviewNote} Structural: ${uniformStructural} primary-muscle exercise(s) per target group per day.`.trim(),
      days,
    };
    let structVal = validateUniformPerMuscleStructure(assembled, parsed, uniformStructural);
    let didStructuralRebuild = false;
    if (!structVal.ok) {
      didStructuralRebuild = true;
      console.warn("[structural-constraints-rebuild]", {
        reason: "retry_with_full_exercise_catalog",
        issues: structVal.issues,
      });
      equipmentPass = [];
      days = split.days.map((d, i) => mapSplitDayToCard(d, i, parsed, ctx, equipmentPass));
      assembled = {
        ...assembled,
        notes: `${assembled.notes} (Regenerated with full exercise catalog to satisfy structural counts.)`.trim(),
        days,
      };
      structVal = validateUniformPerMuscleStructure(assembled, parsed, uniformStructural);
    }
    console.log("[structural-constraints-trace]", {
      userMessagePreview: ctx.message.slice(0, 160),
      parsedStructuralConstraints: parsed.structuralConstraints,
      uniformPerMuscle: uniformStructural,
      targetPerMuscleCounts: structVal.dayReports.map((r) => ({
        dayLabel: r.dayLabel,
        expected: r.expectedPerTarget,
        counted: r.countedByTarget,
      })),
      validationPassed: structVal.ok,
      rebuildTriggered: didStructuralRebuild,
    });
    if (!structVal.ok) {
      console.error("[structural-constraints-failure]", { issues: structVal.issues });
      return null;
    }
    const debugRequestId = ctx.debugRequestId?.trim() || randomUUID();
    const debugBuiltAt = new Date().toISOString();
    console.log("[new-programme-pipeline-hit]", {
      debugSource: "new_programme_pipeline_v1",
      debugRequestId,
      debugBuiltAt,
      programmeTitle: split.title,
      dayCount: days.length,
      intent: parsed.intent,
      structuralUniformPerMuscle: uniformStructural,
    });
    return {
      programmeTitle: split.title,
      programmeGoal: assembled.programmeGoal,
      notes: `DEBUG: generated by ui_builder_path. ${assembled.notes}`,
      debugProgrammeGenerator: "ui_builder_path",
      debugSource: "new_programme_pipeline_v1",
      debugRequestId,
      debugBuiltAt,
      days,
    };
  }

  days = split.days.map((d, i) => mapSplitDayToCard(d, i, parsed, ctx, ctx.equipmentAvailable));
  const splitIssues = detectUnrealisticSplit({
    programmeTitle: split.title,
    programmeGoal: "",
    notes: "",
    days,
  });

  const debugRequestId = ctx.debugRequestId?.trim() || randomUUID();
  const debugBuiltAt = new Date().toISOString();
  console.log("[new-programme-pipeline-hit]", {
    debugSource: "new_programme_pipeline_v1",
    debugRequestId,
    debugBuiltAt,
    programmeTitle: split.title,
    dayCount: days.length,
    intent: parsed.intent,
  });

  return {
    programmeTitle: split.title,
    programmeGoal:
      "Each day is built from your target muscle groups using movement templates, fatigue rules, and your context — split names are groupings only.",
    notes: `DEBUG: generated by ui_builder_path. Muscle-target construction.${reviewNote}${
      splitIssues.length ? ` Split validity: ${splitIssues.slice(0, 2).join(" ")}` : ""
    }`.trim(),
    debugProgrammeGenerator: "ui_builder_path",
    debugSource: "new_programme_pipeline_v1",
    debugRequestId,
    debugBuiltAt,
    days,
  };
}

/** Structured programme object for the assistant card (alias for clarity in route). */
export function renderStructuredProgramme(programme: AssistantStructuredProgramme): AssistantStructuredProgramme {
  return programme;
}
