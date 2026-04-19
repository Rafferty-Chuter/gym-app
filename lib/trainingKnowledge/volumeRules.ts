import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";

export type UserLevel = "novice" | "trained";

export type VolumeRule = {
  minimalEffectiveWeeklySets: number;
  underCoverageThreshold: number;
  targetWeeklySetRange: { min: number; max: number };
  softUpperWeeklyRange: number;
  hardUpperWeeklyWarning: number;
  typicalPerSessionDirectSetRange: { min: number; max: number };
  perSessionPracticalCeiling: number;
  commonFrequencyRange: { min: number; max: number };
  notes: string[];
};

export const VOLUME_RULES_BY_LEVEL: Record<UserLevel, VolumeRule> = {
  novice: {
    minimalEffectiveWeeklySets: 6,
    underCoverageThreshold: 4,
    targetWeeklySetRange: { min: 6, max: 14 },
    softUpperWeeklyRange: 18,
    hardUpperWeeklyWarning: 25,
    typicalPerSessionDirectSetRange: { min: 3, max: 7 },
    perSessionPracticalCeiling: 9,
    commonFrequencyRange: { min: 1, max: 3 },
    notes: ["Beginners often progress with lower total volume and steady execution quality."],
  },
  trained: {
    minimalEffectiveWeeklySets: 10,
    underCoverageThreshold: 8,
    targetWeeklySetRange: { min: 10, max: 20 },
    softUpperWeeklyRange: 22,
    hardUpperWeeklyWarning: 30,
    typicalPerSessionDirectSetRange: { min: 4, max: 8 },
    perSessionPracticalCeiling: 10,
    commonFrequencyRange: { min: 2, max: 3 },
    notes: ["~10+ weekly sets is a practical hypertrophy baseline for many trained users."],
  },
};

const L = VOLUME_RULES_BY_LEVEL.trained;
const S = VOLUME_RULES_BY_LEVEL.novice;

export const MUSCLE_SPECIFIC_VOLUME_RULES: Partial<Record<MuscleRuleId, VolumeRule>> = {
  chest: L,
  lats_upper_back: L,
  quads: { ...L, targetWeeklySetRange: { min: 10, max: 18 }, softUpperWeeklyRange: 20 },
  hamstrings: { ...L, targetWeeklySetRange: { min: 8, max: 16 } },
  glutes: { ...L, targetWeeklySetRange: { min: 8, max: 16 } },
  delts: { ...L, targetWeeklySetRange: { min: 8, max: 16 } },
  biceps: { ...L, targetWeeklySetRange: { min: 8, max: 14 }, hardUpperWeeklyWarning: 24 },
  triceps: { ...L, targetWeeklySetRange: { min: 8, max: 14 }, hardUpperWeeklyWarning: 24 },
  calves: { ...S, targetWeeklySetRange: { min: 8, max: 16 }, minimalEffectiveWeeklySets: 8 },
};

export function getVolumeRule(muscle: MuscleRuleId, level: UserLevel): VolumeRule {
  return MUSCLE_SPECIFIC_VOLUME_RULES[muscle] ?? VOLUME_RULES_BY_LEVEL[level];
}

