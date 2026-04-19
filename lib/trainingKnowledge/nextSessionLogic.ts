import { evaluateExerciseProgress } from "@/lib/trainingKnowledge/progressionEngine";
import type { ExerciseProgressPoint } from "@/lib/trainingKnowledge/plateauDetection";
import { suggestPlateauResponse, shouldTriggerPlateauAdvice } from "@/lib/trainingKnowledge/plateauDetection";

export function recommendNextLoadOrRepTarget(params: {
  exerciseIdOrName: string;
  history: ExerciseProgressPoint[];
  targetRange: { min: number; max: number };
}): string {
  const ev = evaluateExerciseProgress(params);
  if (ev.decision === "add_load") return "Add a small load jump next session and stay in the target rep band.";
  if (ev.decision === "add_reps") return "Keep load the same and push reps toward the top of the range.";
  if (ev.decision === "reduce") return "Use a small load reduction/reset, then rebuild with cleaner reps.";
  return "Hold load steady and improve rep quality/consistency this session.";
}

export function explainWhyThisProgressionChoice(params: {
  exerciseIdOrName: string;
  history: ExerciseProgressPoint[];
  targetRange: { min: number; max: number };
}): string {
  const ev = evaluateExerciseProgress(params);
  const plateauNote = shouldTriggerPlateauAdvice(params.history)
    ? ` ${suggestPlateauResponse(params.history)}`
    : "";
  return `${ev.rationale}${plateauNote}`;
}

export function recommendNextSessionForExercise(params: {
  exerciseIdOrName: string;
  history: ExerciseProgressPoint[];
  targetRange: { min: number; max: number };
  goal?: "hypertrophy" | "strength" | "balanced";
}): string {
  const next = recommendNextLoadOrRepTarget(params);
  const why = explainWhyThisProgressionChoice(params);
  return `${next} ${why}`;
}

