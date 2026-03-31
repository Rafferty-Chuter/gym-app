import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { MUSCLE_RULES } from "@/lib/trainingKnowledge/muscleRules";
import {
  detectOverstackedMuscles,
  detectRedundantExerciseStacking,
  detectUndercoveredMuscles,
  evaluateMuscleCoverage,
  getIndirectWorkForMuscle,
  suggestMissingWorkForMuscle,
  validateSessionAgainstTargetMuscles,
} from "@/lib/trainingKnowledge/coverageLogic";

type InputLike = Parameters<typeof evaluateMuscleCoverage>[0];

export {
  evaluateMuscleCoverage,
  detectUndercoveredMuscles,
  detectOverstackedMuscles,
  detectRedundantExerciseStacking,
  getIndirectWorkForMuscle,
  suggestMissingWorkForMuscle,
  validateSessionAgainstTargetMuscles,
};

export function getPrimaryWorkForMuscle(input: InputLike, muscle: MuscleRuleId): number {
  return evaluateMuscleCoverage(input).directSetsByMuscle[muscle] ?? 0;
}

function expectedPatternTokens(ruleId: MuscleRuleId): string[] {
  const rule = MUSCLE_RULES[ruleId];
  return (rule.keyMovementPatterns ?? []).map((x) => x.toLowerCase());
}

function observedPatterns(input: InputLike): Set<string> {
  const out = new Set<string>();
  const sessions = Array.isArray((input as any).days) ? (input as any).days : [input];
  for (const s of sessions) {
    for (const ex of s.exercises ?? []) {
      const meta = getExerciseByIdOrName(ex.exerciseId ?? ex.exerciseName ?? "");
      if (!meta) continue;
      out.add(String(meta.movementPattern ?? "").toLowerCase());
      for (const t of meta.tags ?? []) out.add(String(t).toLowerCase());
    }
  }
  return out;
}

export function detectMissingMovementPatterns(
  input: InputLike,
  muscle: MuscleRuleId
): string[] {
  const expected = expectedPatternTokens(muscle);
  const seen = observedPatterns(input);
  if (expected.length <= 1) return [];
  const missing = expected.filter((p) => ![...seen].some((s) => s.includes(p) || p.includes(s)));
  const requiredCount = MUSCLE_RULES[muscle].requiredPatternCount;
  if (missing.length === 0) return [];
  if (expected.length - missing.length < requiredCount) {
    return missing.map((m) => `${MUSCLE_RULES[muscle].displayName}: missing movement pattern "${m}".`);
  }
  return [];
}

