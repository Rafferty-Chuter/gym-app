import { getExerciseByIdOrName, type ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";
import { PROGRESSION_RULES, type ProgressionCategory } from "@/lib/trainingKnowledge/progressionRules";
import { progressionDecisionFromRIR } from "@/lib/trainingKnowledge/rirDecisions";
import type { ExerciseProgressPoint } from "@/lib/trainingKnowledge/plateauDetection";

export function getProgressionRulesForExercise(ex: ExerciseMetadata): (typeof PROGRESSION_RULES)[ProgressionCategory] {
  if (ex.role === "isolation" || ex.role === "accessory") return PROGRESSION_RULES.isolation_lift;
  if (ex.role === "main_compound") return PROGRESSION_RULES.compound_lift;
  return PROGRESSION_RULES.hypertrophy_biased;
}

function inRange(x: number, min: number, max: number): boolean {
  return x >= min && x <= max;
}

export function shouldIncreaseLoad(
  history: ExerciseProgressPoint[],
  targetRange: { min: number; max: number },
  rir: number[]
): boolean {
  const recent = history.slice(-2);
  if (!recent.length) return false;
  return recent.every((h) => h.reps >= targetRange.max) && rir.every((r) => r >= 1);
}

export function shouldIncreaseReps(
  history: ExerciseProgressPoint[],
  targetRange: { min: number; max: number },
  rir: number[]
): boolean {
  const last = history.at(-1);
  if (!last) return false;
  return inRange(last.reps, targetRange.min, targetRange.max - 1) && rir.every((r) => r >= 1);
}

export function shouldHoldSteady(
  history: ExerciseProgressPoint[],
  targetRange: { min: number; max: number },
  rir: number[]
): boolean {
  const last = history.at(-1);
  if (!last) return true;
  return inRange(last.reps, targetRange.min, targetRange.max) && rir.some((r) => r <= 1);
}

export function shouldReduceLoad(
  history: ExerciseProgressPoint[],
  targetRange: { min: number; max: number },
  rir: number[]
): boolean {
  const last = history.at(-1);
  if (!last) return false;
  return last.reps < targetRange.min && rir.every((r) => r <= 1);
}

export function applyDoubleProgression(
  history: ExerciseProgressPoint[],
  targetRange: { min: number; max: number }
): "add_load" | "add_reps" | "hold" | "reduce" {
  const rirs = history.slice(-2).map((h) => h.rir);
  const flat = history.length >= 3 ? history.slice(-3).every((h) => h.reps === history[history.length - 1].reps) : false;
  const byRir = progressionDecisionFromRIR({ rirs, repsTrendFlat: flat });
  if (byRir === "increase_load" && shouldIncreaseLoad(history, targetRange, rirs)) return "add_load";
  if (byRir === "increase_reps" && shouldIncreaseReps(history, targetRange, rirs)) return "add_reps";
  if (byRir === "reduce" || shouldReduceLoad(history, targetRange, rirs)) return "reduce";
  return "hold";
}

export function evaluateExerciseProgress(params: {
  exerciseIdOrName: string;
  history: ExerciseProgressPoint[];
  targetRange: { min: number; max: number };
}): {
  decision: "add_load" | "add_reps" | "hold" | "reduce";
  rationale: string;
} {
  const meta = getExerciseByIdOrName(params.exerciseIdOrName);
  const decision = applyDoubleProgression(params.history, params.targetRange);
  const rule = meta ? getProgressionRulesForExercise(meta) : PROGRESSION_RULES.hypertrophy_biased;
  const rationale =
    decision === "add_load"
      ? `Top-end reps and effort look ready. ${rule.whenToIncreaseLoad[0]}`
      : decision === "add_reps"
        ? `Keep load stable and push reps. ${rule.whenToIncreaseReps[0]}`
        : decision === "reduce"
          ? `Recovery/effort signal is too hard right now. ${rule.whenToReduceLoad[0]}`
          : `Hold steady this session and consolidate quality reps around ${rule.targetRIRRange.min}-${rule.targetRIRRange.max} RIR.`;
  return { decision, rationale };
}

