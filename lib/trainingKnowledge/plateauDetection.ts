// Scope: textbook plateau heuristics powering next-session advice helpers
// (progressionEngine, nextSessionLogic, trainingAnswerSupport).
//
// Plateau decision MUST route through the canonical lift trend module
// (lib/liftTrend) so the assistant's advice never disagrees with the
// Progress tab or the home Plateau signal about the same lift.

import {
  classifyE1rmSeries,
  isPlateau,
  TREND_WINDOW,
} from "@/lib/liftTrend";
import { estimateE1RM } from "@/lib/trainingMetrics";

export type ExerciseProgressPoint = {
  date: string;
  load: number;
  reps: number;
  sets: number;
  rir: number;
};

export function detectNoisyButNormalVariation(history: ExerciseProgressPoint[]): boolean {
  if (history.length < 4) return true;
  const reps = history.map((h) => h.reps);
  const spread = Math.max(...reps) - Math.min(...reps);
  return spread <= 2;
}

export function detectPlateau(history: ExerciseProgressPoint[]): boolean {
  const series = history
    .slice(-TREND_WINDOW)
    .map((h) => estimateE1RM(h.load, h.reps));
  return isPlateau(classifyE1rmSeries(series));
}

export function shouldTriggerPlateauAdvice(history: ExerciseProgressPoint[]): boolean {
  return detectPlateau(history) && !detectNoisyButNormalVariation(history);
}

export function suggestPlateauResponse(
  history: ExerciseProgressPoint[],
  context?: { fatigueHigh?: boolean }
): string {
  if (!shouldTriggerPlateauAdvice(history)) {
    return "This looks like normal variation. Keep progressing with small, consistent steps.";
  }
  if (context?.fatigueHigh) {
    return "Plateau + high fatigue signal: hold load briefly or deload, then rebuild with cleaner reps and 1-3 RIR.";
  }
  return "Plateau signal: try a rep-range shift, add a set, or use a small load reset before building back up.";
}

