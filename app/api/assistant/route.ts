import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  detectAssistantModeWithReason,
  type AssistantMode,
} from "@/lib/assistantMode";
import type { UserProfile } from "@/lib/userProfile";
import type { AssistantSelectiveMemoryV1, RecentConversationTurn } from "@/lib/assistantMemory";
import { buildSelectiveMemoryBlock } from "@/lib/assistantMemory";
import { buildInferredTrainingProfile } from "@/lib/inferredTrainingProfile";
import type { CoachingContext } from "@/lib/coachingContext";
import { countCompletedLoggedSets } from "@/lib/completedSets";
import { buildSessionReviewAnchorBlock } from "@/lib/sessionReviewAnchor";
import {
  buildExerciseLogAnchorBlock,
  resolveExerciseFromMessage,
} from "@/lib/assistantLogAnchors";
import {
  classifyAssistantQuestionKind,
  mapQuestionKindToLegacyIntent,
  type AssistantQuestionKind,
  type AssistantThreadTurn,
} from "@/lib/assistantQuestionRouting";
import { buildAssistantEvidenceScopeBlock } from "@/lib/assistantAnswerScope";
import type { BenchContextSummary } from "@/lib/benchContext";
import type { Bench1RMEstimate } from "@/lib/bench1rm";
import {
  buildWorkoutWithQualityPasses,
  type BuiltWorkout,
  type WorkoutBuilderGoal,
  type RecoveryMode,
} from "@/lib/workoutBuilder";
import { formatIntRange } from "@/lib/formatPrescriptionDisplay";
import { isProgrammeModificationIntent, summarizeActiveProgrammeForLog } from "@/lib/assistantProgrammeFlow";
import { parseSplitFromMessage } from "@/lib/splitParser";
import { scoreDayForExercise } from "@/lib/muscleDayBuilder";
import type { SessionType } from "@/lib/sessionTemplates";
import { getExerciseByIdOrName, type ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";
import { parseRequestedExerciseConstraints } from "@/lib/parseRequestedExerciseConstraints";
import type { SplitDefinition } from "@/lib/splitDefinition";
import {
  buildProgramme,
  classifyProgrammeIntent,
  composeModificationUserMessage,
  parseProgrammeRequest,
  resolveSplitDefinitionForRequest,
  validateProgrammeAgainstRequest,
  type ActiveProgrammeState as PipelineActiveProgrammeState,
  type AssistantStructuredProgrammeDebugSource,
  type ParsedProgrammeRequest,
} from "@/lib/programmePipeline";
import { getPrescriptionForExercise } from "@/lib/prescriptionDefaults";
import {
  extractProgrammeConstraintsLLM,
  type ProgrammeConstraintsLLMOutput,
} from "@/lib/extractProgrammeConstraintsLLM";
import { extractProgrammeStructureLLM } from "@/lib/extractProgrammeStructureLLM";
import { buildProgrammeFromLLMPlan } from "@/lib/buildProgrammeFromLLMPlan";
import {
  exclusionStringsForExerciseIds,
  mergeLLMIntoProgrammeBuildState,
} from "@/lib/mergeLLMProgrammeConstraints";
import { findExcludedExercisesPresentInProgramme } from "@/lib/validateProgrammeExcludedExercises";
import { muscleVolumeSummaryForAssistant } from "@/lib/muscleAwareWeeklyVolume";
import { expandExcludedExerciseIds } from "@/lib/expandExcludedExerciseIds";
import { programmeDayMuscleCoverageSummaryForQuestion } from "@/lib/muscleAwareProgrammeDayAssessment";
import { buildHypertrophyEvidencePromptBlock } from "@/lib/hypertrophyEvidenceV1";
import { mapExerciseToMuscleStimulus } from "@/lib/muscleGroupMapper";
import type { MuscleGroupId } from "@/lib/muscleGroupRules";
import { MUSCLE_GROUP_RULES } from "@/lib/muscleGroupRules";
import { buildSessionFeedbackFromBuiltWorkout } from "@/lib/trainingKnowledge/sessionReviewLogic";
import { tryAnswerFromTrainingKnowledge as tryAnswerTrainingKnowledgeQuestion } from "@/lib/trainingKnowledge/trainingAnswerSupport";

/** Mirrors client `coachStructuredOutput` — deterministic Coach tab output + evidence id hooks. */
export type AssistantCoachStructuredOutput = {
  keyFocus: string | null;
  keyFocusType: "plateau" | "declining" | "low-volume" | "progressing" | "none";
  keyFocusExercise?: string;
  keyFocusGroups?: string[];
  keyFocusEvidenceCardIds: string[];
  whatsGoingWell: Array<{ text: string; evidenceCardIds: string[] }>;
  actionableSuggestions: Array<{ text: string; evidenceCardIds: string[] }>;
};

/** Deduped catalog cards referenced by the current coach output (subset of full EvidenceCard). */
export type AssistantEvidenceCard = {
  id: string;
  title: string;
  summary: string;
  practicalTakeaway: string;
  caution?: string;
  confidence: "low" | "moderate" | "high";
};

/**
 * POST /api/assistant JSON body.
 * Coach evidence: `coachStructuredOutput` carries deterministic text + `evidenceCardIds` per section;
 * `evidenceCards` is the deduped catalog subset for those ids (server filters to referenced ids only).
 */
export type AssistantBody = {
  message: string;
  /** Client-owned active thread id (localStorage). */
  thread_id?: string;
  /** Whether the loaded thread history is exact (truthfulness gating). */
  exactThreadLoaded?: boolean;
  /**
   * Client-owned, ordered thread snippet (used for deterministic "last message" queries
   * and for conversation continuity).
   */
  threadMessages?: Array<{
    role: "user" | "assistant";
    content: string;
    workout?: AssistantResponse["structuredWorkout"];
    programme?: AssistantResponse["structuredProgramme"];
  }>;
  /** Last structured programme + parsed constraints (client resends each turn for modify path). */
  activeProgrammeState?: PipelineActiveProgrammeState;
  trainingSummary: {
    totalWorkouts: number;
    totalExercises: number;
    totalSets: number;
    weeklyVolume: Record<string, number>;
    recentExercises: string[];
  };
  trainingFocus?: string;
  experienceLevel?: string;
  unit?: string;
  /** Priority goal label (same as Coach). */
  priorityGoal?: string;
  exerciseTrends?: Array<{
    exercise: string;
    trend: string;
    recentPerformances: Array<{ completedAt: string; weight: number; reps: number }>;
  }>;
  trainingInsights?: {
    weeklyVolume: Record<string, number>;
    frequency: number;
    exerciseInsights: Array<{
      exercise: string;
      sessionsTracked: number;
      trend: string;
      changeSummary: string;
      consistency: string;
      hasAdequateExposure: boolean;
      possiblePlateau: boolean;
      possibleFatigue: boolean;
      possibleLowSpecificity: boolean;
      avgRIR?: number;
      latestSessionAvgRIR?: number;
      latestSessionAllSetsToFailure?: boolean;
    }>;
    findings: string[];
    /** Mean RIR over all logged sets in history. */
    averageRIR?: number;
    /** Exercises flagged as high effort from logged RIR. */
    recentHighEffortExercises?: string[];
  };
  /** Per-exercise insight for the user's priority goal lift (same shape as getExerciseInsights). */
  priorityGoalExerciseInsight?: {
    exercise: string;
    sessionsTracked: number;
    trend: string;
    changeSummary: string;
    consistency: string;
    hasAdequateExposure: boolean;
    possiblePlateau: boolean;
    possibleFatigue: boolean;
    possibleLowSpecificity: boolean;
    avgRIR?: number;
    latestSessionAvgRIR?: number;
    latestSessionAllSetsToFailure?: boolean;
  };
  coachStructuredOutput?: AssistantCoachStructuredOutput;
  /** Only cards referenced via evidenceCardIds in coachStructuredOutput. */
  evidenceCards?: AssistantEvidenceCard[];
  /** Optional plain summary of saved templates (names, splits, exercises) for template_review intent. */
  templatesSummary?: string;
  /** High-confidence user constraints only. */
  userProfile?: UserProfile;
  coachingContext?: CoachingContext;
  /** Selective long-term coaching preferences learned from chats (client-owned). */
  assistantMemory?: AssistantSelectiveMemoryV1;
  /** Rolling window of recent chat turns for thread continuity (client-owned). */
  recentConversationMemory?: RecentConversationTurn[];
  /** Client-owned conversation subject locking: exercise topic to anchor follow-ups. */
  activeExerciseTopic?: string;
  /** Exact last-session data for the active exercise (client-owned). */
  activeExerciseLastSession?: {
    exerciseName: string;
    completedAt: string;
    unloggedSetCount?: number;
    bestSet?: { weight: string; reps: string; e1rm?: number };
    lastSet?: { weight: string; reps: string; notes?: string; rir?: number };
    sets?: Array<{ weight: string; reps: string; notes?: string; rir?: number }>;
  };
  /** Optional bench projection estimate (client-owned). */
  benchProjection?: {
    target1RM?: number;
    payloadUnit: "kg" | "lb";
    benchExerciseName: string;
    /** Canonical max-of-recent-sessions e1RM — model must not contradict with a separate “current 1RM”. */
    authoritativeEstimated1RM: number;
    currentEstimated1RM: number;
    estimateBasisLine: string;
    progressionDeltaKgPerSession: number | null;
    progressionDeltaExplanation: string;
    sessionsEstimate: number | null;
    gapToTarget: number | null;
    workingWeights?: Array<{ reps: number; weight: number }>;
    recentBestSets: Array<{ completedAt: string; weight: number; reps: number; e1rm?: number }>;
    heavyDay: {
      topSetKgMin: number;
      topSetKgMax: number;
      repRangeLabel: string;
      loggedTieIn: string;
    };
    heavyAnchor?: { completedAt: string; weight: number; reps: number; rir?: number };
    volumeDay: {
      workingKgMin: number;
      workingKgMax: number;
      repRangeLabel: string;
      setsHint: string;
      loggedTieIn: string;
    };
    volumeAnchor?: { completedAt: string; weight: number; reps: number; rir?: number } | null;
    readinessLines: string[];
    evidenceScopeLine?: string;
    concreteHeavy?: { loggedBenchmark: string; nearerTargetBand: string };
    concreteVolume?: { loggedBenchmark: string; nearerTargetBand: string };
    readinessSignals?: string[];
    coachFacing?: {
      evidenceLead: string;
      bestCurrentRead: string;
      heavyBenchDay: string;
      volumeBenchDay: string;
      whenTargetLooksRealistic: string;
      nextMove: string;
    };
    subsectionEvidenceLock?: string;
  };
  benchContext?: BenchContextSummary;
  benchEstimate?: Bench1RMEstimate;
};

export type AssistantResponse = {
  reply: string;
  structuredWorkout?: {
    sessionTitle: string;
    sessionGoal: string;
    purposeSummary: string;
    exercises: Array<{
      slot: string;
      exercise: string;
      sets: string;
      reps: string;
      rir: string;
      rest: string;
      rationale: string;
    }>;
    note: string;
  };
  structuredProgramme?: {
    programmeTitle: string;
    programmeGoal: string;
    notes: string;
    /** Temporary: which server path produced this programme (dev tracing). */
    debugSource?: AssistantStructuredProgrammeDebugSource;
    debugRequestId?: string;
    debugBuiltAt?: string;
    days: Array<{
      dayLabel: string;
      sessionType: string;
      purposeSummary: string;
      /** When present, requested exercises are routed to days by muscle overlap. */
      targetMuscles?: string[];
      exercises: Array<{
        slotLabel: string;
        exerciseName: string;
        sets: string;
        reps: string;
        rir: string;
        rest: string;
        rationale: string;
      }>;
    }>;
  };
  /** Durable pipeline state: full programme + last parsed request (timestamps ISO). */
  activeProgrammeState?: PipelineActiveProgrammeState;
  /** When set, client must not treat the turn as a successful programme (no card / clear pipeline state). */
  programmeConstraintFailure?: boolean;
};

export type AssistantIntent =
  | "session_review"
  | "recent_training_analysis"
  | "coach_explanation"
  | "template_review"
  | "exercise_question"
  | "goal_question"
  | "general_training_question"
  | "unknown";

type ParsedContext = {
  goal?: string;
  frequencyPerWeek?: number;
  equipment?: "full_gym" | "home" | "minimal";
  injuryStatus?: "none" | "present";
};

function parseContextFromMessage(message: string): ParsedContext {
  const t = message.trim().toLowerCase();
  const out: ParsedContext = {};

  if (/\bstrength\b/.test(t)) out.goal = "strength";
  else if (/\bhypertrophy\b|\bmuscle\b/.test(t)) out.goal = "hypertrophy";
  else if (/\bboth\b|\bmix\b|\bstrength.*hypertrophy\b|\bhypertrophy.*strength\b/.test(t))
    out.goal = "strength_hypertrophy_mix";

  const freqMatch = t.match(/\b([2-7])\b/);
  if (freqMatch) {
    const n = Number(freqMatch[1]);
    if (Number.isFinite(n)) out.frequencyPerWeek = n;
  }

  if (
    t.includes("full equipment") ||
    t.includes("full gym") ||
    t.includes("commercial gym")
  ) {
    out.equipment = "full_gym";
  } else if (t.includes("home gym")) {
    out.equipment = "home";
  } else if (t.includes("minimal equipment") || t.includes("bodyweight only")) {
    out.equipment = "minimal";
  }

  if (/\bno\b/.test(t) && (t.includes("injury") || t.includes("injuries") || t.endsWith(", no"))) {
    out.injuryStatus = "none";
  } else if (t.includes("injury") || t.includes("pain")) {
    out.injuryStatus = "present";
  }

  return out;
}

function withDefaultsForCoaching(parsed: ParsedContext): Required<ParsedContext> {
  return {
    goal: parsed.goal ?? "strength_hypertrophy_mix",
    frequencyPerWeek: parsed.frequencyPerWeek ?? 4,
    equipment: parsed.equipment ?? "full_gym",
    injuryStatus: parsed.injuryStatus ?? "none",
  };
}

function inferSessionTypeFromMessage(message: string): SessionType | null {
  const t = message.toLowerCase();
  if (/\blegs?\b|\bleg day\b|\blower body\b/.test(t)) return "legs";
  if (/\bpush\b|\bpush day\b/.test(t)) return "push";
  if (/\bpull\b|\bpull day\b/.test(t)) return "pull";
  if (/\bchest\b/.test(t)) return "chest";
  if (/\bback\b/.test(t)) return "back";
  if (/\bshoulders?\b|\bdelts?\b/.test(t)) return "shoulders";
  if (/\barms?\b/.test(t)) return "arms";
  if (/\bupper\b/.test(t)) return "upper";
  if (/\blower\b/.test(t)) return "legs";
  if (/\bfull[\s-_]?body\b|\bfull workout\b/.test(t)) return "full_body";
  return null;
}

function inferSessionTypeFromContext(args: {
  message: string;
  coachingContext?: CoachingContext;
}): SessionType {
  const explicit = inferSessionTypeFromMessage(args.message);
  if (explicit) return explicit;
  const split = args.coachingContext?.inferred?.split ?? "";
  const s = split.toLowerCase();
  if (s.includes("push_pull_legs")) return "push";
  if (s.includes("upper_lower")) return "upper";
  if (s.includes("full_body")) return "full_body";
  return "upper";
}

function inferWorkoutBuilderGoal(
  message: string,
  priorityGoal?: string
): WorkoutBuilderGoal {
  const t = message.toLowerCase();
  const p = (priorityGoal ?? "").toLowerCase();
  if (/\bbench\b/.test(t) || p.includes("bench")) return "bench_strength_emphasis";
  if (/\bchest\b/.test(t) || p.includes("chest")) return "chest_emphasis";
  if (/\bstrength\b/.test(t) || p.includes("strength")) return "improve_overall_strength";
  if (/\bhypertrophy\b|\bmuscle\b/.test(t) || p.includes("hypertrophy")) return "build_overall_muscle";
  if (/\bupper\b/.test(t)) return "upper_body_emphasis";
  return "balanced";
}

function inferEquipmentFromParsed(parsed: ParsedContext): string[] {
  if (parsed.equipment === "minimal") return ["bodyweight", "dumbbells", "bench", "floor"];
  if (parsed.equipment === "home") return ["barbell", "rack", "bench", "dumbbells", "pullup_bar"];
  return [
    "barbell",
    "rack",
    "bench",
    "dumbbells",
    "cable_machine",
    "pullup_bar",
    "leg_curl_machine",
    "leg_extension_machine",
  ];
}

function resolveEquipmentForBuilder(args: {
  parsed: ParsedContext;
  userProfile?: UserProfile;
  coachingContext?: CoachingContext;
}): string[] {
  if (args.parsed.equipment) return inferEquipmentFromParsed(args.parsed);
  const profileEquipment = args.userProfile?.equipment ?? args.coachingContext?.profile?.equipment ?? [];
  const cleaned = profileEquipment
    .map((e) => String(e ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (cleaned.length > 0) return Array.from(new Set(cleaned));
  return inferEquipmentFromParsed(args.parsed);
}

type StrictAnswerMode =
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

type StrictIntentLock = {
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

function computeStrictIntentLock(message: string): StrictIntentLock {
  const t = message.toLowerCase().trim();
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
  else if (splitComparisonLike) mode = "split_comparison_or_recommendation";
  else if (splitEducationLike) mode = "split_explanation_education";
  else if (programmeLike && planActionLike && !asksOpinionOrComparison)
    mode = "multi_day_programme_construction";
  else if (
    workoutLike &&
    (/\b(build|make|create|suggest|generate|plan|what should i train today)\b/.test(t) ||
      (nextSession && /\b(look like|should be|program|session)\b/.test(t)) ) &&
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

function applyStrictIntentLock(
  current: AssistantQuestionKind,
  lock: StrictIntentLock
): AssistantQuestionKind {
  switch (lock.mode) {
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

function hasExplicitConstructionAsk(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /\b(build|make|create|generate|write me|give me|plan|rebuild|adjust|modify)\b/.test(t) &&
    (
      /\b(workout|session|routine|split|programme|program|training plan|weekly plan)\b/.test(t) ||
      /\b(push pull legs|ppl|upper lower|upper\/lower|upper-lower)\b/.test(t)
    )
  ) || /\bwhat should i train today\b/.test(t);
}

function renderBuiltWorkoutReply(workout: BuiltWorkout): string {
  const lines: string[] = [`Session: ${workout.purposeSummary}`, "", "Workout:", ""];
  for (const [idx, ex] of workout.exercises.entries()) {
    lines.push(`${idx + 1}) ${ex.slotLabel}`);
    lines.push(`- Exercise: ${ex.exerciseName}`);
    lines.push(
      `- Prescription: ${formatIntRange(ex.sets)} sets · ${formatIntRange(ex.repRange)} reps · ${formatIntRange(ex.rirRange)} RIR · ${formatIntRange(ex.restSeconds)}s rest`
    );
    lines.push("");
  }
  const practical =
    workout.notes[0] ??
    workout.warnings[0] ??
    "Run compounds first, then accessories, and keep execution quality high.";
  lines.push(`Practical note: ${practical}`);
  if (workout.warnings.length > 0) {
    lines.push("");
    lines.push("Watch-outs:");
    for (const warning of workout.warnings.slice(0, 2)) {
      lines.push(`- ${warning}`);
    }
  }
  const feedback = buildSessionFeedbackFromBuiltWorkout(workout);
  if (feedback.length > 0) {
    lines.push("");
    lines.push("Muscle coverage feedback:");
    for (const f of feedback.slice(0, 2)) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}

function toStructuredWorkout(workout: BuiltWorkout): NonNullable<AssistantResponse["structuredWorkout"]> {
  const sessionTitle = `${workout.sessionType.replace("_", " ")} workout`;
  const sessionGoal = workout.purposeSummary;
  const note =
    workout.notes[0] ??
    workout.warnings[0] ??
    "Run compounds first, then accessories, and keep execution quality high.";
  return {
    sessionTitle,
    sessionGoal,
    purposeSummary: workout.purposeSummary,
    exercises: workout.exercises.map((ex) => ({
      slot: ex.slotLabel,
      exercise: ex.exerciseName,
      sets: formatIntRange(ex.sets),
      reps: formatIntRange(ex.repRange),
      rir: formatIntRange(ex.rirRange),
      rest: `${formatIntRange(ex.restSeconds)}s`,
      rationale: ex.rationale,
    })),
    note,
  };
}

function isProgrammeBuildRequest(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /\b(program|programme|split|routine|weekly plan|full plan|training plan)\b/.test(t) ||
    /\b(push pull legs|ppl|upper lower)\b/.test(t) ||
    /\b\d+\s*(day|days)\b/.test(t) ||
    /\b(one day|another day|on another day|day\s*1|day\s*2|day\s*3|day\s*4)\b/.test(t)
  );
}

type CustomProgrammeDay = {
  label: string;
  sessionType: SessionType;
  index: number;
};

function splitTypeFromMessage(message: string): "ppl" | "upper_lower" | "custom" | "n_day" | "general" | "generic" {
  if (parseSplitFromMessage(message)) return "generic";
  const t = message.toLowerCase();
  if (/\b(push pull legs|ppl)\b/.test(t)) return "ppl";
  if (/\b(upper lower|upper\/lower|upper-lower)\b/.test(t)) return "upper_lower";
  if (/\b([3-6])\s*(day|days)\b/.test(t)) return "n_day";
  if (detectCustomProgrammeDays(message).length >= 2) return "custom";
  return "general";
}

/** True if a logged exercise name satisfies a requested library id (exact or common synonym). */
function exerciseNameSatisfiesRequestedId(exerciseName: string, requestedId: string): boolean {
  const n = exerciseName.toLowerCase().trim();
  const meta = getExerciseByIdOrName(requestedId);
  if (!meta) return false;
  if (n === meta.name.toLowerCase()) return true;
  if (requestedId === "incline_dumbbell_press") {
    return /\bincline\b/.test(n) && /\bpress\b/.test(n);
  }
  if (requestedId === "flat_barbell_bench_press") {
    const flatLike =
      /\bflat\b.*\bbarbell\b.*\bbench\b|\bbarbell\b.*\bbench\b|\bbench press\b|\bbarbell bench\b/.test(n);
    return flatLike && !/\bincline\b/.test(n);
  }
  if (requestedId === "overhead_press") {
    return /\b(overhead|ohp|military)\b/.test(n) && /\bpress\b/.test(n);
  }
  if (requestedId === "jm_press") {
    return /\bjm\s*press\b/.test(n) || /\bj\.m\.\s*press\b/.test(n);
  }
  return false;
}

function requestedExercisePresentInProgramme(
  programme: NonNullable<AssistantResponse["structuredProgramme"]>,
  requestedIds: string[]
): { missingIds: string[]; presentIds: string[] } {
  const presentIds: string[] = [];
  const missingIds: string[] = [];
  for (const id of requestedIds) {
    const ex = getExerciseByIdOrName(id);
    if (!ex) {
      missingIds.push(id);
      continue;
    }
    const satisfied = programme.days.some((d) =>
      d.exercises.some((e) => exerciseNameSatisfiesRequestedId(e.exerciseName, id))
    );
    if (satisfied) presentIds.push(ex.id);
    else missingIds.push(ex.id);
  }
  return { missingIds, presentIds };
}

function targetDayIndexForExercise(
  programme: NonNullable<AssistantResponse["structuredProgramme"]>,
  exercise: ExerciseMetadata,
  splitType: "ppl" | "upper_lower" | "custom" | "n_day" | "general" | "generic"
): number {
  let bestMuscleIdx = -1;
  let bestMuscleScore = 0;
  programme.days.forEach((d, idx) => {
    const s = scoreDayForExercise(d.targetMuscles, exercise);
    if (s > bestMuscleScore) {
      bestMuscleScore = s;
      bestMuscleIdx = idx;
    }
  });
  if (bestMuscleScore > 0) return bestMuscleIdx;

  const byLabel = programme.days.findIndex((d) => {
    const l = d.dayLabel.toLowerCase();
    if (splitType === "ppl") {
      if (exercise.tags.includes("push") && l.includes("push")) return true;
      if (exercise.tags.includes("pull") && l.includes("pull")) return true;
      if (exercise.tags.includes("legs") && l.includes("legs")) return true;
    }
    if (splitType === "upper_lower") {
      if (exercise.tags.includes("upper") && l.includes("upper")) return true;
      if (exercise.tags.includes("lower") && l.includes("lower")) return true;
    }
    return false;
  });
  if (byLabel >= 0) return byLabel;
  const bySessionType = programme.days.findIndex((d) => {
    const s = d.sessionType.toLowerCase();
    if (exercise.tags.includes("push") && s === "push") return true;
    if (exercise.tags.includes("pull") && s === "pull") return true;
    if (exercise.tags.includes("legs") && (s === "legs" || s === "lower")) return true;
    if (exercise.tags.includes("upper") && s === "upper") return true;
    if (exercise.tags.includes("lower") && s === "lower") return true;
    return false;
  });
  if (bySessionType >= 0) return bySessionType;
  return 0;
}

function enforceRequestedExercisesInProgramme(
  programme: NonNullable<AssistantResponse["structuredProgramme"]>,
  requestedIds: string[],
  splitType: "ppl" | "upper_lower" | "custom" | "n_day" | "general" | "generic",
  excludedExerciseIds: readonly string[] = []
): NonNullable<AssistantResponse["structuredProgramme"]> {
  const banned = new Set(excludedExerciseIds.map((id) => id.trim()).filter(Boolean));
  const clone: NonNullable<AssistantResponse["structuredProgramme"]> = {
    ...programme,
    days: programme.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e })),
    })),
  };
  const presence = requestedExercisePresentInProgramme(clone, requestedIds);
  if (presence.missingIds.length === 0) return clone;
  for (const id of presence.missingIds) {
    if (banned.has(id)) continue;
    const ex = getExerciseByIdOrName(id);
    if (!ex) continue;
    const alreadyPresent = clone.days.some((d) =>
      d.exercises.some((e) => exerciseNameSatisfiesRequestedId(e.exerciseName, id))
    );
    if (alreadyPresent) continue;
    const dayIdx = targetDayIndexForExercise(clone, ex, splitType);
    const prescription = getPrescriptionForExercise(ex).adjusted;
    clone.days[dayIdx].exercises.unshift({
      slotLabel: "Requested exercise",
      exerciseName: ex.name,
      sets: formatIntRange(prescription.sets),
      reps: formatIntRange(prescription.repRange),
      rir: formatIntRange(prescription.rirRange),
      rest: `${formatIntRange(prescription.restSeconds)}s`,
      rationale: "User requested this exercise explicitly; injected as a hard programme constraint.",
    });
  }
  return clone;
}

function detectCustomProgrammeDays(message: string): CustomProgrammeDay[] {
  const t = message.toLowerCase();
  const out: CustomProgrammeDay[] = [];

  const addDay = (label: string, sessionType: SessionType, index: number) => {
    if (index < 0) return;
    out.push({ label, sessionType, index });
  };

  const chestBackMatch = t.search(/\b(chest\s*(and|&)\s*back|back\s*(and|&)\s*chest)\b/);
  const armsShouldersMatch = t.search(/\b(arms?\s*(and|&)\s*shoulders?|shoulders?\s*(and|&)\s*arms?)\b/);
  const pushPullMatch = t.search(/\b(push\s*(and|&)\s*pull|pull\s*(and|&)\s*push)\b/);

  const hasChestBackPair = chestBackMatch >= 0;
  const hasArmsShouldersPair = armsShouldersMatch >= 0;

  addDay("Chest + Back", "upper", chestBackMatch);
  addDay("Arms + Shoulders", "shoulders", armsShouldersMatch);
  addDay("Push + Pull", "upper", pushPullMatch);

  const singleSignals: Array<{ re: RegExp; label: string; sessionType: SessionType }> = [
    { re: /\bpush\b/, label: "Push", sessionType: "push" },
    { re: /\bpull\b/, label: "Pull", sessionType: "pull" },
    { re: /\blegs?\b/, label: "Legs", sessionType: "legs" },
    { re: /\blower\b/, label: "Legs", sessionType: "legs" },
    { re: /\bupper\b/, label: "Upper", sessionType: "upper" },
    { re: /\bfull[\s_-]?body\b/, label: "Full Body", sessionType: "full_body" },
    { re: /\bchest\b/, label: "Chest", sessionType: "chest" },
    { re: /\bback\b/, label: "Back", sessionType: "back" },
    { re: /\bshoulders?\b/, label: "Shoulders", sessionType: "shoulders" },
    { re: /\barms?\b/, label: "Arms", sessionType: "arms" },
  ];

  for (const signal of singleSignals) {
    if (hasChestBackPair && (signal.sessionType === "chest" || signal.sessionType === "back")) continue;
    if (hasArmsShouldersPair && (signal.sessionType === "arms" || signal.sessionType === "shoulders")) continue;
    const idx = t.search(signal.re);
    addDay(signal.label, signal.sessionType, idx);
  }

  const sorted = out
    .sort((a, b) => a.index - b.index)
    .filter((day, idx, arr) => arr.findIndex((d) => d.label === day.label) === idx);

  // Keep a practical upper bound for routine size.
  return sorted.slice(0, 6);
}

/**
 * @deprecated Internal name kept for minimal route churn — delegates to `buildProgramme` (muscle groupings only; legacy toDay paths removed).
 */
function buildStructuredProgramme(
  params: {
    message: string;
    priorityGoal?: string;
    recoveryMode: RecoveryMode;
    equipmentAvailable: string[];
    injuriesOrExclusions?: string[];
    recentExerciseIds?: string[];
    preferredExercises?: string[];
    requestedExerciseIds?: string[];
    programmeModification?: boolean;
    activeProgramme?: NonNullable<AssistantResponse["structuredProgramme"]> | null;
    forcedSplitDefinition?: SplitDefinition;
    debugRequestId: string;
  },
  parsedProgrammeRequest: ParsedProgrammeRequest
): NonNullable<AssistantResponse["structuredProgramme"]> | null {
  const goal = inferWorkoutBuilderGoal(params.message, params.priorityGoal);
  return buildProgramme(parsedProgrammeRequest, {
    message: params.message,
    priorityGoal: params.priorityGoal,
    goal,
    recoveryMode: params.recoveryMode,
    equipmentAvailable: params.equipmentAvailable,
    injuriesOrExclusions: params.injuriesOrExclusions ?? [],
    recentExerciseIds: params.recentExerciseIds ?? [],
    preferredExercises: params.preferredExercises ?? [],
    requestedExerciseIds: params.requestedExerciseIds ?? [],
    forcedSplitDefinition: params.forcedSplitDefinition ?? null,
    programmeModification: params.programmeModification ?? false,
    activeProgramme: params.activeProgramme ?? null,
    debugRequestId: params.debugRequestId,
  });
}

function isPipelineActiveProgrammeState(x: unknown): x is PipelineActiveProgrammeState {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Boolean(o.programme) &&
    typeof o.programme === "object" &&
    Boolean(o.parsedRequest) &&
    typeof o.parsedRequest === "object" &&
    typeof o.createdAt === "string" &&
    typeof o.updatedAt === "string"
  );
}

function buildPipelineActiveProgrammeState(
  programme: NonNullable<AssistantResponse["structuredProgramme"]>,
  parsedRequest: ParsedProgrammeRequest,
  previous?: PipelineActiveProgrammeState | null
): PipelineActiveProgrammeState {
  const now = new Date().toISOString();
  return {
    programme,
    parsedRequest,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

function renderStructuredProgrammeText(
  programme: NonNullable<AssistantResponse["structuredProgramme"]>
): string {
  const lines: string[] = [
    `${programme.programmeTitle}`,
    programme.programmeGoal,
    "",
  ];
  for (const day of programme.days) {
    lines.push(`${day.dayLabel} (${day.sessionType})`);
    for (const ex of day.exercises) {
      lines.push(
        `- ${ex.slotLabel}: ${ex.exerciseName} — ${ex.sets} sets, ${ex.reps} reps, ${ex.rir} RIR, ${ex.rest} rest`
      );
    }
    lines.push("");
  }
  lines.push(`Note: ${programme.notes}`);
  return lines.join("\n");
}

function hasMinimumViableContext(parsed: ParsedContext): boolean {
  return Boolean(
    parsed.goal &&
      parsed.frequencyPerWeek &&
      parsed.equipment &&
      parsed.injuryStatus
  );
}

type ExplicitEvidenceAnchor = {
  id:
    | "heavy_bench"
    | "volume_bench"
    | "most_recent_session"
    | "named_session_type"
    | "named_exercise";
  label: string;
  detail: string;
};

function normalizeAnchorText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** User-explicit evidence anchor from the message: primary source hint for weighting rules. */
function detectExplicitEvidenceAnchor(
  message: string,
  activeExerciseTopic: string | undefined
): ExplicitEvidenceAnchor | null {
  const t = normalizeAnchorText(message);

  if (
    /\b(last|latest|most recent)\s+(heavy)\s+(bench|bench press|bench session|bench day)\b/.test(t) ||
    /\b(given|based)\b.*\bheavy\s+bench\b/.test(t) ||
    /\bheavy\s+bench\b.*\b(session|day)\b/.test(t)
  ) {
    return {
      id: "heavy_bench",
      label: "Explicit user anchor: heavy bench",
      detail: "Primary = heavy-bench evidence (e.g., top sets in heavy range). Volume bench can support, not replace.",
    };
  }

  if (
    /\b(last|latest|most recent)\s+(volume)\s+(bench|bench press|bench session|bench day)\b/.test(t) ||
    /\b(given|based)\b.*\bvolume\s+bench\b/.test(t) ||
    /\bvolume\s+bench\b.*\b(session|day)\b/.test(t)
  ) {
    return {
      id: "volume_bench",
      label: "Explicit user anchor: volume bench",
      detail: "Primary = volume-bench evidence (6+ rep bench exposures). Heavy bench can support, not replace.",
    };
  }

  if (
    /\b(most recent|latest|last)\s+(workout|session|day)\b/.test(t) ||
    /\bbased on my (most )?recent\b/.test(t) ||
    /\b(this|current)\s+(workout|session)\b/.test(t)
  ) {
    return {
      id: "most_recent_session",
      label: "Explicit user anchor: most recent session",
      detail: "Primary = exact latest logged session they named. Wider trends only as supporting context.",
    };
  }

  if (/\b(chest and back|push pull|upper lower|legs|pull day|push day|chest day|back day)\b/.test(t)) {
    return {
      id: "named_session_type",
      label: "Explicit user anchor: named session type",
      detail: "Primary = matching session/day type in logs. Other days can support only if clearly labeled secondary.",
    };
  }

  const exerciseMention =
    t.match(
      /\b(bench press|barbell bench|bench|squat|deadlift|row|overhead press|ohp|lat pulldown|pull[- ]?up|chin[- ]?up|curl)\b/
    )?.[1] ?? null;
  if (exerciseMention || activeExerciseTopic?.trim()) {
    const ex = exerciseMention ?? activeExerciseTopic?.trim() ?? "named exercise";
    return {
      id: "named_exercise",
      label: "Explicit user anchor: named exercise",
      detail: `Primary = ${ex} evidence only; other lifts are secondary context.`,
    };
  }

  return null;
}

function tryBuildDeterministicBenchSessionPrescription(params: {
  message: string;
  benchContext: AssistantBody["benchContext"] | undefined;
  explicitAnchor: ExplicitEvidenceAnchor | null;
  payloadUnit?: "kg" | "lb";
}): string | null {
  const m = params.message.toLowerCase();
  const benchish = /\bbench\b|bench press|barbell bench/.test(m);
  if (!benchish) return null;
  const asksPrescription =
    /\b(next|upcoming)\b.*\b(session|day|workout)\b/.test(m) ||
    /\bwhat should\b.*\b(session|day|workout)\b.*\blook like\b/.test(m) ||
    /\bwhat should i do\b.*\bnext\b/.test(m);
  if (!asksPrescription) return null;

  const strictHeavy =
    params.explicitAnchor?.id === "heavy_bench" ||
    /\bheavy\s+bench\b/.test(m) ||
    /\bheavy\b.*\bbench\b/.test(m);
  const strictVolume =
    params.explicitAnchor?.id === "volume_bench" ||
    /\bvolume\s+bench\b/.test(m) ||
    /\bvolume\b.*\bbench\b/.test(m);
  if (!strictHeavy && !strictVolume) return null;

  const unit = params.payloadUnit ?? "kg";
  const heavy = params.benchContext?.latestHeavyBenchSession ?? null;
  const volume = params.benchContext?.latestVolumeBenchSession ?? null;

  if (strictHeavy && !heavy) {
    const closest = volume
      ? `I can see a volume bench line (${volume.bestSet.weight}${unit} x ${volume.bestSet.reps}), but I’m not seeing a logged heavy bench session in this payload.`
      : "I’m not seeing a logged heavy bench session in this payload.";
    return `${closest}\n\nIf you want, I can still draft a heavy-session template, but it won’t be anchored to your exact heavy benchmark.`;
  }
  if (strictVolume && !volume) {
    const closest = heavy
      ? `I can see a heavy bench line (${heavy.bestSet.weight}${unit} x ${heavy.bestSet.reps}), but I’m not seeing a separate volume bench line in this payload.`
      : "I’m not seeing a logged volume bench session in this payload.";
    return `${closest}\n\nIf you want, I can still draft a volume session template, but it won’t be anchored to your exact volume benchmark.`;
  }

  const anchor = strictHeavy ? heavy! : volume!;
  const feltEasy = /\b(felt easy|easy|1\s*rir|one rir|had reps left)\b/.test(m);
  const topW = anchor.bestSet.weight;
  const baseReps = strictHeavy ? "3-5" : "6-8";
  const baseSets = strictHeavy ? "3-4" : "3-5";
  const rir = strictHeavy ? "1-2" : "1-2";
  const bumpLine =
    feltEasy && strictHeavy
      ? `If set 1 is clean and still around 2 RIR, add ${unit === "kg" ? "2.5" : "5"} ${unit} for set 2.`
      : `If set 1 is slower than expected, hold load and keep all working sets clean.`;

  return `Next ${strictHeavy ? "heavy" : "volume"} bench session:\n- Bench press: ${baseSets} working sets of ${baseReps} at around ${topW}${unit}, aiming for ${rir} RIR.\n- ${bumpLine}\n- Finish with one controlled back-off set (5-6 reps if heavy day, 8-10 reps if volume day) only if bar speed stays solid.\n\nThis is anchored to your last ${strictHeavy ? "heavy" : "volume"} bench session (${topW}${unit} x ${anchor.bestSet.reps}), so you’re progressing from the exact context you asked for.`;
}

/**
 * Legacy intent label (logging / compatibility). Prefer `classifyAssistantQuestionKind` for routing.
 */
export function classifyAssistantIntent(message: string): AssistantIntent {
  const t = message.trim().toLowerCase();
  if (!t) return "unknown";
  return mapQuestionKindToLegacyIntent(
    classifyAssistantQuestionKind(message)
  ) as AssistantIntent;
}

function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && a.every((x) => typeof x === "string");
}

function isCoachStructuredOutput(v: unknown): v is AssistantCoachStructuredOutput {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!("keyFocus" in o) || !(o.keyFocus === null || typeof o.keyFocus === "string")) return false;
  if (typeof o.keyFocusType !== "string") return false;
  if (!isStringArray(o.keyFocusEvidenceCardIds)) return false;
  if (!Array.isArray(o.whatsGoingWell) || !Array.isArray(o.actionableSuggestions)) return false;
  for (const row of o.whatsGoingWell) {
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !isStringArray(r.evidenceCardIds)) return false;
  }
  for (const row of o.actionableSuggestions) {
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !isStringArray(r.evidenceCardIds)) return false;
  }
  return true;
}

type JsonWorkoutExercise = { name?: string; sets?: unknown[] };
type JsonWorkout = {
  completedAt?: string;
  name?: string;
  exercises?: JsonWorkoutExercise[];
};

function formatRecentWorkoutsDigest(
  workouts: unknown,
  max = 8
): { text: string; count: number } {
  if (!Array.isArray(workouts)) return { text: "(no recent session list in payload)", count: 0 };
  const slice = (workouts as JsonWorkout[]).slice(0, max);
  const lines = slice.map((w, i) => {
    const date =
      typeof w.completedAt === "string" && w.completedAt.length >= 10
        ? w.completedAt.slice(0, 10)
        : "unknown date";
    const title = typeof w.name === "string" && w.name.trim() ? w.name.trim() : "Session";
    const exParts = (w.exercises ?? []).map((e) => {
      const nm = typeof e.name === "string" && e.name.trim() ? e.name.trim() : "Exercise";
      const n = countCompletedLoggedSets(Array.isArray(e.sets) ? (e.sets as Array<{ weight?: string; reps?: string }>) : []);
      return `${nm} (${n} sets)`;
    });
    return `${i + 1}. ${date} — ${title}: ${exParts.length ? exParts.join("; ") : "no exercises listed"}`;
  });
  return { text: lines.join("\n"), count: slice.length };
}

function formatTemplatesDigest(templates: unknown, max = 8): string {
  if (!Array.isArray(templates)) return "none in payload";
  const slice = templates.slice(0, max) as Array<{ name?: string; exercises?: unknown[] }>;
  if (slice.length === 0) return "none in payload";
  return slice
    .map((t) => {
      const n = Array.isArray(t.exercises) ? t.exercises.length : 0;
      const name = typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Unnamed template";
      return `${name} (${n} exercises)`;
    })
    .join("; ");
}

function formatCoachReviewBriefFromContext(ctx: unknown): string {
  if (ctx == null || typeof ctx !== "object") return "not included";
  const c = ctx as { coachReviewBrief?: CoachingContext["coachReviewBrief"] };
  const b = c.coachReviewBrief;
  if (!b) return "not included";
  const lines: string[] = [];
  if (b.keyFocus) lines.push(`Key focus: ${b.keyFocus}`);
  if (b.nextSessionTitle) lines.push(`Next session (coach plan): ${b.nextSessionTitle}`);
  if (b.whatsGoingWell?.length)
    lines.push(`Going well: ${b.whatsGoingWell.filter(Boolean).join(" | ")}`);
  if (b.topSuggestions?.length)
    lines.push(`Top suggestions: ${b.topSuggestions.filter(Boolean).join(" | ")}`);
  return lines.length ? lines.join("\n") : "(empty brief)";
}

function buildLoggedTrainingPreamble(params: {
  hasWorkoutData: boolean;
  totalWorkouts: number;
  recentDigest: string;
  recentCount: number;
  coachingContext: unknown;
}): string {
  if (!params.hasWorkoutData) {
    return `=== LOGGED TRAINING STATUS ===
No completed workouts were included in the summary (0 sessions / 0 sets). It is appropriate to ask what their training looks like or encourage them to log sessions in the app.`;
  }

  const ctx = params.coachingContext as Partial<CoachingContext> | null | undefined;
  const tpl = formatTemplatesDigest(ctx?.templates);
  const brief = formatCoachReviewBriefFromContext(params.coachingContext);

  return `=== LOGGED TRAINING (AUTHORITATIVE — USER LOGS IN THIS APP) ===
The user has already logged workouts. The digest below is their real history; treat it as ground truth.

Totals (all time, from summary): ${params.totalWorkouts} workout(s).
Recent sessions (${params.recentCount} newest in payload):
${params.recentDigest}

Saved templates (names): ${tpl}

Coach review brief (deterministic tab output):
${brief}

STRICT RULES:
- Start from this logged data and the structured trainingSummary / trainingInsights / coach blocks below. Do NOT ask them to paste or restate their full routine.
- Only ask a follow-up if something critical for safety or their exact question is missing from the payload.
- If the log is thin, say so in one short phrase (e.g. "From your few logged sessions…") and still give the clearest next step from what you have.`;
}

function sanitizeEvidenceCards(v: unknown): AssistantEvidenceCard[] {
  if (!Array.isArray(v)) return [];
  const out: AssistantEvidenceCard[] = [];
  for (const item of v) {
    if (item == null || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.title !== "string") continue;
    if (typeof c.summary !== "string" || typeof c.practicalTakeaway !== "string") continue;
    if (c.confidence !== "low" && c.confidence !== "moderate" && c.confidence !== "high") continue;
    out.push({
      id: c.id,
      title: c.title,
      summary: c.summary,
      practicalTakeaway: c.practicalTakeaway,
      caution: typeof c.caution === "string" ? c.caution : undefined,
      confidence: c.confidence,
    });
  }
  return out;
}

function referencedEvidenceIds(coach: AssistantCoachStructuredOutput): Set<string> {
  const ids = new Set<string>();
  for (const id of coach.keyFocusEvidenceCardIds) ids.add(id);
  for (const w of coach.whatsGoingWell) for (const id of w.evidenceCardIds) ids.add(id);
  for (const s of coach.actionableSuggestions) for (const id of s.evidenceCardIds) ids.add(id);
  return ids;
}

function buildAnalysisInputs(
  trainingSummary: AssistantBody["trainingSummary"],
  trainingInsights: AssistantBody["trainingInsights"] | undefined,
  exerciseTrends: NonNullable<AssistantBody["exerciseTrends"]>,
  coachStructuredOutput: AssistantCoachStructuredOutput | undefined
): {
  topPositive: string | null;
  topIssue: string | null;
  nextStep: string | null;
  missing: Array<"positive" | "issue" | "nextStep">;
} {
  const highVolumeGroup = Object.entries(trainingSummary.weeklyVolume ?? {}).sort(
    (a, b) => b[1] - a[1]
  )[0];

  const coachPositive = coachStructuredOutput?.whatsGoingWell?.[0]?.text?.trim();
  const coachIssue =
    coachStructuredOutput?.keyFocus?.trim() ||
    coachStructuredOutput?.actionableSuggestions?.[0]?.text?.trim();
  const coachNext = coachStructuredOutput?.actionableSuggestions?.[0]?.text?.trim();

  const positiveInsight = (trainingInsights?.exerciseInsights ?? []).find(
    (e) => e.trend === "improving" || e.trend === "progressing"
  );
  const positiveTrend = exerciseTrends.find(
    (t) => t.trend === "improving" || t.trend === "progressing"
  );
  const topPositive: string | null =
    positiveInsight?.changeSummary ||
    (positiveTrend?.exercise
      ? `${positiveTrend.exercise} is trending up across recent logged sessions.`
      : "") ||
    coachPositive ||
    (highVolumeGroup
      ? `Your logs show ${highVolumeGroup[1]} sets for ${highVolumeGroup[0]} in the last 7 days (app-counted from completed sets).`
      : null);

  const topIssue: string | null =
    (trainingInsights?.exerciseInsights ?? [])
      .find((e) => e.possiblePlateau || e.possibleFatigue || e.possibleLowSpecificity)
      ?.changeSummary ||
    (trainingInsights?.findings ?? []).find((f) => typeof f === "string" && f.trim().length > 0) ||
    coachIssue ||
    ((trainingInsights?.frequency ?? 0) < 2
      ? "Based on your recent logged sessions, weekly frequency looks on the low side — an early signal, not a verdict."
      : null);

  const issueExercise = (trainingInsights?.exerciseInsights ?? []).find(
    (e) => e.possiblePlateau || e.possibleFatigue || e.possibleLowSpecificity
  );
  const nextStep: string | null = issueExercise
    ? issueExercise.possibleFatigue
      ? `If recovery seems tight (early signal from logs), a useful rule of thumb is easing effort slightly on ${issueExercise.exercise} for a session or two.`
      : issueExercise.possiblePlateau
        ? `For ${issueExercise.exercise}, a small progression tweak next session is often worth trying; treat “no progress for a few sessions” as a heuristic, not a hard rule.`
        : `For ${issueExercise.exercise}, consider raising specificity gradually while keeping effort aligned with your goal.`
    : coachNext ||
      (highVolumeGroup
        ? `Keeping ${highVolumeGroup[0]} volume roughly steady while adding one focused support lift this week is often a solid next move.`
        : null);

  const missing: Array<"positive" | "issue" | "nextStep"> = [];
  if (!topPositive) missing.push("positive");
  if (!topIssue) missing.push("issue");
  if (!nextStep) missing.push("nextStep");

  return { topPositive, topIssue, nextStep, missing };
}

/**
 * Appended to every assistant turn so replies stay data-grounded without fake precision.
 */
const TRUST_AND_CALIBRATION_BLOCK = `
PRECISION & STRENGTH CLAIMS:
- Never state exact strength gains as a percentage (e.g. "~12% stronger") unless the payload explicitly includes that computed figure and how it was derived. The app usually does not — so do not invent percentages or fake precision.
- Prefer qualitative progression language tied to logged reps/load: e.g. "small but real improvement", "modest progression", "clear rep improvement at the same load", "load moved up slightly with similar reps".

CLEAR SIGNAL VS INFERENCE:
- Distinguish direct log facts (sets, reps, weight, session dates, trends from exerciseTrends / exerciseInsights) from interpretations (recovery, fatigue, frequency "quality", plateau risk).
- When you infer recovery, fatigue, or how "good" frequency is, label it: e.g. "based on your recent logged sessions", "this suggests", "this may indicate", "early signal", "still noisy with this much history".
- Do not present heuristics as physical laws.

WEEKLY VOLUME & SET TOTALS:
- Weekly muscle-group set counts and total sets in the payload are app-calculated from completed sets in logged workouts (last 7 days for weekly breakdown). Quote those numbers exactly; do not round into misleading precision.
- If the last-7-days session count is low, or logs may omit outside-gym work, say the volume picture may be incomplete. Avoid sweeping claims about "your training as a whole" unless the logs reasonably support them.

PLATEAUS, FATIGUE, RULES OF THUMB:
- Phrases like "three sessions with no progress" are heuristics, not guarantees. Use wording such as "a useful rule of thumb", "often", "worth considering", "one thing to watch".
- Keep actionable guidance; soften certainty, not usefulness.

STYLE (keep):
- Direct answers, no unnecessary clarifying loops, continuity with prior context, calm practical tone.
- Prefer specific log references over vague "your data" — e.g. "based on your recent logged sessions" when citing the digest or structured fields.
`.trim();

const INFERENCE_CERTAINTY_BLOCK = `
INFERENCE & CERTAINTY (mandatory for all replies):
- Logged numbers (weight, reps, dates, set counts) = state as facts.
- Fatigue, form, technique, recovery, effort quality, or "what went wrong" inferred only from rep drops, load changes, or notes — is NOT a fact. Treat as interpretation.

When interpreting from patterns, use careful language, for example:
- "may suggest fatigue", "could reflect rep quality slipping", "might indicate fatigue or technique breakdown — the log alone can’t separate those"
- "is consistent with accumulating fatigue (guess from the pattern)", "one possible read is…"

Do NOT say (unless the user explicitly logged it in notes or the payload states it):
- "form issues", "poor form", "technique breakdown" as definite facts
- "this shows/proves/demonstrates" recovery problems, poor form, or definite fatigue
- "you have" / "you are" + diagnostic labels (e.g. "overreaching") from thin indirect evidence

RIR / effort:
- If RIR was not logged on those sets, do not state RIR or proximity to failure as fact. Preface with "RIR wasn’t logged — as an estimate…" or avoid RIR entirely and speak in "load/rep pattern" terms.

When one sentence mixes fact + guess, make the split obvious: e.g. "Third set dropped to 6 at 90 (logged). That pattern sometimes suggests fatigue or pacing (interpretation, not proof)."
`.trim();

const GLOBAL_REPLY_DISCIPLINE_BLOCK = `
GLOBAL REPLY DISCIPLINE (all questions):
- In-app replies should feel concise and premium: takeaway first, minimal preamble, no chain-of-thought or debug tone.
- Lead with a direct answer; avoid padded intros and generic summaries when specifics exist in the payload.
- If EXERCISE LOG ANCHOR or SESSION ANCHOR is present, treat it as the primary evidence for names, sets, and loads on this turn.
- A logged set counts as completed performance only when reps are logged as a number > 0; blank, zero, or missing-rep rows are placeholders or incomplete — never quote those as work done.
- Separate "logged fact" vs "coaching inference" visibly; follow INFERENCE & CERTAINTY rules above for hedging.
- Do not name exercises the user did not ask about unless clearly useful; if you add one, label it as optional context.
- Match depth to the question: default to short; expand only when the user asked for detail, breakdown, or "every set".
- Do not use report-style labels like "A)", "B)", "C)" in user-facing text — including when a task used internal steps A/B/C; write flowing prose instead.
- Do not reuse one generic multi-section template for every question type. Follow the FORMAT HINT for this turn in the task above; only use extra headings when that hint or the Bench projection rules explicitly call for them.
- Do not expose internal framing words in user-facing text (e.g. "primary anchor", "supporting evidence", "benchmark context", "guardrail", "estimate path").
- Calibrate confidence: thin logs → one short line on what you cannot know.
`.trim();

/** Applied last — writing quality and scan layout; does not override evidence or routing rules above. */
const FINAL_RESPONSE_POLISH_BLOCK = `
FINAL RESPONSE POLISH (apply before you finish — user-visible text only):

Grammar & mechanics:
- Normal sentence capitalization; capitalize exercise names and “I” only where standard English expects it. No random Title Case or mid-sentence capitals for emphasis.
- Clean punctuation (commas, periods, apostrophes); no run-ons; no half-finished trailing clauses.
- Prefer contractions where they sound natural in a coach voice (“you’re”, “it’s”) when they read smoothly.

Digestibility (mobile / in-app):
- Put the direct answer in the first line or first very short paragraph (one to two sentences max).
- Use short paragraphs: one to three sentences each; add a blank line between paragraphs so the reply is easy to scan.
- Use “- ” bullets only when they genuinely help (e.g. a few distinct numbers or takeaways). One idea per bullet; do not bullet every sentence.
- Avoid dense walls of text and avoid stacking many labeled sections unless this turn’s task explicitly requires that structure.
- If you use headings, render them cleanly with a colon (e.g., “Best current read:”) and put the content on the next line or same line consistently.

Tone:
- Sound like a polished coach: calm, specific, human — not robotic, not a slide deck, not a lab report.
- Lead with the practical answer the user asked for. For training-plan questions, start with the prescription (what to do), then one short why, then one adjustment if needed.
- Prefer natural coach phrasing over internal analytics phrasing.

Question-type fit (default shapes — tighten further if the task above says otherwise):
- Factual recall: answer first, blank line, then at most one or two short supporting lines (no extra headings).
- Session review: one-line verdict, blank line, three or four “- ” bullets, blank line, one “Next step:” line.
- Recommendation: what to do first, blank line, brief why from logs, optional single “Next:” line.
- Progression: open with improving / stable / mixed / too early to tell (pick one honest read), then two to four short sentences — no fake subsection headers.
- Bench projection (when block present): no forced labels by default. Use 2-4 short coach-like paragraphs (answer first, then why from logs, then next move). Keep heavy vs volume evidence separated naturally.
`.trim();

async function getAssistantReply(
  loggedDataPreamble: string,
  message: string,
  intent: AssistantIntent,
  questionKind: AssistantQuestionKind,
  mode: AssistantMode,
  templateDataAvailable: boolean,
  templatesSummary: string | undefined,
  trainingSummary: AssistantBody["trainingSummary"],
  profile: { trainingFocus?: string; experienceLevel?: string; unit?: string; priorityGoal?: string },
  userProfile: UserProfile | undefined,
  assistantMemory: AssistantSelectiveMemoryV1 | undefined,
  recentConversationMemory: RecentConversationTurn[] | undefined,
  exactThreadLoaded: boolean | undefined,
  activeExerciseTopic: string | undefined,
  activeExerciseLastSession: AssistantBody["activeExerciseLastSession"] | undefined,
  benchProjection: AssistantBody["benchProjection"] | undefined,
  benchContext: AssistantBody["benchContext"] | undefined,
  benchEstimate: AssistantBody["benchEstimate"] | undefined,
  coachingContext: CoachingContext | undefined,
  activeProgramme: NonNullable<AssistantResponse["structuredProgramme"]> | null | undefined,
  exerciseTrends: NonNullable<AssistantBody["exerciseTrends"]>,
  trainingInsights: AssistantBody["trainingInsights"] | undefined,
  priorityGoalExerciseInsight: AssistantBody["priorityGoalExerciseInsight"],
  coachStructuredOutput: AssistantCoachStructuredOutput | undefined,
  evidenceCards: AssistantEvidenceCard[],
  priorAssistantTurnContent: string | null | undefined,
  explicitAnchor: ExplicitEvidenceAnchor | null
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = new OpenAI({ apiKey });

  const weeklyVolumeStr =
    Object.entries(trainingSummary.weeklyVolume ?? {})
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}: ${n} sets`)
      .join("; ") || "none logged";

  const insightsFrequency = trainingInsights?.frequency ?? 0;
  const insightsWeeklyVolume = trainingInsights?.weeklyVolume ?? trainingSummary.weeklyVolume;
  const inferredProfile = buildInferredTrainingProfile({
    weeklyVolume: insightsWeeklyVolume ?? {},
    frequency: insightsFrequency,
    averageRIR: trainingInsights?.averageRIR,
  });
  const effectiveInferred = coachingContext?.inferred ?? {
    split: inferredProfile.inferredSplit,
    weakMuscles: inferredProfile.weakMuscleGroups,
    progressingExercises: [],
    plateauExercises: [],
    avgRIR: inferredProfile.effortStyle.averageRIR,
    volumeByMuscle: inferredProfile.volumeByMuscle,
    frequency: inferredProfile.frequency,
    coachInsight: undefined,
  };
  const insightsWeeklyVolumeStr =
    Object.entries(insightsWeeklyVolume ?? {})
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}: ${n} sets`)
      .join("; ") || "none";

  const volumeCompletenessNote =
    insightsFrequency <= 1
      ? "Volume below reflects only what is logged; with few sessions in the last 7 days, treat weekly totals as a partial snapshot."
      : insightsFrequency <= 2
        ? "Interpret weekly totals cautiously if some training happens outside the app."
        : "";

  const context = `Training data (logged in app): ${trainingSummary.totalWorkouts} total workouts, ${trainingSummary.totalSets} total sets (all-time, counted from completed sets), ${trainingSummary.totalExercises} exercise entries. Last 7 days: ${insightsFrequency} logged session(s). Weekly volume = set counts by muscle group in that window (same calculation as the Coach tab); use these figures verbatim: ${weeklyVolumeStr}. ${volumeCompletenessNote ? `${volumeCompletenessNote} ` : ""}Recent exercise names: ${(trainingSummary.recentExercises ?? []).join(", ") || "none"}.`;

  const plannedDayMuscleCoverageBlock = activeProgramme
    ? programmeDayMuscleCoverageSummaryForQuestion({ programme: activeProgramme, message })
    : null;
  const hypertrophyEvidenceBlock = buildHypertrophyEvidencePromptBlock();
  const findingsStr = (trainingInsights?.findings ?? []).slice(0, 5).join(" ");
  const rirSuffix = (e: {
    avgRIR?: number;
    latestSessionAvgRIR?: number;
    latestSessionAllSetsToFailure?: boolean;
  }) => {
    const parts: string[] = [];
    if (e.avgRIR !== undefined) parts.push(`avgRIR~${e.avgRIR.toFixed(2)}`);
    if (e.latestSessionAvgRIR !== undefined)
      parts.push(`lastSessionAvgRIR~${e.latestSessionAvgRIR.toFixed(2)}`);
    if (e.latestSessionAllSetsToFailure === true) parts.push("lastSessionAllSetsToFailure");
    return parts.length ? ` [RIR: ${parts.join(", ")}]` : "";
  };

  const keyExerciseSignalsStr = (trainingInsights?.exerciseInsights ?? [])
    .slice(0, 4)
    .map(
      (e) =>
        `${e.exercise}: ${e.trend} (${e.changeSummary})${rirSuffix(e)}`
    )
    .join("; ");

  const globalRirStr = [
    trainingInsights?.averageRIR !== undefined &&
      `logged average RIR (all sets): ${trainingInsights.averageRIR.toFixed(2)}`,
    (trainingInsights?.recentHighEffortExercises?.length ?? 0) > 0 &&
      `high-effort exercises (by RIR): ${(trainingInsights?.recentHighEffortExercises ?? []).join(", ")}`,
  ]
    .filter(Boolean)
    .join("; ");

  const goalRirStr = priorityGoalExerciseInsight
    ? `Priority goal lift "${priorityGoalExerciseInsight.exercise}": trend ${priorityGoalExerciseInsight.trend}; ${priorityGoalExerciseInsight.changeSummary}${rirSuffix(priorityGoalExerciseInsight)}`
    : "";
  const trendsStr =
    exerciseTrends.length > 0
      ? exerciseTrends
          .map(
            (t) =>
              `${t.exercise}: ${t.trend} (last ${t.recentPerformances.length} sessions; best set range ${t.recentPerformances[0]?.weight ?? "?"}×${t.recentPerformances[0]?.reps ?? "?"} → ${t.recentPerformances[t.recentPerformances.length - 1]?.weight ?? "?"}×${t.recentPerformances[t.recentPerformances.length - 1]?.reps ?? "?"})`
          )
          .join(". ")
      : "";
  const profileStr =
    [
      profile.trainingFocus && `Training focus: ${profile.trainingFocus}`,
      profile.experienceLevel && `Experience level: ${profile.experienceLevel}`,
      profile.unit && `Preferred units: ${profile.unit}`,
      profile.priorityGoal && `Priority goal: ${profile.priorityGoal}`,
    ]
      .filter(Boolean)
      .join(". ") || "";
  const constraintsStr = userProfile
    ? [
        `Goal: ${userProfile.goal}`,
        `Training days available: ${userProfile.trainingDaysAvailable}`,
        `Equipment: ${(userProfile.equipment ?? []).join(", ") || "full gym"}`,
        userProfile.injuries?.length
          ? `Injuries/limitations: ${userProfile.injuries.join(", ")}`
          : "Injuries/limitations: none reported",
        userProfile.trainingPrioritiesText?.trim()
          ? `Training priorities: ${userProfile.trainingPrioritiesText.trim()}`
          : null,
        `Lower-body priority (inferred): ${userProfile.lowerBodyPriority}`,
      ].filter(Boolean).join("; ")
    : "";
  const inferredStr = `Heuristic inference from logged workout patterns (not direct measurement — say so when you use it; higher priority than profile unless a safety/constraint conflict exists):
- Weekly frequency: ${effectiveInferred.frequency}
- Inferred split: ${effectiveInferred.split ?? inferredProfile.inferredSplit}
- Effort style: ${inferredProfile.effortStyle.label}${
    effectiveInferred.avgRIR !== undefined
      ? ` (avg RIR ${effectiveInferred.avgRIR.toFixed(2)})`
      : ""
  }
- Weak muscle groups: ${effectiveInferred.weakMuscles.join(", ") || "none detected"}
- Progressing exercises: ${effectiveInferred.progressingExercises.join(", ") || "none"}
- Plateau exercises: ${effectiveInferred.plateauExercises.join(", ") || "none"}
- Coach key insight: ${effectiveInferred.coachInsight ?? "none"}
- Volume by muscle: ${
    Object.entries(effectiveInferred.volumeByMuscle ?? {})
      .map(([g, s]) => `${g}:${s}`)
      .join(", ") || "none"
  }`;
  const coachingMemoryStr = coachingContext
    ? `Product memory (persistent app context):
- profile present: ${coachingContext.profile ? "yes" : "no"}
- recent workouts loaded: ${coachingContext.recentWorkouts.length}
- templates loaded: ${coachingContext.templates.length}
Use this memory to avoid asking repeated questions when answers already exist in context.`
    : "Product memory unavailable for this request.";
  const parsedContext = parseContextFromMessage(message);
  const resolvedContext = withDefaultsForCoaching(parsedContext);
  const mvcPresent = hasMinimumViableContext(parsedContext);
  const contextDefaultsNote = [
    !parsedContext.goal && `goal: ${resolvedContext.goal}`,
    !parsedContext.frequencyPerWeek && `frequency: ${resolvedContext.frequencyPerWeek} sessions/week`,
    !parsedContext.equipment && `equipment: ${resolvedContext.equipment}`,
    !parsedContext.injuryStatus && `injury status: ${resolvedContext.injuryStatus}`,
  ]
    .filter(Boolean)
    .join(", ");

  const coachJson = coachStructuredOutput
    ? JSON.stringify(coachStructuredOutput)
    : "";
  const evidenceJson = evidenceCards.length > 0 ? JSON.stringify(evidenceCards) : "[]";
  const hasEvidenceCards = evidenceCards.length > 0;

  const coachAuthorityBlock = coachStructuredOutput
    ? `
Deterministic coach output (authoritative for key focus, positives, and top suggestions — rephrase and explain only; do not contradict or replace with new diagnoses):
${coachJson}

Evidence cards linked to that output (by id). Fields: title, summary, practicalTakeaway, optional caution, confidence — mine summary AND caution for nuance/limitations, not just the title:
${evidenceJson}

Strict rules when coach output is present:
- Do not invent plateaus, injuries, fatigue diagnoses, or problems not stated in coachStructuredOutput.
- Do not introduce new evidence cards or study claims beyond the provided evidenceCards array.
- If the user asks for assessments outside what the structured fields and training summaries support, state the limit and suggest logging more sessions instead of speculating.
`
    : "";

  const evidenceDrivenReasoningBlock = hasEvidenceCards
    ? `
EVIDENCE CARDS (when non-empty — required):
One pass per card: principle + nuance; tie once to their log — same rules as above (short sentences, no stacked outcomes).

Tone guard: avoid alarmist claims. Prefer "this may help", "this may indicate", "a useful rule of thumb", and "a good starting point would be".
`
    : "";

  const reasoningBaseBlock = `
SENTENCE CRAFT (hard rules):
- Max one key idea per sentence. Each sentence should read like a standalone insight.
- Cap sentence length at ~15–18 words. Split if longer.
- Do not stack metrics and interpretation in one sentence (number in one short beat; meaning in the next).
- No stacked concepts in a single sentence — one claim, then move on.
- Clarity beats completeness: omit nice-to-haves before you add length.

SIGNAL DENSITY:
- No repeated ideas: each sentence must add new information. Each outcome once (no stall + plateau + limit progress for one problem).

LENGTH & MERGE:
- Target 3–4 sentences total. Combine two short beats into one sentence only when it stays under ~18 words and stays one clear claim.
- More detail only if the user explicitly asks.

STRUCTURE (default arc — practical coach guidance):
(1) What’s happening — progress or position (from their data).
(2) What to adjust first — clear practical priority.
(3) Why that matters — short cause/effect.
(4) Exact fix — one concise, direct action.

GENERIC PHRASES (ban):
- "maintain progress", "keep progress moving", "balance volume", "find balance", "stay consistent" as empty advice — replace with concrete actions (dose, frequency, effort, recovery).

COACHING LANGUAGE:
- Keep language calm and practical.
- Avoid alarmist phrases like "will stall indefinitely", "will cause injury", "limiting factor is".
- Prefer: "a good starting point would be", "this may help", "this suggests", "early signal", "you can adjust based on how you feel."
- Frame plateau/fatigue/frequency judgments as inference from logs when not a raw number from the payload.

OPENINGS:
- Lead with the point. No: however, since, if you keep, but, generally, it's worth noting.

DEPTH (compressed):
- Keep mechanism, cause→effect, one system link when data support — spread across short sentences, not one dense block.

HOW TO REASON:
- With coach output: coachStructuredOutput + evidenceCards → trainingInsights → exerciseTrends → context. Without: insights + trends + context.

PLAIN LANGUAGE:
- Support muscles; sets, frequency, effort — not lab jargon unless the card uses it. Prefer "system constraint" framing over vague wellness talk.

RIR / EFFORT (when trainingInsights or priorityGoalExerciseInsight include RIR fields):
- When actual RIR data is available, use it directly in your answer.
- Do not answer with generic RIR guidance if session-specific RIR data exists in the payload.
- If a recent session was performed at or near failure (e.g. low avg RIR, or last session all sets @ 0 RIR), mention the tradeoff between stimulus and recoverable volume.
- Do not tell them to reduce to ~1-2 RIR unless the data shows effort is limiting progress or recoverable volume (e.g. plateau/decline or recovery strain with added volume).
- If progress is still positive, prefer: keep current effort for now, monitor recoverability, and use ~1-2 RIR only as the next step if progress stalls.

TONE:
- Clear, concise, actionable, and human.
`;

  const effectiveIntent: AssistantIntent =
    intent === "unknown" ? "general_training_question" : intent;

  const sessionReviewAnchorBlock =
    effectiveIntent === "session_review"
      ? buildSessionReviewAnchorBlock({
          message,
          recentWorkouts: coachingContext?.recentWorkouts,
          unitLabel: profile.unit,
        })
      : "";

  const shouldTryExerciseLock =
    questionKind === "exact_factual_recall" ||
    questionKind === "exercise_progression" ||
    questionKind === "coaching_recommendation" ||
    questionKind === "prior_answer_correction";

  const resolvedExercise = shouldTryExerciseLock
    ? resolveExerciseFromMessage(
        message,
        coachingContext?.recentWorkouts,
        trainingSummary.recentExercises ?? [],
        activeExerciseTopic
      )
    : null;

  const exerciseLogAnchorBlock =
    resolvedExercise && shouldTryExerciseLock
      ? buildExerciseLogAnchorBlock({
          workouts: coachingContext?.recentWorkouts,
          exerciseKey: resolvedExercise.key,
          displayName: resolvedExercise.displayName,
        })
      : "";

  const correctionTurnRule =
    questionKind === "prior_answer_correction"
      ? "- This turn is PRIOR_ANSWER_CORRECTION: the user is disputing or clarifying your last reply — follow CORRECTION MODE in the task (narrow A→D repair first). Do not repeat or restructure your entire prior answer unless they explicitly ask for the full version again.\n"
      : "";
  const explicitAnchorRule = explicitAnchor
    ? `- EXPLICIT USER ANCHOR: ${explicitAnchor.label}. ${explicitAnchor.detail}\n- Evidence weighting order (mandatory): primary = explicit user anchor; secondary = directly relevant supporting evidence; tertiary = broader recent context.\n- Do not let secondary or tertiary evidence replace the primary anchor benchmark.\n`
    : "";
  const explicitAnchorValidationRule = explicitAnchor
    ? "- Before finalizing any estimate: validate anchor fit in order: (1) identify named anchor, (2) name the exact matching logged benchmark for that anchor, (3) confirm the estimate is anchored to that benchmark. If validation fails, say anchor evidence is missing or ambiguous rather than silently switching anchors.\n"
    : "";

  const routingPreambleBase = `
QUESTION KIND (routing): ${questionKind}
INTENT (legacy label): ${effectiveIntent}

GLOBAL RULES (always):
${correctionTurnRule}- Only use detailed recent-training / coach-log analysis when the user's question is actually about recent training, their week, or coach output—or when explaining coach output in coach_explanation using the blocks provided for that purpose.
${explicitAnchorRule}
${explicitAnchorValidationRule}
- Do not answer a different question just because training data is available.
- Do not pivot unrelated questions into bench/support-volume or generic weekly analysis unless the intent is recent_training_analysis.
- If LOGGED TRAINING above shows workouts exist, never ask the user to describe their whole program from scratch; use the digest and structured fields.
- Multi-part answers: each subsection (e.g. heavy day vs volume day vs one session vs weekly totals) must cite only evidence that matches that subsection. Do not let the strongest global benchmark replace a more specific anchor for another subsection.
- For hypertrophy/workout design questions, use the evidence framework block below as primary training logic.
`;

  const evidenceScopeBlock = buildAssistantEvidenceScopeBlock({
    questionKind,
    message,
    hasExerciseLogAnchor: Boolean(exerciseLogAnchorBlock),
    hasSessionReview: questionKind === "session_review",
    hasBenchProjection: Boolean(benchProjection),
    activeExerciseTopic,
  });

  const routingPreamble = `${routingPreambleBase}
${evidenceScopeBlock}`;

  const insightsBlock =
    trainingInsights
      ? `trainingInsights (use for specifics — frequencies, volumes, per-exercise signals, findings, logged RIR). Weekly set totals here match app-aggregated logs for the last 7 days:\n- Training frequency (last 7 days): ${insightsFrequency} session${insightsFrequency === 1 ? "" : "s"}\n- Weekly volume (sets per muscle group): ${insightsWeeklyVolumeStr}\n- Key exercise signals: ${keyExerciseSignalsStr || "none"}\n- Global RIR summary: ${globalRirStr || "no RIR logged or insufficient"}\n- Notable findings: ${findingsStr || "none"}\n${goalRirStr ? `- ${goalRirStr}\n` : ""}${volumeCompletenessNote ? `- Completeness: ${volumeCompletenessNote}\n` : ""}`
      : "";

  const trendsBlock = trendsStr
    ? `exerciseTrends (use for progression / plateau language tied to actual loads and reps):\n${
        exerciseLogAnchorBlock
          ? "When EXERCISE LOG ANCHOR is present, use only the trend row for that same exercise — ignore other lifts’ rows for this answer.\n"
          : ""
      }${trendsStr}\n`
    : "";

  const analysisInputs = buildAnalysisInputs(
    trainingSummary,
    trainingInsights,
    exerciseTrends,
    coachStructuredOutput
  );
  const analysisInputsBlock = `Analysis anchors from workout data (must use):
- Top positive: ${analysisInputs.topPositive ?? "MISSING"}
- Top issue/watch item: ${analysisInputs.topIssue ?? "MISSING"}
- Next step: ${analysisInputs.nextStep ?? "MISSING"}`;

  const activeProgrammeSummaryBlock =
    activeProgramme?.days?.length
      ? `Active structured programme in context (authoritative for "this routine/plan" questions):
- Title: ${activeProgramme.programmeTitle}
- Days: ${activeProgramme.days.length}
- Day labels: ${activeProgramme.days.map((d) => d.dayLabel).join(", ")}
- Session types: ${activeProgramme.days.map((d) => d.sessionType).join(", ")}
Use this directly when the user refers to the routine/plan you just gave them.`
      : "";

  const templateReviewBlock = templateDataAvailable
    ? `Templates / programs (text provided by user in this request):\n${templatesSummary?.trim() ?? ""}\n${activeProgrammeSummaryBlock ? `\n${activeProgrammeSummaryBlock}\n` : ""}`
    : activeProgrammeSummaryBlock
      ? `${activeProgrammeSummaryBlock}\n`
      : `Templates / programs: NO structured template data was sent with this request. Do not pretend you reviewed their saved templates. Ask them to describe template names, split, days per week, and main exercises—or paste details—before judging or comparing programs.\n`;

  let input = "";
  switch (mode) {
    case "advisory":
      input = `
You are an experienced strength coach in advisory mode.

Hard rules:
- Do NOT run a full week-wide diagnosis unless the user asked for it.
- If LOGGED TRAINING above shows workouts, do NOT ask them to paste or restate their routine; you may mention one concrete detail from the digest when it sharpens your answer.
- If LOGGED TRAINING shows no sessions, do not treat that as failure—answer from principles or encourage logging.
- Use calm, coach-like language. No alarmist framing.
- Anchor recommendations to RIR targets and effort control.
- Adapt guidance to the user's message context (e.g., fatigue, stress, sleep, pain, health conditions, training schedule).
- If the user mentions pain, injury, or a health condition, prioritize safety and suggest professional medical input when appropriate.
- Give practical next-step coaching, not report-style commentary.
- Avoid vague "based on your data"; when citing logs, prefer "based on your recent logged sessions" or a concrete fact from the digest.
- Use supportive language like: "a good starting point would be", "this may help", "you can adjust based on how you feel."
- Do not start with clarifying questions when enough context exists.
- If minor context is missing, use these defaults silently and coach decisively:
  - equipment: full gym
  - goal bias: strength + hypertrophy mix
  - frequency baseline: 3-4 sessions per week
- First response MUST include all of:
  1) training structure/split
  2) rep ranges
  3) RIR guidance
  4) progression guidance
- Optional refinement question is allowed only as one short final line (e.g., "I can refine this further if needed.").
- Behaviour > Profile: prefer inferred behavior patterns unless profile constraints (injury/equipment/time) require overrides.
- Use coachingContext memory first; do not re-ask context already in memory.

RIR guidance defaults (unless user context suggests otherwise):
- Main compounds: usually ~1-3 RIR.
- Isolations/accessories: usually ~0-2 RIR.
- If fatigued or recovery-limited: bias higher RIR and reduce set volume.

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}.` : ""}
${inferredStr}
${coachingMemoryStr}
Parsed user context:
- goal: ${resolvedContext.goal}
- frequency: ${resolvedContext.frequencyPerWeek} sessions/week
- equipment: ${resolvedContext.equipment}
- injury status: ${resolvedContext.injuryStatus}
${contextDefaultsNote ? `Assumptions used for missing fields: ${contextDefaultsNote}.` : "No assumptions required; full context was provided."}
Minimum viable context explicitly provided in this message: ${mvcPresent ? "yes" : "no"}.

User question:
${message}

FORMAT HINT (advisory): use the four labels Split / Reps / RIR / Progression on their own lines, each followed by one or two short sentences — not long paragraphs under each.

Reply in plain language as a coach. 4-8 concise sentences with clear section flow:
"Split:", "Reps:", "RIR:", "Progression:".`;
      break;
    case "explanation":
      input = `
You are an elite strength coach. The user wants an explanation of existing coach output in plain English.

${routingPreamble}

${coachStructuredOutput ? coachAuthorityBlock : "No coach structured output is available; say so briefly and answer from profile + general principles only."}

${evidenceDrivenReasoningBlock}

TASK: Explain the current coach decisions and suggestions clearly. Do not invent new diagnoses.
${profileStr ? `User profile: ${profileStr}.` : ""}
- Keep wording simple and non-alarmist.
- Do not use internal terms like "signal", "interaction", or "limiting factor".
- Avoid vague "based on your data"; when citing logs, prefer "based on your recent logged sessions".

User question:
${message}

FORMAT HINT (coach explanation): one short opening line, blank line, then 3–5 short sentences — no extra headings.

Answer in plain language. 3–5 short sentences. Focus on "why" and practical meaning.`;
      break;
    case "clarification":
      input = `
You are an experienced strength coach.

The user's question may be broad or underspecified.
- If LOGGED TRAINING above shows sessions, answer from that data first; do NOT ask them to restate their routine.
- Prefer a practical recommendation grounded in the payload before asking anything.
- Ask at most ONE clarifying question, and only if something critical is missing for safety or their exact question.
- If context is partially missing, assume: full gym equipment; strength + hypertrophy mix; 3-4 sessions/week.
- Avoid clarification loops; do not re-ask what is already in LOGGED TRAINING or structured blocks.
- Keep the tone supportive and concise.
- Avoid vague "based on your data"; when citing logs, prefer "based on your recent logged sessions".

${trainingSummary.totalWorkouts > 0 ? `${context}\n${insightsBlock ? insightsBlock : ""}\n` : ""}
User question:
${message}

FORMAT HINT (clarification): direct answer first, then at most one short paragraph; avoid labeled sections.
`;
      break;
    case "analysis":
    default:
      if (questionKind === "memory_continuity") {
        input = `
You are answering a thread / memory continuity question — training logs are secondary unless the user explicitly linked them.

${routingPreamble}

Hard rules:
- Follow MEMORY CONTEXT and EXACT THREAD ACCESS. Never invent prior chat content.
- If exactThreadLoaded is false, be explicit that you may not have the full prior thread.
- Quote or paraphrase only what appears in RECENT CHAT when the user asked what was said.

User question:
${message}

FORMAT HINT (memory / thread): 2–4 short sentences, blank line optional between distinct points — no headings.

Reply in 2–4 short sentences unless they asked for detail.`;
      } else if (questionKind === "prior_answer_correction") {
        const priorRaw = (priorAssistantTurnContent ?? "").trim();
        const priorCapped =
          priorRaw.length > 4500 ? `${priorRaw.slice(0, 4500)}… [truncated]` : priorRaw;
        const priorBlock =
          priorCapped ||
          "(Full prior assistant text not attached to this request — use RECENT CHAT snippet below if it includes that reply; otherwise say you cannot see the exact prior wording and ask them to paste the sentence they dispute.)";
        input = `
You are a careful strength coach repairing a prior reply after the user challenged it, asked what you meant, or pointed out a mistake.

${routingPreamble}

PRIOR ASSISTANT TURN (verbatim — for diagnosis only; do NOT paste this whole block back to the user):
"""
${priorBlock}
"""

CORRECTION / CLARIFICATION MODE — classify their message as: correction request, dispute of a factual claim, or clarification about a prior statement.

Mandatory response order (internal — do not prefix lines with A), B), or “Step” in the user-visible reply; use short paragraphs with blank lines between):
A) One short sentence: name the exact claim they are pushing back on (quote or paraphrase precisely).
B) One short sentence: whether you were wrong, partially wrong, imprecise, or they clarified scope — if you were wrong, say so directly (“I was wrong about …”). No defensiveness. Skip “I’m an AI” / “I’m here to help” filler when the issue is factual.
C) Correct the claim using the best evidence in this request (SESSION ANCHOR, EXERCISE LOG ANCHOR, bench projection COACH LINES, exerciseTrends, trainingInsights, LOGGED TRAINING digest). If logs support the user, agree explicitly.
D) One sentence: what the corrected picture means in plain language.
E) Optional: at most 1–2 sentences of broader coaching only if clearly useful — only after A–D.

Repetition ban (critical):
- Do NOT reproduce your prior answer at length or re-run the same multi-section structure (e.g. all five bench headings, full session review essay) unless the user explicitly asks you to repeat the full answer.
- Ignore other instructions in this prompt that ask for ~150–190 words or five bench section headings on this turn — this is a surgical fix unless they ask to regenerate everything.

Length: default ~60–120 words unless they asked for more detail.

${coachStructuredOutput ? `If the dispute is about Coach-tab output, treat coachStructuredOutput + evidenceCards as authoritative for what the coach said; repair any mismatch between that and your prior free-text reply.\n${coachAuthorityBlock}` : ""}

${trainingSummary.totalWorkouts > 0 ? `${context}\n` : ""}${insightsBlock ? `${insightsBlock}\n` : ""}${trendsStr ? `${trendsBlock}\n` : ""}
${profileStr ? `User profile (constraints only): ${profileStr}.\n` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}\n` : ""}

User follow-up (challenge / clarification):
${message}
`;
      } else if (questionKind === "session_review") {
        input = `
You are a sharp, practical strength coach texting feedback after one session. Sound human and confident, not like an analytics export.

${routingPreamble}

Anchoring (non-negotiable — logic stays strict):
- Use SESSION ANCHOR only: EXERCISES, SESSION STRUCTURE, RIR line, PER-EXERCISE PRIOR LOGS, COMPARISON GROUNDING, SIMILAR PRIOR SESSION, RECENT SESSION ORDER (titles/dates).
- Do not name exercises outside EXERCISES. Ignore exerciseTrends, trainingInsights lists, digest exercise lines, and chat for naming lifts.
- "Introduced / newly added" only if SESSION ANCHOR explicitly allows vs the immediately prior session; otherwise say "included" or "part of the session".

COMPARISON SAFETY (mandatory — same accuracy rules, natural wording out):
- NEW BASELINE / NO TREND DATA lifts: never imply usual, typical, trend, better/worse vs history. Say it like a coach: e.g. "First time this lift shows up in what I can see — repeat it next time and we’ll know more" or "This gives you a starting point for next week."
- COMPARABLE TO PRIOR LOG ONLY: improved / held steady / dipped slightly only vs those prior dated lines; if messy, say it in plain language ("harder to call — looks mixed").

COACH VOICE (default session reviews — avoid report tone):
- Do NOT sound like a spreadsheet: avoid "max X reps, min Y reps", "average RIR ~0.42 across N sets", or lab-style summaries unless the user explicitly asked for detailed analytics.
- When RIR is logged in the anchor, prefer everyday coaching lines: e.g. "most work was very close to failure", "effort looked controlled", "RIR was mostly logged on the low side" — not decimal averages unless they asked.
- Weave in weights/reps where they help the story ("same 90 as last time, last set just fell off one rep") instead of listing every set mechanically.
- Keep COMPARISON GROUNDING rules but phrase them warmly: e.g. "matched what you did last session" not "metrics aligned with prior observation".

FORMAT HINT (session review — use only this shape; no extra titled blocks like “Summary” or “Overview”):
1) One opening line: verdict — what kind of day + main takeaway (coach tone, no “Verdict:” label).
2) Blank line.
3) Bullets: 3–4 lines with "- " (use a 5th only if the anchor clearly needs it). One clear point per bullet; natural language, not metrics soup. Max ~18 words per bullet when possible.
4) Blank line.
5) One line starting with "Next step: " — one specific action (load, reps, sets, rest, or repeat to confirm). Avoid vague "monitor recovery" unless the anchor supports it.

Layout: blank lines between verdict, bullets, and next step. No dense wall of text. No dash-stacking beyond these bullets.

Length: ~80–150 words default. Premium and concise.

Style bans: "solid", "fits well", "balanced", empty hype — unless tied to a concrete fact from the anchor in the same breath.

OPTIONAL DEEPER LAYER (only after a blank line, if useful):
Evidence / Compared to last time / Why this matters — short bullets only; still coach voice, not a data dump.

RIR: if anchor says none logged, do not invent RIR numbers; you may reference load/rep feel in hedged coach language.

${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

If SESSION ANCHOR says data is missing, brief coach line + one bullet + next step to log — no invention.`;
      } else if (questionKind === "exact_factual_recall") {
        input = `
You are answering a precise factual question about logged training.

${routingPreamble}

Hard rules:
- If EXERCISE LOG ANCHOR is present, lead with the exact numbers (date → sets) from completed sets only.
- If no anchor match, say the payload does not show that exercise; do not guess.
- Treat non-completed rows as not performed; never cite blank or zero-rep rows as reps achieved.
- Do not drift to unrelated exercises or weekly narratives unless the user asked.

FORMAT HINT (factual recall): first line = the direct answer (the numbers/dates they asked for). Blank line. Then at most two short supporting sentences. No section headings. Bullets only if you are listing several distinct logged facts.

${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

Reply: number-first, tight and scannable.`;
      } else if (questionKind === "exercise_progression") {
        input = `
You are analyzing progression for one lift using logs.

${routingPreamble}

Hard rules:
- EXERCISE LOG ANCHOR is primary: compare the most recent sessions shown there (dates + loads/reps).
- You may supplement with exerciseTrends / exerciseInsights rows ONLY for the same exercise name if present; do not switch to a different lift.
- State what changed (load, reps, set count) or that the log is too thin — label inference vs fact.
- Mention consistency or within-session rep fall-off only when visible in the anchor/trends.

FORMAT HINT (progression): first sentence = honest headline — improving, roughly stable, mixed, or too early to tell from the log. Then two to four short sentences with specifics (loads/reps/dates). No subsection headers or bullet list unless the user asked for a breakdown.

${trendsStr ? `${trendsBlock}` : ""}
${insightsBlock ? `\n${insightsBlock}` : ""}
${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

Reply in plain language: specific, coach-like, minimal filler.`;
      } else if (questionKind === "progression_readiness_path") {
        input = `
You are answering a progression-path / readiness-path question (how progress should look on the way to a target).

${routingPreamble}

Hard rules:
- Answer the actual path question first — not a detached estimate headline.
- Weave current position naturally into the answer (e.g. current heavy and volume benchmarks + rough estimate) instead of dropping a standalone metrics block.
- Keep output practical and coach-like: short answer, milestones, what makes target realistic, one next move.
- If user named explicit context (heavy/volume/last session), keep that as strict primary context; do not silently switch.
- If exact requested context is missing, say so clearly and offer closest context as secondary.
- Avoid internal/system wording in user text (anchor/guardrail/path jargon).

Recommended flow:
A) how far off target looks right now (short)
B) current position integrated naturally
C) likely progression path / milestones
D) what would make target realistic
E) one next move

FORMAT HINT (progression path): 4-6 short paragraphs or short bullets with one idea each. No rigid heading template unless user asked for one.

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${context}
${trendsStr ? trendsBlock : ""}

User question:
${message}

Reply: coach-like progression roadmap, practical and specific.`;
      } else if (questionKind === "projection_estimate") {
        input = `
You are answering a projection / estimate question (e.g. 1RM, timelines, working weights).

${routingPreamble}

Hard rules:
- Ground the answer in real logged performances from the payload (digest, exerciseTrends, bench projection block in subject when present).
- Frame timelines and maxes as estimates, not promises. Avoid overconfident dates.
- If data are sparse, say confidence is low and what extra logging would help.
- If the user explicitly named an anchor context (heavy bench / volume bench / most recent session / named day / named exercise), open from that anchor first, then add other evidence as supporting context.
${
  benchProjection
    ? `
BENCH GOAL / PROJECTION (when the Bench projection block appears above):
- DEFAULT REPLY = sharp coach note (~120–170 words). Follow the COACH LINES in the block; paraphrase lightly in a warm, readable voice.
- STRUCTURE: answer first in plain coaching language, then short reason from logs, then one clear next move. Use labels only if the user explicitly asked for a labeled breakdown.
- Keep evidence weighting internally: explicit user anchor first, directly relevant support second, broader context last.
- NUMBERS: Stick to what COACH LINES already give — one best-current max read, one heavy-day range, one volume-day range. Do not stack extra formula bands, session tables, or “working weight” grids unless the user explicitly asks for detail.
- EVIDENCE: If COACH LINES open with broader-context wording, keep that one light sentence — do not lecture about methodology.
- SUBSECTION EVIDENCE: Obey SUBSECTION EVIDENCE LOCK in the bench block — “Volume bench day” must never recycle the heavy-day anchor numbers unless the lock explicitly says there is no volume data (then say so, don’t copy heavy).
- BANNED in user-facing text: “authoritative”, “Epley”, “inverse”, “app window”, “estimate — not a promise”, long liability disclaimers, “interpretation… diagnosis”, or sounding like an internal calculation dump.
- Also banned in user-facing text: “primary anchor”, “supporting evidence”, “benchmark context”, “strength-floor guardrail”, “estimate path”.
- TIMELINES: Skip vague “a few months” unless you tie one short clause to their actual log trend and uncertainty; prefer readiness signs over dates.
- For direct timeline/readiness questions (“when can I hit 120”, “how long until 120”), use this dedicated flow without rigid labels: where they are now, rough timeline, readiness markers, next move.
- Ban filler (“gradually increase intensity and volume”) unless the same breath includes specific loads/reps from COACH LINES.
`
    : ""
}

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${context}
${trendsStr ? trendsBlock : ""}

User question:
${message}

FORMAT HINT: if no Bench projection block, use a short opening answer plus one blank line and two or three sentences — no multi-heading template. If the block is present, use the four-heading layout above (or timeline format when explicitly asked).

Reply: follow the structure rules above when the Bench projection block is present; otherwise direct estimate + brief reasoning tied to logged numbers.`;
      } else if (questionKind === "volume_balance") {
        const muscleRulesVolumeBlock = muscleVolumeSummaryForAssistant({
          workouts: coachingContext?.recentWorkouts ?? [],
          onlyIncludeNonZero: false,
        });
        input = `
You are answering a weekly volume / balance question.

${routingPreamble}

Hard rules:
- Use trainingInsights weekly volume / frequency and trainingSummary figures verbatim where provided; those counts reflect completed logged sets in the app window.
- For muscle-group-specific decisions (chest vs delts vs triceps, etc.), prioritize the muscle-aware hypertrophy volume estimate block below.
- Name muscle groups with very low or zero logged sets as potentially under-sampled in the app, not necessarily "weak".
- Tie recommendations to the user’s stated goal/profile when available; avoid generic "watch recovery" unless logs justify it.

FORMAT HINT (volume / balance): lead with the key numbers in one or two sentences, blank line, then one short paragraph of implications (optional “- ” bullets if comparing 2–3 muscle groups).

${insightsBlock ? `${insightsBlock}` : ""}
${muscleRulesVolumeBlock ? `\n${muscleRulesVolumeBlock}\n` : ""}
${hypertrophyEvidenceBlock ? `\n${hypertrophyEvidenceBlock}\n` : ""}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${context}

User question:
${message}

Reply: specific numbers first, then 1–2 practical implications.`;
      } else if (questionKind === "coaching_recommendation") {
        input = `
You are giving a coaching recommendation grounded in their logs.

${routingPreamble}

Hard rules:
- Start with a clear recommendation (what to do next session or how to adjust load/intensity).
- Explain why in 1–2 sentences using log facts; if EXERCISE LOG ANCHOR exists, prioritize it over unrelated trends.
- Calibrate confidence: sparse history → say what you are unsure about.
- Do not list unrelated exercises unless they are clearly tied to the same bottleneck.

FORMAT HINT (recommendation): paragraph 1 = clear directive (what to do). Blank line. Paragraph 2 = why, tied to log facts in one or two sentences. Optional final line starting with "Next: " for the single best follow-up. No extra labeled sections.

${coachAuthorityBlock}
${evidenceDrivenReasoningBlock}
${hypertrophyEvidenceBlock ? `\n${hypertrophyEvidenceBlock}\n` : ""}
${insightsBlock ? `${insightsBlock}` : ""}
${trendsStr ? trendsBlock : ""}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${hypertrophyEvidenceBlock ? `\n${hypertrophyEvidenceBlock}\n` : ""}
${inferredStr}
${coachingMemoryStr}
${context}

User question:
${message}

Reply: decisive, specific, calm tone — no vague praise without numbers.`;
      } else if (
        questionKind === "split_comparison_or_recommendation" ||
        questionKind === "split_explanation_education"
      ) {
        input = `
You are answering a split/routine comparison or recommendation question.

${routingPreamble}

Hard rules:
- Do NOT generate a full routine/program unless the user explicitly asked to build/create/make/generate one.
- Start with a direct answer to the comparison question (one sentence).
- Then briefly compare practical tradeoffs (goal fit, schedule fit, recovery fit, adherence).
- End with one practical recommendation for this user.
- Keep this coach-like and concise; no generic filler.

FORMAT HINT:
A) direct answer first
B) short comparison
C) what makes one better depending on goal/schedule/recovery
D) one practical recommendation

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${hypertrophyEvidenceBlock ? `\n${hypertrophyEvidenceBlock}\n` : ""}
${inferredStr}
${coachingMemoryStr}
${context}

User question:
${message}

Reply: comparison/recommendation only — no auto-generated programme.`;
      } else if (effectiveIntent === "recent_training_analysis") {
        input = `
You are an elite strength coach: diagnose system constraints, prescribe fixes — not generic fitness explanation.

${routingPreamble}
${reasoningBaseBlock}
${coachAuthorityBlock}
${evidenceDrivenReasoningBlock}
${insightsBlock}
${trendsBlock}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints (use only as hard constraints): ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (totals and recent exercise names):
${context}

User question:
${message}

FORMAT HINT (week / training analysis): either (a) three short paragraphs with blank lines between — what’s going well, what to watch, next step — or (b) three “- ” bullets for those same beats plus one closing line. Keep sentences short; one idea per sentence. Do not add extra headers beyond what scan needs.

Answer in plain language. 3–4 sentences; ~15–18 words each; one new idea per sentence; cover: progress → limiter → fix.
- Use the three analysis anchors below explicitly; do not replace them with generic RIR advice unless the top issue is RIR/effort related.
- Stay on the user’s question; cite the smallest set of exercises that actually answers it — avoid unrelated “also your X” drift.

Target style example:
"Your training is progressing well overall. Bench press is improving and frequency is consistent. Back volume is slightly low relative to your goal, so increasing it gradually would help keep progress balanced."

${analysisInputsBlock}
`;
      } else if (effectiveIntent === "coach_explanation") {
        input = `
You are an elite strength coach. The user wants an explanation of what the coach output means—not a fresh week-wide diagnosis.

${routingPreamble}

${coachStructuredOutput ? coachAuthorityBlock : "No coach structured output is available; say so briefly and answer from profile + general principles only."}

${evidenceDrivenReasoningBlock}

TASK: Explain the existing coach decisions and suggestions using the evidence cards when present. Tie mechanisms to evidence. Do not invent new diagnoses beyond coachStructuredOutput + evidence.
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}
${context}

User question:
${message}

FORMAT HINT: one short opening line, blank line, then 3–5 short sentences — no extra headings; optional closing takeaway line.

Answer in plain language. 3–5 short sentences. Focus on "why" the coach said what it said.
`;
      } else if (effectiveIntent === "template_review") {
        input = `
You are an elite strength coach. The user is asking about workout templates, programs, splits, or routines.

${routingPreamble}

${templateReviewBlock}
${profileStr ? `User profile (may inform recommendations): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Optional context — only reference if it helps compare template ideas to their setup (do not replace answering their template question):
${context}

User question:
${message}

FORMAT HINT: direct answer first, then short supporting detail; use “- ” bullets only if comparing days or options.

Answer directly about templates/programs. If template data was missing above, ask clearly for the missing details before reviewing. Do not default to recent-session training analysis.
`;
      } else if (effectiveIntent === "exercise_question") {
        input = `
You are an elite strength coach.

${routingPreamble}

Answer the exercise question directly. Use profile and training log only when clearly relevant; do not force unrelated weekly-volume commentary.
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (use only if relevant):
${context}
${insightsBlock ? `${insightsBlock}` : ""}
${trendsStr ? trendsBlock : ""}

User question:
${message}

FORMAT HINT: opening answer in one or two sentences, blank line, then brief context if needed — no multi-section template unless bench projection rules apply above.

Reply in plain language, concise (3–5 sentences unless they asked for detail).
`;
      } else if (effectiveIntent === "goal_question") {
        input = `
You are an elite strength coach.

${routingPreamble}

Answer about goals, phases (bulk/cut), strength vs hypertrophy, or priorities. Use profile when helpful. Do not open with unrelated weekly log analysis unless the question ties to it.
${
  benchProjection
    ? `
Bench projection block is available: if the question is how bench sessions should look for a target max, follow the block’s COACH LINES (premium coach tone, no technical jargon in the user reply) — same density rules as projection_estimate.
`
    : ""
}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (optional, only if relevant):
${context}

User question:
${message}

FORMAT HINT: match the question shape — short Q gets a short reply; avoid extra headings unless the bench projection block rules apply.

Reply in plain language, concise.
`;
      } else {
        /* general_training_question */
        input = `
You are an elite strength coach.

${routingPreamble}

Answer the question normally. You may use training context below only when it directly helps—do not lead with or default to "your training this week" unless the question calls for it.
${plannedDayMuscleCoverageBlock ? `\nPlanned session muscle coverage (deterministic; use for “push/pull/leg day hits X” questions):\n${plannedDayMuscleCoverageBlock}` : ""}
${hypertrophyEvidenceBlock ? `\n${hypertrophyEvidenceBlock}\n` : ""}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (optional reference):
${context}
${insightsBlock ? `\n${insightsBlock}` : ""}
${trendsStr ? trendsBlock : ""}

User question:
${message}

FORMAT HINT: default = one short paragraph or two with a blank line between; no invented section headers.

Reply in plain language. Prefer 3–5 concise sentences unless the user asks for more.
`;
      }
      break;
  }

  const profileHint = userProfile
    ? {
        lowerBodyPriority: userProfile.lowerBodyPriority,
        trainingPrioritiesText: userProfile.trainingPrioritiesText,
      }
    : undefined;

  const selectiveMemoryBlock =
    assistantMemory != null
      ? buildSelectiveMemoryBlock({ memory: assistantMemory, profileHint })
      : "- None saved yet";

  const recentChatLines =
    (recentConversationMemory ?? [])
      .slice(-6)
      .map((t) => {
        const c = (t.content ?? "").replace(/\s+/g, " ").trim();
        const trimmed = c.length > 220 ? `${c.slice(0, 220)}…` : c;
        return `${t.role}: ${trimmed}`;
      })
      .filter(Boolean) ?? [];

  const recentConversationBlock = recentChatLines.length
    ? recentChatLines.join("\n")
    : "- None";

  const exactThreadAccessBlock = `
EXACT THREAD ACCESS (truthfulness gating):
- exactThreadLoaded = ${exactThreadLoaded === true ? "true" : "false"}

Rules:
- If exactThreadLoaded is false, do NOT claim you remember verbatim details from a previous thread that is not loaded.
- For questions like "Do you remember our last chat about X?":
  - If exactThreadLoaded is true: you may answer only if the RECENT CHAT snippet contains X (or clearly references it).
  - If exactThreadLoaded is false: say you don't have the exact prior thread loaded right now, but you can still help using saved preferences + current training/profile context.
`.trim();

  const memoryContextBlock =
    effectiveIntent === "session_review"
      ? `
MEMORY CONTEXT (session review — saved preferences only):
${selectiveMemoryBlock}

RECENT CHAT: intentionally omitted for this request so prior topics cannot add exercises that are not in SESSION ANCHOR.

${exactThreadAccessBlock}
`.trim()
      : questionKind === "memory_continuity"
        ? `
MEMORY CONTEXT (thread / continuity mode):
${selectiveMemoryBlock}

RECENT CHAT (authoritative for thread-memory questions — quote only what appears here):
${recentConversationBlock}

${exactThreadAccessBlock}

Rules:
- Do not claim exact prior-chat memory unless exactThreadLoaded is true and the snippet supports it.
- App training logs are separate from chat memory; do not conflate them when the user asked about the conversation.
`.trim()
        : `
MEMORY CONTEXT (preferences only; workout + profile override):
${selectiveMemoryBlock}

RECENT CHAT (thread continuity; brief):
${recentConversationBlock}

${exactThreadAccessBlock}
`.trim();

  console.log("[memory-debug] retrieved for request", {
    selectiveMemoryBlock,
    recentConversationTurns: (recentConversationMemory ?? []).slice(-6).map((t) => t.role),
  });

  const activeExerciseBlock = activeExerciseTopic
    ? `Active exercise topic (lock): ${activeExerciseTopic}\n${
        activeExerciseLastSession
          ? `Last logged session for this exercise: ${activeExerciseLastSession.completedAt}\n- Best set: ${
              activeExerciseLastSession.bestSet
                ? `${activeExerciseLastSession.bestSet.weight}×${activeExerciseLastSession.bestSet.reps}`
                : "n/a"
            }\n- Last set: ${
              activeExerciseLastSession.lastSet
                ? `${activeExerciseLastSession.lastSet.weight}×${activeExerciseLastSession.lastSet.reps}`
                : "n/a"
            }${
              (activeExerciseLastSession.unloggedSetCount ?? 0) > 0
                ? `\n- Unlogged/incomplete sets in that session: ${activeExerciseLastSession.unloggedSetCount}`
                : ""
            }`
          : "- Last session data: missing"
      }`
    : "Active exercise topic (lock): none\n- Last session data: missing";

  const benchProjectionBlock = benchProjection
    ? (() => {
        const p = benchProjection;
        const auth = p.authoritativeEstimated1RM ?? p.currentEstimated1RM;
        const explicitAnchorLine =
          explicitAnchor?.id === "heavy_bench" && p.heavyAnchor
            ? `PRIMARY ANCHOR FOR THIS TURN (mandatory): heavy bench ${p.heavyAnchor.weight}×${p.heavyAnchor.reps} (${formatIsoDate(
                p.heavyAnchor.completedAt
              )}) is the main estimate anchor.`
            : explicitAnchor?.id === "volume_bench" && p.volumeAnchor
              ? `PRIMARY ANCHOR FOR THIS TURN (mandatory): volume bench ${p.volumeAnchor.weight}×${p.volumeAnchor.reps} (${formatIsoDate(
                  p.volumeAnchor.completedAt
                )}) is the main estimate anchor.`
              : explicitAnchor?.id === "most_recent_session"
                ? "PRIMARY ANCHOR FOR THIS TURN (mandatory): use the most recent logged session as the main estimate anchor."
                : "";
        const parts: string[] = [
          `BENCH — Reply like a premium in-app coach (~120–170 words). Readable, specific, calm — not a lab report.`,
          ...(explicitAnchorLine ? [explicitAnchorLine, ``] : []),
          ...(p.subsectionEvidenceLock ? [p.subsectionEvidenceLock, ``] : []),
          `Start with the direct answer to the user’s question, then one short why from logs, then one clear next move. Avoid rigid heading templates unless the user asked for a breakdown.`,
          `Keep evidence weighting internally: explicit user anchor first, secondary context second, broader context last.`,
          `COACH LINES (primary — light paraphrase only; do not add extra number bands or formulas in the user reply):`,
          p.coachFacing?.evidenceLead ?? "",
          p.coachFacing?.bestCurrentRead ?? `About ${auth}${p.payloadUnit} max strength from logged bench tops (rough estimate).`,
          `Heavy bench day: ${p.coachFacing?.heavyBenchDay ?? ""}`,
          `Volume bench day: ${p.coachFacing?.volumeBenchDay ?? ""}`,
          `When target looks realistic:\n${p.coachFacing?.whenTargetLooksRealistic ?? ""}`,
          `Next move: ${p.coachFacing?.nextMove ?? ""}`,
          ``,
          `INTERNAL (stay consistent; do not read jargon aloud): ${p.estimateBasisLine}`,
          ...(p.evidenceScopeLine ? [p.evidenceScopeLine] : []),
          ...(p.readinessSignals?.length ? p.readinessSignals : []),
        ];
        const tail = p.recentBestSets
          .slice(-4)
          .map((s) => `${s.weight}×${s.reps}`)
          .join(" → ");
        if (tail) {
          parts.push(
            `Optional — only if user asks for history: recent bench bests chain ${tail} (${p.benchExerciseName}).`
          );
        }
        return `Bench projection block:\n${parts.filter(Boolean).join("\n")}`;
      })()
    : "Bench projection data: none";
  const benchEstimateBlock = benchEstimate
    ? `Bench 1RM estimate object (deterministic):
- estimated1RM: ${benchEstimate.estimated1RM}
- estimateLow: ${benchEstimate.estimateLow}
- estimateHigh: ${benchEstimate.estimateHigh}
- confidence: ${benchEstimate.confidence}
- primaryAnchorUsed: ${benchEstimate.primaryAnchorUsed.kind} | ${
        benchEstimate.primaryAnchorUsed.set.weight
      }x${benchEstimate.primaryAnchorUsed.set.reps}${
        benchEstimate.primaryAnchorUsed.set.rir !== undefined
          ? ` @~${benchEstimate.primaryAnchorUsed.set.rir} RIR`
          : ""
      } | effectiveRTF ${benchEstimate.primaryAnchorUsed.effectiveRTF} | ${benchEstimate.primaryAnchorUsed.formulaUsed}
- supportingEvidenceUsed: ${benchEstimate.supportingEvidenceUsed.used ? "yes" : "no"} | agreement ${benchEstimate.supportingEvidenceUsed.agreement}${
        benchEstimate.supportingEvidenceUsed.set
          ? ` | ${benchEstimate.supportingEvidenceUsed.set.weight}x${benchEstimate.supportingEvidenceUsed.set.reps}`
          : ""
      }
- reasoningSummary: ${benchEstimate.reasoningSummary}
Rules:
- Prefer this object for estimate numbers/ranges/confidence.
- Keep primary vs supporting evidence separation from this object.
`
    : "Bench 1RM estimate object: none";
  const benchContextBlock = benchContext
    ? `Bench context (structured, completed sets only):
- latest heavy bench session: ${
        benchContext.latestHeavyBenchSession
          ? `${formatIsoDate(benchContext.latestHeavyBenchSession.completedAt)} | ${benchContext.latestHeavyBenchSession.sessionName} | ${benchContext.latestHeavyBenchSession.exerciseName} | sets ${benchContext.latestHeavyBenchSession.sets.map((s) => `${s.weight}x${s.reps}`).join(", ")} | best ${benchContext.latestHeavyBenchSession.bestSet.weight}x${benchContext.latestHeavyBenchSession.bestSet.reps}${benchContext.latestHeavyBenchSession.avgRIR !== undefined ? ` | avgRIR~${benchContext.latestHeavyBenchSession.avgRIR.toFixed(2)}` : ""}`
          : "none found"
      }
- latest volume bench session: ${
        benchContext.latestVolumeBenchSession
          ? `${formatIsoDate(benchContext.latestVolumeBenchSession.completedAt)} | ${benchContext.latestVolumeBenchSession.sessionName} | ${benchContext.latestVolumeBenchSession.exerciseName} | sets ${benchContext.latestVolumeBenchSession.sets.map((s) => `${s.weight}x${s.reps}`).join(", ")} | best ${benchContext.latestVolumeBenchSession.bestSet.weight}x${benchContext.latestVolumeBenchSession.bestSet.reps}${benchContext.latestVolumeBenchSession.avgRIR !== undefined ? ` | avgRIR~${benchContext.latestVolumeBenchSession.avgRIR.toFixed(2)}` : ""}`
          : "none found"
      }
Rules:
- Use these summaries as authoritative heavy-vs-volume context when the user asks about heavy/volume bench explicitly.
- Do not swap heavy and volume anchors.
`
    : "Bench context: none";

  const conversationSubjectBlock =
    effectiveIntent === "session_review"
      ? `
SESSION REVIEW — ANCHOR (overrides active exercise lock, bench projection, and normal conversation subject lock):

${sessionReviewAnchorBlock}
`.trim()
      : exerciseLogAnchorBlock
        ? `
EXERCISE LOG — ANCHOR (overrides active exercise topic lock and bench projection for this turn when they conflict with the named exercise below):

${exerciseLogAnchorBlock}

Rules:
- The user’s message + EXERCISE LOG ANCHOR outrank stale UI topic carryover: answer for the locked exercise above.
- Use only completed sets as performance; cite dates from the anchor when comparing to prior sessions.
`.trim()
        : `
CONVERSATION SUBJECT LOCK (prevents topic drift):
${activeExerciseBlock}
Rule: If the user asks a follow-up about the current active exercise, anchor your entire answer to it. Do not switch to another exercise just because it has a recent signal.

If the user requests exact last-session reps/weights for the active exercise and the payload includes last-session data, answer using the exact best/last set values (no vague summary).

${benchProjectionBlock}

${benchContextBlock}

${benchEstimateBlock}`.trim();

  const finalInput = `${loggedDataPreamble.trim()}\n\n${conversationSubjectBlock}\n\n${input.trim()}\n\n${memoryContextBlock}\n\n---\nTRUST & CALIBRATION (apply to your reply):\n${TRUST_AND_CALIBRATION_BLOCK}\n\n---\nINFERENCE & CERTAINTY (apply to your reply):\n${INFERENCE_CERTAINTY_BLOCK}\n\n---\n${GLOBAL_REPLY_DISCIPLINE_BLOCK}\n\n---\n${FINAL_RESPONSE_POLISH_BLOCK}`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: finalInput,
  });

  const reply = response.output_text?.trim();
  if (!reply) throw new Error("Empty response from model");
  return reply;
}

function formatIsoDate(iso: string | undefined): string {
  if (!iso) return "unknown date";
  if (typeof iso !== "string") return "unknown date";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function stripHeadingPrefix(text: string, labels: string[]): string {
  let out = (text ?? "").trim();
  for (const label of labels) {
    const re = new RegExp(`^${label}\\s*:?\\s*`, "i");
    out = out.replace(re, "").trim();
  }
  return out;
}

type ThreadMessageForDeterministic = { role: "user" | "assistant"; content: string };
type ThreadMessageWithStructured = ThreadMessageForDeterministic & {
  workout?: AssistantResponse["structuredWorkout"];
  programme?: AssistantResponse["structuredProgramme"];
};

/** Prior assistant message when the user’s latest turn is a challenge/clarification (user, assistant, user). */
function extractPriorAssistantTurnForCorrection(
  threadMessages: ThreadMessageForDeterministic[] | undefined
): string | null {
  if (!threadMessages?.length) return null;
  const history = threadMessages.filter(
    (t): t is ThreadMessageForDeterministic =>
      Boolean(t?.content?.trim() && (t.role === "user" || t.role === "assistant"))
  );
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last.role !== "user" || prev.role !== "assistant") return null;
  return prev.content.trim();
}

function normalizeForThreadMatch(s: string): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tryBuildDeterministicThreadReferenceReply(params: {
  message: string;
  threadMessages: ThreadMessageForDeterministic[] | undefined;
  exactThreadLoaded: boolean | undefined;
}): string | null {
  const m = normalizeForThreadMatch(params.message);
  const history = (params.threadMessages ?? []).filter(
    (t): t is ThreadMessageForDeterministic => Boolean(t && t.role && typeof t.content === "string")
  );
  if (!history.length) return null;

  const exactThreadLoaded = Boolean(params.exactThreadLoaded);

  // Helper: locate where the "current question" sits in the history snippet.
  const currentUserIdx = (() => {
    const target = normalizeForThreadMatch(params.message);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user" && normalizeForThreadMatch(history[i].content) === target) return i;
    }
    // Fallback: assume the last user message is the current question.
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") return i;
    }
    return -1;
  })();

  const getLastUserBefore = (idx: number): ThreadMessageForDeterministic | undefined => {
    for (let i = idx - 1; i >= 0; i--) if (history[i].role === "user") return history[i];
    return undefined;
  };
  const getSecondLastUserBefore = (idx: number): ThreadMessageForDeterministic | undefined => {
    let seen = 0;
    for (let i = idx - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        seen += 1;
        if (seen === 2) return history[i];
      }
    }
    return undefined;
  };
  const getLastAssistantBefore = (idx: number): ThreadMessageForDeterministic | undefined => {
    for (let i = idx - 1; i >= 0; i--) if (history[i].role === "assistant") return history[i];
    return undefined;
  };

  const asksLastMessage = /\bwhat\s+was\s+my\s+last\s+message\b/.test(m) || /\blast\s+message\b/.test(m);
  const asksBeforeThat = /\bone\s+before\s+that\b|\bthe\s+one\s+before\s+that\b/.test(m);
  const asksWhatWereWeDiscussing = /\bwhat\s+were\s+we\s+just\s+discussing\b|\bwhat\s+were\s+we\s+discussing\b/.test(m);

  if (asksLastMessage || asksBeforeThat || asksWhatWereWeDiscussing) {
    if (currentUserIdx < 0) return null;
    if (asksBeforeThat) {
      const second = getSecondLastUserBefore(currentUserIdx);
      if (!second) return "I can’t see that far back in the loaded thread snippet.";
      return `The one before that (your message): ${second.content}`;
    }
    if (asksWhatWereWeDiscussing) {
      const lastAssistant = getLastAssistantBefore(currentUserIdx);
      if (!lastAssistant) return "I don’t see an assistant reply just before that in the loaded thread snippet.";
      return `We were just discussing (assistant’s last message): ${lastAssistant.content}`;
    }
    // default: last message
    const lastUser = getLastUserBefore(currentUserIdx);
    if (!lastUser) return "I can’t see your previous message in the loaded thread snippet.";
    return `Your last message: ${lastUser.content}`;
  }

  // Truthful memory question: "Do you remember our last chat about RIR?"
  const asksRememberLastChat = /\bdo\s+you\s+remember\b/.test(m) && /\b(last\s+chat|our\s+last\s+chat|previous\s+chat)\b/.test(m);
  if (asksRememberLastChat) {
    // Extract a coarse topic after "about ..."
    const topicMatch = params.message.match(/about\s+([^?]+)/i);
    const topicRaw = topicMatch?.[1]?.trim() ?? "";
    const topicLower = normalizeForThreadMatch(topicRaw);

    // Also search for a few common training-keywords if we didn't get "about X".
    const fallbackTopics = ["rir", "rpe", "reps in reserve", "bench", "pb", "squat", "deadlift", "hammer curl"];
    const inferredTopic =
      topicLower ||
      fallbackTopics.find((k) => m.includes(normalizeForThreadMatch(k))) ||
      "";

    const includesTopic = inferredTopic
      ? history.some((t) => normalizeForThreadMatch(t.content).includes(inferredTopic))
      : false;

    if (!exactThreadLoaded) {
      return inferredTopic
        ? `I don’t have the exact previous thread loaded here, so I can’t confirm verbatim—but I can still help using your saved preferences and your current training data (if it relates to "${topicRaw.trim() || inferredTopic}").`
        : `I don’t have the exact previous thread loaded here, so I can’t confirm verbatim—but I can still help using your saved preferences and your current training data.`;
    }

    if (includesTopic) {
      const snippet = history
        .map((t) => t.content)
        .find((c) => (inferredTopic ? normalizeForThreadMatch(c).includes(inferredTopic) : false));
      const trimmedSnippet = snippet ? snippet.slice(0, 160).trim() : undefined;
      return trimmedSnippet
        ? `Yes. In our loaded chat snippet, you mentioned something about "${topicRaw.trim() || inferredTopic}". ${trimmedSnippet}${
            trimmedSnippet.length >= 160 ? "…" : ""
          }`
        : `Yes—you mentioned "${topicRaw.trim() || inferredTopic}" in the loaded thread snippet.`;
    }

    return `I can see the loaded thread snippet here, but I don’t see "${topicRaw.trim() || inferredTopic}" in the snippet I have access to right now.`;
  }

  return null;
}

function extractLatestStructuredProgramme(
  threadMessages: ThreadMessageWithStructured[] | undefined
): AssistantResponse["structuredProgramme"] | null {
  if (!Array.isArray(threadMessages) || threadMessages.length === 0) return null;
  for (let i = threadMessages.length - 1; i >= 0; i--) {
    const m = threadMessages[i];
    if (m?.role === "assistant" && m?.programme && Array.isArray(m.programme.days)) {
      const p = m.programme;
      if (!p.days.length) continue;
      if (process.env.NODE_ENV === "development") {
        if (p.debugSource !== "new_programme_pipeline_v1") {
          console.warn("[programme-cache-hit]", {
            action: "thread_programme_non_v1_still_usable",
            debugSource: p.debugSource ?? "missing",
            programmeTitle: p.programmeTitle,
          });
        }
      }
      console.log("[programme-cache-hit]", {
        action: "thread_programme_used_for_merge",
        debugSource: p.debugSource ?? "missing",
        programmeTitle: p.programmeTitle,
        dayCount: p.days.length,
      });
      return p;
    }
  }
  return null;
}

function isProgrammeAdjustmentRequest(message: string): boolean {
  const t = message.toLowerCase();
  if (!t.trim()) return false;
  const adjustmentVerb =
    /\b(add|remove|swap|change|replace|reduce|increase|adjust|modify|rebuild|regenerate|make it|make this|make that|prioriti[sz]e)\b/.test(
      t
    );
  const programmeScoped =
    /\b(program|programme|routine|split|day|days|ppl|push pull legs|upper lower)\b/.test(t) ||
    /\b(side delt|delts?|chest|back|legs?|arms?|shoulders?|fatigue|hypertrophy|strength|barbell|dumbbell|machine)\b/.test(t);
  return adjustmentVerb && programmeScoped;
}

function tryBuildDeterministicExerciseReply(params: {
  message: string;
  activeExerciseLastSession: AssistantBody["activeExerciseLastSession"] | undefined;
}): string | null {
  const m = params.message.toLowerCase();
  const lastTimeRequested =
    /(last time|last session|most recent|last logged)/.test(m) ||
    (m.includes("last") && (m.includes("reps") || m.includes("weight")));

  const asksForExact =
    /(what reps|what weight|weight and reps|what did i|i did|i achieve)/.test(m) ||
    /(reps?\s+(did|i)|weight.*reps|weight and reps)/.test(m) ||
    (/(what happened|how did it go)/.test(m) && /(last|most recent)/.test(m));

  if (!lastTimeRequested || !asksForExact) return null;
  const data = params.activeExerciseLastSession;
  if (!data) return null;
  const best = data.bestSet;
  const lastSet = data.lastSet;
  if (!best || !lastSet) return null;

  const date = formatIsoDate(data.completedAt);
  const unloggedLine =
    (data.unloggedSetCount ?? 0) > 0
      ? `\n\n${data.unloggedSetCount} set${data.unloggedSetCount === 1 ? "" : "s"} in that session look unlogged or incomplete, so they don’t count as completed performance.`
      : "";
  return `Your last ${data.exerciseName} session was logged on ${date}.

Logged completed sets: best set ${best.weight}×${best.reps}; last completed set ${lastSet.weight}×${lastSet.reps}.${unloggedLine}

Use those completed sets as your baseline for progression.`;
}

function tryBuildDeterministicBenchProjectionReply(params: {
  message: string;
  benchProjection: AssistantBody["benchProjection"] | undefined;
  explicitAnchor: ExplicitEvidenceAnchor | null;
  benchContext: AssistantBody["benchContext"] | undefined;
  benchEstimate: AssistantBody["benchEstimate"] | undefined;
}): string | null {
  const m = params.message.toLowerCase();
  const oneRm = /\b(1rm|e1rm|one rep max)\b/.test(m);
  const benchish =
    /\bbench\b|pb|bench press|barbell bench/.test(m) ||
    (params.benchProjection != null && oneRm);

  const asksWhen =
    /(when|expect|timeline|when can i|how soon|can i expect)/.test(m) ||
    (m.includes("expect") && m.includes("bench"));
  const asksTimelineReadiness =
    /\b(when|how long|timeline|how soon|realistic)\b/.test(m) &&
    (/\b\d{2,3}\s*(kg|kgs|lb|lbs)?\b/.test(m) || /\btarget\b/.test(m) || /\b(hit|reach|get|expect)\b/.test(m));
  const asksProgressionPath =
    /\b(what should my progress look like|what should my bench look like on the way|what milestones should i hit|how should my sessions progress|up until)\b/.test(
      m
    ) && (/\b(120|1rm|target|bench|kg|lb)\b/.test(m));
  const asksTripleTargetWeight =
    (/\b(what weight|which weight|weight should i)\b/.test(m) &&
      /\b(3 reps|3 rep|triple|triples)\b/.test(m) &&
      /\b(120|target|1rm|bench)\b/.test(m)) ||
    (/\bi mean\b/.test(m) &&
      /\b(what weight|3 reps|triple)\b/.test(m) &&
      /\b(120|target|bench)\b/.test(m));
  const asksWorking =
    /(working weight|working weights|what would my working weights|what weight.*reps|reps need|working weights\/reps)/.test(m) ||
    m.includes("working weights") ||
    m.includes("working weight");
  const asksHeavyVolumeSessions =
    /\b(heavy|volume)\b/.test(m) &&
    /\b(session|sessions|day)\b/.test(m) &&
    (/what can i expect/.test(m) || /look like/.test(m) || /should my/.test(m));
  const asksBenchGoalSessions =
    /what should my session/.test(m) ||
    /when this is possible/.test(m) ||
    /need to look/.test(m) ||
    /based on my (most )?recent/.test(m) ||
    /how can i expect/.test(m) ||
    /increase to\b/.test(m);

  if (!benchish) return null;
  const p = params.benchProjection;
  if (!p?.heavyDay || !p.volumeDay || !p.recentBestSets.length) return null;

  const wantsProjection =
    asksWhen ||
    asksWorking ||
    asksHeavyVolumeSessions ||
    asksBenchGoalSessions ||
    (oneRm && p.target1RM != null);

  if (!wantsProjection) return null;

  const u = p.payloadUnit;
  const cf = p.coachFacing;
  if (!cf) return null;

  const mentionsTemplates = /template|templates|program|routine|split/.test(m);
  const templateLine = mentionsTemplates
    ? `\n\nIf you use a template, keep heavy bench on your heavy day and volume bench on your lighter slot.`
    : "";
  const heavyAnchor = params.benchContext?.latestHeavyBenchSession?.bestSet
    ? {
        weight: params.benchContext.latestHeavyBenchSession.bestSet.weight,
        reps: params.benchContext.latestHeavyBenchSession.bestSet.reps,
        completedAt: params.benchContext.latestHeavyBenchSession.completedAt,
      }
    : (p.heavyAnchor ?? null);
  const volumeAnchor = params.benchContext?.latestVolumeBenchSession?.bestSet
    ? {
        weight: params.benchContext.latestVolumeBenchSession.bestSet.weight,
        reps: params.benchContext.latestVolumeBenchSession.bestSet.reps,
        completedAt: params.benchContext.latestVolumeBenchSession.completedAt,
      }
    : (p.volumeAnchor ?? null);
  const heavySessionRir = params.benchContext?.latestHeavyBenchSession?.avgRIR;

  // Validation gate: if user explicitly named heavy/volume as primary anchor, the chosen benchmark must match.
  if (params.explicitAnchor?.id === "heavy_bench" && (!heavyAnchor || heavyAnchor.reps > 5)) return null;
  if (params.explicitAnchor?.id === "volume_bench" && (!volumeAnchor || volumeAnchor.reps < 6)) return null;

  const primaryEvidence =
    params.explicitAnchor?.id === "heavy_bench"
      ? heavyAnchor
        ? `Your heavy bench reference is ${heavyAnchor.weight}×${heavyAnchor.reps} (${formatIsoDate(heavyAnchor.completedAt)})${
            heavySessionRir !== undefined ? `, with logged effort around ${heavySessionRir.toFixed(1)} RIR` : ""
          }.`
        : "This is anchored to your heavy bench work."
      : params.explicitAnchor?.id === "volume_bench"
        ? volumeAnchor
          ? `Your volume bench reference is ${volumeAnchor.weight}×${volumeAnchor.reps} (${formatIsoDate(volumeAnchor.completedAt)}).`
          : "This is anchored to your volume bench work."
        : params.explicitAnchor?.id === "most_recent_session"
          ? "This is anchored to your most recent logged session."
          : heavyAnchor
            ? `Most useful reference right now is heavy bench around ${heavyAnchor.weight}×${heavyAnchor.reps}.`
            : volumeAnchor
              ? `Most useful reference right now is volume bench around ${volumeAnchor.weight}×${volumeAnchor.reps}.`
              : "Most useful reference right now is your recent logged bench work.";

  const supportingEvidence =
    params.explicitAnchor?.id === "heavy_bench"
      ? volumeAnchor
        ? `Volume bench around ${volumeAnchor.weight}×${volumeAnchor.reps} helps confirm the read without replacing the heavy-day reference.`
        : "No separate 6+ rep volume line was found in this payload."
      : heavyAnchor
        ? `Heavy bench around ${heavyAnchor.weight}×${heavyAnchor.reps} gives the top-end context.`
        : "Only broader bench trend context is available.";

  const readinessLine = cf.whenTargetLooksRealistic
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  const estimateLine = params.benchEstimate
    ? `About ${params.benchEstimate.estimateLow}–${params.benchEstimate.estimateHigh} ${u} (center ~${params.benchEstimate.estimated1RM} ${u}, ${params.benchEstimate.confidence} confidence).`
    : cf.bestCurrentRead;
  const supportLine = params.benchEstimate
    ? `${supportingEvidence} ${params.benchEstimate.reasoningSummary}`
    : supportingEvidence;
  const cleanSupportLine = stripHeadingPrefix(supportLine, ["Supporting evidence"]);
  const cleanNextMove = stripHeadingPrefix(cf.nextMove, ["Next move"]);
  const readinessLines = cf.whenTargetLooksRealistic
    .split("\n")
    .map((line) => stripHeadingPrefix(line, ["When target looks realistic", "When"]))
    .map((line) => line.trim())
    .filter(Boolean);

  if (asksTripleTargetWeight) {
    const target = p.target1RM ?? (/\b(1[0-9]{2})\b/.exec(m)?.[1] ? Number(/\b(1[0-9]{2})\b/.exec(m)?.[1]) : null);
    const heavyNow = heavyAnchor?.weight ?? null;
    const repsNow = heavyAnchor?.reps ?? null;
    const step = u === "kg" ? 2.5 : 5;
    const tripleGoalRaw = target != null ? target / (1 + 3 / 30) : null; // Epley inverse for 3 reps.
    const roundToStep = (v: number) => Math.round(v / step) * step;
    const tripleGoal = tripleGoalRaw != null ? roundToStep(tripleGoalRaw) : null;
    const realisticGate = tripleGoal != null ? roundToStep(tripleGoal - step * 2) : null;

    const opening =
      tripleGoal != null
        ? `For a realistic ${target}${u} 1RM attempt, a good heavy benchmark is roughly ${tripleGoal}${u} for 3 reps.`
        : `A good benchmark before a 1RM attempt is having your heavy triples clearly moving up week to week.`;

    const ladder =
      heavyNow != null
        ? `From where you are now (${heavyNow}${u} x ${repsNow ?? 3}), keep repeating the same triple load until it feels clearly easier, then move up by ${step}${u}: ${heavyNow}${u} x 3 -> ${roundToStep(heavyNow + step)}${u} x 3 -> ${roundToStep(heavyNow + step * 2)}${u} x 3 -> ${roundToStep(heavyNow + step * 3)}${u} x 3.`
        : `Progress triples in small steps (${step}${u}) and only move up when the current load is repeatable without grinding.`;

    const gateLine =
      realisticGate != null
        ? `Once you are around ${realisticGate}${u}-${tripleGoal}${u} for solid triples, you are usually in range to test ${target}${u} on a good day.`
        : `When heavy triples are stable and no longer near-max effort each week, testing your target becomes realistic.`;

    return `${opening}

${ladder}

${gateLine}

Next: keep one heavy triple-focused day and one volume day, and only jump load when set 1 still looks clean at about 1-2 RIR.`;
  }

  if (asksTimelineReadiness || asksProgressionPath) {
    const est = params.benchEstimate;
    const target = p.target1RM ?? null;
    const gap = est && target != null ? Number((target - est.estimated1RM).toFixed(1)) : null;
    const progressRate = p.progressionDeltaKgPerSession;

    let closenessLine: string;
    if (gap != null && gap <= 0) {
      closenessLine = `Your current estimated range already covers ${target} ${u} — you may be ready to attempt it now or very soon.`;
    } else if (gap != null) {
      closenessLine = `You're roughly ${gap} ${u} short of ${target} ${u} on this read.`;
    } else {
      closenessLine = "Current position relative to target is unclear from the data available.";
    }

    let timelineText: string;
    if (gap != null && gap <= 0) {
      timelineText = "Near-term: a peaking session or a strong heavy day could confirm it.";
    } else if (gap != null && progressRate != null && progressRate > 0) {
      const sessions = Math.ceil(gap / progressRate);
      const weeksLow = Math.ceil(sessions * 0.7);
      const weeksHigh = Math.ceil(sessions * 1.5);
      timelineText = `At your recent rate (~${progressRate} ${u} per bench exposure), roughly ${sessions} focused bench sessions — so roughly ${weeksLow}–${weeksHigh} weeks if benching 1–2 times a week. Treat this as an order-of-magnitude guess, not a guarantee.`;
    } else if (est) {
      timelineText = est.confidence === "high"
        ? "Rough estimate: the next 4–8 focused bench exposures if recovery and execution stay consistent."
        : est.confidence === "medium"
          ? "Rough estimate: the next 6–12 focused bench exposures, with normal week-to-week variability."
          : "Timeline is uncertain from current data — likely measured in training blocks rather than individual sessions.";
    } else {
      timelineText = "Not enough progression data to give a specific timeline.";
    }

    const heavyLine = heavyAnchor
      ? `Heavy triples around ${heavyAnchor.weight}×${heavyAnchor.reps} should start to feel repeatable, not near-max every week.`
      : "Heavy triples at your current top weight should feel repeatable.";
    const volumeLine = volumeAnchor
      ? `Volume bench around ${volumeAnchor.weight}×${volumeAnchor.reps} should keep pace without hurting the next heavy session.`
      : "Volume bench should keep pace without hurting the next heavy session.";
    const markerLines = [
      readinessLines[0] ?? heavyLine,
      readinessLines[1] ?? volumeLine,
    ];

    if (asksProgressionPath) {
      const offTargetLine =
        gap != null
          ? gap <= 0
            ? `You’re already around target level on this read, so now it’s about confirming it on a good peak day.`
            : `You’re still roughly ${gap} ${u} off ${target} ${u}, which is close enough to plan in milestones rather than guessing a fixed date.`
          : `You’re on track, but the exact distance to target is still a little unclear from the current data.`;
      const currentPos =
        heavyAnchor && volumeAnchor
          ? `Right now your heavy bench is around ${heavyAnchor.weight}x${heavyAnchor.reps}, and your volume bench is around ${volumeAnchor.weight}x${volumeAnchor.reps}.`
          : heavyAnchor
            ? `Right now your heavy bench is around ${heavyAnchor.weight}x${heavyAnchor.reps}.`
            : volumeAnchor
              ? `Right now your volume bench is around ${volumeAnchor.weight}x${volumeAnchor.reps}.`
              : `Right now we only have partial benchmark data, so use the next 2-3 sessions to tighten the read.`;
      return `${offTargetLine}

${currentPos} ${estimateLine}

The progression path from here is simple: keep heavy work repeatable at low reps, keep one volume day moving, and look for steady bar-speed quality before chasing max attempts.

What would make ${target ?? "the target"} ${u} look realistic:
- ${markerLines[0]}
- ${markerLines[1]}

Next: ${cleanNextMove}${templateLine}`.trim();
    }

    return `${closenessLine} ${estimateLine}

Rough timeline: ${timelineText}

What to look for before ${target ?? "that target"} ${u ?? ""} looks realistic:
- ${markerLines[0]}
- ${markerLines[1]}

Next: ${cleanNextMove}${templateLine}`.trim();
  }

  return `${estimateLine}

${primaryEvidence}
${readinessLine ? `\n${readinessLine}` : ""}

Also from your logs: ${cleanSupportLine}

Next: ${cleanNextMove}${templateLine}`.trim();
}

function parseSetRangeMaxFromProgrammeText(setsText: string | undefined): number {
  if (!setsText) return 0;
  const nums =
    String(setsText)
      .match(/\d+/g)
      ?.map((n) => parseInt(n, 10))
      .filter(Number.isFinite) ?? [];
  if (!nums.length) return 0;
  return Math.max(...nums);
}

function detectMuscleFromQuestion(message: string): MuscleGroupId | null {
  const t = message.toLowerCase();
  if (/\bchest|pec/.test(t)) return "chest";
  if (/\b(back|lats?|upper back|mid back|rows?|pulldown|pull-up|pull up)\b/.test(t)) return "lats_upper_back";
  if (/\b(shoulder|delts?)\b/.test(t)) return "delts";
  if (/\bbiceps?\b/.test(t)) return "biceps";
  if (/\btriceps?\b/.test(t)) return "triceps";
  if (/\bquads?\b/.test(t)) return "quads";
  if (/\bhamstrings?\b/.test(t)) return "hamstrings";
  if (/\bglutes?\b/.test(t)) return "glutes";
  if (/\bcalves?\b/.test(t)) return "calves";
  if (/\b(abs|core|abdominals?)\b/.test(t)) return "abs_core";
  return null;
}

function isRoutineVolumeQuestion(message: string): boolean {
  const t = message.toLowerCase();
  const asksVolume =
    /\b(how many sets|weekly sets|sets per week|weekly volume|how much volume)\b/.test(t) ||
    (/\bsets?\b/.test(t) && /\bweek|weekly\b/.test(t));
  const referencesRoutine =
    /\b(this|that)\s+(routine|programme|program|plan|workout)\b/.test(t) ||
    /\byou\s+just\s+gave\s+me\b/.test(t) ||
    /\bfrom\s+the\s+(routine|programme|program|plan|workout)\b/.test(t) ||
    /\bfrom\s+the\s+routine\b/.test(t);
  return asksVolume || (referencesRoutine && /\bsets?\b/.test(t));
}

function tryBuildDeterministicRoutineVolumeReply(params: {
  message: string;
  activeProgramme: AssistantResponse["structuredProgramme"] | null | undefined;
}): string | null {
  const p = params.activeProgramme;
  if (!p?.days?.length) return null;
  if (!isRoutineVolumeQuestion(params.message)) return null;

  const direct: Record<MuscleGroupId, number> = Object.fromEntries(
    (Object.keys(MUSCLE_GROUP_RULES) as MuscleGroupId[]).map((k) => [k, 0])
  ) as Record<MuscleGroupId, number>;

  for (const day of p.days) {
    for (const row of day.exercises ?? []) {
      const meta = getExerciseByIdOrName(row.exerciseName);
      if (!meta) continue;
      const setCount = parseSetRangeMaxFromProgrammeText(row.sets);
      if (!setCount) continue;
      const stim = mapExerciseToMuscleStimulus(meta);
      for (const g of stim.direct) {
        direct[g] += setCount / Math.max(1, stim.direct.length);
      }
    }
  }

  const specific = detectMuscleFromQuestion(params.message);
  if (specific) {
    const n = Math.round(direct[specific] ?? 0);
    const name = MUSCLE_GROUP_RULES[specific].displayName;
    return `From the routine I just gave you, ${name} gets about ${n} direct set${n === 1 ? "" : "s"} per week.`;
  }

  const lines = (Object.keys(MUSCLE_GROUP_RULES) as MuscleGroupId[])
    .map((g) => `- ${MUSCLE_GROUP_RULES[g].displayName}: ~${Math.round(direct[g] ?? 0)} direct sets/week`)
    .join("\n");
  return `From the routine I just gave you, estimated weekly direct set volume is:\n${lines}`;
}

export async function POST(request: NextRequest) {
  try {
    const requestStartedAt = Date.now();
    const body = (await request.json()) as AssistantBody;
    const {
      message,
      trainingSummary,
      trainingFocus,
      experienceLevel,
      unit,
      priorityGoal,
      exerciseTrends,
      trainingInsights,
      priorityGoalExerciseInsight: rawPriorityGoalInsight,
      coachStructuredOutput: rawCoach,
      evidenceCards: rawEvidence,
      templatesSummary: rawTemplatesSummary,
      userProfile,
      coachingContext,
      assistantMemory,
      recentConversationMemory,
      thread_id,
      threadMessages,
      exactThreadLoaded,
      activeExerciseTopic,
      activeExerciseLastSession,
      benchProjection,
      benchContext,
      benchEstimate,
      activeProgrammeState: rawClientActiveProgramme,
    } = body;

    const templatesSummary =
      typeof rawTemplatesSummary === "string" ? rawTemplatesSummary : undefined;
    const templateDataAvailable = Boolean(templatesSummary?.trim());

    const coachStructuredOutput = isCoachStructuredOutput(rawCoach) ? rawCoach : undefined;
    const evidenceCards =
      coachStructuredOutput != null
        ? sanitizeEvidenceCards(rawEvidence).filter((c) =>
            referencedEvidenceIds(coachStructuredOutput).has(c.id)
          )
        : [];

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "message is required and must be a non-empty string." },
        { status: 400 }
      );
    }
    if (trainingSummary == null || typeof trainingSummary !== "object") {
      return NextResponse.json(
        { error: "trainingSummary is required." },
        { status: 400 }
      );
    }

    const trimmedMessage = message.trim();
    const forceDynamicProgrammeDebug = true;
    console.log("[programme-request-received]", {
      message: trimmedMessage,
      receivedAtMs: requestStartedAt,
      debugForceDynamicProgramme: forceDynamicProgrammeDebug,
    });
    console.log("[thread-debug] assistant request", {
      threadId: thread_id,
      exactThreadLoaded: Boolean(exactThreadLoaded),
      threadMessagesLength: Array.isArray(threadMessages) ? threadMessages.length : 0,
      recentConversationTurnsLength: Array.isArray(recentConversationMemory) ? recentConversationMemory.length : 0,
    });
    const explicitAnchor = detectExplicitEvidenceAnchor(trimmedMessage, activeExerciseTopic);
    const wantsBenchEstimateDebug =
      /\b(1rm|e1rm|one rep max|one-rep max|estimated 1rm|current 1rm)\b/i.test(trimmedMessage) &&
      /\bbench\b|bench press|barbell bench/i.test(trimmedMessage);
    const initialQuestionKind = classifyAssistantQuestionKind(trimmedMessage, {
      threadMessages: Array.isArray(threadMessages)
        ? (threadMessages as AssistantThreadTurn[])
        : undefined,
    });
    const strictIntentLock = computeStrictIntentLock(trimmedMessage);
    const questionKind = applyStrictIntentLock(initialQuestionKind, strictIntentLock);
    console.log("[assistant-question-kind]", {
      initialQuestionKind,
      lockedQuestionKind: questionKind,
      classifiedAtMs: Date.now(),
      elapsedMsFromReceive: Date.now() - requestStartedAt,
    });
    const latestStructuredProgramme = extractLatestStructuredProgramme(
      Array.isArray(threadMessages) ? (threadMessages as ThreadMessageWithStructured[]) : undefined
    );
    const programmeAdjustmentAsk = isProgrammeAdjustmentRequest(trimmedMessage);
    const programmeModificationIntent =
      Boolean(latestStructuredProgramme) && isProgrammeModificationIntent(trimmedMessage);
    const programmeModificationFlow =
      Boolean(latestStructuredProgramme) &&
      (programmeModificationIntent || programmeAdjustmentAsk);
    let clientActiveProgramme = isPipelineActiveProgrammeState(rawClientActiveProgramme)
      ? rawClientActiveProgramme
      : null;
    if (clientActiveProgramme && process.env.NODE_ENV === "development") {
      const p = clientActiveProgramme.programme;
      if (p.debugSource !== "new_programme_pipeline_v1" || !p.days?.length) {
        console.warn("[programme-cache-hit]", {
          action: "client_active_programme_state_rejected_non_v1",
          debugSource: p.debugSource ?? "missing",
          dayCount: p.days?.length ?? 0,
        });
        clientActiveProgramme = null;
      }
    }
    if (clientActiveProgramme) {
      console.log("[programmePipeline] active programme state loaded from client", {
        title: clientActiveProgramme.programme.programmeTitle,
        dayCount: clientActiveProgramme.programme.days.length,
        priorIntent: clientActiveProgramme.parsedRequest.intent,
      });
    }
    const mergedStructuredProgramme =
      clientActiveProgramme?.programme ?? latestStructuredProgramme ?? null;
    const pipelineIntent = classifyProgrammeIntent(trimmedMessage, {
      activeProgrammeState: clientActiveProgramme,
      hasThreadProgramme: Boolean(latestStructuredProgramme),
    });
    const parsedProgrammeRequest = parseProgrammeRequest({
      message: trimmedMessage,
      intent: pipelineIntent.intent,
    });
    if (latestStructuredProgramme) {
      console.log("[active-programme-loaded]", {
        programmeTitle: latestStructuredProgramme.programmeTitle,
        dayCount: latestStructuredProgramme.days.length,
        sessionTypesByDay: latestStructuredProgramme.days.map((d) => d.sessionType),
        summary: summarizeActiveProgrammeForLog(latestStructuredProgramme),
        mergedWithClient: Boolean(clientActiveProgramme?.programme),
      });
    } else {
      console.log("[active-programme-loaded]", {
        status: clientActiveProgramme ? "client_only" : "none_in_thread",
      });
    }
    console.log("[assistant-intent-lock]", {
      initialQuestionKind,
      lockedQuestionKind: questionKind,
      mode: strictIntentLock.mode,
      qualifiers: strictIntentLock.qualifiers,
      programmeModificationFlow,
      programmeModificationIntent,
      programmeAdjustmentAsk,
    });
    // Deterministic fast-paths are gated by freshly computed intent each turn.
    const deterministicByKind =
      tryAnswerTrainingKnowledgeQuestion({
        message: trimmedMessage,
        activeProgramme: mergedStructuredProgramme,
      }) ??
      tryBuildDeterministicRoutineVolumeReply({
        message: trimmedMessage,
        activeProgramme: mergedStructuredProgramme,
      }) ??
      ((questionKind === "coaching_recommendation" ||
        questionKind === "projection_estimate" ||
        questionKind === "exercise_question") &&
      /\bbench\b|bench press|barbell bench/i.test(trimmedMessage)
        ? tryBuildDeterministicBenchSessionPrescription({
            message: trimmedMessage,
            benchContext,
            explicitAnchor,
            payloadUnit: benchProjection?.payloadUnit,
          })
        : null) ??
      (questionKind === "memory_continuity"
        ? tryBuildDeterministicThreadReferenceReply({
            message: trimmedMessage,
            threadMessages,
            exactThreadLoaded,
          })
        : null) ??
      (questionKind === "exact_factual_recall"
        ? tryBuildDeterministicExerciseReply({
            message: trimmedMessage,
            activeExerciseLastSession,
          })
        : null) ??
      ((questionKind === "projection_estimate" || questionKind === "progression_readiness_path")
        ? tryBuildDeterministicBenchProjectionReply({
            message: trimmedMessage,
            benchProjection,
            explicitAnchor,
            benchContext,
            benchEstimate,
          })
        : null);
    if (deterministicByKind) {
      return NextResponse.json({ reply: deterministicByKind } satisfies AssistantResponse);
    }
    const explicitConstructionAsk = hasExplicitConstructionAsk(trimmedMessage);
    const parsed = parseContextFromMessage(trimmedMessage);
    const resolvedEquipment = resolveEquipmentForBuilder({
      parsed,
      userProfile,
      coachingContext,
    });
    const inferredExclusions = [
      ...(Array.isArray(userProfile?.injuries) ? userProfile!.injuries : []),
      ...(Array.isArray(coachingContext?.profile?.injuries) ? coachingContext!.profile!.injuries ?? [] : []),
      ...(parsed.injuryStatus === "present" ? ["injury", "pain"] : []),
    ];
    const recentExerciseIdsFromContext =
      coachingContext?.recentWorkouts?.flatMap((w) =>
        Array.isArray(w.exercises) ? w.exercises.map((e) => e.name || e.exerciseId || "") : []
      ) ?? [];
    const preferredExercisesFromContext = latestStructuredProgramme
      ? latestStructuredProgramme.days.flatMap((d) => d.exercises.map((ex) => ex.exerciseName))
      : Array.isArray(activeExerciseTopic) && activeExerciseTopic.length > 0
        ? activeExerciseTopic
        : activeExerciseTopic
          ? [activeExerciseTopic]
          : [];
    const requestedConstraints = parseRequestedExerciseConstraints(trimmedMessage);
    const requestedExerciseIds = requestedConstraints.exerciseIds;
    /** Only parsed exercise library ids are mandatory; phrasing like "includes" alone must not enable empty-id enforcement. */
    const constraintHard = requestedExerciseIds.length > 0;
    console.log("[programme-constraint-mode]", {
      requestedExerciseIds,
      parserHardRequirementPhrasing: requestedConstraints.hardRequirement,
      constraintHard,
    });
    const mergedPreferredExercises = Array.from(
      new Set([...requestedExerciseIds, ...preferredExercisesFromContext])
    );
    const splitTypeDetected = splitTypeFromMessage(trimmedMessage);
    const programmeLikeRequested =
      questionKind === "multi_day_programme_construction" ||
      (questionKind === "template_review" && isProgrammeBuildRequest(trimmedMessage)) ||
      explicitConstructionAsk ||
      programmeModificationFlow;
    console.log("[programme-template-path-hit]", {
      hit: false,
      reason: "No static template return path allowed for programme requests.",
      elapsedMsFromReceive: Date.now() - requestStartedAt,
    });
    console.log("[programme-cache-hit]", {
      hit: false,
      where: "assistant_route",
      reason: "No server-side programme cache; each POST builds or streams fresh.",
      elapsedMsFromReceive: Date.now() - requestStartedAt,
    });
    const recoveryModeForProgramme: RecoveryMode =
      parsedProgrammeRequest.fatigueMode === "low_fatigue" ||
      /\b(low fatigue|recovery|deload|easy)\b/i.test(trimmedMessage)
        ? "low_fatigue"
        : "normal";

    const skipStructuredForPipelineCompareOrExplain =
      pipelineIntent.intent === "programme_compare" || pipelineIntent.intent === "programme_explain";

    const pipelineWantsProgrammeModify =
      pipelineIntent.intent === "programme_modify" && Boolean(mergedStructuredProgramme);

    const pipelineWantsProgrammeBuild =
      pipelineIntent.intent === "programme_build" &&
      (explicitConstructionAsk ||
        questionKind === "multi_day_programme_construction" ||
        isProgrammeBuildRequest(trimmedMessage));

    const legacyEnterStructuredProgrammePath =
      (questionKind === "multi_day_programme_construction" ||
        (questionKind === "template_review" && isProgrammeBuildRequest(trimmedMessage)) ||
        programmeModificationFlow) &&
      (explicitConstructionAsk ||
        programmeModificationFlow ||
        questionKind === "multi_day_programme_construction");

    const enterStructuredProgrammePath =
      !skipStructuredForPipelineCompareOrExplain &&
      (pipelineWantsProgrammeModify ||
        pipelineWantsProgrammeBuild ||
        legacyEnterStructuredProgrammePath);

    const programmeModificationUnified =
      pipelineWantsProgrammeModify || programmeModificationFlow;

    const activeForModify: PipelineActiveProgrammeState | null =
      clientActiveProgramme ??
      (mergedStructuredProgramme
        ? {
            programme: mergedStructuredProgramme,
            parsedRequest: { intent: "programme_build", splitType: "general" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null);

    const programmeBuildUserMessage =
      programmeModificationUnified && activeForModify
        ? composeModificationUserMessage(activeForModify, parsedProgrammeRequest, trimmedMessage)
        : trimmedMessage;

    let progParsed: ParsedProgrammeRequest = parsedProgrammeRequest;
    let progExclusions = inferredExclusions;
    let progRequestedIds = requestedExerciseIds;
    let progMergedPreferred = mergedPreferredExercises;
    let programmeLlmConstraints: ProgrammeConstraintsLLMOutput | null = null;

    if (enterStructuredProgrammePath && process.env.OPENAI_API_KEY?.trim()) {
      try {
        const llmOut = await extractProgrammeConstraintsLLM({
          userMessage: programmeBuildUserMessage,
          apiKey: process.env.OPENAI_API_KEY.trim(),
        });
        if (llmOut) {
          programmeLlmConstraints = llmOut;
          const merged = mergeLLMIntoProgrammeBuildState({
            parsed: progParsed,
            llm: llmOut,
            baseRequestedIds: requestedExerciseIds,
            baseExclusions: inferredExclusions,
            userMessage: programmeBuildUserMessage,
          });
          progParsed = merged.parsed;
          progExclusions = merged.exclusions;
          progRequestedIds = merged.requestedIds;
          progMergedPreferred = Array.from(
            new Set([...progRequestedIds, ...preferredExercisesFromContext])
          );
          console.log("[programme-llm-constraints]", {
            includeExerciseIds: llmOut.includeExerciseIds,
            excludeExerciseIds: llmOut.excludeExerciseIds,
            uniformPerMuscleExerciseCount: llmOut.uniformPerMuscleExerciseCount,
            splitTypeHint: llmOut.splitTypeHint,
            recoveryOrFatigueHint: llmOut.recoveryOrFatigueHint,
            briefRationale: llmOut.briefRationale,
            mergedRequestedIds: progRequestedIds,
            mergedExcludedIds: progParsed.excludedExercises ?? [],
          });
        }
      } catch (e) {
        console.warn("[programme-llm-constraints] extraction failed", e);
      }
    }

    if (enterStructuredProgrammePath) {
      const expandedExcludedIds = expandExcludedExerciseIds(progParsed.excludedExercises ?? []);
      if (expandedExcludedIds.length > 0) {
        progParsed = { ...progParsed, excludedExercises: expandedExcludedIds };
        progRequestedIds = progRequestedIds.filter((id) => !expandedExcludedIds.includes(id));
        progExclusions = [
          ...new Set([...progExclusions, ...exclusionStringsForExerciseIds(expandedExcludedIds)]),
        ];
        progMergedPreferred = Array.from(
          new Set([...progRequestedIds, ...preferredExercisesFromContext])
        );
        console.log("[programme-exclusion-expansion]", {
          expandedExcludedIds,
          requestedAfterExpansion: progRequestedIds,
        });
      }
    }

    const resolvedSplitForBuild = programmeModificationUnified
      ? null
      : resolveSplitDefinitionForRequest(
          enterStructuredProgrammePath ? progParsed : parsedProgrammeRequest,
          enterStructuredProgrammePath ? programmeBuildUserMessage : trimmedMessage
        );

    const forcedSplitDefinition = programmeModificationUnified
      ? undefined
      : resolvedSplitForBuild ?? undefined;

    if (resolvedSplitForBuild && !programmeModificationUnified) {
      console.log("[programmePipeline] resolved split for dynamic builder", {
        title: resolvedSplitForBuild.title,
        source: resolvedSplitForBuild.source,
        dayCount: resolvedSplitForBuild.days.length,
      });
    }

    console.log("[assistant-programme-routing]", {
      detectedIntent: questionKind,
      pipelineIntent: pipelineIntent.intent,
      explicitConstructionAsk,
      programmeModificationFlow,
      programmeModificationUnified,
      programmeModificationIntent,
      programmeAdjustmentAsk,
      pipelineWantsProgrammeModify,
      pipelineWantsProgrammeBuild,
      skipStructuredForPipelineCompareOrExplain,
      hasLatestStructuredProgramme: Boolean(latestStructuredProgramme),
      hasClientActiveProgramme: Boolean(clientActiveProgramme),
      enterStructuredProgrammePath,
      splitTypeDetected,
      requestedExerciseConstraints: requestedExerciseIds,
      programmeLlmConstraintsApplied: Boolean(programmeLlmConstraints),
      flow: programmeLikeRequested ? "programme" : "non-programme",
      cannedTemplateBypassed: true,
    });
    if (questionKind === "single_session_construction" && explicitConstructionAsk) {
      const sessionType = inferSessionTypeFromContext({
        message: trimmedMessage,
        coachingContext,
      });
      const built = buildWorkoutWithQualityPasses({
        sessionType,
        goal: inferWorkoutBuilderGoal(trimmedMessage, priorityGoal),
        equipmentAvailable: resolvedEquipment,
        injuriesOrExclusions: inferredExclusions,
        recentTrainingContext: {
          recentExerciseIds: recentExerciseIdsFromContext,
        },
        preferredExercises: mergedPreferredExercises,
        requestedExerciseIds,
        userMessage: trimmedMessage,
        recoveryMode: /\b(low fatigue|recovery|deload|easy)\b/i.test(trimmedMessage)
          ? ("low_fatigue" as RecoveryMode)
          : ("normal" as RecoveryMode),
      });
      if (!built.exercises.length) {
        const fallbackStructured = {
          sessionTitle: `${sessionType.replace("_", " ")} workout`,
          sessionGoal: "Structured fallback after generator issue",
          purposeSummary: "Could not fully build this session from current constraints.",
          exercises: [],
          note: "I couldn't generate exercises with current constraints. Try adding equipment or removing exclusions.",
        };
        return NextResponse.json({
          reply: "I couldn't generate this session from the current constraints.",
          structuredWorkout: fallbackStructured,
        } satisfies AssistantResponse);
      }
      return NextResponse.json({
        reply: renderBuiltWorkoutReply(built),
        structuredWorkout: toStructuredWorkout(built),
      } satisfies AssistantResponse);
    }
    if (enterStructuredProgrammePath) {
      const programmeDebugRequestId = randomUUID();
      const constraintHardStructured = progRequestedIds.length > 0;
      const recoveryModeForStructured: RecoveryMode =
        progParsed.fatigueMode === "low_fatigue" ||
        /\b(low fatigue|recovery|deload|easy)\b/i.test(trimmedMessage)
          ? "low_fatigue"
          : "normal";
      console.log("[programme-build-path-entered]", {
        reason: programmeModificationUnified ? "modification_or_adjustment" : "initial_or_multi_day",
        dynamicBuilder: true,
        questionKind,
        programmePipelineModify: pipelineWantsProgrammeModify,
        programmeDebugRequestId,
      });
      console.log("[assistant-programme-constraints]", {
        detectedIntent: questionKind,
        splitTypeDetected,
        parsedRequestedExerciseConstraints: requestedExerciseIds,
        mergedRequestedExerciseIds: progRequestedIds,
        mergedExcludedExerciseIds: progParsed.excludedExercises ?? [],
        normalizedRequestedExercises: progRequestedIds.map((id) => ({
          id,
          canonicalName: getExerciseByIdOrName(id)?.name ?? id,
        })),
        hardRequirementParser: constraintHard,
        hardRequirementEffective: constraintHardStructured,
        parserHardRequirementPhrasing: requestedConstraints.hardRequirement,
        builderInput: {
          message: programmeBuildUserMessage,
          priorityGoal: priorityGoal ?? undefined,
          recoveryMode: recoveryModeForStructured,
          equipmentAvailable: resolvedEquipment,
          injuriesOrExclusions: progExclusions,
          recentExerciseIds: recentExerciseIdsFromContext.slice(0, 12),
          preferredExercises: progMergedPreferred,
          requestedExerciseIdsPassedToBuilder: progRequestedIds,
        },
      });
      const builderStartedAt = Date.now();
      console.log("[dynamic-builder-called]", {
        function: "buildStructuredProgramme",
        splitTypeDetected,
        startedAtMs: builderStartedAt,
        elapsedMsFromReceive: builderStartedAt - requestStartedAt,
        forcedSplit: Boolean(forcedSplitDefinition),
      });
      if (programmeModificationUnified) {
        console.log("[programme-modify-called]", {
          hasClientState: Boolean(clientActiveProgramme),
          hasThreadProgramme: Boolean(latestStructuredProgramme),
        });
      }
      let programme: NonNullable<AssistantResponse["structuredProgramme"]> | null = null;
      let llmProgrammeBuilt = false;
      if (process.env.OPENAI_API_KEY?.trim()) {
        const llmPlan1 = await extractProgrammeStructureLLM({
          userMessage: programmeBuildUserMessage,
          apiKey: process.env.OPENAI_API_KEY.trim(),
          requestedExerciseIds: progRequestedIds,
          excludedExerciseIds: progParsed.excludedExercises ?? [],
        });
        if (llmPlan1) {
          const built1 = buildProgrammeFromLLMPlan({
            plan: llmPlan1,
            message: programmeBuildUserMessage,
            programmeTitleHint: forcedSplitDefinition?.title,
            requestedExerciseIds: progRequestedIds,
            excludedExerciseIds: progParsed.excludedExercises ?? [],
          });
          console.log("[programme-llm-structure-attempt]", {
            attempt: 1,
            receivedDays: llmPlan1.days.length,
            valid: Boolean(built1.programme),
            issues: built1.issues,
          });
          if (built1.programme) {
            programme = built1.programme;
            llmProgrammeBuilt = true;
          } else {
            const llmPlan2 = await extractProgrammeStructureLLM({
              userMessage: programmeBuildUserMessage,
              apiKey: process.env.OPENAI_API_KEY.trim(),
              requestedExerciseIds: progRequestedIds,
              excludedExerciseIds: progParsed.excludedExercises ?? [],
              retryIssues: built1.issues,
            });
            if (llmPlan2) {
              const built2 = buildProgrammeFromLLMPlan({
                plan: llmPlan2,
                message: programmeBuildUserMessage,
                programmeTitleHint: forcedSplitDefinition?.title,
                requestedExerciseIds: progRequestedIds,
                excludedExerciseIds: progParsed.excludedExercises ?? [],
              });
              console.log("[programme-llm-structure-attempt]", {
                attempt: 2,
                receivedDays: llmPlan2.days.length,
                valid: Boolean(built2.programme),
                issues: built2.issues,
              });
              if (built2.programme) {
                programme = built2.programme;
                llmProgrammeBuilt = true;
              }
            }
          }
        }
      }
      if (!programme) {
        programme = buildStructuredProgramme(
        {
          message: programmeBuildUserMessage,
          priorityGoal: priorityGoal ?? undefined,
          recoveryMode: recoveryModeForStructured,
          equipmentAvailable: resolvedEquipment,
          injuriesOrExclusions: progExclusions,
          recentExerciseIds: recentExerciseIdsFromContext,
          preferredExercises: progMergedPreferred,
          requestedExerciseIds: progRequestedIds,
          programmeModification: programmeModificationUnified,
          activeProgramme: mergedStructuredProgramme,
          forcedSplitDefinition,
          debugRequestId: programmeDebugRequestId,
        },
        progParsed
        );
      }
      const excludedIdsForValidation = progParsed.excludedExercises ?? [];
      if (programme && excludedIdsForValidation.length > 0) {
        const violations = findExcludedExercisesPresentInProgramme(programme, excludedIdsForValidation);
        if (violations.length > 0) {
          const strongerExcl = [
            ...new Set([...progExclusions, ...exclusionStringsForExerciseIds(violations)]),
          ];
          const repaired = buildStructuredProgramme(
            {
              message: `${programmeBuildUserMessage} Do not include these exercises under any circumstance: ${violations.join(", ")}.`,
              priorityGoal: priorityGoal ?? undefined,
              recoveryMode: recoveryModeForStructured,
              equipmentAvailable: resolvedEquipment,
              injuriesOrExclusions: strongerExcl,
              recentExerciseIds: recentExerciseIdsFromContext,
              preferredExercises: progMergedPreferred,
              requestedExerciseIds: progRequestedIds,
              programmeModification: programmeModificationUnified,
              activeProgramme: mergedStructuredProgramme,
              forcedSplitDefinition,
              debugRequestId: programmeDebugRequestId,
            },
            progParsed
          );
          if (repaired) {
            programme = repaired;
            llmProgrammeBuilt = false;
            console.log("[programme-excluded-repair]", {
              programmeDebugRequestId,
              violations,
              rebuilt: true,
            });
          } else {
            console.warn("[programme-excluded-repair] rebuild returned null", {
              programmeDebugRequestId,
              violations,
            });
          }
        }
      }
      console.log("[dynamic-builder-finished]", {
        function: "buildStructuredProgramme_or_hybrid_v2",
        returnedProgramme: Boolean(programme),
        llmProgrammeBuilt,
        durationMs: Date.now() - builderStartedAt,
        elapsedMsFromReceive: Date.now() - requestStartedAt,
      });
      if (programme) {
        const preValidation = requestedExercisePresentInProgramme(programme, progRequestedIds);
        const needsHardRebuildPass = constraintHardStructured && preValidation.missingIds.length > 0;
        let rebuiltProgramme: NonNullable<AssistantResponse["structuredProgramme"]> | null = null;
        if (needsHardRebuildPass) {
          console.log("[programme-request-validation]", {
            requestedExerciseIds: progRequestedIds,
            finalExercisesPresent: preValidation.presentIds,
            missingRequestedExercises: preValidation.missingIds,
            rebuildTriggered: true,
            reason: "Hard requested exercises missing after first build pass.",
          });
          rebuiltProgramme = buildStructuredProgramme(
            {
              message: `${programmeBuildUserMessage} must include ${progRequestedIds.join(" ")}`,
              priorityGoal: priorityGoal ?? undefined,
              recoveryMode: recoveryModeForStructured,
              equipmentAvailable: resolvedEquipment,
              injuriesOrExclusions: progExclusions,
              recentExerciseIds: recentExerciseIdsFromContext,
              preferredExercises: progRequestedIds,
              requestedExerciseIds: progRequestedIds,
              programmeModification: programmeModificationUnified,
              activeProgramme: mergedStructuredProgramme,
              forcedSplitDefinition,
              debugRequestId: programmeDebugRequestId,
            },
            progParsed
          );
        }
        const preEnforcementProgramme = rebuiltProgramme ?? programme;
        const preEnforcementValidation = requestedExercisePresentInProgramme(
          preEnforcementProgramme,
          progRequestedIds
        );
        const afterEnforcement = constraintHardStructured
          ? enforceRequestedExercisesInProgramme(
              preEnforcementProgramme,
              progRequestedIds,
              splitTypeDetected,
              progParsed.excludedExercises ?? []
            )
          : preEnforcementProgramme;
        const requestValidation = requestedExercisePresentInProgramme(afterEnforcement, progRequestedIds);
        let structuredProgramme = afterEnforcement;

        const pipelineValidation1 = validateProgrammeAgainstRequest(
          structuredProgramme,
          progParsed,
          progRequestedIds,
          constraintHardStructured
        );
        if (!pipelineValidation1.ok && !programmeModificationUnified) {
          console.log("[programme-request-validation]", {
            pass: 1,
            fallback: "rebuilding_once",
            issues: pipelineValidation1.allIssues,
          });
          const retry = buildStructuredProgramme(
            {
              message: `${programmeBuildUserMessage} [auto-fix: ${pipelineValidation1.allIssues.join("; ")}]`,
              priorityGoal: priorityGoal ?? undefined,
              recoveryMode: recoveryModeForStructured,
              equipmentAvailable: resolvedEquipment,
              injuriesOrExclusions: progExclusions,
              recentExerciseIds: recentExerciseIdsFromContext,
              preferredExercises: progMergedPreferred,
              requestedExerciseIds: progRequestedIds,
              programmeModification: programmeModificationUnified,
              activeProgramme: mergedStructuredProgramme,
              forcedSplitDefinition,
              debugRequestId: programmeDebugRequestId,
            },
            progParsed
          );
          if (retry) {
            structuredProgramme = constraintHardStructured
              ? enforceRequestedExercisesInProgramme(
                  retry,
                  progRequestedIds,
                  splitTypeDetected,
                  progParsed.excludedExercises ?? []
                )
              : retry;
            const pipelineValidation2 = validateProgrammeAgainstRequest(
              structuredProgramme,
              progParsed,
              progRequestedIds,
              constraintHardStructured
            );
            if (!pipelineValidation2.ok) {
              console.log("[programme-request-validation]", {
                pass: 2,
                ok: false,
                issues: pipelineValidation2.allIssues,
              });
              return NextResponse.json({
                reply: `I could not satisfy this programme request reliably: ${pipelineValidation2.allIssues.join(
                  "; "
                )}. Try narrowing equipment, split, or requested exercises.`,
                programmeConstraintFailure: constraintHardStructured,
              } satisfies AssistantResponse);
            }
          } else {
            console.log("[programmePipeline] validation rebuild returned null; aborting structured response");
            return NextResponse.json({
              reply: `I could not satisfy this programme request after validation: ${pipelineValidation1.allIssues.join(
                "; "
              )}.`,
              programmeConstraintFailure: constraintHardStructured,
            } satisfies AssistantResponse);
          }
        }

        const requestedExerciseTrace = progRequestedIds.map((id) => {
          const ex = getExerciseByIdOrName(id);
          const exName = ex?.name ?? id;
          const match = structuredProgramme.days.flatMap((d) =>
            d.exercises
              .filter((e) => exerciseNameSatisfiesRequestedId(e.exerciseName, id))
              .map((e) => ({
                dayLabel: d.dayLabel,
                slotLabel: e.slotLabel,
                rationale: e.rationale,
                placedInSlot: e.slotLabel !== "Requested exercise",
                injectedFallback: e.slotLabel === "Requested exercise",
              }))
          );
          return {
            requestedExerciseId: id,
            requestedExerciseName: exName,
            matches: match,
          };
        });
        const fallbackInjectionUsed =
          preEnforcementValidation.missingIds.length > 0 && requestValidation.presentIds.length > 0;
        const requestedSlotMatches = requestedExerciseTrace.flatMap((entry) =>
          entry.matches.map((m) => ({
            requestedExerciseId: entry.requestedExerciseId,
            requestedExerciseName: entry.requestedExerciseName,
            dayLabel: m.dayLabel,
            slotLabel: m.slotLabel,
            placedInSlot: m.placedInSlot,
            injectedFallback: m.injectedFallback,
          }))
        );
        const pushDay = structuredProgramme.days.find(
          (d) => d.sessionType.toLowerCase() === "push" || /\bpush\b/i.test(d.dayLabel)
        );
        console.log("[programme-request-trace]", {
          userMessage: trimmedMessage,
          programmeBuildUserMessage,
          parsedProgrammeRequestBeforeMerge: parsedProgrammeRequest,
          effectiveParsedProgrammeRequest: progParsed,
          parseRequestedExerciseConstraints: {
            exerciseIds: requestedExerciseIds,
            hardRequirementPhrasing: requestedConstraints.hardRequirement,
            constraintHardParser: constraintHard,
            constraintHardEffective: constraintHardStructured,
          },
          normalizedRequestedExercises: progRequestedIds.map((id) => ({
            id,
            resolvedInMetadata: Boolean(getExerciseByIdOrName(id)),
            canonicalName: getExerciseByIdOrName(id)?.name ?? null,
          })),
          splitTypeDetected,
          pushDaySlotMatching: pushDay
            ? {
                dayLabel: pushDay.dayLabel,
                sessionType: pushDay.sessionType,
                targetMuscles: pushDay.targetMuscles ?? null,
                exerciseNames: pushDay.exercises.map((e) => e.exerciseName),
              }
            : null,
          allDaysExercises: structuredProgramme.days.map((d) => ({
            dayLabel: d.dayLabel,
            sessionType: d.sessionType,
            exerciseNames: d.exercises.map((e) => e.exerciseName),
          })),
        });
        console.log("[assistant-programme-output]", {
          requestType: programmeModificationUnified ? "programme_modification_rebuild" : "programme_construction",
          splitTypeDetected,
          builderCalled: true,
          selectedExercisesByDay: structuredProgramme.days.map((d) => ({
            dayLabel: d.dayLabel,
            exercises: d.exercises.map((e) => e.exerciseName),
          })),
          requestedExerciseTrace,
          requestedSlotMatches,
          preValidationMissingRequested: preEnforcementValidation.missingIds,
          requestedExercisesPresent: requestValidation.presentIds,
          requestedExercisesMissing: requestValidation.missingIds,
          rebuildTriggered: needsHardRebuildPass,
          fallbackInjectionUsed,
          structuredProgrammeReturned: true,
          cannedTemplateBypassed: true,
        });
        console.log("[programme-request-validation]", {
          requestedExerciseIds: progRequestedIds,
          finalExercisesPresent: requestValidation.presentIds,
          missingRequestedExercises: requestValidation.missingIds,
          rebuildTriggered: needsHardRebuildPass,
          finalValidationPassed:
            !constraintHardStructured || requestValidation.missingIds.length === 0,
        });
        if (constraintHardStructured && requestValidation.missingIds.length > 0) {
          const missingNames = requestValidation.missingIds
            .map((id) => getExerciseByIdOrName(id)?.name ?? id)
            .join(", ");
          const pushPreview = structuredProgramme.days.find(
            (d) => d.sessionType.toLowerCase() === "push" || /\bpush\b/i.test(d.dayLabel)
          );
          console.error("[programme-constraint-failure]", {
            reason: "requested_exercise_missing_from_final_output",
            requestedExerciseIds: progRequestedIds,
            missingIds: requestValidation.missingIds,
            presentIds: requestValidation.presentIds,
            constraintHardStructured,
            parserHardRequirementPhrasing: requestedConstraints.hardRequirement,
            pushDayExerciseNames: pushPreview?.exercises.map((e) => e.exerciseName) ?? null,
            programmeDebugRequestId,
          });
          const devBanner =
            process.env.NODE_ENV === "development"
              ? "DEV: Requested exercise constraint failed — programme card withheld.\n\n"
              : "";
          return NextResponse.json({
            reply: `${devBanner}This routine could not be finalized because these requested exercises are still missing from the programme: ${missingNames}. Check server logs for [programme-request-trace] and [programme-constraint-failure].`,
            programmeConstraintFailure: true,
          } satisfies AssistantResponse);
        }
        const excludedStillPresent = findExcludedExercisesPresentInProgramme(
          structuredProgramme,
          progParsed.excludedExercises ?? []
        );
        if (excludedStillPresent.length > 0) {
          const avoidNames = excludedStillPresent
            .map((id) => getExerciseByIdOrName(id)?.name ?? id)
            .join(", ");
          console.error("[programme-excluded-violation]", {
            programmeDebugRequestId,
            excludedStillPresent,
            avoidNames,
          });
          return NextResponse.json({
            reply: `This routine still includes exercises you asked to avoid: ${avoidNames}. Try rephrasing or narrowing the request.`,
            programmeConstraintFailure: true,
          } satisfies AssistantResponse);
        }

        const activeState = buildPipelineActiveProgrammeState(
          structuredProgramme,
          progParsed,
          clientActiveProgramme
        );
        console.log("[programme-rendered]", {
          success: true,
          debugSource: structuredProgramme.debugSource ?? "unknown",
          dayCount: structuredProgramme.days.length,
          programmeTitle: structuredProgramme.programmeTitle,
        });
        console.log("[active-programme-state-stored]", activeState);
        return NextResponse.json({
          reply: renderStructuredProgrammeText(structuredProgramme),
          structuredProgramme,
          activeProgrammeState: activeState,
        } satisfies AssistantResponse);
      }
      console.log("[template-fallback-hit]", {
        path: "assistant_route_structured_path_empty_programme",
        reason: "buildStructuredProgramme returned null",
      });
      console.error("[old-programme-path-hit]", {
        path: "template_fallback",
        reason: "buildStructuredProgramme_returned_null",
        programmeDebugRequestId,
      });
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          reply:
            "DEV BLOCKED: Programme builder returned null; template fallback is disabled. See server logs for [old-programme-path-hit] and [programme-build-path-entered].",
        } satisfies AssistantResponse);
      }
      const fallbackProgramme: NonNullable<AssistantResponse["structuredProgramme"]> = {
        programmeTitle: "Programme builder unavailable",
        programmeGoal: "Structured fallback",
        notes: "I couldn't generate a full programme from current constraints. Try specifying split and available equipment.",
        debugSource: "template_fallback",
        days: [],
      };
      console.log("[assistant-programme-output]", {
        requestType: programmeModificationUnified ? "programme_modification_rebuild" : "programme_construction",
        splitTypeDetected,
        builderCalled: true,
        structuredProgrammeReturned: true,
        cannedTemplateBypassed: true,
        fallback: true,
      });
      console.log("[programme-rendered]", {
        success: false,
        fallback: true,
        debugSource: fallbackProgramme.debugSource ?? "unknown",
        dayCount: fallbackProgramme.days.length,
      });
      return NextResponse.json({
        reply: "I couldn't generate a full programme from current constraints.",
        structuredProgramme: fallbackProgramme,
        activeProgrammeState: buildPipelineActiveProgrammeState(
          fallbackProgramme,
          progParsed,
          clientActiveProgramme
        ),
      } satisfies AssistantResponse);
    }
    const priorAssistantTurnContent =
      questionKind === "prior_answer_correction"
        ? extractPriorAssistantTurnForCorrection(threadMessages)
        : null;
    const intent = mapQuestionKindToLegacyIntent(questionKind) as AssistantIntent;
    console.log("[assistant-anchor]", {
      explicitAnchor: explicitAnchor?.id ?? null,
      label: explicitAnchor?.label ?? null,
      primaryHeavyFromContext: benchContext?.latestHeavyBenchSession
        ? `${benchContext.latestHeavyBenchSession.bestSet.weight}x${benchContext.latestHeavyBenchSession.bestSet.reps}`
        : null,
      primaryVolumeFromContext: benchContext?.latestVolumeBenchSession
        ? `${benchContext.latestVolumeBenchSession.bestSet.weight}x${benchContext.latestVolumeBenchSession.bestSet.reps}`
        : null,
    });
    if (wantsBenchEstimateDebug) {
      console.log("[assistant-bench-debug] context payload", {
        message: trimmedMessage,
        explicitAnchor: explicitAnchor?.id ?? null,
        benchContext,
        benchProjectionInputs: benchProjection
          ? {
              benchExerciseName: benchProjection.benchExerciseName,
              payloadUnit: benchProjection.payloadUnit,
              authoritativeEstimated1RM: benchProjection.authoritativeEstimated1RM,
              heavyAnchor: benchProjection.heavyAnchor ?? null,
              volumeAnchor: benchProjection.volumeAnchor ?? null,
              recentBestSets: benchProjection.recentBestSets,
              progressionDeltaKgPerSession: benchProjection.progressionDeltaKgPerSession,
            }
          : null,
        benchEstimate,
      });
    }
    const hasWorkoutData =
      (Number(trainingSummary.totalWorkouts) || 0) > 0 ||
      (Number(trainingSummary.totalSets) || 0) > 0;
    const hasCoachAnalysis = coachStructuredOutput != null;
    const hardAnalysisPhrases = [
      "how is my training",
      "how is my training looking",
      "how is this week",
      "how am i doing",
      "how are my workouts",
      "thoughts on my training",
      "thoughts on my volume",
      "overall volume",
    ];
    const hardAnalysisMatch =
      hasWorkoutData &&
      hardAnalysisPhrases.some((phrase) =>
        trimmedMessage.toLowerCase().includes(phrase)
      );
    const modeDetection = detectAssistantModeWithReason({
      message: trimmedMessage,
      hasWorkoutData,
      hasCoachAnalysis,
    });
    const parsedContext = parseContextFromMessage(trimmedMessage);
    const minimumContextPresent = hasMinimumViableContext(parsedContext);
    const seemsProgramRequest =
      /\b(split|program|plan|routine|training plan|workout plan|how should i train|what should i do)\b/.test(
        trimmedMessage.toLowerCase()
      );
    const shouldForceAdvisory =
      !hasWorkoutData && (minimumContextPresent || seemsProgramRequest);
    let mode: AssistantMode = hardAnalysisMatch
      ? "analysis"
      : shouldForceAdvisory
        ? "advisory"
        : modeDetection.mode;
    const analysisPreferredKinds: AssistantQuestionKind[] = [
      "session_review",
      "single_session_construction",
      "multi_day_programme_construction",
      "split_comparison_or_recommendation",
      "split_explanation_education",
      "prior_answer_correction",
      "exact_factual_recall",
      "exercise_progression",
      "progression_readiness_path",
      "projection_estimate",
      "volume_balance",
      "coaching_recommendation",
      "memory_continuity",
    ];
    if (intent === "session_review" || analysisPreferredKinds.includes(questionKind)) {
      mode = "analysis";
    }
    console.log("[assistant] intent:", intent, "questionKind:", questionKind, "templateDataAvailable:", templateDataAvailable);
    console.log("[assistant mode]", mode);
    console.log("[assistant mode check]", {
      message: trimmedMessage,
      detectedMode: mode,
      hasWorkoutData,
    });
    console.log("[assistant mode detail]", {
      mode,
      reason: modeDetection.reason,
      hasWorkoutData,
      minimumContextPresent,
      shouldForceAdvisory,
    });
    if (hardAnalysisMatch) {
      console.log("[assistant mode override]", {
        message: trimmedMessage,
        override: "analysis",
        reason: "hard_analysis_phrase_match_with_workout_data",
      });
    }

    const recentDigest = formatRecentWorkoutsDigest(
      coachingContext && typeof coachingContext === "object" && "recentWorkouts" in coachingContext
        ? (coachingContext as { recentWorkouts?: unknown }).recentWorkouts
        : undefined
    );
    const loggedDataPreamble = buildLoggedTrainingPreamble({
      hasWorkoutData,
      totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
      recentDigest: recentDigest.text,
      recentCount: recentDigest.count,
      coachingContext,
    });

    console.log("[assistant-context-debug]", {
      hasWorkoutData,
      totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
      recentWorkoutsDigestCount: recentDigest.count,
      priorityGoalIncluded: Boolean(priorityGoal),
      userProfileIncluded: Boolean(userProfile),
      coachingContextIncluded: Boolean(coachingContext),
      inferredIncluded: Boolean(
        coachingContext &&
          typeof coachingContext === "object" &&
          "inferred" in coachingContext &&
          (coachingContext as { inferred?: unknown }).inferred
      ),
      coachReviewBriefIncluded: Boolean(
        coachingContext &&
          typeof coachingContext === "object" &&
          "coachReviewBrief" in coachingContext &&
          (coachingContext as { coachReviewBrief?: unknown }).coachReviewBrief
      ),
      trainingInsightsIncluded: Boolean(trainingInsights),
      exerciseTrendsCount: Array.isArray(exerciseTrends) ? exerciseTrends.length : 0,
      coachStructuredIncluded: Boolean(coachStructuredOutput),
      intent,
      questionKind,
      mode,
    });

    const priorityGoalExerciseInsight =
      rawPriorityGoalInsight != null &&
      typeof rawPriorityGoalInsight === "object" &&
      typeof (rawPriorityGoalInsight as { exercise?: unknown }).exercise === "string"
        ? (rawPriorityGoalInsight as NonNullable<AssistantBody["priorityGoalExerciseInsight"]>)
        : undefined;

    console.log("[assistant-debug] payload RIR fields:", {
      averageRIR: trainingInsights?.averageRIR,
      recentHighEffortExercises: trainingInsights?.recentHighEffortExercises,
      priorityGoalExerciseRir: priorityGoalExerciseInsight && {
        exercise: priorityGoalExerciseInsight.exercise,
        avgRIR: priorityGoalExerciseInsight.avgRIR,
        latestSessionAvgRIR: priorityGoalExerciseInsight.latestSessionAvgRIR,
        latestSessionAllSetsToFailure: priorityGoalExerciseInsight.latestSessionAllSetsToFailure,
      },
    });

    if (
      latestStructuredProgramme &&
      isProgrammeModificationIntent(trimmedMessage) &&
      !enterStructuredProgrammePath
    ) {
      console.warn("[programme-pipeline-plain-prose-fallback]", {
        reason:
          "Active structured programme + modification-like message did not enter structured builder — check intent classification or explicitConstructionAsk gate.",
        questionKind,
        explicitConstructionAsk,
        enterStructuredProgrammePath,
        messagePreview: trimmedMessage.slice(0, 120),
      });
    }

    const reply = await getAssistantReply(
      loggedDataPreamble,
      trimmedMessage,
      intent,
      questionKind,
      mode,
      templateDataAvailable,
      templatesSummary,
      {
        totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
        totalExercises: Number(trainingSummary.totalExercises) || 0,
        totalSets: Number(trainingSummary.totalSets) || 0,
        weeklyVolume: trainingSummary.weeklyVolume ?? {},
        recentExercises: Array.isArray(trainingSummary.recentExercises)
          ? trainingSummary.recentExercises
          : [],
      },
      { trainingFocus, experienceLevel, unit, priorityGoal },
      userProfile,
      assistantMemory,
      recentConversationMemory,
      exactThreadLoaded,
      activeExerciseTopic,
      activeExerciseLastSession,
      benchProjection,
      benchContext,
      benchEstimate,
      coachingContext,
      mergedStructuredProgramme,
      exerciseTrends ?? [],
      trainingInsights,
      priorityGoalExerciseInsight,
      coachStructuredOutput,
      evidenceCards,
      priorAssistantTurnContent,
      explicitAnchor
    );

    return NextResponse.json({ reply } satisfies AssistantResponse);
  } catch (err) {
    console.error("Assistant route error:", err);
  
    const message = err instanceof Error ? err.message : "Invalid request.";
    const status =
      message.includes("OPENAI") || message.includes("Empty response") ? 500 : 400;
  
    return NextResponse.json({ error: message }, { status });
  }
}
