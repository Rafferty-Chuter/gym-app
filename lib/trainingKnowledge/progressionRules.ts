export type ProgressionCategory =
  | "compound_lift"
  | "isolation_lift"
  | "hypertrophy_biased"
  | "strength_biased";

export type ProgressionRule = {
  category: ProgressionCategory;
  preferredProgressionStyle: "double_progression" | "load_first" | "reps_first";
  loadJumpDefault: { lowerBody: number; upperBody: number; isolation: number };
  repRangeLogic: "hit_top_of_range_then_add_load" | "reps_then_sets_then_load" | "tight_strength_band";
  targetRIRRange: { min: number; max: number };
  whenToIncreaseLoad: string[];
  whenToIncreaseReps: string[];
  whenToHoldSteady: string[];
  whenToReduceLoad: string[];
  plateauWindowWeeks: number;
  noiseTolerance: "low" | "moderate" | "high";
  notes: string[];
};

export const PROGRESSION_RULES: Record<ProgressionCategory, ProgressionRule> = {
  compound_lift: {
    category: "compound_lift",
    preferredProgressionStyle: "double_progression",
    loadJumpDefault: { lowerBody: 5, upperBody: 2.5, isolation: 1.25 },
    repRangeLogic: "hit_top_of_range_then_add_load",
    targetRIRRange: { min: 1, max: 3 },
    whenToIncreaseLoad: ["Top-end reps met across sets with >=1-2 RIR.", "RIR stays >3 for repeated sessions."],
    whenToIncreaseReps: ["Load is stable but reps are below top of target range with good technique."],
    whenToHoldSteady: ["Fatigue is high, reps stable, RIR around 1-2."],
    whenToReduceLoad: ["Repeated 0-1 RIR with stalled reps/load over multiple sessions."],
    plateauWindowWeeks: 3,
    noiseTolerance: "moderate",
    notes: ["Compounds usually progress load once rep targets are consistently met."],
  },
  isolation_lift: {
    category: "isolation_lift",
    preferredProgressionStyle: "double_progression",
    loadJumpDefault: { lowerBody: 2.5, upperBody: 1.25, isolation: 1.25 },
    repRangeLogic: "reps_then_sets_then_load",
    targetRIRRange: { min: 1, max: 3 },
    whenToIncreaseLoad: ["Consistently at top reps with controlled tempo and >1 RIR."],
    whenToIncreaseReps: ["Primary progression path for most isolations."],
    whenToHoldSteady: ["Technique drift or local fatigue despite stable reps."],
    whenToReduceLoad: ["Joint irritation or repeated failure with no rep progress."],
    plateauWindowWeeks: 3,
    noiseTolerance: "high",
    notes: ["Isolations often progress reps first, then smaller load jumps."],
  },
  hypertrophy_biased: {
    category: "hypertrophy_biased",
    preferredProgressionStyle: "double_progression",
    loadJumpDefault: { lowerBody: 5, upperBody: 2.5, isolation: 1.25 },
    repRangeLogic: "hit_top_of_range_then_add_load",
    targetRIRRange: { min: 1, max: 3 },
    whenToIncreaseLoad: ["When reps reach upper band with quality and RIR still >=1-2."],
    whenToIncreaseReps: ["When load jump would drop reps too far below target."],
    whenToHoldSteady: ["When soreness/fatigue is high but trend still moving slowly upward."],
    whenToReduceLoad: ["When performance trend drops across multiple sessions."],
    plateauWindowWeeks: 4,
    noiseTolerance: "high",
    notes: ["Failure is not required; consistent near-failure work is enough."],
  },
  strength_biased: {
    category: "strength_biased",
    preferredProgressionStyle: "load_first",
    loadJumpDefault: { lowerBody: 5, upperBody: 2.5, isolation: 1.25 },
    repRangeLogic: "tight_strength_band",
    targetRIRRange: { min: 1, max: 3 },
    whenToIncreaseLoad: ["Reps and bar speed look stable at current load."],
    whenToIncreaseReps: ["Secondary option when load jump is too aggressive."],
    whenToHoldSteady: ["Technique needs consolidation at current load."],
    whenToReduceLoad: ["Repeated misses or hard grinders with no movement in performance."],
    plateauWindowWeeks: 3,
    noiseTolerance: "low",
    notes: ["Strength-biased work prioritizes load progression with tighter rep bands."],
  },
};

