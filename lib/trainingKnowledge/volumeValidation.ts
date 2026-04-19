import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { getVolumeRule, type UserLevel } from "@/lib/trainingKnowledge/volumeRules";
import { evaluatePerSessionDose } from "@/lib/trainingKnowledge/sessionDose";

export function getV1VolumeStatus(
  muscle: MuscleRuleId,
  weeklySets: number,
  userLevel: UserLevel
): "under" | "target" | "high" | "over" {
  const rule = getVolumeRule(muscle, userLevel);
  if (weeklySets < rule.underCoverageThreshold) return "under";
  if (weeklySets > rule.hardUpperWeeklyWarning) return "over";
  if (weeklySets > rule.softUpperWeeklyRange) return "high";
  return "target";
}

export function getVolumeWarningLevel(
  muscle: MuscleRuleId,
  weeklySets: number,
  sessionSets: number,
  userLevel: UserLevel
): "none" | "caution" | "warning" {
  const status = getV1VolumeStatus(muscle, weeklySets, userLevel);
  const rule = getVolumeRule(muscle, userLevel);
  if (status === "over" || sessionSets > rule.perSessionPracticalCeiling) return "warning";
  if (status === "high" || sessionSets > rule.typicalPerSessionDirectSetRange.max) return "caution";
  return "none";
}

export function validateSessionVolumeV1(
  session: {
    targetMuscles?: string[];
    exercises?: Array<{ exerciseName?: string; sets?: string | { min: number; max: number } }>;
  },
  userLevel: UserLevel
): string[] {
  const targets = (session.targetMuscles ?? []).map((x) => x.toLowerCase());
  const out: string[] = [];
  const muscleTokens: MuscleRuleId[] = [
    "chest","lats_upper_back","quads","hamstrings","glutes","delts","biceps","triceps","calves",
  ];
  for (const m of muscleTokens) {
    if (!targets.some((t) => t.includes(m.split("_")[0]) || m.includes(t))) continue;
    const s = evaluatePerSessionDose(session, m, userLevel);
    if (s.status === "low") out.push(`${m} may be under-dosed in this session.`);
    if (s.status === "high") out.push(`${m} may be over-stacked in this session.`);
  }
  return out;
}

