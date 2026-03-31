import {
  EXERCISE_METADATA_LIBRARY,
  getExerciseByIdOrName,
  type ExerciseMetadata,
} from "@/lib/exerciseMetadataLibrary";
import { mapExerciseToMuscleStimulus } from "@/lib/muscleGroupMapper";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";

export type ExerciseRoleV1 =
  | "primary_compound"
  | "secondary_compound"
  | "machine_compound"
  | "isolation"
  | "accessory"
  | "stability";

export type ExerciseIntelligence = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  directStimulusMuscles: MuscleRuleId[];
  indirectStimulusMuscles: MuscleRuleId[];
  movementPattern: string;
  exerciseRole: ExerciseRoleV1;
  fatigueCost: ExerciseMetadata["fatigueCost"];
  lengthBias: "lengthened" | "neutral" | "shortened";
  resistanceProfile: "free_weight" | "machine_cable" | "bodyweight" | "mixed";
  redundancyGroup: string;
  useCase: string;
  equipment: string[];
  substitutions: string[];
  repRange: string;
  placement: "early" | "middle" | "late";
};

function mapRole(role: ExerciseMetadata["role"]): ExerciseRoleV1 {
  if (role === "main_compound") return "primary_compound";
  if (role === "secondary_compound") return "secondary_compound";
  if (role === "machine_compound") return "machine_compound";
  if (role === "isolation") return "isolation";
  if (role === "accessory") return "accessory";
  return "stability";
}

function mapLengthBias(v: ExerciseMetadata["lengthBias"]): ExerciseIntelligence["lengthBias"] {
  if (v === "stretch_biased") return "lengthened";
  if (v === "shortened_biased") return "shortened";
  return "neutral";
}

function inferResistanceProfile(ex: ExerciseMetadata): ExerciseIntelligence["resistanceProfile"] {
  const equipment = (ex.equipment ?? []).join(" ").toLowerCase();
  if (ex.loadCategory.includes("bodyweight")) return "bodyweight";
  if (equipment.includes("machine") || equipment.includes("cable")) return "machine_cable";
  if (equipment.includes("barbell") || equipment.includes("dumbbell")) return "free_weight";
  return "mixed";
}

function inferPlacement(ex: ExerciseMetadata): ExerciseIntelligence["placement"] {
  if (ex.role === "main_compound") return "early";
  if (ex.role === "secondary_compound" || ex.role === "machine_compound") return "middle";
  return "late";
}

function inferRedundancyGroup(ex: ExerciseMetadata): string {
  if (ex.redundancyGroup) return ex.redundancyGroup;
  if (ex.movementPattern.includes("horizontal_push")) return "horizontal_push_press";
  if (ex.movementPattern.includes("vertical_push")) return "vertical_push_press";
  if (ex.movementPattern.includes("vertical_pull")) return "vertical_pull";
  if (ex.movementPattern.includes("horizontal_pull")) return "horizontal_pull_row";
  if (ex.movementPattern.includes("hip_hinge")) return "hip_hinge";
  if (ex.movementPattern.includes("knee_extension")) return "knee_extension_iso";
  if (ex.movementPattern.includes("knee_flexion")) return "knee_flexion_iso";
  if (ex.id.includes("lateral_raise")) return "lateral_raise_family";
  return ex.movementPattern || "general";
}

const OVERRIDE_USE_CASE: Record<string, string> = {
  jm_press: "Direct triceps-biased pressing accessory; useful between pure presses and pure extensions.",
  lateral_raise: "Direct side-delt hypertrophy work without meaningful chest/triceps loading.",
  romanian_deadlift: "Posterior-chain hinge with long-length hamstring emphasis.",
};

export function toExerciseIntelligence(ex: ExerciseMetadata): ExerciseIntelligence {
  const stim = mapExerciseToMuscleStimulus(ex);
  return {
    id: ex.id,
    name: ex.name,
    primaryMuscles: ex.primaryMuscles,
    secondaryMuscles: ex.secondaryMuscles,
    directStimulusMuscles: stim.direct as MuscleRuleId[],
    indirectStimulusMuscles: stim.indirect as MuscleRuleId[],
    movementPattern: ex.movementPattern,
    exerciseRole: mapRole(ex.role),
    fatigueCost: ex.fatigueCost,
    lengthBias: mapLengthBias(ex.lengthBias),
    resistanceProfile: inferResistanceProfile(ex),
    redundancyGroup: inferRedundancyGroup(ex),
    useCase:
      OVERRIDE_USE_CASE[ex.id] ??
      ex.idealUseCases?.join(" ") ??
      ex.typicalPlacementInSession ??
      "General hypertrophy and strength progression movement.",
    equipment: ex.equipment,
    substitutions: ex.substitutes ?? [],
    repRange: ex.recommendedRepRange,
    placement: inferPlacement(ex),
  };
}

export function getExerciseIntelligence(idOrName: string): ExerciseIntelligence | null {
  const ex = getExerciseByIdOrName(idOrName);
  if (!ex) return null;
  return toExerciseIntelligence(ex);
}

export function getAllExerciseIntelligence(): ExerciseIntelligence[] {
  return EXERCISE_METADATA_LIBRARY.map(toExerciseIntelligence);
}

