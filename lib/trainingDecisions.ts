export type CoachDecisionType =
  | "maintain_current_plan"
  | "increase_support_volume"
  | "increase_goal_lift_exposure"
  | "reduce_fatigue"
  | "gather_more_data";

export type TrainingStyle = "to_failure" | "rir_based" | "mixed";

/**
 * Infer style from mean RIR and typical weekly sets per muscle (7-day average).
 * v1 heuristic:
 * - <= 0.5 RIR: to_failure
 * - <= 2 RIR: rir_based
 * - > 2 RIR: mixed
 */
export function inferTrainingStyle(
  avgRIR?: number,
  _setsPerMuscle?: number
): TrainingStyle | undefined {
  if (avgRIR === undefined || !Number.isFinite(avgRIR)) return undefined;
  if (avgRIR <= 0.5) return "to_failure";
  if (avgRIR <= 2) return "rir_based";
  return "mixed";
}

export type DecisionContext = {
  goal: string;
  experienceLevel: string;
  keyFocusType?: string;
  keyFocusExercise?: string;
  supportGroup?: string;
  fatigueRisk?: "low" | "moderate" | "high";
  frequencyStatus?: "low" | "adequate" | "high";
  hasEnoughData: boolean;
  supportGap?: boolean;
  goalLiftProgress?: "progressing" | "stable" | "plateau" | "declining";
  goalLiftExposure?: "low" | "adequate" | "high";
  /** Estimated current weekly sets for the primary target exercise/muscle when available. */
  currentWeeklySets?: number;
  /** Mean RIR from goal-lift sets when available, else all logged sets (undefined if no RIR data). */
  avgRIR?: number;
  trainingStyle?: TrainingStyle;
};

export type CoachDecision = {
  id: string;
  type: CoachDecisionType;
  reason: string;
  priority: number;
};

const MAX_DECISIONS = 2;

/**
 * Deterministic next-action suggestions from context. Rules evaluated in order; first match wins.
 * At most {@link MAX_DECISIONS} decisions; sorted by priority (highest first).
 */
export function decideNextActions(context: DecisionContext): CoachDecision[] {
  if (!context.hasEnoughData) {
    return sortAndCap([
      {
        id: "gather_more_data",
        type: "gather_more_data",
        reason: "Not enough consistent training exposure yet to make a reliable decision.",
        priority: 100,
      },
    ]);
  }

  if (context.goalLiftProgress === "progressing" && context.supportGap === true) {
    return sortAndCap([
      {
        id: "increase_support_volume",
        type: "increase_support_volume",
        reason:
          "Weekly volume for a key muscle group is low compared with your main lift progress — bringing it up usually extends the progression runway.",
        priority: 80,
      },
    ]);
  }

  if (context.fatigueRisk === "high" && context.goalLiftProgress !== "progressing") {
    return sortAndCap([
      {
        id: "reduce_fatigue",
        type: "reduce_fatigue",
        reason:
          "Performance is likely being limited by accumulated fatigue rather than insufficient stimulus.",
        priority: 90,
      },
    ]);
  }

  if (context.goalLiftProgress === "declining") {
    return sortAndCap([
      {
        id: "reduce_fatigue",
        type: "reduce_fatigue",
        reason:
          "Recent performance is declining, so recovery or fatigue management should be addressed before adding more stimulus.",
        priority: 88,
      },
    ]);
  }

  if (context.supportGap === true && context.keyFocusType === "low-volume") {
    return sortAndCap([
      {
        id: "increase_support_volume",
        type: "increase_support_volume",
        reason:
          "A muscle group you rely on is undertrained on a weekly basis compared with the lift that is progressing.",
        priority: 82,
      },
    ]);
  }

  if (
    context.goalLiftProgress === "plateau" &&
    (context.goalLiftExposure === "low" || context.frequencyStatus === "low")
  ) {
    return sortAndCap([
      {
        id: "increase_goal_lift_exposure",
        type: "increase_goal_lift_exposure",
        reason: "Insufficient exposure to the target lift is limiting further adaptation.",
        priority: 85,
      },
    ]);
  }

  if (context.goalLiftProgress === "plateau") {
    return sortAndCap([
      {
        id: "reduce_fatigue",
        type: "reduce_fatigue",
        reason:
          "Progress has stalled despite sufficient exposure, suggesting accumulated fatigue or the need for a reset.",
        priority: 84,
      },
    ]);
  }

  // fatigueRisk "high" is handled above
  if (context.goalLiftProgress === "progressing" && context.supportGap !== true) {
    return sortAndCap([
      {
        id: "maintain_current_plan",
        type: "maintain_current_plan",
        reason: "Current training stimulus is effective and well-tolerated.",
        priority: 70,
      },
    ]);
  }

  return sortAndCap([
    {
      id: "maintain_current_plan",
      type: "maintain_current_plan",
      reason: "No clear limiting factor detected.",
      priority: 60,
    },
  ]);
}

function sortAndCap(decisions: CoachDecision[]): CoachDecision[] {
  return [...decisions]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_DECISIONS);
}
