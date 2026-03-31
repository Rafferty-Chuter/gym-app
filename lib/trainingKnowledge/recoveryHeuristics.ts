import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import { MUSCLE_RECOVERY_RULES } from "@/lib/trainingKnowledge/fatigueRules";

export function estimateRecoveryWindow(muscleOrSession: string): { min: number; max: number } {
  const key = muscleOrSession.toLowerCase();
  const match = MUSCLE_RECOVERY_RULES.find((m) => key.includes(m.muscle) || m.muscle.includes(key));
  return match?.typicalRecoveryHours ?? { min: 24, max: 48 };
}

export function isBackToBackSchedulingTooAggressive(programme: AssistantStructuredProgramme): boolean {
  const large = ["chest", "back", "lats_upper_back", "quads", "hamstrings", "glutes"];
  for (let i = 1; i < programme.days.length; i++) {
    const prev = (programme.days[i - 1].targetMuscles ?? []).map((x) => x.toLowerCase());
    const cur = (programme.days[i].targetMuscles ?? []).map((x) => x.toLowerCase());
    if (large.some((m) => prev.includes(m) && cur.includes(m))) return true;
  }
  return false;
}

export function detectLikelyUnderRecovery(params: {
  recentSessionsPer7d: number;
  feelsWrecked?: boolean;
  performanceDrop?: boolean;
}): boolean {
  if (params.recentSessionsPer7d >= 6 && (params.feelsWrecked || params.performanceDrop)) return true;
  return Boolean(params.performanceDrop && params.recentSessionsPer7d >= 5);
}

export function shouldReduceVolumeNextSession(params: {
  underRecovered: boolean;
  lowFatigueMode?: boolean;
}): boolean {
  return params.underRecovered || Boolean(params.lowFatigueMode);
}

export function shouldInsertLowFatigueSession(programme: AssistantStructuredProgramme): boolean {
  return isBackToBackSchedulingTooAggressive(programme) || programme.days.length >= 6;
}

