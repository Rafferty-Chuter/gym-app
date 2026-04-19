/**
 * Per-turn workout / programme construction intent.
 * Prior thread context (e.g. a built workout in history) must not imply “keep building”
 * on the next message — each user message is classified fresh here and in question routing.
 */

import type { AssistantQuestionKind } from "@/lib/assistantQuestionRouting";

export type ConstructionResponseMode = "none" | "single_workout_build" | "programme_build";

/** Distinct follow-up / turn intents (for logging and future branching; not all map to builders). */
export type WorkoutArtefactIntent =
  | "build_new_workout"
  | "modify_current_workout"
  | "explain_current_workout"
  | "critique_current_workout"
  | "answer_general_training_question"
  | "non_workout_instruction";

/**
 * Hard override: user explicitly refuses structured workout/programme generation this turn.
 * Must run before construction cues (including “generate” + “workout” negatives).
 */
export function userExplicitlyBlocksStructuredWorkoutGeneration(message: string): boolean {
  const t = message.toLowerCase().trim();
  if (!t) return false;

  const refusesWorkoutObject =
    /\b(i\s+)?don'?t\s+want\b/.test(t) &&
    /\b(you\s+to\s+)?(generate|create|build|make|give|write|output)\b/.test(t) &&
    /\b(a\s+)?(workout|session|routine|programme|program|split)\b/.test(t);

  const doNotGenerateWorkout =
    /\b(don'?t|do not|please don'?t|stop|no more)\b/.test(t) &&
    /\b(generate|create|build|make|give me|write me|output)\b/.test(t) &&
    /\b(workout|session|routine|programme|program|split)\b/.test(t);

  const notArtefact =
    /\bnot\s+a\s+(workout|routine|programme|program|split)\b/.test(t) ||
    /\bno\s+workout\b/.test(t) ||
    /\bwithout\s+a\s+(workout|routine|programme|program)\b/.test(t);

  const explanationOnly =
    /\b(just|only)\s+(explain|answer|describe|talk|tell me)\b/.test(t) ||
    /\banswer\s+(generally|in general|conceptually)\b/.test(t) ||
    /\b(in\s+)?general\b.*\b(terms|principles)\b/.test(t);

  const noRoutine =
    /\bnot\s+(a\s+)?routine\b/.test(t) ||
    /\bdon'?t\s+(give|send)\s+me\s+a\s+routine\b/.test(t);

  return (
    refusesWorkoutObject ||
    doNotGenerateWorkout ||
    notArtefact ||
    explanationOnly ||
    noRoutine
  );
}

/** Lexical “build / give me a … workout|programme” style ask; false when blocked. */
export function hasExplicitLexicalConstructionAsk(message: string): boolean {
  if (userExplicitlyBlocksStructuredWorkoutGeneration(message)) return false;
  const t = message.toLowerCase();
  // Classic build verbs + workout/session family.
  if (
    /\b(build|make|create|generate|write me|give me|plan|rebuild|adjust|modify)\b/.test(t) &&
    (/\b(workout|session|routine|split|programme|program|training plan|weekly plan)\b/.test(t) ||
      /\b(push pull legs|ppl|upper lower|upper\/lower|upper-lower)\b/.test(t) ||
      /\b(push day|pull day|leg day|upper day|lower day)\b/.test(t))
  ) {
    return true;
  }

  // "i want / i'd like / i need + [session type] day|session|workout" — direct session request.
  if (
    /\b(i want|i'?d like|i need|can i (get|have))\b/.test(t) &&
    /\b(push|pull|leg|legs|upper|lower|chest|back|shoulder|shoulders|arms?|full.?body)\s+(day|session|workout)\b/.test(t)
  ) {
    return true;
  }

  return /\bwhat should i train today\b/.test(t);
}

/**
 * Loose construction mode from verbs + programme/workout anchors.
 * Does not default to single-workout when a generic verb matches but there is no programme/workout target.
 */
export function detectConstructionResponseMode(message: string): ConstructionResponseMode {
  const t = message.toLowerCase();
  if (userExplicitlyBlocksStructuredWorkoutGeneration(message)) return "none";

  const coreBuildVerbs =
    /\b(build|make|create|structure|generate|write me|give me|plan|rebuild|adjust|modify)\b/;
  const suggestWithProgrammeOrSessionTarget =
    /\bsuggest\b/.test(t) &&
    /\b(workout|session|routine|split|programme|program|training plan|weekly plan|push day|pull day|leg day|upper day|lower day|ppl|push pull legs|upper lower|weekly|per week)\b/.test(
      t
    );
  const wantsSessionDirectly =
    /\b(i want|i'?d like|i need|can i (get|have))\b/.test(t) &&
    /\b(push|pull|leg|legs|upper|lower|chest|back|shoulder|shoulders|arms?|full.?body)\s+(day|session|workout)\b/.test(t);
  const asksBuildVerb =
    coreBuildVerbs.test(t) ||
    suggestWithProgrammeOrSessionTarget ||
    wantsSessionDirectly ||
    /\bwhat should i train today\b/.test(t);

  if (!asksBuildVerb) return "none";

  const programmeish =
    /\b(split|program|programme|routine|training plan|weekly plan|day 1|day 2|multi[-\s]?day|\d+\s*day)\b/.test(
      t
    ) || /\b(push pull legs|ppl|upper lower|upper\/lower|full body)\b/.test(t);
  const workoutish =
    /\b(workout|session|push day|pull day|leg day|upper day|lower day|today(?:'s)? workout)\b/.test(
      t
    ) || /\bwhat should i train today\b/.test(t);

  if (programmeish && !workoutish) return "programme_build";
  if (workoutish && !programmeish) return "single_workout_build";
  if (!programmeish && !workoutish) return "none";
  return programmeish ? "programme_build" : "single_workout_build";
}

/** Gate before returning a structured single-session card (defense in depth). */
export function shouldEmitStructuredSingleSessionWorkout(args: {
  message: string;
  questionKind: AssistantQuestionKind;
  explicitLexicalConstructionAsk: boolean;
  strictConstructionMode: ConstructionResponseMode;
}): boolean {
  if (userExplicitlyBlocksStructuredWorkoutGeneration(args.message)) return false;
  if (args.questionKind === "single_session_construction") return true;
  return (
    args.explicitLexicalConstructionAsk && args.strictConstructionMode === "single_workout_build"
  );
}

/** Allow structured programme builder: blocked turns skip new builds unless modifying an active programme. */
export function mayRunStructuredProgrammePath(args: {
  message: string;
  programmeModificationFlow: boolean;
}): boolean {
  if (!userExplicitlyBlocksStructuredWorkoutGeneration(args.message)) return true;
  return args.programmeModificationFlow;
}

/** Coarse artefact intent for telemetry / prompts (single pass, message-only). */
export function classifyWorkoutArtefactIntent(message: string): WorkoutArtefactIntent {
  const t = message.toLowerCase().trim();
  if (userExplicitlyBlocksStructuredWorkoutGeneration(message)) return "non_workout_instruction";
  if (hasExplicitLexicalConstructionAsk(message)) return "build_new_workout";
  if (
    /\b(modify|change|update|adjust|swap|replace|remove|add)\b/.test(t) &&
    /\b(this|the|my)\s+(workout|session|programme|program|routine|split)\b/.test(t)
  ) {
    return "modify_current_workout";
  }
  if (
    /\b(explain|what does|walk me through|break down)\b/.test(t) &&
    /\b(this|the|my)\s+(workout|session)\b/.test(t)
  ) {
    return "explain_current_workout";
  }
  if (
    /\b(critique|review|rate|too much|too little|what'?s wrong)\b/.test(t) &&
    /\b(this|the|my)\s+(workout|session|programme|routine)\b/.test(t)
  ) {
    return "critique_current_workout";
  }
  if (
    /\b(optimal|how much|how often|frequency|volume|enough|too much|is this)\b/.test(t) &&
    /\b(chest|back|legs|arms|shoulders|training|muscle|week|weekly)\b/.test(t)
  ) {
    return "answer_general_training_question";
  }
  return "answer_general_training_question";
}
