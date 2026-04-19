import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { evaluateMuscleCoverage } from "@/lib/trainingKnowledge/muscleCoverage";
import { getVolumeRule, type UserLevel } from "@/lib/trainingKnowledge/volumeRules";
import { MUSCLE_RULES } from "@/lib/trainingKnowledge/muscleRules";

type Input = AssistantStructuredProgramme | { days?: Array<{ exercises?: Array<{ exerciseName?: string; sets?: string }> }> };

function toCoverageInput(input: Input) {
  if ("days" in input) return input;
  return input;
}

export function getWeeklyDirectSetsForMuscle(input: Input, muscle: MuscleRuleId): number {
  return evaluateMuscleCoverage(toCoverageInput(input)).directSetsByMuscle[muscle] ?? 0;
}

export function getWeeklyIndirectSetsForMuscle(input: Input, muscle: MuscleRuleId): number {
  return evaluateMuscleCoverage(toCoverageInput(input)).indirectSetsByMuscle[muscle] ?? 0;
}

export function getWeightedWeeklySetsForMuscle(input: Input, muscle: MuscleRuleId): number {
  const cov = evaluateMuscleCoverage(toCoverageInput(input));
  return (cov.directSetsByMuscle[muscle] ?? 0) + (cov.indirectSetsByMuscle[muscle] ?? 0);
}

export function evaluateWeeklyVolumeForMuscle(input: Input, muscle: MuscleRuleId, userLevel: UserLevel) {
  const rule = getVolumeRule(muscle, userLevel);
  const direct = getWeeklyDirectSetsForMuscle(input, muscle);
  const weighted = getWeightedWeeklySetsForMuscle(input, muscle);
  const base = direct;
  const status =
    base < rule.underCoverageThreshold
      ? "under"
      : base > rule.hardUpperWeeklyWarning
        ? "over"
        : base > rule.softUpperWeeklyRange
          ? "high"
          : "target";
  return { direct, weighted, status, rule };
}

export function detectUndercoveredMusclesByWeeklyVolume(input: Input, userLevel: UserLevel): MuscleRuleId[] {
  const out: MuscleRuleId[] = [];
  for (const m of Object.keys(MUSCLE_RULES) as MuscleRuleId[]) {
    if (evaluateWeeklyVolumeForMuscle(input, m, userLevel).status === "under") out.push(m);
  }
  return out;
}

export function detectOverstackedMusclesByWeeklyVolume(input: Input, userLevel: UserLevel): MuscleRuleId[] {
  const out: MuscleRuleId[] = [];
  for (const m of Object.keys(MUSCLE_RULES) as MuscleRuleId[]) {
    const s = evaluateWeeklyVolumeForMuscle(input, m, userLevel).status;
    if (s === "over" || s === "high") out.push(m);
  }
  return out;
}

