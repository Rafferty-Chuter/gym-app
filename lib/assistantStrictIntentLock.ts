/**
 * Strict intent lock for the assistant route: a deterministic second pass
 * over the message that pins the answer mode (factual recall, session
 * review, projection, construction, ...) so the model can't drift. Lives
 * outside the route file because a route may only export handlers, and the
 * routing tests call these directly.
 */

import { userExplicitlyBlocksStructuredWorkoutGeneration } from "@/lib/workoutConstructionIntent";
import { isPhysiqueQuestion, type AssistantQuestionKind } from "@/lib/assistantQuestionRouting";

export type StrictAnswerMode =
  | "physique_progress"
  | "factual_recall"
  | "session_review"
  | "exercise_progression"
  | "recommendation"
  | "projection_estimate"
  | "timeline_readiness"
  | "progression_readiness_path"
  | "single_workout_construction"
  | "multi_day_programme_construction"
  | "split_comparison_or_recommendation"
  | "split_explanation_education"
  | "correction_clarification"
  | "general";

export type StrictIntentLock = {
  mode: StrictAnswerMode;
  qualifiers: {
    heavy: boolean;
    volume: boolean;
    lastOrRecent: boolean;
    thisSession: boolean;
    nextSession: boolean;
    programmeLike: boolean;
    workoutLike: boolean;
    estimateLike: boolean;
    timelineLike: boolean;
    reviewLike: boolean;
    whyLike: boolean;
    exactExerciseMention: string | null;
  };
};

export function computeStrictIntentLock(message: string): StrictIntentLock {
  const t = message.toLowerCase().trim();
  const physiqueLike = isPhysiqueQuestion(t);
  const constructionBlocked = userExplicitlyBlocksStructuredWorkoutGeneration(message);
  const heavy = /\bheavy\b/.test(t);
  const volume = /\bvolume\b/.test(t);
  const lastOrRecent = /\b(last|latest|most recent|recent)\b/.test(t);
  const thisSession = /\b(this|current)\s+(session|workout|day)\b/.test(t);
  const nextSession = /\bnext\s+(session|workout|day)\b/.test(t);
  const programmeLike =
    /\b(program|programme|routine|split|training plan|weekly plan)\b/.test(t) ||
    /\b(push pull legs|ppl|upper lower)\b/.test(t) ||
    /\b\d+\s*(day|days)\b/.test(t);
  const workoutLike = /\b(workout|session|day)\b/.test(t);
  const estimateLike = /\b(estimate|1rm|e1rm|one rep max)\b/.test(t);
  const timelineLike = /\b(when|how long|timeline|how soon|realistic)\b/.test(t);
  const reviewLike = /\b(review|look at|assess|how was|how did)\b/.test(t);
  const whyLike = /\bwhy\b/.test(t);
  const factualLike =
    /\b(what reps|what weight|how many sets|exactly|what did i)\b/.test(t) ||
    (lastOrRecent && /\b(on|for)\b/.test(t) && /\b(bench|squat|deadlift|row|press|curl|pull)\b/.test(t));
  const correctionLike =
    /^\?+$/.test(t) ||
    /^(what|huh|eh)\?*$/.test(t) ||
    /^(no|nope|nah|wrong|incorrect|false)\.?$/.test(t) ||
    /\b(that's wrong|thats wrong|what do you mean|you missed|you overlooked)\b/.test(t);
  const progressionLike = /\b(progress|progression|trend|improving|plateau)\b/.test(t);
  const progressionPathLike =
    /\b(what should my progress look like|on the way to|up until|what milestones should i hit|how should my sessions progress)\b/.test(
      t
    ) && /\b(1rm|target|bench|kg|lb)\b/.test(t);
  const recommendationLike =
    /\b(what should|what do i do|what should i do|how should i|next)\b/.test(t) &&
    (workoutLike || /\bbench|squat|deadlift|row|press\b/.test(t));
  const planActionLike =
    /\b(build|make|create|generate|write|design|plan)\b/.test(t) ||
    /\b(give me|write me)\b/.test(t);
  const asksOpinionOrComparison =
    /\b(which is better|what is better|do you prefer|vs|versus|difference between|compare|pros and cons|what do you think)\b/.test(
      t
    ) ||
    (/\bshould i\b/.test(t) && /\b(or|vs|versus|better)\b/.test(t));
  const splitMention = /\b(ppl|push pull legs|upper lower|split|routine|programme|program)\b/.test(t);
  const splitComparisonLike =
    splitMention &&
    (/\b(what is better|which is better|better than|do you prefer|vs|versus)\b/.test(t) ||
      (/\bshould i\b/.test(t) && /\b(or|vs|versus)\b/.test(t)));
  const splitEducationLike =
    splitMention &&
    /\b(what is a good split for me|how does .* compare|pros and cons|difference between|what do you think)\b/.test(
      t
    );
  const exactExerciseMention =
    t.match(/\b(bench press|bench|squat|deadlift|row|lat pulldown|pull-up|overhead press|curl)\b/)?.[1] ??
    null;

  let mode: StrictAnswerMode = "general";
  if (correctionLike) mode = "correction_clarification";
  // Bodyweight, calories, sleep and "how long until X kg" questions answer from the physique block,
  // so they never fall into the bench timeline or 1RM projection paths.
  else if (physiqueLike) mode = "physique_progress";
  else if (splitComparisonLike) mode = "split_comparison_or_recommendation";
  else if (splitEducationLike) mode = "split_explanation_education";
  else if (!constructionBlocked && programmeLike && planActionLike && !asksOpinionOrComparison)
    mode = "multi_day_programme_construction";
  else if (
    !constructionBlocked &&
    workoutLike &&
    (/\b(build|make|create|generate|plan|what should i train today)\b/.test(t) ||
      (/\bsuggest\b/.test(t) && /\b(workout|session)\b/.test(t)) ||
      (nextSession && /\b(look like|should be|program|session)\b/.test(t))) &&
    !asksOpinionOrComparison
  )
    mode = "single_workout_construction";
  else if (progressionPathLike) mode = "progression_readiness_path";
  else if (timelineLike && (estimateLike || /\b\d{2,3}\s*(kg|lb|kgs|lbs)\b/.test(t)))
    mode = "timeline_readiness";
  else if (estimateLike) mode = "projection_estimate";
  else if (factualLike) mode = "factual_recall";
  else if (reviewLike && (lastOrRecent || thisSession)) mode = "session_review";
  else if (progressionLike) mode = "exercise_progression";
  else if (recommendationLike) mode = "recommendation";
  else if (whyLike) mode = "correction_clarification";

  return {
    mode,
    qualifiers: {
      heavy,
      volume,
      lastOrRecent,
      thisSession,
      nextSession,
      programmeLike,
      workoutLike,
      estimateLike,
      timelineLike,
      reviewLike,
      whyLike,
      exactExerciseMention,
    },
  };
}

export function applyStrictIntentLock(
  current: AssistantQuestionKind,
  lock: StrictIntentLock
): AssistantQuestionKind {
  switch (lock.mode) {
    case "physique_progress":
      return "physique_progress";
    case "correction_clarification":
      return "prior_answer_correction";
    case "factual_recall":
      return "exact_factual_recall";
    case "session_review":
      return "session_review";
    case "exercise_progression":
      return "exercise_progression";
    case "recommendation":
      return "coaching_recommendation";
    case "projection_estimate":
    case "timeline_readiness":
      return "projection_estimate";
    case "progression_readiness_path":
      return "progression_readiness_path";
    case "single_workout_construction":
      return "single_session_construction";
    case "multi_day_programme_construction":
      return "multi_day_programme_construction";
    case "split_comparison_or_recommendation":
      return "split_comparison_or_recommendation";
    case "split_explanation_education":
      return "split_explanation_education";
    default:
      return current;
  }
}
