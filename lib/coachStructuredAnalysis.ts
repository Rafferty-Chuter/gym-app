import {
  getWorkoutHistory,
  getTrainingInsights,
  getExerciseInsights,
  computeAvgRIRForCoachDecisions,
  getMuscleGroupForExercise,
  detectExerciseSignals,
  detectVolumeSignals,
  detectFrequencySignals,
  scoreTrainingSignals,
  buildSignalInteractions,
  type TrainingInteraction,
  type TrainingSignal,
  type TrainingInsights,
  type ExerciseInsights,
} from "@/lib/trainingAnalysis";
import { resolveLoggedExerciseMeta } from "@/lib/exerciseLibrary";
import {
  decideNextActions,
  inferTrainingStyle,
  type CoachDecision,
  type DecisionContext,
} from "@/lib/trainingDecisions";
import {
  buildPrescription,
  prescriptionToText,
  type Prescription,
} from "@/lib/trainingPrescriptions";
import { detectLimitingSupportMuscle } from "@/lib/goalSupportProfiles";
import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { PriorityGoal } from "@/lib/priorityGoal";
import { getStoredUserProfile } from "@/lib/userProfile";
import {
  getEvidenceCardIdsForDecision,
  getEvidenceCardIdsForInteraction,
  getEvidenceCardIdsForRecommendation,
  getEvidenceCardIdsForSignal,
} from "@/lib/evidenceMapping";
import {
  generateNextSessionAdjustments,
  type NextSessionAdjustmentPlan,
} from "@/lib/nextSessionAdjustments";
import { getSuggestedExercisesForCoarseGroup, plainCoachNameForCoarseGroup } from "@/lib/coachMusclePools";

export type CoachStructuredAnalysis = {
  keyFocus: string | null;
  keyFocusType: "plateau" | "declining" | "low-volume" | "progressing" | "none";
  keyFocusExercise?: string;
  keyFocusGroups?: string[];
  /** Evidence card ids aligned to `keyFocus` (from signal id when present). */
  keyFocusEvidenceCardIds: string[];
  whatsGoingWell: string[];
  /** One entry per `whatsGoingWell` line, from the source signal id. */
  whatsGoingWellEvidenceCardIds: string[][];
  volumeBalance: {
    label: string;
    summary: string;
  }[];
  actionableSuggestions: string[];
  /** One entry per `actionableSuggestions` line (same order). */
  actionableSuggestionEvidenceCardIds: string[][];
  /** Next-session adjustment plan from decisions; omitted when no workout data pipeline ran. */
  nextSessionAdjustmentPlan?: NextSessionAdjustmentPlan | null;
};

type Recommendation = {
  id: string;
  type:
    | "increase_sets"
    | "reduce_sets"
    | "add_frequency"
    | "swap_exercise"
    | "progress_exercise"
    | "keep_current_plan";
  target: string;
  reason: string;
  urgency: "low" | "medium" | "high";
  confidence: 1 | 2 | 3 | 4 | 5;
};

function confidenceLevel(confidence: 1 | 2 | 3 | 4 | 5): "low" | "medium" | "high" {
  if (confidence <= 2) return "low";
  if (confidence === 3) return "medium";
  return "high";
}

function softenForConfidence(text: string, level: "low" | "medium" | "high"): string {
  const t = text.trim();
  if (level === "high") return t;
  return `Early signal: ${t}`;
}

export const EMPTY_COACH_STRUCTURED_ANALYSIS: CoachStructuredAnalysis = {
  keyFocus: null,
  keyFocusType: "none",
  keyFocusEvidenceCardIds: [],
  whatsGoingWell: [],
  whatsGoingWellEvidenceCardIds: [],
  volumeBalance: [],
  actionableSuggestions: [],
  actionableSuggestionEvidenceCardIds: [],
};

function matchesGoalExercise(exerciseNameLower: string, goal: PriorityGoal): boolean {
  const hasAny = (keywords: string[]) => keywords.some((k) => exerciseNameLower.includes(k));

  if (goal === "Build Overall Muscle") return true;

  if (goal === "Increase Bench Press" || goal === "Build Chest") {
    return hasAny(["bench", "bench press", "incline", "chest press", "fly"]);
  }
  if (goal === "Increase Squat") {
    return hasAny(["squat", "front squat", "back squat"]);
  }
  if (goal === "Increase Deadlift") {
    return hasAny(["deadlift", "dead lift", "rdl"]);
  }
  if (goal === "Build Back") {
    return hasAny(["row", "pulldown", "pull up", "pull-up", "lat"]);
  }

  return hasAny(["bench", "bench press", "squat", "deadlift", "dead lift"]);
}

function goalPrimaryExercise(goal: PriorityGoal): string | undefined {
  if (goal === "Increase Bench Press") return "Bench Press";
  if (goal === "Increase Squat") return "Squat";
  if (goal === "Increase Deadlift") return "Deadlift";
  return undefined;
}

function isLiftSpecificGoal(goal: PriorityGoal): boolean {
  return (
    goal === "Increase Bench Press" ||
    goal === "Increase Squat" ||
    goal === "Increase Deadlift"
  );
}

function rankForKeyFocus(signal: TrainingSignal): number {
  const statusRank =
    signal.status === "high_priority" ? 4 : signal.status === "warning" ? 3 : signal.status === "neutral" ? 2 : 1;
  return signal.priorityScore * 10 + statusRank;
}

function selectKeyFocusSignal(
  signals: TrainingSignal[],
  goal: PriorityGoal
): TrainingSignal | null {
  const sorted = [...signals].sort((a, b) => rankForKeyFocus(b) - rankForKeyFocus(a));
  const primary = sorted.filter((s) => s.goalRelevanceClass === "primary");
  if (primary.length > 0) return primary[0];

  const supportive = sorted.filter((s) => s.goalRelevanceClass === "supportive");
  if (supportive.length > 0) return supportive[0];

  if (isLiftSpecificGoal(goal)) {
    const targetExercise = goalPrimaryExercise(goal) ?? "Goal lift";
    return {
      id: `insufficient-goal-data-${targetExercise.toLowerCase().replace(/\s+/g, "-")}`,
      category: "performance",
      status: "neutral",
      severity: 2,
      confidence: 2,
      confidenceLevel: "low",
      goalRelevanceClass: "primary",
      goalRelevance: 5,
      priorityScore: 20,
      title: `${targetExercise}: need a bit more logged work`,
      explanation: `Log ${targetExercise.toLowerCase()} 1–2 more times before we read the trend with confidence.`,
      target: { exercise: targetExercise },
      evidence: ["goal_specific_data=insufficient", "recent_exposure=low"],
      recommendationIds: [`fix-${targetExercise.toLowerCase().replace(/\s+/g, "-")}-goal-exposure-low`],
    };
  }

  const general = sorted.filter((s) => s.goalRelevanceClass === "general");
  if (general.length > 0) return general[0];

  return sorted[0] ?? null;
}

function recommendationFromSignal(signal: TrainingSignal): Recommendation {
  const ex = signal.target?.exercise;
  const mg = signal.target?.muscleGroup;
  const urgency: Recommendation["urgency"] =
    signal.status === "high_priority" ? "high" : signal.severity >= 4 ? "high" : signal.severity >= 3 ? "medium" : "low";

  if (signal.id.includes("-effort-high") && ex) {
    return {
      id: `rec-${signal.id}`,
      type: "reduce_sets",
      target: ex,
      reason: signal.explanation,
      urgency: "medium",
      confidence: signal.confidence,
    };
  }

  if ((signal.id.includes("-decline") || signal.category === "fatigue") && ex) {
    return {
      id: `rec-${signal.id}`,
      type: "swap_exercise",
      target: ex,
      reason: signal.explanation,
      urgency,
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("-plateau") && ex) {
    return {
      id: `rec-${signal.id}`,
      type: "progress_exercise",
      target: ex,
      reason: signal.explanation,
      urgency,
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("-progressing") && ex) {
    return {
      id: `rec-${signal.id}`,
      type: "keep_current_plan",
      target: ex,
      reason: signal.explanation,
      urgency: "low",
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("volume-low") && mg) {
    return {
      id: `rec-${signal.id}`,
      type: "increase_sets",
      target: mg,
      reason: signal.explanation,
      urgency,
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("volume-high") && mg) {
    return {
      id: `rec-${signal.id}`,
      type: "reduce_sets",
      target: mg,
      reason: signal.explanation,
      urgency,
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("frequency-low")) {
    return {
      id: `rec-${signal.id}`,
      type: "add_frequency",
      target: "weekly training frequency",
      reason: signal.explanation,
      urgency,
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("-goal-exposure-low") && ex) {
    return {
      id: `rec-${signal.id}`,
      type: "add_frequency",
      target: ex,
      reason: signal.explanation,
      urgency: "high",
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("-frequency-low") && ex) {
    return {
      id: `rec-${signal.id}`,
      type: "add_frequency",
      target: ex,
      reason: signal.explanation,
      urgency,
      confidence: signal.confidence,
    };
  }
  if (signal.id.includes("interaction")) {
    return {
      id: `rec-${signal.id}`,
      type: "add_frequency",
      target: ex ?? "goal lift",
      reason: signal.explanation,
      urgency: "high",
      confidence: signal.confidence,
    };
  }
  return {
    id: `rec-${signal.id}`,
    type: "keep_current_plan",
    target: signal.target?.exercise ?? signal.target?.muscleGroup ?? "current plan",
    reason: signal.explanation,
    urgency: "low",
    confidence: signal.confidence,
  };
}

function interactionRecommendationToText(
  interaction: TrainingInteraction,
  goalExercise: string | undefined
): string[] {
  if (interaction.id.includes("goal-data-insufficient")) {
    const target = goalExercise ?? "goal lift";
    return [
      `What to do next: schedule ${target} 1–2× per week for the next two weeks.`,
      `Why it matters: steady exposure makes progression and adjustments much easier to read.`,
    ];
  }
  if (interaction.id.includes("support-gap")) {
    const slug = interaction.id.replace("interaction-progress-support-gap-", "");
    const progressingEx = slug
      .split("-")
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ");
    const weak = interaction.weakMuscleGroup ?? "back";
    const area = plainCoachNameForCoarseGroup(weak);
    const examples = getSuggestedExercisesForCoarseGroup(weak).slice(0, 3);
    const examplePhrase =
      examples.length >= 2
        ? `${examples[0]}, ${examples[1]}, or similar`
        : examples.length === 1
          ? examples[0]
          : `${area} exercises you tolerate well`;
    return [
      `Main issue: ${area} weekly work is behind while ${progressingEx} is improving. Why it matters: that imbalance often shows up as slower progress or a stall on ${progressingEx}. What to do next: add 3–4 quality ${area} sets next session (${examplePhrase}). How hard: leave 1–2 reps in reserve on most of the new sets unless you already know you recover fast.`,
    ];
  }
  return [];
}

function recommendationToText(rec: Recommendation, unit: "kg" | "lb"): string {
  const loadIncrement = unit === "kg" ? "2.5kg" : "5lb";
  const targetTitle =
    rec.target.length > 1 ? rec.target[0].toUpperCase() + rec.target.slice(1) : rec.target;

  if (rec.type === "increase_sets") {
    const area = plainCoachNameForCoarseGroup(rec.target);
    const hints = getSuggestedExercisesForCoarseGroup(rec.target).slice(0, 2);
    const hintText = hints.length >= 2 ? ` (e.g. ${hints[0]}, ${hints[1]})` : hints.length === 1 ? ` (e.g. ${hints[0]})` : "";
    return softenForConfidence(
      `This area needs more weekly sets. Next session, add 3–4 focused sets for ${area}${hintText}.`,
      confidenceLevel(rec.confidence)
    );
  }
  if (rec.type === "reduce_sets") {
    return softenForConfidence(
      `${targetTitle}: trim 2–4 sets next week to keep recovery on track.`,
      confidenceLevel(rec.confidence)
    );
  }
  if (rec.type === "add_frequency") {
    if (rec.target !== "weekly training frequency") {
      return softenForConfidence(
        `${targetTitle}: increase exposure to 1-2 sessions per week so trends are easier to assess.`,
        confidenceLevel(rec.confidence)
      );
    }
    return softenForConfidence(
      "Next week: aim for 2+ sessions so progression signals stay clear.",
      confidenceLevel(rec.confidence)
    );
  }
  if (rec.type === "swap_exercise") {
    return softenForConfidence(
      `${targetTitle}: run one lighter session or use a stable variation, then rebuild load with clean reps.`,
      confidenceLevel(rec.confidence)
    );
  }
  if (rec.type === "progress_exercise") {
    return softenForConfidence(
      `${targetTitle}: hold load and target +1 rep, or add +${loadIncrement} if reps stay stable.`,
      confidenceLevel(rec.confidence)
    );
  }
  return softenForConfidence(
    `${targetTitle}: keep current plan and continue small progression steps.`,
    confidenceLevel(rec.confidence)
  );
}

function isGoalRelevantRecommendationSignal(
  signal: TrainingSignal,
  goal: PriorityGoal
): boolean {
  if (signal.goalRelevanceClass === "primary" || signal.goalRelevanceClass === "supportive") {
    return true;
  }
  if (!isLiftSpecificGoal(goal)) return true;
  return false;
}

function interactionToKeyFocusType(i: TrainingInteraction): CoachStructuredAnalysis["keyFocusType"] {
  if (i.id.includes("goal-data-insufficient")) return "none";
  if (i.id.includes("support-gap")) return "low-volume";
  return "none";
}

function normalizeExerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getUniqueExerciseNamesFromWorkouts(
  workouts: ReturnType<typeof getWorkoutHistory>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of workouts ?? []) {
    for (const ex of w.exercises ?? []) {
      const label = ex.name?.trim();
      if (!label) continue;
      const key = normalizeExerciseKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

const RECENT_WORKOUTS_FOR_EXERCISE_LIST = 5;
const SUPPORT_EXERCISE_LOOKBACK_WORKOUTS = 10;

/**
 * Exercise names from the most recent sessions (newest first), de-duplicated by normalized name.
 * Used for next-session adjustment copy (e.g. row vs pulldown hints).
 */
function recentExerciseNamesFromWorkouts(
  workouts: ReturnType<typeof getWorkoutHistory>
): string[] {
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of sorted.slice(0, RECENT_WORKOUTS_FOR_EXERCISE_LIST)) {
    for (const ex of w.exercises ?? []) {
      const label = ex.name?.trim();
      if (!label) continue;
      const key = normalizeExerciseKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

function getRecentExercisesByMuscleGroup(
  workouts: ReturnType<typeof getWorkoutHistory>
): Record<string, string[]> {
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const out: Record<string, string[]> = {
    chest: [],
    back: [],
    shoulders: [],
    arms: [],
    legs: [],
  };
  const seen: Record<string, Set<string>> = {
    chest: new Set<string>(),
    back: new Set<string>(),
    shoulders: new Set<string>(),
    arms: new Set<string>(),
    legs: new Set<string>(),
  };
  const consideredWorkouts = sorted.slice(0, SUPPORT_EXERCISE_LOOKBACK_WORKOUTS);
  console.log(
    "[coach structured analysis] support extraction workouts considered",
    consideredWorkouts.map((w) => ({
      completedAt: w.completedAt,
      exercises: (w.exercises ?? []).map((e) => e.name),
    }))
  );

  const classifyGroup = (exerciseName: string): keyof typeof out | undefined => {
    const name = exerciseName.trim().toLowerCase();
    const fromMetrics = getMuscleGroupForExercise(exerciseName);
    if (fromMetrics && fromMetrics in out) return fromMetrics as keyof typeof out;

    // Broader fallback matching for common support movements.
    if (
      name.includes("row") ||
      name.includes("t-bar") ||
      name.includes("pulldown") ||
      name.includes("pull-up") ||
      name.includes("pull up") ||
      name.includes("pullup") ||
      name.includes("lat")
    ) {
      return "back";
    }
    return undefined;
  };

  for (const w of consideredWorkouts) {
    for (const ex of w.exercises ?? []) {
      const label = ex.name?.trim();
      if (!label) continue;
      const resolvedMeta = resolveLoggedExerciseMeta({
        exerciseId: ex.exerciseId,
        name: label,
      });
      console.log("[coach structured analysis] resolved metadata", {
        exerciseName: label,
        exerciseId: ex.exerciseId ?? null,
        resolvedExerciseId: resolvedMeta?.id ?? null,
      });
      const group = classifyGroup(label);
      console.log("[coach structured analysis] support extraction exercise group", {
        exercise: label,
        group: group ?? null,
      });
      if (!group || !(group in out)) continue;
      const key = normalizeExerciseKey(label);
      if (seen[group].has(key)) continue;
      seen[group].add(key);
      out[group].push(label);
    }
  }
  console.log("[coach structured analysis] support extraction final by-group", out);
  return out;
}

function supportGroupFromInteraction(
  interaction: TrainingInteraction | undefined,
  signals: TrainingSignal[]
): string | undefined {
  if (!interaction) return undefined;
  for (const id of interaction.signals ?? []) {
    const s = signals.find((sig) => sig.id === id);
    if (s?.category === "volume" && s.target?.muscleGroup) return s.target.muscleGroup;
  }
  return undefined;
}

function exerciseFromSupportGapInteraction(
  interaction: TrainingInteraction | undefined
): string | undefined {
  if (!interaction?.id?.includes("interaction-progress-support-gap-")) return undefined;
  const slug = interaction.id.replace("interaction-progress-support-gap-", "");
  if (!slug) return undefined;
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export type BuildCoachStructuredAnalysisParams = {
  focus: TrainingFocus;
  experienceLevel: ExperienceLevel;
  goal: PriorityGoal;
  unit: "kg" | "lb";
};

const MIN_WORKOUTS_FOR_NON_LIFT_DECISION_CONTEXT = 3;

/** Mean weekly sets per muscle group (last 7d) where volume > 0; undefined if none. */
function averageWeeklySetsPerMuscle(weekly: Record<string, number>): number | undefined {
  const vals = Object.values(weekly).filter((n) => typeof n === "number" && n > 0);
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function mapFatigueRiskFromSignals(
  avgRIR: number | undefined,
  goalLiftProgress: DecisionContext["goalLiftProgress"]
): DecisionContext["fatigueRisk"] {
  if (avgRIR === undefined || !Number.isFinite(avgRIR)) return undefined;
  if (avgRIR <= 0.5 && goalLiftProgress === "declining") return "high";
  if (avgRIR <= 0.5) return "moderate";
  return "low";
}

function mapFrequencyStatusForDecisions(
  insights: TrainingInsights,
  signals: TrainingSignal[]
): DecisionContext["frequencyStatus"] {
  if (signals.some((s) => s.id === "frequency-low-last7days")) return "low";
  const f = insights.frequency;
  if (f <= 1) return "low";
  if (f >= 5) return "high";
  return "adequate";
}

function mapGoalLiftProgressForDecisions(
  trend: ExerciseInsights["trend"] | undefined
): DecisionContext["goalLiftProgress"] {
  if (!trend || trend === "insufficient_data") return undefined;
  return trend;
}

function mapGoalLiftExposureForDecisions(
  insight: ExerciseInsights | undefined
): DecisionContext["goalLiftExposure"] {
  if (!insight) return undefined;
  if (insight.exposuresLast7Days < 2) return "low";
  if (insight.averageExposuresPerWeekLast4Weeks >= 2 || insight.exposuresLast7Days >= 3) return "high";
  return "adequate";
}

function estimatedWeeklySetsForExercise(
  workouts: ReturnType<typeof getWorkoutHistory>,
  exerciseName?: string
): number | undefined {
  if (!exerciseName) return undefined;
  const nowMs = Date.now();
  const cutoffMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const key = exerciseName.trim().toLowerCase().replace(/\s+/g, " ");
  let total = 0;
  for (const w of workouts ?? []) {
    const wMs = new Date(w.completedAt).getTime();
    if (!Number.isFinite(wMs) || wMs < cutoffMs) continue;
    for (const ex of w.exercises ?? []) {
      const exKey = ex.name?.trim().toLowerCase().replace(/\s+/g, " ");
      if (!exKey || exKey !== key) continue;
      total += ex.sets?.length ?? 0;
    }
  }
  return total > 0 ? total : undefined;
}

function decisionToText(
  decision: CoachDecision,
  context: DecisionContext,
  _unit: "kg" | "lb"
): string {
  const ex = context.keyFocusExercise;
  const sg = context.supportGroup;
  const area = plainCoachNameForCoarseGroup(sg ?? "back");
  const hints = getSuggestedExercisesForCoarseGroup(sg).slice(0, 2);
  const hintPhrase =
    hints.length >= 2 ? `${hints[0]} or ${hints[1]}` : hints.length === 1 ? hints[0] : `${area} work`;
  switch (decision.type) {
    case "increase_support_volume":
      return ex
        ? `Main issue: ${area} weekly volume is still low while ${ex} is moving. Why it matters: without enough ${area} work, ${ex} often slows down. What to do next: add 3–4 ${area} sets next session (${hintPhrase}). How hard: keep most added sets around 1–2 reps shy of failure.`
        : `Main issue: ${area} weekly volume looks low relative to your goal. What to do next: add 3–4 ${area} sets this week (${hintPhrase}).`;
    case "increase_goal_lift_exposure":
      return ex
        ? `${ex} is not getting enough specific exposure. Increase it to 1–2 sessions per week to drive further adaptation.`
        : `Your goal lift is not getting enough specific exposure. Increase it to 1–2 sessions per week to drive further adaptation.`;
    case "reduce_fatigue":
      return ex
        ? `${ex} is being pushed very hard right now — most recent sets are very close to failure. Ease off one notch so recovery can keep up.`
        : `Effort is very high across recent sets. Leave a rep or two in reserve on some work so fatigue doesn’t stack.`;
    case "maintain_current_plan":
      return ex
        ? `${ex} is progressing well. Keep the current plan and continue small progression steps.`
        : `Current training is working well. Keep the plan and continue small progression steps.`;
    case "gather_more_data":
      return ex
        ? `Log 1–2 more ${ex} sessions before making a bigger adjustment — we need a clearer read first.`
        : `Log 1–2 more sessions before making a bigger adjustment — the trend needs another data point or two.`;
    default: {
      const _exhaustive: never = decision.type;
      return _exhaustive;
    }
  }
}

/**
 * Same deterministic pipeline as the Coach screen “Analyze” action (signals, key focus, suggestions, evidence ids).
 */
export function buildCoachStructuredAnalysis(
  allWorkouts: ReturnType<typeof getWorkoutHistory>,
  params: BuildCoachStructuredAnalysisParams
): CoachStructuredAnalysis {
  if (allWorkouts.length === 0) {
    return { ...EMPTY_COACH_STRUCTURED_ANALYSIS };
  }

  const { focus, experienceLevel, goal, unit } = params;
  const insights = getTrainingInsights(allWorkouts);
  const supportGapResult = detectLimitingSupportMuscle({
    goal: String(goal),
    volumeByMuscle: insights.weeklyVolume,
  });
  console.log("[coach structured analysis] supportGapResult", supportGapResult);
  const exerciseNames = getUniqueExerciseNamesFromWorkouts(allWorkouts);
  const allExerciseInsights = exerciseNames
    .map((name) => getExerciseInsights(allWorkouts, name, { maxSessions: 5 }))
    .filter((i) => i.sessionsTracked > 0);
  const goalInsights: TrainingInsights = {
    ...insights,
    exerciseInsights: allExerciseInsights,
  };
  const userProfile = getStoredUserProfile(focus, experienceLevel, goal);
  const minPlateauExposures = 4;
  const minDeclineExposures = 3;
  const minNegativeStepsForDecline = 2;

  const rawSignals = [
    ...detectExerciseSignals(allWorkouts, {
      maxSessions: 5,
      goalExerciseName: goalPrimaryExercise(goal),
      minPlateauExposures,
      minDeclineExposures,
      minNegativeStepsForDecline,
    }),
    ...detectVolumeSignals(allWorkouts),
    ...detectFrequencySignals(allWorkouts),
  ];
  const scoredSignals = scoreTrainingSignals(rawSignals, focus, userProfile);
  const interactions = buildSignalInteractions(scoredSignals, userProfile, insights.weeklyVolume);

  const topInteraction = interactions[0];
  const keyFocusSignal = topInteraction ? null : selectKeyFocusSignal(scoredSignals, goal);
  const keyFocusConfidence = topInteraction
    ? topInteraction.confidenceLevel
    : keyFocusSignal
      ? confidenceLevel(keyFocusSignal.confidence)
      : "high";
  const keyFocusType: CoachStructuredAnalysis["keyFocusType"] = topInteraction
    ? interactionToKeyFocusType(topInteraction)
    : keyFocusSignal?.category === "fatigue" || keyFocusSignal?.id.includes("-decline")
      ? "declining"
      : keyFocusSignal?.id.includes("-plateau")
        ? "plateau"
        : keyFocusSignal?.id.includes("volume-low")
          ? "low-volume"
          : keyFocusSignal?.status === "positive"
            ? "progressing"
            : "none";

  const keyFocus = {
    text: keyFocusSignal
      ? softenForConfidence(
          [`${keyFocusSignal.title}.`, keyFocusSignal.explanation]
            .filter((s) => s && String(s).trim())
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
          keyFocusConfidence
        )
      : topInteraction
        ? softenForConfidence(
            [
              `${topInteraction.title}.`,
              topInteraction.id.includes("support-gap") && supportGapResult.rationale
                ? supportGapResult.rationale
                : topInteraction.implication,
            ]
              .filter((s) => s && String(s).trim())
              .join(" ")
              .replace(/\s+/g, " ")
              .trim(),
            keyFocusConfidence
          )
        : null,
    type: keyFocusType,
    exercise:
      keyFocusSignal?.target?.exercise ??
      goalPrimaryExercise(goal) ??
      exerciseFromSupportGapInteraction(topInteraction),
    groups: keyFocusSignal?.target?.muscleGroup
      ? [keyFocusSignal.target.muscleGroup[0].toUpperCase() + keyFocusSignal.target.muscleGroup.slice(1)]
      : undefined,
  };

  const whatsGoingWellWithEvidence = scoredSignals
    .filter((s) => s.status === "positive")
    .slice(0, 2)
    .map((s) => {
      const evidenceCardIds = getEvidenceCardIdsForSignal(s.id);
      const cLevel = confidenceLevel(s.confidence);
      if (s.target?.exercise) {
        const exInsight = goalInsights.exerciseInsights.find(
          (i) => i.exercise.toLowerCase() === s.target?.exercise?.toLowerCase()
        );
        const first = exInsight?.recentPerformances[0];
        const last = exInsight?.recentPerformances[exInsight.recentPerformances.length - 1];
        if (first && last) {
          const deltaW = last.weight - first.weight;
          const deltaR = last.reps - first.reps;
          const bits: string[] = [];
          if (deltaW > 0) bits.push(`+${deltaW}${unit}`);
          if (deltaR > 0) bits.push(`+${deltaR} rep${deltaR === 1 ? "" : "s"}`);
          const text = bits.length
            ? softenForConfidence(
                `${s.target.exercise} is progressing (${bits.join(", ")} over ${exInsight?.sessionsTracked ?? 0} sessions).`,
                cLevel
              )
            : softenForConfidence(`${s.title}.`, cLevel);
          return { text, evidenceCardIds };
        }
      }
      return { text: softenForConfidence(s.title, cLevel), evidenceCardIds };
    });

  const volumeBalance = scoredSignals
    .filter((s) => s.category === "volume" || s.category === "balance")
    .slice(0, 4)
    .map((s) => ({
      label: s.target?.muscleGroup
        ? `${s.target.muscleGroup[0].toUpperCase()}${s.target.muscleGroup.slice(1)}`
        : s.title,
      summary: softenForConfidence(s.explanation, confidenceLevel(s.confidence)),
    }));

  const topPrioritySignals = scoredSignals.slice(0, 6);
  const goalRelevantTopSignals = topPrioritySignals.filter((s) =>
    isGoalRelevantRecommendationSignal(s, goal)
  );
  const sourceSignals =
    goalRelevantTopSignals.length > 0 ? goalRelevantTopSignals : topPrioritySignals;

  const structuredRecommendations = sourceSignals.map((s) => recommendationFromSignal(s));
  const interactionRecommendations = topInteraction
    ? interactionRecommendationToText(topInteraction, goalPrimaryExercise(goal))
    : [];

  const hasInsufficientGoalData =
    isLiftSpecificGoal(goal) && Boolean(keyFocusSignal?.id?.includes("insufficient-goal-data"));
  const goalExercise = goalPrimaryExercise(goal);
  const dataGatheringRecommendation: Recommendation | null =
    hasInsufficientGoalData && goalExercise
      ? {
          id: `rec-gather-${goalExercise.toLowerCase().replace(/\s+/g, "-")}-data`,
          type: "add_frequency",
          target: goalExercise,
          reason: "Not enough recent goal-specific exposures to assess progress confidently.",
          urgency: "high",
          confidence: 5,
        }
      : null;

  const orderedRecommendations = dataGatheringRecommendation
    ? [dataGatheringRecommendation, ...structuredRecommendations]
    : structuredRecommendations;
  const seenRec = new Set<string>();
  const filteredStructuredRecs = orderedRecommendations
    .filter((r) => {
      const targetLower = r.target.toLowerCase();
      const injuryConflict = (userProfile.injuries ?? []).some((inj) =>
        targetLower.includes(inj.toLowerCase())
      );
      if (injuryConflict) return false;
      if (
        r.type === "add_frequency" &&
        userProfile.trainingDaysAvailable <= insights.frequency
      ) {
        return false;
      }
      return true;
    })
    .filter((r) => {
      const key = `${r.type}:${r.target}`;
      if (seenRec.has(key)) return false;
      seenRec.add(key);
      return true;
    });
  const interactionEvidenceCardIds = topInteraction
    ? getEvidenceCardIdsForInteraction(topInteraction.id)
    : [];

  const suggestionSlots = [
    ...interactionRecommendations.map((text) => ({
      text,
      evidenceCardIds: interactionEvidenceCardIds,
    })),
    ...filteredStructuredRecs.map((r) => {
      const byId = getEvidenceCardIdsForRecommendation(r.id);
      const evidenceCardIds =
        byId.length > 0 ? byId : getEvidenceCardIdsForRecommendation(r.type);
      return {
        text: recommendationToText(r, unit),
        evidenceCardIds,
      };
    }),
  ].slice(0, 2);

  const keyFocusEvidenceCardIds = keyFocusSignal
    ? getEvidenceCardIdsForSignal(keyFocusSignal.id)
    : topInteraction
      ? getEvidenceCardIdsForInteraction(topInteraction.id)
      : [];

  const goalExerciseInsight = goalExercise
    ? goalInsights.exerciseInsights.find(
        (i) => i.exercise.toLowerCase() === goalExercise.toLowerCase()
      )
    : undefined;

  const avgRIR = computeAvgRIRForCoachDecisions(allWorkouts, goalExercise);
  const goalLiftProgress = mapGoalLiftProgressForDecisions(goalExerciseInsight?.trend);
  const setsPerMuscleAvg = averageWeeklySetsPerMuscle(insights.weeklyVolume);
  const trainingStyle = inferTrainingStyle(avgRIR, setsPerMuscleAvg);

  /** Prefer the weak area from the active support-gap interaction so copy + exercise picks match. */
  const resolvedSupportGroupForCoach =
    topInteraction?.id.includes("support-gap") && topInteraction.weakMuscleGroup
      ? topInteraction.weakMuscleGroup
      : supportGapResult.limitingMuscle ??
        supportGroupFromInteraction(topInteraction, scoredSignals);

  const decisionContext: DecisionContext = {
    goal,
    experienceLevel,
    hasEnoughData:
      !hasInsufficientGoalData &&
      (isLiftSpecificGoal(goal) ? true : allWorkouts.length >= MIN_WORKOUTS_FOR_NON_LIFT_DECISION_CONTEXT),
    fatigueRisk: mapFatigueRiskFromSignals(avgRIR, goalLiftProgress),
    frequencyStatus: mapFrequencyStatusForDecisions(insights, scoredSignals),
    supportGap: Boolean(topInteraction?.id.includes("support-gap")),
    ...(resolvedSupportGroupForCoach ? { supportGroup: resolvedSupportGroupForCoach } : {}),
    goalLiftProgress,
    goalLiftExposure: mapGoalLiftExposureForDecisions(goalExerciseInsight),
    currentWeeklySets: estimatedWeeklySetsForExercise(
      allWorkouts,
      keyFocus.exercise ?? goalExercise
    ),
    ...(keyFocus.type !== "none" ? { keyFocusType: keyFocus.type } : {}),
    ...(keyFocus.exercise ? { keyFocusExercise: keyFocus.exercise } : {}),
    ...(avgRIR !== undefined ? { avgRIR } : {}),
    ...(trainingStyle ? { trainingStyle } : {}),
  };
  console.log("[coach structured analysis] decisionContext", decisionContext);

  const coachDecisions = decideNextActions(decisionContext);
  console.log("[coach structured analysis] coachDecisions", coachDecisions);

  if (
    !isLiftSpecificGoal(goal) &&
    decisionContext.supportGap === true &&
    decisionContext.keyFocusType === "low-volume"
  ) {
    console.log(
      "[coach structured analysis] coachDecisions (broad goal + support gap / low-volume)",
      coachDecisions
    );
  }

  const recentExercises = recentExerciseNamesFromWorkouts(allWorkouts);
  const recentExercisesByGroup = getRecentExercisesByMuscleGroup(allWorkouts);
  const supportGroup = resolvedSupportGroupForCoach;
  const supportExercises = supportGroup ? recentExercisesByGroup[supportGroup] ?? [] : [];
  const supportGroupWeeklySets =
    supportGroup && supportGroup in insights.weeklyVolume
      ? insights.weeklyVolume[supportGroup]
      : undefined;
  console.log("[coach structured analysis] keyFocusExercise", decisionContext.keyFocusExercise);
  console.log("[coach structured analysis] supportGroup", supportGroup);
  console.log("[coach structured analysis] supportExercises", supportExercises);
  console.log("[coach structured analysis] supportGroupWeeklySets", supportGroupWeeklySets);

  const decisionBasedSuggestions = coachDecisions.map((d) => {
    try {
      const prescription: Prescription = buildPrescription({
        decision: d,
        context: decisionContext,
        unit,
      });
      console.log("[coach structured analysis] prescription", { decisionId: d.id, prescription });
      const text = prescriptionToText(
        d,
        prescription,
        decisionContext,
        recentExercises,
        supportExercises,
        supportGroup,
        supportGroupWeeklySets
      );
      console.log("[coach structured analysis] final prescription text", {
        decisionId: d.id,
        text,
      });
      if (typeof text === "string" && text.trim()) return text;
      return decisionToText(d, decisionContext, unit);
    } catch (err) {
      console.warn("[coach structured analysis] prescription generation failed", err);
      return decisionToText(d, decisionContext, unit);
    }
  });
  console.log("[coach structured analysis] decisionBasedSuggestions", decisionBasedSuggestions);

  const actionableSuggestions =
    decisionBasedSuggestions.length > 0
      ? decisionBasedSuggestions
      : suggestionSlots.map((s) => s.text);

  const actionableSuggestionEvidenceCardIds =
    coachDecisions.length > 0
      ? coachDecisions.map((d) => getEvidenceCardIdsForDecision(d.type))
      : suggestionSlots.map((s) => s.evidenceCardIds);

  const nextSessionAdjustmentPlan = generateNextSessionAdjustments({
    decisions: coachDecisions,
    context: decisionContext,
    goal: String(goal),
    recentExercises,
    supportExercises,
    supportGroup,
    unit,
  });
  console.log("[coach structured analysis] nextSessionAdjustmentPlan", nextSessionAdjustmentPlan);

  return {
    keyFocus: keyFocus.text,
    keyFocusType: keyFocus.type,
    keyFocusExercise: keyFocus.exercise,
    keyFocusGroups: keyFocus.groups,
    keyFocusEvidenceCardIds,
    whatsGoingWell: whatsGoingWellWithEvidence.map((w) => w.text),
    whatsGoingWellEvidenceCardIds: whatsGoingWellWithEvidence.map((w) => w.evidenceCardIds),
    volumeBalance,
    actionableSuggestions,
    actionableSuggestionEvidenceCardIds,
    nextSessionAdjustmentPlan,
  };
}

/** Flatten all evidence ids referenced by a coach analysis (for deduped card payload). */
export function collectReferencedEvidenceCardIds(
  analysis: CoachStructuredAnalysis
): string[] {
  return [
    ...analysis.keyFocusEvidenceCardIds,
    ...analysis.actionableSuggestionEvidenceCardIds.flat(),
    ...analysis.whatsGoingWellEvidenceCardIds.flat(),
  ];
}
