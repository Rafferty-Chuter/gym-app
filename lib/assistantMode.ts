export type AssistantMode =
  | "analysis"
  | "advisory"
  | "explanation"
  | "clarification";

type DetectAssistantModeParams = {
  message: string;
  hasWorkoutData: boolean;
  hasCoachAnalysis: boolean;
};

type ModeDetection = {
  mode: AssistantMode;
  reason: string;
};

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function detectAssistantModeWithReason(
  params: DetectAssistantModeParams
): ModeDetection {
  const message = (params.message ?? "").trim().toLowerCase();

  const explanationPhrases = [
    "why did you say",
    "what do you mean",
    "explain",
    "why",
  ];
  const analysisPhrases = [
    "how is my training",
    "how is my week",
    "how am i doing",
    "how's my training",
    "how are my workouts",
    "how am i progressing",
    "progress",
    "plateau",
    "what should i do next",
    "next session",
    "how is it looking",
    "how is this week",
    "thoughts on my workout",
    "thoughts on my session",
  ];
  const advisoryPhrases = [
    "how hard should i train",
    "what rir",
    "how many sets",
    "should i train to failure",
    "i'm feeling unwell",
    "im feeling unwell",
  ];

  // A) Explanation mode first
  if (includesAny(message, explanationPhrases)) {
    return { mode: "explanation", reason: "matched_explanation_phrase" };
  }

  // B) Analysis mode second (must override advisory when both could match)
  if (params.hasWorkoutData && includesAny(message, analysisPhrases)) {
    return { mode: "analysis", reason: "matched_analysis_phrase_with_workout_data" };
  }

  // C) Advisory mode third
  if (!params.hasWorkoutData) {
    return { mode: "advisory", reason: "no_workout_data" };
  }
  if (includesAny(message, advisoryPhrases)) {
    return { mode: "advisory", reason: "matched_general_guidance_phrase" };
  }

  // D) Clarification mode last when vague / unmatched
  return { mode: "clarification", reason: "no_mode_rule_matched" };
}

export function detectAssistantMode(params: DetectAssistantModeParams): AssistantMode {
  return detectAssistantModeWithReason(params).mode;
}
