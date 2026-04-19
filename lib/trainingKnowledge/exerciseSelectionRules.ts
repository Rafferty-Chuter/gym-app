import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";

export type ExerciseSelectionRule = {
  key: string;
  primaryDefault: "compound" | "isolation" | "either";
  secondExerciseJustifiedWhen: string[];
  redundancyFlags: string[];
  substitutionIntent: string;
  onePerCategoryDefault: boolean;
  notes: string[];
};

export const EXERCISE_SELECTION_RULES: Record<string, ExerciseSelectionRule> = {
  chest: {
    key: "chest",
    primaryDefault: "compound",
    secondExerciseJustifiedWhen: [
      "Angle changes meaningfully (flat vs incline).",
      "Second movement is isolation/fly for local targeting.",
    ],
    redundancyFlags: ["Two flat press variants back-to-back often redundant."],
    substitutionIntent: "Preserve horizontal press intent first.",
    onePerCategoryDefault: true,
    notes: ["Compounds are efficient default; add fly/isolation only if it adds distinct stimulus."],
  },
  lats_upper_back: {
    key: "lats_upper_back",
    primaryDefault: "compound",
    secondExerciseJustifiedWhen: ["Add both one vertical pull and one horizontal pull."],
    redundancyFlags: ["Pull-up + pulldown overlaps heavily unless specific progression reason exists."],
    substitutionIntent: "Preserve pull direction (vertical/horizontal) and target profile.",
    onePerCategoryDefault: true,
    notes: ["Back setup is better when pull directions are complemented, not duplicated."],
  },
  delts: {
    key: "delts",
    primaryDefault: "either",
    secondExerciseJustifiedWhen: ["Press + lateral/rear-delt isolation gives distinct stimulus."],
    redundancyFlags: ["Multiple near-identical lateral raise variants are often redundant."],
    substitutionIntent: "Preserve shoulder function emphasis (press vs raise/rear-delt).",
    onePerCategoryDefault: true,
    notes: ["Pressing alone may miss side/rear-delt focus."],
  },
  quads: {
    key: "quads",
    primaryDefault: "compound",
    secondExerciseJustifiedWhen: ["Second movement changes pattern: squat/press + extension."],
    redundancyFlags: ["Squat + hack squat can overlap heavily without a clear volume reason."],
    substitutionIntent: "Preserve knee-dominant intent and leg-drive role.",
    onePerCategoryDefault: true,
    notes: ["One heavy knee-dominant compound is often enough unless extra volume is needed."],
  },
  hamstrings: {
    key: "hamstrings",
    primaryDefault: "compound",
    secondExerciseJustifiedWhen: ["Hinge + knee-curl is complementary, not redundant."],
    redundancyFlags: ["Multiple hinges without curl can leave pattern coverage narrow."],
    substitutionIntent: "Preserve hinge or knee-flexion intent specifically.",
    onePerCategoryDefault: true,
    notes: ["Include both hip and knee function when possible."],
  },
  triceps: {
    key: "triceps",
    primaryDefault: "either",
    secondExerciseJustifiedWhen: ["Pushdown + overhead extension changes arm position and emphasis."],
    redundancyFlags: ["Two pushdown variants alone are often redundant."],
    substitutionIntent: "Preserve elbow-extension role and intended arm position.",
    onePerCategoryDefault: true,
    notes: ["Overhead and pushdown variants are not fully redundant."],
  },
  calves: {
    key: "calves",
    primaryDefault: "isolation",
    secondExerciseJustifiedWhen: ["Standing + seated can change emphasis usefully."],
    redundancyFlags: ["Two similar standing variants may not add much."],
    substitutionIntent: "Preserve plantarflexion role; note emphasis changes if needed.",
    onePerCategoryDefault: true,
    notes: ["Standing/seated pairing can be justified by emphasis differences."],
  },
};

export function ruleForMuscle(muscle: MuscleRuleId): ExerciseSelectionRule | null {
  return EXERCISE_SELECTION_RULES[muscle] ?? null;
}

