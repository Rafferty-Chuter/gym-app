import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { getVolumeRule, type UserLevel } from "@/lib/trainingKnowledge/volumeRules";
import { mapTargetTokenToMuscleGroup } from "@/lib/muscleGroupMapper";
import { getWeeklyDirectSetsForMuscle } from "@/lib/trainingKnowledge/weeklyVolume";

type Input = AssistantStructuredProgramme;

export function getTrainingFrequencyForMuscle(input: Input, muscle: MuscleRuleId): number {
  let days = 0;
  for (const d of input.days ?? []) {
    const targets = (d.targetMuscles ?? [])
      .map((t) => mapTargetTokenToMuscleGroup(t))
      .filter((x): x is MuscleRuleId => Boolean(x));
    if (targets.includes(muscle)) days += 1;
  }
  return days;
}

export function evaluateFrequencyForMuscle(input: Input, muscle: MuscleRuleId, userLevel: UserLevel) {
  const freq = getTrainingFrequencyForMuscle(input, muscle);
  const rule = getVolumeRule(muscle, userLevel);
  const status =
    freq < rule.commonFrequencyRange.min ? "low" : freq > rule.commonFrequencyRange.max + 1 ? "high" : "target";
  return { freq, status, rule };
}

export function shouldSplitVolumeAcrossMoreSessions(input: Input, muscle: MuscleRuleId): boolean {
  const weekly = getWeeklyDirectSetsForMuscle(input, muscle);
  const freq = getTrainingFrequencyForMuscle(input, muscle);
  return weekly > 14 && freq < 2;
}

export function detectFrequencyTooLowForVolumeGoal(input: Input, muscle: MuscleRuleId): boolean {
  const weekly = getWeeklyDirectSetsForMuscle(input, muscle);
  const freq = getTrainingFrequencyForMuscle(input, muscle);
  return weekly >= 12 && freq <= 1;
}

