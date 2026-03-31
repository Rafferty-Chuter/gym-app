import type { BuiltWorkout } from "@/lib/workoutBuilder";
import {
  classifySessionFatigue,
  detectJunkVolumeRisk,
  detectOverfatiguingSession,
  getSessionFatigueScore,
} from "@/lib/trainingKnowledge/fatigueScoring";
import { suggestBetterExerciseOrder } from "@/lib/trainingKnowledge/exerciseOrder";
import { shouldReduceVolumeNextSession } from "@/lib/trainingKnowledge/recoveryHeuristics";

export function shouldAddAnotherExercise(params: {
  built: BuiltWorkout;
  candidateIsCompound: boolean;
  lowFatigueMode?: boolean;
}): boolean {
  if (params.lowFatigueMode && params.candidateIsCompound) return false;
  if (detectOverfatiguingSession(params.built, params.lowFatigueMode ? "low_fatigue" : "normal")) return false;
  if (detectJunkVolumeRisk(params.built) && params.candidateIsCompound) return false;
  return true;
}

export function reduceSessionFatigue(built: BuiltWorkout): BuiltWorkout {
  const trimmed = { ...built, exercises: [...built.exercises] };
  while (trimmed.exercises.length > 4 && detectOverfatiguingSession(trimmed, "low_fatigue")) {
    const idx = trimmed.exercises.findIndex((e) => e.rirRange.min <= 1);
    if (idx >= 0) trimmed.exercises.splice(idx, 1);
    else trimmed.exercises.pop();
  }
  trimmed.notes = [...trimmed.notes, "Reduced session density to keep fatigue more recoverable."];
  return trimmed;
}

export function applyLowFatigueAdjustments(built: BuiltWorkout): BuiltWorkout {
  const out: BuiltWorkout = {
    ...built,
    exercises: built.exercises.map((e) => ({
      ...e,
      sets: {
        min: Math.max(1, Math.floor(e.sets.min * 0.6)),
        max: Math.max(2, Math.floor(e.sets.max * 0.6)),
      },
      rirRange: { min: Math.max(2, e.rirRange.min), max: Math.max(3, e.rirRange.max) },
    })),
    notes: [...built.notes, "Low-fatigue mode applied: lower set volume and more reps in reserve."],
  };
  return reduceSessionFatigue(out);
}

export function chooseLowerFatigueExerciseVariant(name: string, substitutes: string[]): string {
  const preferred = substitutes.find((s) => /\b(machine|cable|supported|seated)\b/i.test(s));
  return preferred ?? substitutes[0] ?? name;
}

export function buildSessionFatigueReview(
  built: BuiltWorkout,
  opts?: { lowFatigueMode?: boolean; underRecovered?: boolean; priorityExerciseIds?: string[] }
): string[] {
  const score = getSessionFatigueScore(
    {
      sessionType: built.sessionType,
      exercises: built.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        sets: `${e.sets.min}-${e.sets.max}`,
        reps: `${e.repRange.min}-${e.repRange.max}`,
        rir: `${e.rirRange.min}-${e.rirRange.max}`,
      })),
    },
    opts?.lowFatigueMode ? "low_fatigue" : "normal"
  );
  const cls = classifySessionFatigue(score, built.sessionType);
  const out: string[] = [];
  if (cls === "high") out.push("This session is likely high fatigue for its current structure.");
  if (detectJunkVolumeRisk(built)) out.push("You likely already have enough useful work; extra sets may be junk volume.");
  const orderHint = suggestBetterExerciseOrder(
    built.exercises.map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName })),
    { priorityExerciseIds: opts?.priorityExerciseIds ?? [] }
  );
  if (orderHint) out.push(orderHint);
  if (
    shouldReduceVolumeNextSession({
      underRecovered: Boolean(opts?.underRecovered),
      lowFatigueMode: opts?.lowFatigueMode,
    })
  ) {
    out.push("Recovery signals suggest reducing volume or using a low-fatigue day next session.");
  }
  return out;
}

