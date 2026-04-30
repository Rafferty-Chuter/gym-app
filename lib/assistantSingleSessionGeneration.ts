/**
 * Single workout-generation brain for assistant single-session cards.
 *
 * All UI structured single-session workouts MUST come from here (via the API route).
 * Exercise selection, ordering, and coaching rationale lines: LLM planner (`planSingleSessionWorkoutLLM`).
 * Sets / reps / RIR / rest: app prescriptions (`getPrescriptionForExercise` in `llmPlannedSessionMapper`).
 */

import type { RecoveryMode, WorkoutBuilderGoal, BuiltWorkout } from "@/lib/workoutTypes";
import type { SessionType } from "@/lib/sessionTemplates";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { builtWorkoutToStructuredWorkout, type AssistantStructuredWorkoutV1 } from "@/lib/assistantStructuredWorkoutContract";
import { tryBuildSingleSessionWithLLMCoachPlan } from "@/lib/llmPlannedSessionMapper";

export type GenerateAssistantSingleSessionParams = {
  apiKey: string;
  userMessage: string;
  sessionTypeHint: SessionType;
  equipmentAvailable: string[];
  exclusions: string[];
  requestedExerciseIds: string[];
  recoveryMode: RecoveryMode;
  goal: WorkoutBuilderGoal;
  coachContextSnippet: string;
  userTargetedMuscleRuleIds?: MuscleRuleId[];
};

export type GenerateAssistantSingleSessionResult =
  | {
      built: BuiltWorkout;
      structuredWorkout: AssistantStructuredWorkoutV1;
      issues: string[];
    }
  | { built: null; structuredWorkout: null; issues: string[] };

/**
 * One call = one structured session for the assistant card.
 */
export async function generateAssistantSingleSessionWorkout(
  params: GenerateAssistantSingleSessionParams
): Promise<GenerateAssistantSingleSessionResult> {
  const { built, issues } = await tryBuildSingleSessionWithLLMCoachPlan({
    apiKey: params.apiKey,
    userMessage: params.userMessage,
    sessionTypeHint: params.sessionTypeHint,
    equipmentAvailable: params.equipmentAvailable,
    exclusions: params.exclusions,
    requestedExerciseIds: params.requestedExerciseIds,
    recoveryMode: params.recoveryMode,
    goal: params.goal,
    coachContextSnippet: params.coachContextSnippet,
    userTargetedMuscleRuleIds: params.userTargetedMuscleRuleIds,
  });
  if (!built || built.exercises.length === 0) {
    return { built: null, structuredWorkout: null, issues };
  }
  return {
    built,
    structuredWorkout: builtWorkoutToStructuredWorkout(built, {
      debugGenerator: "assistant_unified_path",
      debugTrace:
        "generateAssistantSingleSessionWorkout → tryBuildSingleSessionWithLLMCoachPlan → builtWorkoutFromPlannedSession → builtWorkoutToStructuredWorkout",
    }),
    issues,
  };
}
