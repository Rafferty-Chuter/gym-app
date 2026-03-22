/**
 * Shared training analysis utilities.
 * Used by the Coach page and can be reused for AI analysis.
 */

import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { UserProfile } from "@/lib/userProfile";
import {
  getStats,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
  getMuscleGroupForExercise,
  getBestSet,
  estimateE1RM,
  getUniqueExerciseNames,
  exerciseKey,
  getExerciseMetrics,
} from "@/lib/trainingMetrics";

const WORKOUT_HISTORY_KEY = "workoutHistory";

const SBD_NAMES = ["squat", "bench", "deadlift", "bench press", "squat", "dead lift"];
function isSBD(exerciseName: string): boolean {
  const n = exerciseName.trim().toLowerCase();
  return SBD_NAMES.some((s) => n.includes(s)) || n.includes("bench") || n.includes("squat") || n.includes("deadlift");
}

export type StoredWorkout = {
  completedAt: string;
  name?: string;
  durationSec?: number;
  exercises: { name: string; restSec?: number; sets: { weight: string; reps: string; notes?: string }[] }[];
};

export function getWorkoutHistory(): StoredWorkout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export { getWorkoutsFromLast7Days, getVolumeByMuscleGroup, getMuscleGroupForExercise };
export { getStats };
export { getExerciseMetrics };

// --- Exercise trend analysis (deterministic, no AI) ---

export type ExerciseTrend =
  | "progressing"
  | "stable"
  | "plateau"
  | "declining"
  | "insufficient_data";

export type RecentPerformance = {
  completedAt: string;
  weight: number;
  reps: number;
  e1rm: number;
};

export type ExerciseTrendResult = {
  exercise: string;
  trend: ExerciseTrend;
  recentPerformances: RecentPerformance[];
};

export type ExerciseInsights = {
  exercise: string;
  sessionsTracked: number;
  trend: ExerciseTrend;
  changeSummary: string;
  consistency: "consistent" | "inconsistent";
  hasAdequateExposure: boolean;
  possiblePlateau: boolean;
  possibleFatigue: boolean;
  possibleLowSpecificity: boolean;
  positiveStepCount: number;
  negativeStepCount: number;
  exposuresLast7Days: number;
  exposuresLast28Days: number;
  averageExposuresPerWeekLast4Weeks: number;
  daysSinceLastPerformed: number | null;
  averageHardSetsPerExposure: number;
  recentPerformances: RecentPerformance[];
};

const DEFAULT_MAX_SESSIONS = 5;
const MIN_SESSIONS_FOR_PLATEAU = 3;
const MIN_SESSIONS_FOR_INSUFFICIENT = 3;
const MIN_SESSIONS_FOR_PLATEAU_RULE = 4;
const E1RM_MEANINGFUL_DELTA_PCT = 0.015; // 1.5%

function performanceBetter(
  a: { weight: number; reps: number },
  b: { weight: number; reps: number }
): boolean {
  return a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);
}

function performanceWorse(
  a: { weight: number; reps: number },
  b: { weight: number; reps: number }
): boolean {
  return a.weight < b.weight || (a.weight === b.weight && a.reps < b.reps);
}

/**
 * Deterministic trend analysis per exercise using last 3–5 sessions.
 * Compares best set per session (highest weight, then reps) to classify:
 * progressing, stable, plateau, or declining.
 */
export function getExerciseTrends(
  workouts: StoredWorkout[],
  options?: { maxSessions?: number }
): ExerciseTrendResult[] {
  const maxSessions = Math.min(
    Math.max(options?.maxSessions ?? DEFAULT_MAX_SESSIONS, 3),
    5
  );
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const exerciseNames = getUniqueExerciseNames(sorted);
  const results: ExerciseTrendResult[] = [];

  for (const exerciseName of exerciseNames) {
    const key = exerciseKey(exerciseName);
    const performances: RecentPerformance[] = [];
    for (const w of sorted) {
      const ex = w.exercises?.find((e) => exerciseKey(e.name) === key);
      if (!ex?.sets?.length) continue;
      const best = getBestSet(ex.sets);
      if (!best) continue;
      performances.push({
        completedAt: w.completedAt,
        weight: best.weight,
        reps: best.reps,
        e1rm: estimateE1RM(best.weight, best.reps),
      });
      if (performances.length >= maxSessions) break;
    }

    let trend: ExerciseTrend = "stable";
    if (performances.length >= 2) {
      const ordered = [...performances].reverse();
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      if (performanceBetter(last, first)) {
        trend = "progressing";
      } else if (performanceWorse(last, first)) {
        trend = "declining";
      } else {
        let noImprovementCount = 0;
        for (let i = ordered.length - 1; i > 0; i--) {
          if (!performanceBetter(ordered[i], ordered[i - 1])) noImprovementCount += 1;
          else break;
        }
        trend = noImprovementCount >= MIN_SESSIONS_FOR_PLATEAU - 1 ? "plateau" : "stable";
      }
    }

    results.push({
      exercise: exerciseName,
      trend,
      recentPerformances: performances.reverse(),
    });
  }

  return results;
}

/**
 * Deterministic workout intelligence for a single exercise.
 * Uses the last 3–5 sessions, extracts the best set per session,
 * and classifies the trend as: progressing, stable, plateau, or declining.
 */
export function getExerciseInsights(
  workouts: StoredWorkout[],
  exerciseName: string,
  options?: { maxSessions?: number }
): ExerciseInsights {
  const metrics = getExerciseMetrics(workouts, exerciseName, options);
  const {
    exercise,
    sessionsTracked,
    recentPerformances,
    frequencyLast28Days,
    daysSinceLastPerformed,
    exposuresLast7Days,
    exposuresLast28Days,
    averageExposuresPerWeekLast4Weeks,
    averageHardSetsPerExposure,
  } = metrics;

  const hasAdequateExposure =
    sessionsTracked >= MIN_SESSIONS_FOR_INSUFFICIENT && frequencyLast28Days >= 2;
  const possibleLowSpecificity = !hasAdequateExposure;

  if (sessionsTracked < MIN_SESSIONS_FOR_INSUFFICIENT) {
    const last = recentPerformances[recentPerformances.length - 1];
    const lastStr = last ? `${last.weight} × ${last.reps}` : "no logged best set";
    return {
      exercise,
      sessionsTracked,
      trend: "insufficient_data",
      changeSummary: `Not enough sessions to classify trend reliably yet. Latest best set: ${lastStr}.`,
      consistency: "inconsistent",
      hasAdequateExposure,
      possiblePlateau: false,
      possibleFatigue: false,
      possibleLowSpecificity,
      positiveStepCount: 0,
      negativeStepCount: 0,
      exposuresLast7Days,
      exposuresLast28Days,
      averageExposuresPerWeekLast4Weeks,
      daysSinceLastPerformed,
      averageHardSetsPerExposure,
      recentPerformances,
    };
  }

  const first = recentPerformances[0];
  const last = recentPerformances[recentPerformances.length - 1];
  const firstE1RM = metrics.firstE1RM;
  const lastE1RM = metrics.lastE1RM;

  const base = Math.max(firstE1RM, 1);
  const deltaE1RM = lastE1RM - firstE1RM;
  const deltaPct = deltaE1RM / base;
  const meaningfulUp = deltaPct >= E1RM_MEANINGFUL_DELTA_PCT;
  const meaningfulDown = deltaPct <= -E1RM_MEANINGFUL_DELTA_PCT;

  let prTrendSteps = 0;
  let worseningSteps = 0;
  for (let i = 1; i < recentPerformances.length; i++) {
    const prev = recentPerformances[i - 1];
    const curr = recentPerformances[i];
    const stepBase = Math.max(prev.e1rm, 1);
    const stepDeltaPct = (curr.e1rm - prev.e1rm) / stepBase;
    if (stepDeltaPct >= E1RM_MEANINGFUL_DELTA_PCT) prTrendSteps += 1;
    if (stepDeltaPct <= -E1RM_MEANINGFUL_DELTA_PCT) worseningSteps += 1;
  }

  let trend: ExerciseTrend = "stable";
  if (meaningfulUp || prTrendSteps >= 1) {
    trend = "progressing";
  } else if (meaningfulDown && worseningSteps >= 2) {
    trend = "declining";
  } else if (
    sessionsTracked >= MIN_SESSIONS_FOR_PLATEAU_RULE &&
    !meaningfulUp &&
    prTrendSteps === 0 &&
    hasAdequateExposure
  ) {
    trend = "plateau";
  } else {
    trend = "stable";
  }

  const possiblePlateau =
    sessionsTracked >= MIN_SESSIONS_FOR_PLATEAU_RULE &&
    !meaningfulUp &&
    prTrendSteps === 0 &&
    hasAdequateExposure;
  const possibleFatigue =
    trend === "declining" && worseningSteps >= 2 && (daysSinceLastPerformed ?? 999) <= 10;

  const firstStr = `${first.weight} × ${first.reps}`;
  const lastStr = `${last.weight} × ${last.reps}`;
  const deltaPctAbs = Math.abs(deltaPct * 100).toFixed(1);
  const deltaSign = deltaE1RM >= 0 ? "+" : "";

  const changeSummary =
    trend === "progressing"
      ? `Estimated strength improved (${deltaSign}${deltaPctAbs}% e1RM) from ${firstStr} to ${lastStr} across ${sessionsTracked} sessions.`
      : trend === "declining"
        ? `Estimated strength trended down (${deltaPctAbs}% e1RM) from ${firstStr} to ${lastStr} across ${sessionsTracked} sessions.`
        : trend === "plateau"
          ? `Estimated strength has been flat across ${sessionsTracked} sessions (${lastStr}, e1RM ~${lastE1RM}).`
          : `Estimated strength is mostly stable across ${sessionsTracked} sessions (${lastStr}).`;

  const consistency: "consistent" | "inconsistent" =
    worseningSteps <= 1 ? "consistent" : "inconsistent";

  return {
    exercise,
    sessionsTracked,
    trend,
    changeSummary,
    consistency,
    hasAdequateExposure,
    possiblePlateau,
    possibleFatigue,
    possibleLowSpecificity,
    positiveStepCount: prTrendSteps,
    negativeStepCount: worseningSteps,
    exposuresLast7Days,
    exposuresLast28Days,
    averageExposuresPerWeekLast4Weeks,
    daysSinceLastPerformed,
    averageHardSetsPerExposure,
    recentPerformances,
  };
}

export type TrainingInsights = {
  weeklyVolume: Record<string, number>;
  frequency: number;
  exerciseInsights: ExerciseInsights[];
  findings: string[];
};

export type TrainingSignal = {
  id: string;
  category: "performance" | "volume" | "frequency" | "fatigue" | "balance";
  status: "positive" | "neutral" | "warning" | "high_priority";
  severity: 1 | 2 | 3 | 4 | 5;
  confidence: 1 | 2 | 3 | 4 | 5;
  confidenceLevel: "low" | "medium" | "high";
  goalRelevanceClass: "primary" | "supportive" | "general" | "irrelevant";
  goalRelevance: 1 | 2 | 3 | 4 | 5;
  priorityScore: number;
  title: string;
  explanation: string;
  target?: { exercise?: string; muscleGroup?: string };
  evidence: string[];
  recommendationIds: string[];
};

export type TrainingInteraction = {
  id: string;
  signals: string[];
  title: string;
  implication: string;
  confidenceLevel: "low" | "medium" | "high";
  severity: 1 | 2 | 3 | 4 | 5;
  goalRelevance: 1 | 2 | 3 | 4 | 5;
  priorityScore: number;
  recommendationIds: string[];
};

function toScale1to5(n: number): 1 | 2 | 3 | 4 | 5 {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return Math.round(n) as 1 | 2 | 3 | 4 | 5;
}

function confidenceLevelFromScore(confidence: 1 | 2 | 3 | 4 | 5): "low" | "medium" | "high" {
  if (confidence <= 2) return "low";
  if (confidence === 3) return "medium";
  return "high";
}

function getRecentWeekBuckets(workouts: StoredWorkout[], weeksToCheck = 2): number {
  const now = Date.now();
  const windowMs = weeksToCheck * 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;
  const buckets = new Set<string>();
  for (const w of workouts ?? []) {
    const d = new Date(w.completedAt);
    const ms = d.getTime();
    if (!Number.isFinite(ms) || ms < cutoff) continue;
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const week = Math.ceil(day / 7);
    buckets.add(`${year}-${month}-${week}`);
  }
  return buckets.size;
}

function goalRelevanceForSignal(
  signal: TrainingSignal,
  focus: TrainingFocus
): 1 | 2 | 3 | 4 | 5 {
  if (focus === "Hypertrophy") {
    if (signal.category === "volume" || signal.category === "balance") return 5;
    if (signal.category === "performance") return 3;
    if (signal.category === "frequency") return 4;
    return 3;
  }
  if (focus === "Powerlifting") {
    if (signal.target?.exercise && signal.category === "performance") return 5;
    if (signal.category === "performance" || signal.category === "fatigue") return 4;
    if (signal.category === "frequency") return 4;
    return 2;
  }
  if (focus === "General Strength") {
    if (signal.category === "performance" || signal.category === "fatigue") return 5;
    if (signal.category === "frequency") return 4;
    if (signal.category === "volume") return 3;
    return 3;
  }
  // General Fitness
  if (signal.category === "frequency" || signal.category === "balance") return 5;
  if (signal.category === "volume") return 4;
  return 3;
}

function getLiftKeywordFromGoal(primaryGoal?: string): "bench" | "squat" | "deadlift" | null {
  const g = (primaryGoal ?? "").toLowerCase();
  if (g.includes("increase bench")) return "bench";
  if (g.includes("increase squat")) return "squat";
  if (g.includes("increase deadlift")) return "deadlift";
  return null;
}

function isLiftSpecificGoal(primaryGoal?: string): boolean {
  return getLiftKeywordFromGoal(primaryGoal) !== null;
}

function classifySignalGoalRelevance(
  signal: TrainingSignal,
  profile?: UserProfile
): "primary" | "supportive" | "general" | "irrelevant" {
  const lift = getLiftKeywordFromGoal(profile?.goals?.primaryGoal);
  if (!lift) return "general";

  const ex = (signal.target?.exercise ?? "").toLowerCase();
  const mg = (signal.target?.muscleGroup ?? "").toLowerCase();
  const isGoalLiftExercise = ex.includes(lift);

  const supportiveMusclesByLift: Record<"bench" | "squat" | "deadlift", string[]> = {
    bench: ["chest", "shoulders", "arms"],
    squat: ["legs", "back"],
    deadlift: ["back", "legs"],
  };
  const supportiveMuscles = supportiveMusclesByLift[lift];
  const isSupportiveMuscle = mg ? supportiveMuscles.includes(mg) : false;

  if (isGoalLiftExercise) return "primary";
  if (
    signal.id.includes("goal-lift-exposure-low") ||
    (signal.category === "fatigue" && isGoalLiftExercise) ||
    (signal.category === "frequency" && (isGoalLiftExercise || signal.id.includes(`-${lift}`))) ||
    (signal.category === "volume" && isSupportiveMuscle)
  ) {
    return "supportive";
  }

  // Unrelated lift progression shouldn't dominate key focus for lift-specific goals.
  if (signal.category === "performance" && signal.status === "positive" && ex && !isGoalLiftExercise) {
    return "irrelevant";
  }
  return "general";
}

function goalRelevanceFromClass(
  cls: "primary" | "supportive" | "general" | "irrelevant",
  base: 1 | 2 | 3 | 4 | 5
): 1 | 2 | 3 | 4 | 5 {
  if (cls === "primary") return 5;
  if (cls === "supportive") return toScale1to5(Math.max(4, base));
  if (cls === "general") return toScale1to5(Math.min(3, base));
  return 1;
}

export function scoreTrainingSignals(
  signals: TrainingSignal[],
  focus: TrainingFocus,
  profile?: UserProfile
): TrainingSignal[] {
  return signals
    .map((signal) => {
      const baseGoalRelevance = goalRelevanceForSignal(signal, focus);
      const goalRelevanceClass = classifySignalGoalRelevance(signal, profile);
      const targetExercise = signal.target?.exercise?.toLowerCase() ?? "";
      const targetMuscle = signal.target?.muscleGroup?.toLowerCase() ?? "";
      const priorityExerciseBoost =
        profile?.goals?.priorityExercises?.some((ex) =>
          targetExercise.includes(ex.toLowerCase())
        )
          ? 1
          : 0;
      const priorityMuscleBoost =
        profile?.goals?.priorityMuscles?.some((m) => targetMuscle === m.toLowerCase()) ? 1 : 0;

      const boostedBase = toScale1to5(baseGoalRelevance + priorityExerciseBoost + priorityMuscleBoost);
      const goalRelevance = goalRelevanceFromClass(goalRelevanceClass, boostedBase);

      // Phase-aware severity interpretation: flatter progress during cut/maintain is less alarming.
      let adjustedSeverity = signal.severity;
      if (
        profile?.goals?.phase === "cut" &&
        (signal.id.includes("-plateau") || signal.id.includes("-decline"))
      ) {
        adjustedSeverity = toScale1to5(Math.max(1, signal.severity - 1));
      }

      const priorityScore = adjustedSeverity * signal.confidence * goalRelevance;
      return {
        ...signal,
        severity: adjustedSeverity,
        goalRelevanceClass,
        goalRelevance,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
}

function interactionConfidenceFromSignals(signals: TrainingSignal[]): "low" | "medium" | "high" {
  const minConf = Math.min(...signals.map((s) => s.confidence));
  if (minConf <= 2) return "low";
  if (minConf === 3) return "medium";
  return "high";
}

export function buildSignalInteractions(
  scoredSignals: TrainingSignal[],
  profile?: UserProfile
): TrainingInteraction[] {
  const out: TrainingInteraction[] = [];

  const positives = scoredSignals.filter(
    (s) => s.status === "positive" && s.category === "performance" && Boolean(s.target?.exercise)
  );
  const lowVolumeBack = scoredSignals.find(
    (s) => s.id.includes("volume-low-back") || (s.target?.muscleGroup ?? "") === "back"
  );
  const lowVolumeChest = scoredSignals.find(
    (s) => s.id.includes("volume-low-chest") || (s.target?.muscleGroup ?? "") === "chest"
  );
  const frequencyLow = scoredSignals.find((s) => s.id.includes("frequency-low"));
  const goalExposureLow = scoredSignals.find((s) => s.id.includes("goal-lift-exposure-low"));

  for (const p of positives) {
    const ex = p.target?.exercise ?? "Target lift";
    const exLower = ex.toLowerCase();
    const isBench = exLower.includes("bench");
    const isSquat = exLower.includes("squat");
    const isDeadlift = exLower.includes("deadlift") || exLower.includes("dead lift");
    const supportSignal = isBench ? lowVolumeBack : isDeadlift || isSquat ? lowVolumeBack : lowVolumeChest;
    if (!supportSignal) continue;
    const interactionSignals = [p, supportSignal];
    const severity = toScale1to5(Math.max(p.severity, supportSignal.severity));
    const goalRelevance = toScale1to5(Math.max(p.goalRelevance, supportSignal.goalRelevance));
    const priorityScore = severity * Math.max(p.confidence, supportSignal.confidence) * goalRelevance;
    out.push({
      id: `interaction-progress-support-gap-${exLower.replace(/\s+/g, "-")}`,
      signals: interactionSignals.map((s) => s.id),
      title: `${ex} is progressing but support volume is lagging`,
      implication: `Progress may be less sustainable if supportive volume stays low; this can become a limiting factor and raise plateau risk.`,
      confidenceLevel: interactionConfidenceFromSignals(interactionSignals),
      severity,
      goalRelevance,
      priorityScore,
      recommendationIds: [`interaction-support-${exLower.replace(/\s+/g, "-")}-volume-up`],
    });
  }

  if (goalExposureLow && frequencyLow) {
    const severity = toScale1to5(Math.max(goalExposureLow.severity, frequencyLow.severity));
    const goalRelevance = toScale1to5(Math.max(goalExposureLow.goalRelevance, frequencyLow.goalRelevance));
    const priorityScore = severity * Math.max(goalExposureLow.confidence, frequencyLow.confidence) * goalRelevance;
    out.push({
      id: `interaction-goal-data-insufficient`,
      signals: [goalExposureLow.id, frequencyLow.id],
      title: `Goal-lift data is insufficient for a confident trend read`,
      implication: `With low goal-specific exposure and low weekly frequency, progress interpretation stays noisy and forward planning is less reliable.`,
      confidenceLevel: interactionConfidenceFromSignals([goalExposureLow, frequencyLow]),
      severity,
      goalRelevance,
      priorityScore,
      recommendationIds: ["interaction-gather-goal-data"],
    });
  }

  // Phase-aware softer interpretation when cutting.
  if (profile?.goals?.phase === "cut") {
    for (const i of out) {
      if (i.id.includes("support-gap")) {
        i.implication = `${i.implication} During a cut, keep expectations conservative and emphasize sustainability.`;
      }
    }
  }

  return out.sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
}

/**
 * Deterministic global training insights.
 * - Uses weekly volume by muscle group
 * - Uses recent training frequency (last 7 days)
 * - Uses 2–5 key exercise insights derived from getExerciseInsights()
 * - Adds notable findings (progressing/plateau/declining/low-volume)
 */
export function getTrainingInsights(
  allWorkouts: StoredWorkout[]
): TrainingInsights {
  const weeklyVolumeEmpty: Record<string, number> = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
  };

  if (!allWorkouts?.length) {
    return {
      weeklyVolume: weeklyVolumeEmpty,
      frequency: 0,
      exerciseInsights: [],
      findings: ["No workout history found yet."],
    };
  }

  const recentWorkouts = getWorkoutsFromLast7Days(allWorkouts);
  const weeklyVolume = getVolumeByMuscleGroup(recentWorkouts);
  const frequency = recentWorkouts.length;

  const labels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };
  const muscleGroups = ["chest", "back", "legs", "shoulders", "arms"] as const;

  const exerciseNames = getUniqueExerciseNames(allWorkouts);
  const allExerciseInsights = exerciseNames.map((name) =>
    getExerciseInsights(allWorkouts, name, { maxSessions: 5 })
  );

  const priority: Record<ExerciseTrend, number> = {
    progressing: 3,
    plateau: 2,
    declining: 1,
    stable: 0,
    insufficient_data: -1,
  };

  const candidates = allExerciseInsights.filter((i) => i.sessionsTracked >= 3);

  // Deterministic ordering:
  // priority (trend) -> sessionsTracked -> exercise name
  const sortedCandidates = [...(candidates.length ? candidates : allExerciseInsights)].sort(
    (a, b) =>
      (priority[b.trend] - priority[a.trend]) ||
      (b.sessionsTracked - a.sessionsTracked) ||
      a.exercise.localeCompare(b.exercise)
  );

  const exerciseInsights = sortedCandidates.slice(0, 5);
  const minRequested = 2;
  const finalExerciseInsights =
    exerciseInsights.length >= minRequested
      ? exerciseInsights
      : sortedCandidates.slice(0, minRequested);

  const findings: string[] = [];
  findings.push(
    `Training frequency: ${frequency} session${frequency === 1 ? "" : "s"} in the last 7 days.`
  );

  const lowVolumeGroups = muscleGroups
    .map((g) => ({ group: g, sets: weeklyVolume[g] ?? 0 }))
    .filter((x) => x.sets > 0 && x.sets < 8);

  if (lowVolumeGroups.length > 0) {
    findings.push(
      `Lower-volume muscle groups: ${lowVolumeGroups
        .slice(0, 3)
        .map((x) => `${labels[x.group]} (${x.sets} sets)`)
        .join(", ")}.`
    );
  }

  const progressing = allExerciseInsights
    .filter((i) => i.trend === "progressing")
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise));
  if (progressing.length > 0) {
    findings.push(
      `Progressing lifts: ${progressing
        .slice(0, 3)
        .map((i) => i.exercise)
        .join(", ")}.`
    );
  }

  const plateauing = allExerciseInsights
    .filter((i) => i.trend === "plateau")
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise));
  if (plateauing.length > 0) {
    findings.push(
      `Plateauing lifts: ${plateauing
        .slice(0, 3)
        .map((i) => i.exercise)
        .join(", ")}.`
    );
  }

  const declining = allExerciseInsights
    .filter((i) => i.trend === "declining")
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise));
  if (declining.length > 0) {
    findings.push(
      `Declining lifts: ${declining
        .slice(0, 3)
        .map((i) => i.exercise)
        .join(", ")}.`
    );
  }

  // If nothing notable found besides frequency/low volume, add a neutral note.
  if (
    progressing.length === 0 &&
    plateauing.length === 0 &&
    declining.length === 0 &&
    findings.length <= 2
  ) {
    findings.push("No clear multi-session progression signals detected recently.");
  }

  return {
    weeklyVolume,
    frequency,
    exerciseInsights: finalExerciseInsights,
    findings,
  };
}

export function detectExerciseSignals(
  workouts: StoredWorkout[],
  options?: {
    maxSessions?: number;
    goalExerciseName?: string;
    minPlateauExposures?: number;
    minDeclineExposures?: number;
    minNegativeStepsForDecline?: number;
  }
): TrainingSignal[] {
  const exerciseNames = getUniqueExerciseNames(workouts ?? []);
  const out: TrainingSignal[] = [];
  const goalKey = exerciseKey(options?.goalExerciseName);
  const minPlateauExposures = Math.max(options?.minPlateauExposures ?? 4, 4);
  const minDeclineExposures = Math.max(options?.minDeclineExposures ?? 3, 3);
  const minNegativeStepsForDecline = Math.max(options?.minNegativeStepsForDecline ?? 2, 2);

  for (const exerciseName of exerciseNames) {
    const insight = getExerciseInsights(workouts, exerciseName, options);
    if (insight.sessionsTracked < 1) continue;

    if (insight.trend === "progressing") {
      const conf = toScale1to5(insight.sessionsTracked >= 5 ? 5 : insight.sessionsTracked >= 4 ? 4 : 3);
      out.push({
        id: `performance-progressing-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}`,
        category: "performance",
        status: "positive",
        severity: 2,
        confidence: conf,
        confidenceLevel: confidenceLevelFromScore(conf),
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${insight.exercise} is progressing`,
        explanation: insight.changeSummary,
        target: { exercise: insight.exercise },
        evidence: [
          `trend=progressing`,
          `sessionsTracked=${insight.sessionsTracked}`,
          `hasAdequateExposure=${insight.hasAdequateExposure}`,
        ],
        recommendationIds: [
          `continue-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}-progression`,
        ],
      });
      continue;
    }

    if (goalKey && exerciseKey(insight.exercise) === goalKey && insight.exposuresLast7Days < 2) {
      const conf: 1 | 2 | 3 | 4 | 5 = insight.exposuresLast28Days >= 2 ? 3 : 2;
      out.push({
        id: `goal-lift-exposure-low-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}`,
        category: "frequency",
        status: "warning",
        severity: 4,
        confidence: conf,
        confidenceLevel: confidenceLevelFromScore(conf),
        goalRelevanceClass: "general",
        goalRelevance: 5,
        priorityScore: 0,
        title: `${insight.exercise} exposure is low for your goal`,
        explanation:
          insight.exposuresLast28Days >= 2
            ? `${insight.exercise} has only ${insight.exposuresLast7Days} exposure in the last 7 days.`
            : `${insight.exercise} shows an early low-exposure signal (limited data so far).`,
        target: { exercise: insight.exercise },
        evidence: [
          `exposuresLast7Days=${insight.exposuresLast7Days}`,
          `exposuresLast28Days=${insight.exposuresLast28Days}`,
          `averageExposuresPerWeekLast4Weeks=${insight.averageExposuresPerWeekLast4Weeks}`,
        ],
        recommendationIds: [`fix-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}-goal-exposure-low`],
      });
    }

    if (insight.averageExposuresPerWeekLast4Weeks < 1) {
      const conf: 1 | 2 | 3 | 4 | 5 = insight.exposuresLast28Days >= 2 ? 3 : 2;
      out.push({
        id: `exercise-frequency-low-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}`,
        category: "frequency",
        status: "warning",
        severity: 3,
        confidence: conf,
        confidenceLevel: confidenceLevelFromScore(conf),
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${insight.exercise} frequency is low`,
        explanation:
          insight.exposuresLast28Days >= 2
            ? `${insight.exercise} averages ${insight.averageExposuresPerWeekLast4Weeks.toFixed(2)} exposures/week over the last 4 weeks.`
            : `${insight.exercise} has an initial low-frequency indication (limited data so far).`,
        target: { exercise: insight.exercise },
        evidence: [
          `averageExposuresPerWeekLast4Weeks=${insight.averageExposuresPerWeekLast4Weeks}`,
          `exposuresLast28Days=${insight.exposuresLast28Days}`,
          `daysSinceLastPerformed=${insight.daysSinceLastPerformed ?? "n/a"}`,
        ],
        recommendationIds: [`fix-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}-frequency-low`],
      });
    }

    if (
      (insight.trend === "plateau" || insight.possiblePlateau) &&
      insight.sessionsTracked >= minPlateauExposures
    ) {
      const conf = insight.sessionsTracked >= 5 && insight.hasAdequateExposure ? 4 : 2;
      out.push({
        id: `performance-plateau-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}`,
        category: "performance",
        status: "warning",
        severity: 3,
        confidence: conf,
        confidenceLevel: confidenceLevelFromScore(conf),
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${insight.exercise} looks plateaued`,
        explanation: insight.changeSummary,
        target: { exercise: insight.exercise },
        evidence: [
          `trend=${insight.trend}`,
          `possiblePlateau=${insight.possiblePlateau}`,
          `sessionsTracked=${insight.sessionsTracked}`,
        ],
        recommendationIds: [
          `fix-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}-plateau`,
        ],
      });
      continue;
    }

    if (
      insight.trend === "declining" &&
      insight.sessionsTracked >= minDeclineExposures &&
      insight.negativeStepCount >= minNegativeStepsForDecline
    ) {
      const conf = insight.hasAdequateExposure ? 4 : 2;
      out.push({
        id: `performance-declining-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}`,
        category: insight.possibleFatigue ? "fatigue" : "performance",
        status: insight.possibleFatigue ? "high_priority" : "warning",
        severity: insight.possibleFatigue ? 5 : 4,
        confidence: conf,
        confidenceLevel: confidenceLevelFromScore(conf),
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${insight.exercise} is trending down`,
        explanation: insight.changeSummary,
        target: { exercise: insight.exercise },
        evidence: [
          `trend=declining`,
          `possibleFatigue=${insight.possibleFatigue}`,
          `sessionsTracked=${insight.sessionsTracked}`,
        ],
        recommendationIds: [
          `fix-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}-decline`,
        ],
      });
      continue;
    }

    if (insight.trend === "insufficient_data" || !insight.hasAdequateExposure) {
      const conf: 1 | 2 | 3 | 4 | 5 = 1;
      out.push({
        id: `insufficient-exposure-for-assessment-${insight.exercise.toLowerCase().replace(/\s+/g, "-")}`,
        category: "performance",
        status: "neutral",
        severity: 1,
        confidence: conf,
        confidenceLevel: "low",
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${insight.exercise}: limited data so far`,
        explanation: "Initial indication only. More exposures are needed before stronger conclusions.",
        target: { exercise: insight.exercise },
        evidence: [
          `trend=${insight.trend}`,
          `sessionsTracked=${insight.sessionsTracked}`,
          `hasAdequateExposure=${insight.hasAdequateExposure}`,
        ],
        recommendationIds: [],
      });
    }
  }

  return out;
}

export function detectVolumeSignals(workouts: StoredWorkout[]): TrainingSignal[] {
  const recentWorkouts = getWorkoutsFromLast7Days(workouts ?? []);
  const weeklyVolume = getVolumeByMuscleGroup(recentWorkouts);
  const weeksWithData = getRecentWeekBuckets(workouts ?? [], 2);
  const volumeConfidence: 1 | 2 | 3 | 4 | 5 = weeksWithData >= 2 ? 4 : 2;
  const volumeConfidenceLevel = confidenceLevelFromScore(volumeConfidence);
  const groups = ["chest", "back", "legs", "shoulders", "arms"] as const;
  const out: TrainingSignal[] = [];

  for (const group of groups) {
    const sets = weeklyVolume[group] ?? 0;
    if (sets <= 0) continue;

    if (sets < 8) {
      out.push({
        id: `volume-low-${group}`,
        category: "volume",
        status: "warning",
        severity: 3,
        confidence: volumeConfidence,
        confidenceLevel: volumeConfidenceLevel,
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${group[0].toUpperCase()}${group.slice(1)} volume is low`,
        explanation:
          weeksWithData >= 2
            ? `${group[0].toUpperCase()}${group.slice(1)} is below the target zone this week.`
            : `${group[0].toUpperCase()}${group.slice(1)} shows an early low-volume signal (limited data so far).`,
        target: { muscleGroup: group },
        evidence: [`weeklySets=${sets}`, `thresholdLow<8`, `window=last7days`, `weeksWithData=${weeksWithData}`],
        recommendationIds: [`fix-${group}-volume-low`],
      });
      continue;
    }

    if (sets > 20) {
      out.push({
        id: `volume-high-${group}`,
        category: "volume",
        status: "warning",
        severity: 2,
        confidence: weeksWithData >= 2 ? 3 : 2,
        confidenceLevel: weeksWithData >= 2 ? "medium" : "low",
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: `${group[0].toUpperCase()}${group.slice(1)} volume is high`,
        explanation:
          weeksWithData >= 2
            ? `${group[0].toUpperCase()}${group.slice(1)} is above the target zone this week.`
            : `${group[0].toUpperCase()}${group.slice(1)} shows an early high-volume signal (limited data so far).`,
        target: { muscleGroup: group },
        evidence: [`weeklySets=${sets}`, `thresholdHigh>20`, `window=last7days`, `weeksWithData=${weeksWithData}`],
        recommendationIds: [`fix-${group}-volume-high`],
      });
    }
  }

  return out;
}

export function detectFrequencySignals(workouts: StoredWorkout[]): TrainingSignal[] {
  const recentWorkouts = getWorkoutsFromLast7Days(workouts ?? []);
  const frequency = recentWorkouts.length;
  const weeksWithData = getRecentWeekBuckets(workouts ?? [], 2);
  const frequencyConfidence: 1 | 2 | 3 | 4 | 5 = weeksWithData >= 2 ? 5 : 2;
  const frequencyConfidenceLevel = confidenceLevelFromScore(frequencyConfidence);

  if (frequency <= 1) {
    return [
      {
        id: "frequency-low-last7days",
        category: "frequency",
        status: "warning",
        severity: frequency === 0 ? 4 : 3,
        confidence: frequencyConfidence,
        confidenceLevel: frequencyConfidenceLevel,
        goalRelevanceClass: "general",
        goalRelevance: 3,
        priorityScore: 0,
        title: "Weekly training frequency is low",
        explanation:
          weeksWithData >= 2
            ? "Low session count can limit progression signal quality."
            : "Initial indication of low frequency (limited data so far).",
        evidence: [`sessionsLast7Days=${frequency}`, `thresholdLow<=1`, `weeksWithData=${weeksWithData}`],
        recommendationIds: ["fix-frequency-low"],
      },
    ];
  }

  return [
    {
      id: "frequency-adequate-last7days",
      category: "frequency",
      status: "positive",
      severity: 1,
      confidence: weeksWithData >= 2 ? 4 : 2,
      confidenceLevel: weeksWithData >= 2 ? "high" : "low",
      goalRelevanceClass: "general",
      goalRelevance: 3,
      priorityScore: 0,
      title: "Weekly training frequency is solid",
      explanation:
        weeksWithData >= 2
          ? "Session frequency is high enough to maintain clear progression signals."
          : "Early signal that training frequency is adequate, with limited data so far.",
      evidence: [`sessionsLast7Days=${frequency}`, `thresholdAdequate>=2`, `weeksWithData=${weeksWithData}`],
      recommendationIds: ["continue-frequency-adequate"],
    },
  ];
}

/**
 * Format exercise trend results as human-readable progression lines for Coach.
 */
export function formatExerciseTrendsForDisplay(
  trends: ExerciseTrendResult[],
  unit: "kg" | "lb" = "kg"
): string[] {
  const lines: string[] = [];
  for (const { exercise, trend, recentPerformances } of trends) {
    if (recentPerformances.length < 2) continue;
    const n = recentPerformances.length;
    const first = recentPerformances[0];
    const last = recentPerformances[recentPerformances.length - 1];
    const firstStr = `${first.weight} ${unit} × ${first.reps}`;
    const lastStr = `${last.weight} ${unit} × ${last.reps}`;
    if (trend === "progressing") {
      lines.push(`${exercise}: progressing over last ${n} sessions — best set improved from ${firstStr} to ${lastStr}.`);
    } else if (trend === "declining") {
      lines.push(`${exercise}: declining over last ${n} sessions — best set went from ${firstStr} to ${lastStr}. Consider recovery or deload.`);
    } else if (trend === "plateau") {
      lines.push(`${exercise}: plateau over last ${n} sessions (best set ${lastStr}). No improvement recently — try small load or rep progression.`);
    } else {
      lines.push(`${exercise}: stable over last ${n} sessions (best set ${lastStr}).`);
    }
  }
  return lines;
}

function getProgressionFeedback(workouts: StoredWorkout[], unit: "kg" | "lb" = "kg"): string[] {
  const lines: string[] = [];
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const recent = sorted[0];
  const previous = sorted[1];
  if (!recent?.exercises?.length || !previous?.exercises?.length) return lines;

  const prevByName: Record<string, { name: string; sets: { weight: string; reps: string }[] }> = {};
  for (const ex of previous.exercises) {
    const key = ex.name?.trim().toLowerCase() ?? "";
    if (key && !prevByName[key]) prevByName[key] = ex;
  }

  for (const ex of recent.exercises) {
    const name = ex.name?.trim() || "Exercise";
    const key = name.toLowerCase();
    const prevEx = prevByName[key];
    if (!prevEx?.sets?.length) continue;

    const recentBest = getBestSet(ex.sets ?? []);
    const previousBest = getBestSet(prevEx.sets ?? []);
    if (!recentBest || !previousBest) continue;

    const prevStr = `${previousBest.weight}${unit} × ${previousBest.reps}`;
    const recentStr = `${recentBest.weight}${unit} × ${recentBest.reps}`;

    if (recentBest.weight > previousBest.weight || (recentBest.weight === previousBest.weight && recentBest.reps > previousBest.reps)) {
      lines.push(`${name}: improved from ${prevStr} to ${recentStr}. Progressing well.`);
    } else if (recentBest.weight === previousBest.weight && recentBest.reps === previousBest.reps) {
      lines.push(`${name}: unchanged (${recentStr}). Try adding 1 rep next session.`);
    } else {
      lines.push(`${name}: declined slightly. Maintain weight, check recovery.`);
    }
  }

  return lines;
}

export type CoachFeedbackSections = {
  volume: string[];
  progression: string[];
  recommendations: string[];
};

export function generateFeedback(
  allWorkouts: StoredWorkout[],
  recentWorkouts: StoredWorkout[],
  weeklyVolume: Record<string, number>,
  unit: "kg" | "lb" = "kg",
  focus: TrainingFocus = "General Fitness",
  experienceLevel: ExperienceLevel = "Intermediate"
): CoachFeedbackSections {
  const volume: string[] = [];
  const progression: string[] = [];
  const recommendations: string[] = [];

  if (allWorkouts.length === 0) {
    recommendations.push(
      experienceLevel === "Beginner"
        ? "Log a few workouts to get started — we’ll give you tailored feedback as you go."
        : "There isn't enough data yet. Log some workouts to get feedback."
    );
    return { volume, progression, recommendations };
  }

  const workoutsLast7Days = recentWorkouts.length;
  if (workoutsLast7Days <= 1) {
    if (focus === "General Fitness") {
      recommendations.push("Staying consistent helps. Aim for 2–3 sessions per week when you can.");
    } else if (experienceLevel === "Beginner") {
      recommendations.push("Building a habit is key. Try to get in 2–3 sessions per week when you can.");
    } else {
      recommendations.push("Training frequency may be low. Aim for at least 2–3 sessions per week if you can.");
    }
  }

  const groupLabels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };
  const volumeOrder = ["chest", "back", "legs", "shoulders", "arms"] as const;
  const chest = weeklyVolume.chest ?? 0;
  const back = weeklyVolume.back ?? 0;
  const legs = weeklyVolume.legs ?? 0;
  const upperTotal = chest + back;

  if (focus === "Hypertrophy") {
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      if (sets < 8) {
        volume.push(`${label}: ${sets} sets → low for muscle growth, consider increasing volume`);
      } else if (sets <= 20) {
        volume.push(`${label}: ${sets} sets → good range for hypertrophy`);
      } else {
        volume.push(`${label}: ${sets} sets → on the higher side; ensure recovery`);
      }
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg volume is low vs upper body. For balance and growth, add more squat, hinge, or leg work.");
    }
    if (back > 0 && chest > 0 && back > chest * 1.5) {
      volume.push("Back volume is high relative to chest. Balancing push and pull supports hypertrophy.");
    }
  } else if (focus === "Powerlifting") {
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      volume.push(`${label}: ${sets} sets this week`);
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg volume is low vs upper body. Squat and deadlift frequency matters for powerlifting.");
    }
  } else if (focus === "General Fitness") {
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      volume.push(`${label}: ${sets} sets this week`);
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg work is a bit low vs upper body. Adding some squat or hinge work can help balance.");
    }
  } else {
    // General Strength
    for (const group of volumeOrder) {
      const sets = weeklyVolume[group] ?? 0;
      const label = groupLabels[group];
      if (sets < 8) {
        volume.push(`${label}: ${sets} sets → low, consider increasing volume`);
      } else if (sets <= 20) {
        volume.push(`${label}: ${sets} sets → good range`);
      } else {
        volume.push(`${label}: ${sets} sets → slightly high, monitor recovery`);
      }
    }
    if (upperTotal > 0 && legs < upperTotal * 0.5) {
      volume.push("Leg volume is low compared to upper body. Consider adding more squat, hinge, or leg work.");
    }
    if (chest >= 10 && chest <= 20) {
      volume.push("Chest volume looks reasonable for the week.");
    } else if (chest > 20) {
      volume.push("Chest volume is on the higher side. Ensure you're recovering well.");
    }
    if (back > 0 && chest > 0 && back > chest * 1.5) {
      volume.push("Back volume is high relative to chest. Consider balancing push and pull for upper body.");
    }
  }

  const exerciseTrends = getExerciseTrends(allWorkouts, { maxSessions: 5 });
  const progressionLines = formatExerciseTrendsForDisplay(exerciseTrends, unit);
  if (progressionLines.length > 0) {
    if (focus === "Powerlifting") {
      const sbd: string[] = [];
      const other: string[] = [];
      for (const line of progressionLines) {
        const name = line.split(":")[0]?.trim() ?? "";
        if (isSBD(name)) sbd.push(line);
        else other.push(line);
      }
      if (sbd.length > 0) {
        progression.push("Squat, bench, deadlift: progression is key for powerlifting.");
        progression.push(...sbd);
      }
      progression.push(...other);
    } else if (focus === "Hypertrophy") {
      progression.push(...progressionLines);
      progression.push("For hypertrophy, both volume and progression matter.");
    } else if (focus === "General Fitness") {
      progression.push(...progressionLines);
      progression.push("Any progression is a win; consistency matters most.");
    } else {
      progression.push(...progressionLines);
    }
  }

  if (allWorkouts.length > 0 && recommendations.length === 0) {
    const beginnerTail = experienceLevel === "Beginner" ? " Take it at your own pace." : "";
    if (focus === "Hypertrophy") {
      recommendations.push("For hypertrophy, aim for balanced volume across muscle groups and progressive overload." + beginnerTail);
    } else if (focus === "Powerlifting") {
      recommendations.push("For powerlifting, prioritize squat, bench, and deadlift performance; support with accessory volume." + beginnerTail);
    } else if (focus === "General Strength") {
      if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2) {
        recommendations.push("Your recent training looks consistent. Keep progressing on compound lifts and volume." + beginnerTail);
      } else {
        recommendations.push("Keep logging workouts. Compound lifts and reasonable volume support general strength." + beginnerTail);
      }
    } else {
      if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2) {
        recommendations.push("Your routine looks consistent and balanced. Keep it up." + beginnerTail);
      } else {
        recommendations.push("Staying consistent and keeping a balanced routine is what matters most." + beginnerTail);
      }
    }
  }

  return { volume, progression, recommendations };
}
