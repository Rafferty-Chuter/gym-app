import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { evaluateMuscleCoverage } from "@/lib/trainingKnowledge/muscleCoverage";
import { getVolumeRule, type UserLevel } from "@/lib/trainingKnowledge/volumeRules";

type SessionInput = {
  targetMuscles?: string[];
  exercises?: Array<{ exerciseId?: string; exerciseName?: string; sets?: string | { min: number; max: number } }>;
};

export function getDirectSetsForMuscleInSession(session: SessionInput, muscle: MuscleRuleId): number {
  return evaluateMuscleCoverage(session).directSetsByMuscle[muscle] ?? 0;
}

export function evaluatePerSessionDose(session: SessionInput, muscle: MuscleRuleId, userLevel: UserLevel) {
  const rule = getVolumeRule(muscle, userLevel);
  const sets = getDirectSetsForMuscleInSession(session, muscle);
  const status =
    sets < rule.typicalPerSessionDirectSetRange.min
      ? "low"
      : sets > rule.perSessionPracticalCeiling
        ? "high"
        : "target";
  return { sets, status, rule };
}

export function detectMuscleSessionDoseTooLow(session: SessionInput, muscle: MuscleRuleId, userLevel: UserLevel): boolean {
  return evaluatePerSessionDose(session, muscle, userLevel).status === "low";
}

export function detectMuscleSessionDoseTooHigh(session: SessionInput, muscle: MuscleRuleId, userLevel: UserLevel): boolean {
  return evaluatePerSessionDose(session, muscle, userLevel).status === "high";
}

export function detectSessionOverstacking(session: SessionInput): string[] {
  const cov = evaluateMuscleCoverage(session);
  return Object.entries(cov.directSetsByMuscle)
    .filter(([, n]) => n > 10)
    .map(([m, n]) => `${m} is very high in one session (~${Math.round(n)} direct sets).`);
}

