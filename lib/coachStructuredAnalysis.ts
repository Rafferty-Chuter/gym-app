import {
  getWorkoutHistory,
  getTrainingInsights,
  getExerciseInsights,
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
import {
  decideNextActions,
  type CoachDecision,
  type DecisionContext,
} from "@/lib/trainingDecisions";
import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { PriorityGoal } from "@/lib/priorityGoal";
import { getStoredUserProfile } from "@/lib/userProfile";
import {
  getEvidenceCardIdsForInteraction,
  getEvidenceCardIdsForRecommendation,
  getEvidenceCardIdsForSignal,
} from "@/lib/evidenceMapping";

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
  if (level === "high") return text;
  if (level === "medium") return `Initial indication: ${text}`;
  return `Early signal: ${text} (limited data so far).`;
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

function goalPrefix(goal: PriorityGoal) {
  switch (goal) {
    case "Increase Bench Press":
      return "For your bench press goal,";
    case "Increase Squat":
      return "For your squat goal,";
    case "Increase Deadlift":
      return "For your deadlift goal,";
    case "Build Chest":
      return "For your chest growth goal,";
    case "Build Back":
      return "For your back growth goal,";
    case "Build Overall Muscle":
      return "For your overall muscle growth goal,";
    case "Improve Overall Strength":
    default:
      return "For your overall strength goal,";
  }
}

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
      title: `${targetExercise}: insufficient goal data`,
      explanation:
        `There isn't enough recent ${targetExercise.toLowerCase()} exposure to assess progress yet.`,
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
      `Prioritize ${target} exposure: schedule it 1-2x per week for the next 2 weeks.`,
      `Keep one top set and one back-off set logged each session so trend confidence improves quickly.`,
    ];
  }
  if (interaction.id.includes("support-gap")) {
    const exFromId = interaction.id.replace("interaction-progress-support-gap-", "").replace(/-/g, " ");
    return [
      `${exFromId[0]?.toUpperCase() ?? ""}${exFromId.slice(1)} is moving up; add 3-4 supportive back sets next session.`,
      `Maintain current progression, but raise support volume to reduce near-term plateau risk.`,
    ];
  }
  return [];
}

function recommendationToText(rec: Recommendation, unit: "kg" | "lb"): string {
  const loadIncrement = unit === "kg" ? "2.5kg" : "5lb";
  const targetTitle =
    rec.target.length > 1 ? rec.target[0].toUpperCase() + rec.target.slice(1) : rec.target;

  if (rec.type === "increase_sets") {
    return softenForConfidence(`Next session, add 3–4 ${rec.target} sets.`, confidenceLevel(rec.confidence));
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

export type BuildCoachStructuredAnalysisParams = {
  focus: TrainingFocus;
  experienceLevel: ExperienceLevel;
  goal: PriorityGoal;
  unit: "kg" | "lb";
};

const MIN_WORKOUTS_FOR_NON_LIFT_DECISION_CONTEXT = 3;

function mapFatigueRiskFromSignals(signals: TrainingSignal[]): DecisionContext["fatigueRisk"] {
  const fatigue = signals.filter((s) => s.category === "fatigue");
  if (fatigue.length === 0) return undefined;
  const top = fatigue.reduce((a, b) => (a.severity >= b.severity ? a : b));
  if (top.status === "high_priority" || top.severity >= 5) return "high";
  if (top.severity >= 3) return "moderate";
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

function decisionToText(
  decision: CoachDecision,
  context: DecisionContext,
  _unit: "kg" | "lb"
): string {
  const ex = context.keyFocusExercise;
  switch (decision.type) {
    case "increase_support_volume":
      return ex
        ? `Progress is strong on ${ex}, but support volume is the limiting factor. Add 3–4 back sets next session to keep progress moving.`
        : `Support volume is the limiting factor. Add 3–4 back sets next session to keep progress moving.`;
    case "increase_goal_lift_exposure":
      return ex
        ? `${ex} is not getting enough specific exposure. Increase it to 1–2 sessions per week to drive further adaptation.`
        : `Your goal lift is not getting enough specific exposure. Increase it to 1–2 sessions per week to drive further adaptation.`;
    case "reduce_fatigue":
      return `Performance is being limited by fatigue. Reduce total volume or intensity briefly, then rebuild once recovery improves.`;
    case "maintain_current_plan":
      return ex
        ? `${ex} is progressing well. Keep the current plan and continue small progression steps.`
        : `Current training is working well. Keep the plan and continue small progression steps.`;
    case "gather_more_data":
      return ex
        ? `More ${ex} exposure is needed before making a reliable adjustment. Keep training consistently for a few more sessions.`
        : `More training data is needed before making a reliable adjustment. Keep training consistently for a few more sessions.`;
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
  const exerciseNames = getUniqueExerciseNamesFromWorkouts(allWorkouts);
  const allExerciseInsights = exerciseNames
    .map((name) => getExerciseInsights(allWorkouts, name, { maxSessions: 5 }))
    .filter((i) => i.sessionsTracked > 0);
  const goalInsights: TrainingInsights = {
    ...insights,
    exerciseInsights: allExerciseInsights,
  };
  const userProfile = getStoredUserProfile(focus, experienceLevel, goal);
  const minPlateauExposures = userProfile.goals.phase === "cut" ? 5 : 4;
  const minDeclineExposures = userProfile.goals.phase === "cut" ? 4 : 3;
  const minNegativeStepsForDecline = userProfile.goals.phase === "cut" ? 3 : 2;

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
  const interactions = buildSignalInteractions(scoredSignals, userProfile);

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
          `${goalPrefix(goal)} ${keyFocusSignal.title}. ${keyFocusSignal.explanation}${
            userProfile.goals.phase === "cut" &&
            (keyFocusSignal.category === "performance" || keyFocusSignal.category === "fatigue")
              ? " During a cut phase, treat flat performance as a softer signal unless it persists."
              : ""
          }`,
          keyFocusConfidence
        )
      : topInteraction
        ? softenForConfidence(
            `${goalPrefix(goal)} ${topInteraction.title}. ${topInteraction.implication}`,
            keyFocusConfidence
          )
        : null,
    type: keyFocusType,
    exercise: keyFocusSignal?.target?.exercise ?? goalPrimaryExercise(goal),
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
      const excluded = userProfile.constraints.excludedExercises.some((ex) =>
        targetLower.includes(ex.toLowerCase())
      );
      const injuryConflict = userProfile.constraints.injuriesOrLimitations.some((inj) =>
        targetLower.includes(inj.toLowerCase())
      );
      if (excluded || injuryConflict) return false;
      if (
        r.type === "add_frequency" &&
        userProfile.constraints.daysPerWeekAvailable <= insights.frequency
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

  const decisionContext: DecisionContext = {
    goal,
    experienceLevel,
    hasEnoughData:
      !hasInsufficientGoalData &&
      (isLiftSpecificGoal(goal) ? true : allWorkouts.length >= MIN_WORKOUTS_FOR_NON_LIFT_DECISION_CONTEXT),
    fatigueRisk: mapFatigueRiskFromSignals(scoredSignals),
    frequencyStatus: mapFrequencyStatusForDecisions(insights, scoredSignals),
    supportGap: Boolean(topInteraction?.id.includes("support-gap")),
    goalLiftProgress: mapGoalLiftProgressForDecisions(goalExerciseInsight?.trend),
    goalLiftExposure: mapGoalLiftExposureForDecisions(goalExerciseInsight),
    ...(keyFocus.type !== "none" ? { keyFocusType: keyFocus.type } : {}),
    ...(keyFocus.exercise ? { keyFocusExercise: keyFocus.exercise } : {}),
  };

  const coachDecisions = decideNextActions(decisionContext);

  const decisionBasedSuggestions = coachDecisions.map((d) => decisionToText(d, decisionContext, unit));
  console.log("[coach structured analysis] decisionBasedSuggestions", decisionBasedSuggestions);

  const actionableSuggestions =
    decisionBasedSuggestions.length > 0
      ? decisionBasedSuggestions
      : suggestionSlots.map((s) => s.text);

  const actionableSuggestionEvidenceCardIds =
    coachDecisions.length > 0
      ? coachDecisions.map((d) => getEvidenceCardIdsForRecommendation(d.type))
      : suggestionSlots.map((s) => s.evidenceCardIds);

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
