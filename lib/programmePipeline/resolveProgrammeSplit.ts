import { splitDefinitionFromStructuredProgramme } from "@/lib/assistantProgrammeFlow";
import type { SplitDefinition } from "@/lib/splitDefinition";
import { buildSplitFromGrouping } from "@/lib/trainingKnowledge/splitLogic";
import type { RecoveryMode, WorkoutBuilderGoal } from "@/lib/workoutTypes";
import type { AssistantStructuredProgramme, ParsedProgrammeRequest } from "./types";
import { resolveMuscleGroupingsOnly } from "./resolveMuscleGroupingsOnly";
import { splitDefinitionFromStandardType } from "./splitGroupings";

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
  forcedSplitDefinition?: SplitDefinition | null;
  programmeModification?: boolean;
  activeProgramme?: AssistantStructuredProgramme | null;
  debugRequestId?: string;
};

function normalizedDayMuscleKey(targetMuscles: string[]): string {
  return [...new Set(targetMuscles.map((m) => m.toLowerCase().trim()).filter(Boolean))]
    .sort()
    .join(",");
}

function splitGroupingFingerprints(def: SplitDefinition): string {
  return def.days.map((d) => normalizedDayMuscleKey(d.targetMuscles)).join("||");
}

function splitGroupingsEquivalent(a: SplitDefinition, b: SplitDefinition): boolean {
  if (a.days.length !== b.days.length) return false;
  return splitGroupingFingerprints(a) === splitGroupingFingerprints(b);
}

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
    split = splitDefinitionFromStandardType("full_body");
  }

  const resolved =
    split && split.days.length > 0 ? split : splitDefinitionFromStandardType("full_body");
  if (!resolved || resolved.days.length === 0) {
    throw new Error("resolveProgrammeSplitDefinition: could not resolve a non-empty split");
  }
  return resolved;
}
