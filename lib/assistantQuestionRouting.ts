import { parseSessionReviewSelection } from "@/lib/sessionReviewAnchor";

/**
 * Fine-grained question routing for assistant prompts (first matching rule wins).
 * Keeps answers anchored: session vs exercise vs facts vs coaching vs volume vs memory.
 */
export type AssistantQuestionKind =
  | "memory_continuity"
  | "prior_answer_correction"
  | "single_session_construction"
  | "multi_day_programme_construction"
  | "split_comparison_or_recommendation"
  | "split_explanation_education"
  | "progression_readiness_path"
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

export type AssistantThreadTurn = { role: string; content: string };

/** True when the last turn is user and the one before is assistant (follow-up on the bot’s last reply). */
export function threadMessagesSupportCorrectionTurn(
  threadMessages: AssistantThreadTurn[] | null | undefined
): boolean {
  if (!threadMessages?.length) return false;
  const msgs = threadMessages.filter((m) => typeof m.content === "string" && m.content.trim());
  if (msgs.length < 2) return false;
  const last = msgs[msgs.length - 1];
  const prev = msgs[msgs.length - 2];
  return (
    last.role === "user" &&
    prev.role === "assistant" &&
    (prev.content?.trim().length ?? 0) > 0
  );
}

/**
 * Heuristic: user is disputing, clarifying, or correcting something from the assistant’s prior reply.
 * Keep in sync with server routing — only used when `threadMessagesSupportCorrectionTurn` is true.
 */
export function isPriorAnswerChallengeText(message: string): boolean {
  const raw = message.trim();
  if (!raw) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  const wc = words.length;

  const strong = [
    /\bthat'?s?\s+wrong\b/i,
    /\b(this|it)\s+is\s+wrong\b/i,
    /\bnot\s+(true|right|correct)\b/i,
    /\bthat\s+isn'?t\s+(right|true|correct)\b/i,
    /\bwhat\s+do\s+you\s+mean\b/i,
    /\bwdym\b/i,
    /\b(they|it)\s+(is|are)\s+there\b/i,
    /\b(you|you'?re|you\s+are)\s+(wrong|incorrect)\b/i,
    /\b(you|you'?re|you\s+are)\s+(lying|a\s+liar)\b/i,
    /\bno,?\s+i\s+meant\b/i,
    /\bi\s+meant\s+(bench|squat|dead|deadlift|row|ohp|press|curl|pull)\b/i,
    /\b(i\s+do\s+have|i\s+have)\s+(those|that|them|it)\b/i,
    /\bi\s+(also\s+)?have\s+.*\blogged\b/i,
    /\bi\s+did\s+log\b/i,
    /\b(it'?s|they'?re)\s+in\s+my\s+log\b/i,
    /\b(my\s+)?log\s+shows\b/i,
    /\byou\s+said\b.*\b(but|wrong|not|isn'?t|actually)\b/i,
    /\bwhy did you say\b/i,
    /\b(that|this) doesn'?t match\b/i,
    /\b(that|this) doesn'?t make sense\b/i,
    /\b(i\s+)?disagree\b/i,
    /\bfix\s+your\b.*\b(answer|reply)\b/i,
    /\byou\s+missed\b/i,
    /\byou\s+overlooked\b/i,
  ].some((re) => re.test(raw));

  const trimmedForWeak = raw.trim();
  const weakStandalone =
    /^\?+$/.test(trimmedForWeak) ||
    (wc <= 2 && /^(what|huh|eh)\?*$/i.test(trimmedForWeak)) ||
    (wc <= 3 && /^(no|nope|nah)\.?$/i.test(trimmedForWeak)) ||
    (wc <= 4 && /^(wrong|incorrect|false)\.?$/i.test(trimmedForWeak));

  return strong || weakStandalone;
}

export function shouldRoutePriorAnswerCorrection(
  message: string,
  threadMessages: AssistantThreadTurn[] | null | undefined
): boolean {
  return (
    threadMessagesSupportCorrectionTurn(threadMessages) && isPriorAnswerChallengeText(message)
  );
}

export function classifyAssistantQuestionKind(
  message: string,
  opts?: { threadMessages?: AssistantThreadTurn[] | null }
): AssistantQuestionKind {
  const t = message.trim().toLowerCase();
  if (!t) return "general_training_question";

  if (shouldRoutePriorAnswerCorrection(message, opts?.threadMessages)) {
    return "prior_answer_correction";
  }

  const hasConstructionFamilyTerm =
    /\b(workout|session|routine|split|programme|program|training plan|weekly plan)\b/.test(t);
  const hasConstructionAction =
    /\b(build|make|create|generate|write me|design|plan|give me)\b/.test(t) ||
    /\bwhat should i train today\b/.test(t);
  const splitCompareCue =
    (/\b(what is better|which is better|better than|do you prefer|vs|versus)\b/.test(t) &&
      /\b(ppl|push pull legs|upper lower|split|routine|programme|program)\b/.test(t)) ||
    (/\b(should i do)\b/.test(t) && /\b(vs|versus|or)\b/.test(t) && /\b(split|ppl|upper lower)\b/.test(t));
  const splitExplainCue =
    /\b(what is a good split for me|how does .* compare|pros and cons|difference between)\b/.test(t) &&
    /\b(ppl|push pull legs|upper lower|split|routine|programme|program)\b/.test(t);
  if (splitCompareCue) return "split_comparison_or_recommendation";
  if (splitExplainCue) return "split_explanation_education";
  const sessionTypeMentions = [
    "chest",
    "back",
    "legs",
    "leg",
    "shoulders",
    "shoulder",
    "arms",
    "push",
    "pull",
    "upper",
    "lower",
    "full body",
    "full-body",
  ].filter((token) => t.includes(token)).length;
  const hasCustomMultiDayCue =
    /\b(one day|another day|on another day|day\s*1|day\s*2|day\s*3|day\s*4)\b/.test(t) ||
    (/\b(day)\b/.test(t) && /\b(and|then|another)\b/.test(t) && sessionTypeMentions >= 2);
  const hasMultiDayCue =
    /\b(split|routine|programme|program|training plan|weekly plan)\b/.test(t) ||
    /\b(push pull legs|ppl|upper lower)\b/.test(t) ||
    /\b\d+\s*(day|days)\b/.test(t) ||
    /\b(week|weekly)\b/.test(t) ||
    hasCustomMultiDayCue;
  const hasSingleSessionCue =
    /\b(leg|legs|push|pull|chest|back|shoulder|shoulders|arms|upper|lower|full body)\s+(workout|session|day)\b/.test(t);
  if (hasConstructionFamilyTerm && hasConstructionAction) {
    if (hasMultiDayCue && (!hasSingleSessionCue || sessionTypeMentions >= 2)) {
      return "multi_day_programme_construction";
    }
    if (
      /\b(push pull legs|ppl|upper lower)\b/.test(t) ||
      /\b\d+\s*(day|days)\b/.test(t) ||
      hasCustomMultiDayCue
    ) {
      return "multi_day_programme_construction";
    }
    return "single_session_construction";
  }

  // Projection-first override: 1RM estimate/readiness/timeline questions should not fall
  // into session_review or exercise_progression even when they contain "progression" or "session" words.
  const has1rmCue = /\b(1rm|e1rm|one rep max|one-rep max|estimated 1rm|current 1rm|pr 1rm)\b/.test(t);
  const hasTargetWeight = /\b\d{2,3}\s*(kg|kgs|lb|lbs|kilograms|pounds)\b/.test(t);
  const hasTimelineCue = /\b(when|how long|how soon|timeline|expect|realistic)\b/.test(t);
  const hasBenchCue = /\bbench\b|bench press|barbell bench|pb/.test(t);
  const hasProgressionTimelineCue =
    /\b(based on|from)\b/.test(t) &&
    /\b(progress|progression|recent|workouts?|sets?)\b/.test(t) &&
    (hasTimelineCue || has1rmCue || hasTargetWeight);

  if (
    (has1rmCue && hasBenchCue &&
      (/\b(estimate|current|read|readiness|expect|likely|taking into account|given that|based on)\b/.test(t) ||
        /\b(heavy|volume)\b/.test(t))) ||
    (has1rmCue && hasTargetWeight && hasTimelineCue) ||
    (hasTargetWeight && hasTimelineCue && (hasBenchCue || /\b(hit|reach|get|attempt|lift)\b/.test(t))) ||
    hasProgressionTimelineCue
  ) {
    return "projection_estimate";
  }

  const progressionPathCue =
    /\b(what should my progress look like|what should my bench look like on the way|what milestones should i hit|how should my sessions progress)\b/.test(
      t
    ) ||
    ((/\b(progress|milestones?|on the way|from here|up until)\b/.test(t) &&
      /\b(1rm|e1rm|target|kg|lb|bench)\b/.test(t)));
  if (progressionPathCue) {
    return "progression_readiness_path";
  }

  if (
    /\b(do you remember|remember our|what did we (just )?say|what was my (previous|last) message|our last chat|recall what we)\b/.test(
      t
    ) ||
    (/\bwhat\s+was\s+my\s+last\s+message\b/.test(t) && !/\bworkout\b/.test(t))
  ) {
    return "memory_continuity";
  }

  // Bench 1RM path + workout anchoring → projection (not a pure session recap); keeps bench projection block available.
  if (
    /\b(1rm|one rep max|one-rep max|e1rm)\b/.test(t) &&
    /\b(kg|lb|kgs|lbs)\b/.test(t) &&
    /\b(last|latest|most recent|previous|based on)\b/.test(t) &&
    /\b(workout|session)\b/.test(t) &&
    !/\b(squat|deadlift|dead lift|sumo)\b/.test(t)
  ) {
    return "projection_estimate";
  }

  if (parseSessionReviewSelection(message)) {
    return "session_review";
  }

  const workoutBuildCue =
    /\b(suggest me a workout|build me a|make me a|what should i train today|build me a full workout)\b/.test(
      t
    ) ||
    (/\b(workout|session|day)\b/.test(t) &&
      /\b(build|make|create|generate|plan|write)\b/.test(t)) ||
    (/\b(include)\b/.test(t) && /\b(sets|reps|rir)\b/.test(t) && /\b(workout|session|day)\b/.test(t));
  if (workoutBuildCue) {
    return "single_session_construction";
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
    /\bworking sets\b.*\b(look|should|need to)\b/.test(t) ||
    (/\b(bench|bench press|pb)\b/.test(t) &&
      /\b(heavy|volume)\b/.test(t) &&
      /\b(session|sessions|day)\b/.test(t) &&
      /\b(expect|look|what)\b/.test(t) &&
      /\b(like|should|would)\b/.test(t))
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
    case "prior_answer_correction":
      return "general_training_question";
    case "coach_explanation":
      return "coach_explanation";
    case "split_comparison_or_recommendation":
      return "template_review";
    case "split_explanation_education":
      return "template_review";
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
