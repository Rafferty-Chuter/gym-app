import {
  detectMissingMovementPatterns,
  detectOverstackedMuscles,
  detectRedundantExerciseStacking,
  detectUndercoveredMuscles,
  validateSessionAgainstTargetMuscles,
} from "@/lib/trainingKnowledge/muscleCoverage";
import { MUSCLE_RULES, type MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { mapTargetTokenToMuscleGroup } from "@/lib/muscleGroupMapper";

type SessionLike = {
  targetMuscles?: string[];
  exercises?: Array<{ exerciseName?: string; exerciseId?: string; sets?: string | { min: number; max: number } }>;
};

export type SessionValidity = {
  ok: boolean;
  issues: string[];
  warnings: string[];
};

export function assessSessionValidity(session: SessionLike): SessionValidity {
  const targets = (session.targetMuscles ?? [])
    .map((x) => mapTargetTokenToMuscleGroup(x))
    .filter((x): x is MuscleRuleId => Boolean(x));

  const issues: string[] = [];
  const warnings: string[] = [];
  const coverage = validateSessionAgainstTargetMuscles(session, targets);
  if (!coverage.ok) issues.push(...coverage.issues);

  for (const t of targets) {
    warnings.push(...detectMissingMovementPatterns(session, t));
  }
  const under = detectUndercoveredMuscles(session).filter((m) => targets.includes(m));
  if (under.length) warnings.push(`Under-covered targets: ${under.map((m) => MUSCLE_RULES[m].displayName).join(", ")}.`);
  const over = detectOverstackedMuscles(session).filter((m) => targets.includes(m));
  if (over.length) warnings.push(`Potential overstack: ${over.map((m) => MUSCLE_RULES[m].displayName).join(", ")}.`);
  warnings.push(...detectRedundantExerciseStacking(session));

  return { ok: issues.length === 0, issues, warnings };
}

