import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";

export type RecommendationSeverity = 1 | 2 | 3 | 4 | 5;
export type RecommendationConfidence = 1 | 2 | 3 | 4 | 5;
export type GoalRelevance = 1 | 2 | 3 | 4 | 5;

export type RecommendationSignalType =
  | "declining_exercise"
  | "plateau_exercise"
  | "low_exposure_exercise"
  | "low_volume_group"
  | "high_volume_group"
  | "balance_imbalance"
  | "progressing_exercise"
  | "good_balance"
  | "low_frequency";

export type RecommendationSignal = {
  id: string;
  type: RecommendationSignalType;
  exercise?: string;
  muscleGroup?: "chest" | "back" | "legs" | "shoulders" | "arms";
  details?: string;
  severity: RecommendationSeverity;
  confidence: RecommendationConfidence;
};

export type BasicTrainingMetrics = {
  weeklyVolume: Record<string, number>;
  frequencyLast7Days: number;
};

export type RecommendationActionType =
  | "load_adjustment"
  | "rep_progression"
  | "volume_increase"
  | "volume_reduce"
  | "exercise_selection"
  | "frequency_adjustment";

export type StructuredRecommendation = {
  id: string;
  actionType: RecommendationActionType;
  priorityScore: number;
  signalId: string;
  exercise?: string;
  muscleGroup?: string;
  instruction: {
    intent: "fix" | "continue";
    target: string;
    action: string;
    dosage?: string;
  };
};

export type RecommendationOutput = {
  keyFocus: StructuredRecommendation | null;
  positives: StructuredRecommendation[];
  balanceNotes: StructuredRecommendation[];
  recommendations: StructuredRecommendation[];
};

function clamp1to5(n: number): 1 | 2 | 3 | 4 | 5 {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return Math.round(n) as 1 | 2 | 3 | 4 | 5;
}

function isStrengthFocus(focus: TrainingFocus): boolean {
  return focus === "Powerlifting" || focus === "General Strength";
}

function goalRelevanceForSignal(
  focus: TrainingFocus,
  signal: RecommendationSignal
): GoalRelevance {
  if (focus === "Hypertrophy") {
    if (signal.type === "low_volume_group" || signal.type === "balance_imbalance") return 5;
    if (signal.type === "progressing_exercise" || signal.type === "good_balance") return 3;
    if (signal.type === "plateau_exercise" || signal.type === "declining_exercise") return 2;
    return 2;
  }
  if (focus === "Powerlifting") {
    if (
      (signal.type === "plateau_exercise" || signal.type === "declining_exercise") &&
      signal.exercise
    )
      return 5;
    if (signal.type === "low_exposure_exercise" && signal.exercise) return 4;
    if (signal.type === "low_volume_group") return 2;
    return 3;
  }
  if (focus === "General Strength") {
    if (signal.type === "plateau_exercise" || signal.type === "declining_exercise") return 5;
    if (signal.type === "low_frequency" || signal.type === "low_exposure_exercise") return 4;
    if (signal.type === "low_volume_group") return 3;
    return 3;
  }
  // General Fitness
  if (signal.type === "low_frequency" || signal.type === "balance_imbalance") return 5;
  if (signal.type === "declining_exercise" || signal.type === "plateau_exercise") return 3;
  return 3;
}

function scoreSignal(
  focus: TrainingFocus,
  signal: RecommendationSignal
): { priorityScore: number; goalRelevance: GoalRelevance } {
  const goalRelevance = goalRelevanceForSignal(focus, signal);
  const priorityScore = signal.severity * signal.confidence * goalRelevance;
  return { priorityScore, goalRelevance };
}

function structuredFromSignal(
  focus: TrainingFocus,
  experienceLevel: ExperienceLevel,
  signal: RecommendationSignal
): StructuredRecommendation {
  const { priorityScore } = scoreSignal(focus, signal);
  const expAdj = experienceLevel === "Beginner" ? "conservative" : "standard";
  const ex = signal.exercise;
  const mg = signal.muscleGroup;

  if (signal.type === "declining_exercise" && ex) {
    return {
      id: `rec-${signal.id}`,
      actionType: "load_adjustment",
      priorityScore,
      signalId: signal.id,
      exercise: ex,
      instruction: {
        intent: "fix",
        target: ex,
        action: "reduce load slightly and rebuild quality reps",
        dosage: expAdj === "conservative" ? "~2.5% load drop next session" : "~2.5-5% load drop next session",
      },
    };
  }
  if (signal.type === "plateau_exercise" && ex) {
    return {
      id: `rec-${signal.id}`,
      actionType: "rep_progression",
      priorityScore,
      signalId: signal.id,
      exercise: ex,
      instruction: {
        intent: "fix",
        target: ex,
        action: "use a small progression lever on top set",
        dosage: "hold load and add +1 rep, or add a small load jump with same reps",
      },
    };
  }
  if (signal.type === "low_volume_group" && mg) {
    return {
      id: `rec-${signal.id}`,
      actionType: "volume_increase",
      priorityScore,
      signalId: signal.id,
      muscleGroup: mg,
      instruction: {
        intent: "fix",
        target: mg,
        action: "increase focused weekly sets",
        dosage: "add 3-5 sets over next 7 days",
      },
    };
  }
  if (signal.type === "high_volume_group" && mg) {
    return {
      id: `rec-${signal.id}`,
      actionType: "volume_reduce",
      priorityScore,
      signalId: signal.id,
      muscleGroup: mg,
      instruction: {
        intent: "fix",
        target: mg,
        action: "trim volume to protect recovery",
        dosage: "reduce by 2-4 sets next week",
      },
    };
  }
  if (signal.type === "low_frequency") {
    return {
      id: `rec-${signal.id}`,
      actionType: "frequency_adjustment",
      priorityScore,
      signalId: signal.id,
      instruction: {
        intent: "fix",
        target: "weekly training frequency",
        action: "increase session frequency",
        dosage: "target 2-3 sessions this week",
      },
    };
  }
  if (signal.type === "progressing_exercise" && ex) {
    return {
      id: `rec-${signal.id}`,
      actionType: "rep_progression",
      priorityScore,
      signalId: signal.id,
      exercise: ex,
      instruction: {
        intent: "continue",
        target: ex,
        action: "maintain progression momentum",
        dosage: "next session: +1 rep or a small load increase",
      },
    };
  }
  if (signal.type === "balance_imbalance" || signal.type === "good_balance") {
    return {
      id: `rec-${signal.id}`,
      actionType: "exercise_selection",
      priorityScore,
      signalId: signal.id,
      instruction: {
        intent: signal.type === "good_balance" ? "continue" : "fix",
        target: "push/pull and lower/upper balance",
        action: signal.type === "good_balance" ? "keep current balance strategy" : "rebalance exercise selection",
        dosage: signal.type === "good_balance" ? "maintain current split this week" : "bias next 1-2 sessions toward lagging pattern",
      },
    };
  }

  // low_exposure_exercise and fallback
  return {
    id: `rec-${signal.id}`,
    actionType: "frequency_adjustment",
    priorityScore,
    signalId: signal.id,
    exercise: ex,
    instruction: {
      intent: "fix",
      target: ex ?? "target exercise",
      action: "increase specific exposure",
      dosage: "perform it at least 1-2x per week",
    },
  };
}

function shouldPreferExerciseSpecific(focus: TrainingFocus, r: StructuredRecommendation): boolean {
  if (!isStrengthFocus(focus)) return true;
  const isExerciseSpecific = Boolean(r.exercise);
  if (isExerciseSpecific) return true;
  return r.actionType !== "volume_increase" && r.actionType !== "volume_reduce";
}

function shouldPreferVolumeSpecific(focus: TrainingFocus, r: StructuredRecommendation): boolean {
  if (focus !== "Hypertrophy") return true;
  return r.actionType === "volume_increase" || r.actionType === "volume_reduce" || Boolean(r.muscleGroup);
}

export function buildTrainingRecommendations(
  input: {
    focus: TrainingFocus;
    experienceLevel: ExperienceLevel;
    signals: RecommendationSignal[];
    metrics: BasicTrainingMetrics;
  }
): RecommendationOutput {
  const { focus, experienceLevel, signals, metrics } = input;

  const scored = signals
    .map((s) => {
      const base = structuredFromSignal(focus, experienceLevel, s);
      const { priorityScore } = scoreSignal(focus, s);
      return { signal: s, rec: { ...base, priorityScore } };
    })
    .sort((a, b) => b.rec.priorityScore - a.rec.priorityScore || a.rec.id.localeCompare(b.rec.id));

  const positives = scored
    .filter((x) => x.signal.type === "progressing_exercise" || x.signal.type === "good_balance")
    .map((x) => x.rec)
    .slice(0, 2);

  const balanceNotes = scored
    .filter(
      (x) =>
        x.signal.type === "balance_imbalance" ||
        x.signal.type === "low_volume_group" ||
        x.signal.type === "high_volume_group"
    )
    .map((x) => x.rec)
    .slice(0, 2);

  const severe = scored.filter((x) => x.signal.severity >= 4).map((x) => x.rec);
  const moderate = scored.filter((x) => x.signal.severity < 4).map((x) => x.rec);
  const orderedPool = [...severe, ...moderate];

  const filteredPool = orderedPool
    .filter((r) => shouldPreferExerciseSpecific(focus, r))
    .filter((r) => shouldPreferVolumeSpecific(focus, r));
  const pool = filteredPool.length > 0 ? filteredPool : orderedPool;

  const deduped: StructuredRecommendation[] = [];
  const seenTargets = new Set<string>();
  for (const r of pool) {
    const targetKey = `${r.actionType}:${r.exercise ?? r.muscleGroup ?? r.instruction.target}`;
    if (seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    deduped.push(r);
  }

  let keyFocus: StructuredRecommendation | null = deduped[0] ?? null;
  if (!keyFocus && metrics.frequencyLast7Days <= 1) {
    keyFocus = {
      id: "fallback-low-frequency",
      actionType: "frequency_adjustment",
      priorityScore: 10,
      signalId: "fallback",
      instruction: {
        intent: "fix",
        target: "weekly training frequency",
        action: "increase consistency",
        dosage: "target at least 2 sessions next week",
      },
    };
  }

  const recommendations = deduped.slice(0, 3);

  if (recommendations.length === 0) {
    return {
      keyFocus,
      positives,
      balanceNotes,
      recommendations: keyFocus ? [keyFocus] : [],
    };
  }

  return {
    keyFocus,
    positives,
    balanceNotes,
    recommendations,
  };
}

export function renderRecommendationText(rec: StructuredRecommendation): string {
  const prefix =
    rec.instruction.intent === "continue"
      ? `${rec.instruction.target}: keep this going`
      : `${rec.instruction.target}: priority`;
  const dosage = rec.instruction.dosage ? ` (${rec.instruction.dosage})` : "";
  return `${prefix} — ${rec.instruction.action}${dosage}.`;
}

export function renderRecommendationOutputText(output: RecommendationOutput): {
  keyFocus: string | null;
  positives: string[];
  balanceNotes: string[];
  recommendations: string[];
} {
  return {
    keyFocus: output.keyFocus ? renderRecommendationText(output.keyFocus) : null,
    positives: output.positives.map(renderRecommendationText),
    balanceNotes: output.balanceNotes.map(renderRecommendationText),
    recommendations: output.recommendations.map(renderRecommendationText),
  };
}

