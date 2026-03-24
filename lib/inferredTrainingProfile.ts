export type InferredTrainingProfile = {
  volumeByMuscle: Record<string, number>;
  frequency: number;
  inferredSplit: "full_body" | "upper_lower" | "push_pull_legs" | "body_part_split" | "mixed";
  effortStyle: {
    averageRIR?: number;
    label: "high_effort" | "moderate_effort" | "conservative_effort" | "unknown";
  };
  weakMuscleGroups: string[];
};

function inferSplitFromFrequencyAndVolume(
  frequency: number,
  volumeByMuscle: Record<string, number>
): InferredTrainingProfile["inferredSplit"] {
  const activeGroups = Object.values(volumeByMuscle).filter((v) => v > 0).length;
  if (frequency <= 2) return "full_body";
  if (frequency <= 4) return "upper_lower";
  if (frequency >= 5 && activeGroups >= 5) return "push_pull_legs";
  if (frequency >= 5 && activeGroups <= 3) return "body_part_split";
  return "mixed";
}

function inferEffortLabel(avgRIR?: number): InferredTrainingProfile["effortStyle"]["label"] {
  if (avgRIR === undefined || !Number.isFinite(avgRIR)) return "unknown";
  if (avgRIR <= 1) return "high_effort";
  if (avgRIR <= 3) return "moderate_effort";
  return "conservative_effort";
}

export function buildInferredTrainingProfile(params: {
  weeklyVolume: Record<string, number>;
  frequency: number;
  averageRIR?: number;
}): InferredTrainingProfile {
  const volumeByMuscle = params.weeklyVolume ?? {};
  const weakMuscleGroups = Object.entries(volumeByMuscle)
    .filter(([, sets]) => Number.isFinite(sets) && sets < 8)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([group]) => group);

  return {
    volumeByMuscle,
    frequency: Number.isFinite(params.frequency) ? params.frequency : 0,
    inferredSplit: inferSplitFromFrequencyAndVolume(params.frequency, volumeByMuscle),
    effortStyle: {
      averageRIR: params.averageRIR,
      label: inferEffortLabel(params.averageRIR),
    },
    weakMuscleGroups,
  };
}
