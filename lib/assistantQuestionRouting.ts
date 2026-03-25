import { parseSessionReviewSelection } from "@/lib/sessionReviewAnchor";

/**
 * Fine-grained question routing for assistant prompts (first matching rule wins).
 * Keeps answers anchored: session vs exercise vs facts vs coaching vs volume vs memory.
 */
export type AssistantQuestionKind =
  | "memory_continuity"
  | "session_review"
  | "exact_factual_recall"
  | "exercise_progression"
  | "projection_estimate"
  | "volume_balance"
  | "coaching_recommendation"
  | "coach_explanation"
  | "template_review"
  | "exercise_question"
  | "goal_question"
  | "recent_training_analysis"
  | "general_training_question";

export function classifyAssistantQuestionKind(message: string): AssistantQuestionKind {
  const t = message.trim().toLowerCase();
  if (!t) return "general_training_question";

  if (
    /\b(do you remember|remember our|what did we (just )?say|what was my (previous|last) message|our last chat|recall what we)\b/.test(
      t
    ) ||
    (/\bwhat\s+was\s+my\s+last\s+message\b/.test(t) && !/\bworkout\b/.test(t))
  ) {
    return "memory_continuity";
  }

  if (parseSessionReviewSelection(message)) {
    return "session_review";
  }

  const progressionCue =
    /\b(progress|progressed|progressing|trend|improving|stalled|plateau)\b/.test(t);

  if (
    progressionCue &&
    (/\bhow has\b/.test(t) ||
      /\bhow's\b/.test(t) ||
      /\bhow is my\b/.test(t) ||
      /\bam i progressing\b/.test(t) ||
      /\brecent\b.*\btrend\b/.test(t) ||
      /\btrend\b.*\b(bench|squat|deadlift|row|press|curl|pull)\b/.test(t) ||
      /\b(bench|squat|deadlift|row|press|curl|pull|chin|lat)\b.*\btrend\b/.test(t))
  ) {
    return "exercise_progression";
  }

  const factualCue =
    /\b(what reps|what weight|how many sets|how much did i)\b/.test(t) ||
    /\bwhat did i (do|get|hit)\b/.test(t) ||
    (/\blast (session|time)\b/.test(t) && /\b(on|for)\b/.test(t));

  if (factualCue && !progressionCue) {
    return "exact_factual_recall";
  }

  if (
    /\b(1rm|one rep max|one-rep max|e1rm|estimated 1rm)\b/.test(t) ||
    (/\bwhen (could|can|should) i\b/.test(t) && /\b(kg|lb|kgs|lbs|attempt|hit|lift)\b/.test(t)) ||
    /\bworking sets\b.*\b(look|should|need to)\b/.test(t)
  ) {
    return "projection_estimate";
  }

  if (
    /\bweekly volume\b/.test(t) ||
    /\bhow much volume\b/.test(t) ||
    /\b(undertrained|under-trained|enough)\b.*\b(for|on)\b.*\b(chest|back|legs|arms|shoulders|biceps|triceps|quads|hamstrings)\b/
      .test(t) ||
    /\bwhat muscle (groups?)?\b.*\b(low|lag|missing|weakest|under)\b/.test(t) ||
    /\bvolume\b.*\b(chest|back|legs|arms|shoulders)\b/.test(t)
  ) {
    return "volume_balance";
  }

  if (
    /\bwhat should i do\b/.test(t) ||
    /\bnext session\b/.test(t) ||
    /\bshould i (increase|add|reduce|cut|deload|lower|raise|up|drop)\b/.test(t) ||
    /\bshould i (train|take|skip)\b/.test(t) ||
    /\bwhat'?s lagging\b/.test(t) ||
    /\bwhat is lagging\b/.test(t)
  ) {
    return "coaching_recommendation";
  }

  if (
    t.includes("why did you say") ||
    t.includes("what do you mean") ||
    (t.includes("why") &&
      (t.includes("coach") || t.includes("suggestion") || t.includes("recommendation") || t.includes("assistant")))
  ) {
    return "coach_explanation";
  }

  if (
    t.includes("template") ||
    t.includes("split") ||
    t.includes("program") ||
    t.includes("routine") ||
    t.includes("workout plan")
  ) {
    return "template_review";
  }

  if (
    t.includes("is this exercise") ||
    (t.includes("should i do") &&
      !/\b(increase|reduce|weight|intensity|volume|deload)\b/.test(t)) ||
    /\b(should i|is it ok to|can i)\b.*\b(bench|squat|deadlift|row|press|curl|pull|chin|lift)\b/.test(t)
  ) {
    return "exercise_question";
  }

  if (
    t.includes("goal") ||
    t.includes("bulk") ||
    t.includes("cut") ||
    /\bstrength\b/.test(t) ||
    t.includes("hypertrophy")
  ) {
    return "goal_question";
  }

  if (
    t.includes("how is my training") ||
    t.includes("how is my week") ||
    t.includes("how's my training") ||
    t.includes("hows my training") ||
    t.includes("analyze my training") ||
    t.includes("recent training") ||
    t.includes("my training look") ||
    t.includes("training looking") ||
    t.includes("how is my lifting") ||
    t.includes("review my training") ||
    t.includes("review my workouts") ||
    (t.includes("review") && t.includes("training")) ||
    t.includes("assess my training") ||
    t.includes("feedback on my training") ||
    t.includes("clearest next step") ||
    t.includes("look at my training") ||
    t.includes("what do you think of my training") ||
    (t.includes("volume") &&
      (t.includes("thoughts") ||
        t.includes("overall") ||
        (t.includes("how") && (t.includes("week") || t.includes("looking") || t.includes("doing")))))
  ) {
    return "recent_training_analysis";
  }

  return "general_training_question";
}

/** Maps routing kind to legacy intent string used for logging / partial backward compatibility. */
export type LegacyAssistantIntent =
  | "session_review"
  | "recent_training_analysis"
  | "coach_explanation"
  | "template_review"
  | "exercise_question"
  | "goal_question"
  | "general_training_question";

export function mapQuestionKindToLegacyIntent(kind: AssistantQuestionKind): LegacyAssistantIntent {
  switch (kind) {
    case "session_review":
      return "session_review";
    case "coach_explanation":
      return "coach_explanation";
    case "template_review":
      return "template_review";
    case "exercise_question":
      return "exercise_question";
    case "goal_question":
      return "goal_question";
    case "recent_training_analysis":
      return "recent_training_analysis";
    default:
      return "general_training_question";
  }
}
