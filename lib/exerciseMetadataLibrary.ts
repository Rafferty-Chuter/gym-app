export type FatigueCost = "low" | "moderate" | "high" | "very_high";

export type ExerciseRole =
  | "main_compound"
  | "secondary_compound"
  | "machine_compound"
  | "isolation"
  | "accessory";

export type ExerciseMetadata = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementPattern: string;
  role: ExerciseRole;
  equipment: string[];
  fatigueCost: FatigueCost;
  substitutes: string[];
  loadCategory: string;
  recommendedRepRange: string;
  lengthBias: "stretch_biased" | "neutral" | "shortened_biased";
  tags: string[];
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

export const EXERCISE_METADATA_LIBRARY: ExerciseMetadata[] = [
  {
    id: "flat_barbell_bench_press",
    name: "Flat Barbell Bench Press",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front_delts"],
    movementPattern: "horizontal_push",
    role: "main_compound",
    equipment: ["barbell", "bench", "rack"],
    fatigueCost: "high",
    substitutes: ["flat_dumbbell_press", "machine_chest_press", "smith_flat_press"],
    loadCategory: "free_weight_compound",
    recommendedRepRange: "4-8",
    lengthBias: "neutral",
    tags: ["chest", "push", "upper", "full_body", "horizontal_push"],
  },
  {
    id: "incline_dumbbell_press",
    name: "Incline Dumbbell Press",
    primaryMuscles: ["upper_chest"],
    secondaryMuscles: ["triceps", "front_delts"],
    movementPattern: "incline_horizontal_push",
    role: "secondary_compound",
    equipment: ["dumbbells", "incline_bench"],
    fatigueCost: "moderate",
    substitutes: ["incline_barbell_press", "smith_incline_press", "incline_machine_press"],
    loadCategory: "free_weight_compound",
    recommendedRepRange: "6-12",
    lengthBias: "neutral",
    tags: ["chest", "push", "upper", "horizontal_push"],
  },
  {
    id: "cable_chest_fly",
    name: "Cable Chest Fly",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    movementPattern: "horizontal_adduction",
    role: "isolation",
    equipment: ["cable_machine"],
    fatigueCost: "low",
    substitutes: ["pec_deck", "dumbbell_fly", "machine_fly"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "10-20",
    lengthBias: "stretch_biased",
    tags: ["chest", "push", "upper", "full_body"],
  },
  {
    id: "chest_supported_row",
    name: "Chest-Supported Row",
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["rear_delts", "biceps"],
    movementPattern: "horizontal_pull",
    role: "secondary_compound",
    equipment: ["machine_or_bench", "dumbbells_or_plate_loaded"],
    fatigueCost: "moderate",
    substitutes: ["seated_cable_row", "barbell_row", "machine_row"],
    loadCategory: "compound_row",
    recommendedRepRange: "6-12",
    lengthBias: "neutral",
    tags: ["back", "pull", "upper", "full_body", "horizontal_pull"],
  },
  {
    id: "lat_pulldown",
    name: "Lat Pulldown",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper_back"],
    movementPattern: "vertical_pull",
    role: "secondary_compound",
    equipment: ["cable_machine", "pulldown_station"],
    fatigueCost: "moderate",
    substitutes: ["pull_up", "assisted_pull_up", "single_arm_pulldown"],
    loadCategory: "machine_compound",
    recommendedRepRange: "6-12",
    lengthBias: "stretch_biased",
    tags: ["back", "pull", "upper", "full_body", "vertical_pull"],
  },
  {
    id: "pull_up",
    name: "Pull-Up / Chin-Up",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper_back", "core"],
    movementPattern: "vertical_pull",
    role: "main_compound",
    equipment: ["pullup_bar"],
    fatigueCost: "high",
    substitutes: ["lat_pulldown", "assisted_pull_up", "neutral_grip_pulldown"],
    loadCategory: "bodyweight_compound",
    recommendedRepRange: "4-10",
    lengthBias: "stretch_biased",
    tags: ["back", "pull", "upper", "full_body", "vertical_pull"],
  },
  {
    id: "rear_delt_cable_fly",
    name: "Rear Delt Cable Fly",
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["mid_traps", "rhomboids"],
    movementPattern: "horizontal_abduction",
    role: "isolation",
    equipment: ["cable_machine"],
    fatigueCost: "low",
    substitutes: ["reverse_pec_deck", "rear_delt_dumbbell_fly", "face_pull"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "12-20",
    lengthBias: "stretch_biased",
    tags: ["shoulders", "back", "pull", "upper", "full_body"],
  },
  {
    id: "back_squat",
    name: "Back Squat",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["adductors", "spinal_erectors"],
    movementPattern: "squat",
    role: "main_compound",
    equipment: ["barbell", "rack"],
    fatigueCost: "very_high",
    substitutes: ["front_squat", "hack_squat", "leg_press"],
    loadCategory: "free_weight_compound",
    recommendedRepRange: "3-8",
    lengthBias: "neutral",
    tags: ["legs", "lower", "full_body", "quad_dominant"],
  },
  {
    id: "hack_squat_or_leg_press",
    name: "Hack Squat / Leg Press",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["adductors"],
    movementPattern: "machine_squat",
    role: "machine_compound",
    equipment: ["hack_squat_machine_or_leg_press"],
    fatigueCost: "high",
    substitutes: ["back_squat", "front_squat", "smith_squat", "split_squat"],
    loadCategory: "machine_compound",
    recommendedRepRange: "6-12",
    lengthBias: "stretch_biased",
    tags: ["legs", "lower", "quad_dominant"],
  },
  {
    id: "romanian_deadlift",
    name: "Romanian Deadlift / Stiff-Leg Deadlift",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["spinal_erectors", "adductors"],
    movementPattern: "hip_hinge",
    role: "main_compound",
    equipment: ["barbell_or_dumbbells"],
    fatigueCost: "high",
    substitutes: ["good_morning", "45_degree_back_extension", "cable_pull_through"],
    loadCategory: "free_weight_compound",
    recommendedRepRange: "5-10",
    lengthBias: "stretch_biased",
    tags: ["legs", "lower", "full_body", "hamstring", "glute", "hip_hinge"],
  },
  {
    id: "leg_curl",
    name: "Leg Curl",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["calves"],
    movementPattern: "knee_flexion",
    role: "isolation",
    equipment: ["leg_curl_machine"],
    fatigueCost: "low",
    substitutes: ["nordic_curl", "stability_ball_leg_curl", "slider_leg_curl"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "8-15",
    lengthBias: "stretch_biased",
    tags: ["legs", "lower", "hamstring"],
  },
  {
    id: "leg_extension",
    name: "Leg Extension",
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    movementPattern: "knee_extension",
    role: "isolation",
    equipment: ["leg_extension_machine"],
    fatigueCost: "low",
    substitutes: ["sissy_squat", "split_squat_quad_bias", "step_up_quad_bias"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "10-20",
    lengthBias: "shortened_biased",
    tags: ["legs", "lower", "quad_dominant"],
  },
  {
    id: "standing_or_seated_calf_raise",
    name: "Calf Raise (Standing / Seated)",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    movementPattern: "ankle_plantarflexion",
    role: "isolation",
    equipment: ["calf_machine_or_leg_press_or_dumbbells"],
    fatigueCost: "low",
    substitutes: ["leg_press_calf_raise", "single_leg_calf_raise", "smith_calf_raise"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "8-20",
    lengthBias: "stretch_biased",
    tags: ["legs", "lower", "calf"],
  },
  {
    id: "overhead_press",
    name: "Overhead Press",
    primaryMuscles: ["front_delts", "side_delts"],
    secondaryMuscles: ["triceps", "upper_chest"],
    movementPattern: "vertical_push",
    role: "main_compound",
    equipment: ["barbell_or_dumbbells"],
    fatigueCost: "high",
    substitutes: ["machine_shoulder_press", "smith_overhead_press", "landmine_press"],
    loadCategory: "free_weight_compound",
    recommendedRepRange: "4-8",
    lengthBias: "neutral",
    tags: ["shoulders", "push", "upper", "full_body", "vertical_push"],
  },
  {
    id: "lateral_raise",
    name: "Lateral Raise",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: ["supraspinatus"],
    movementPattern: "shoulder_abduction",
    role: "isolation",
    equipment: ["dumbbells_or_cables"],
    fatigueCost: "low",
    substitutes: ["machine_lateral_raise", "cable_lateral_raise", "leaning_lateral_raise"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "12-25",
    lengthBias: "stretch_biased",
    tags: ["shoulders", "push", "upper", "full_body"],
  },
  {
    id: "biceps_curl",
    name: "Biceps Curl",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["brachialis", "forearms"],
    movementPattern: "elbow_flexion",
    role: "isolation",
    equipment: ["dumbbells_or_barbell_or_cable"],
    fatigueCost: "low",
    substitutes: ["hammer_curl", "preacher_curl", "cable_curl"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "8-15",
    lengthBias: "neutral",
    tags: ["arms", "pull", "upper", "full_body", "biceps"],
  },
  {
    id: "triceps_pushdown_or_extension",
    name: "Triceps Extension / Pushdown",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["anconeus"],
    movementPattern: "elbow_extension",
    role: "isolation",
    equipment: ["cable_machine_or_dumbbells"],
    fatigueCost: "low",
    substitutes: ["overhead_extension", "skullcrusher", "machine_dip"],
    loadCategory: "isolation_machine_cable",
    recommendedRepRange: "8-15",
    lengthBias: "stretch_biased",
    tags: ["arms", "push", "upper", "full_body", "triceps"],
  },
  {
    id: "hip_thrust_or_glute_bridge",
    name: "Hip Thrust / Glute Bridge",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "adductors"],
    movementPattern: "hip_extension",
    role: "secondary_compound",
    equipment: ["barbell_or_machine_or_dumbbells", "bench_optional"],
    fatigueCost: "moderate",
    substitutes: ["romanian_deadlift", "cable_pull_through", "45_degree_back_extension"],
    loadCategory: "compound_glute",
    recommendedRepRange: "6-12",
    lengthBias: "shortened_biased",
    tags: ["legs", "lower", "glute", "hip_hinge"],
  },
];

const byId = new Map<string, ExerciseMetadata>(
  EXERCISE_METADATA_LIBRARY.map((e) => [e.id, e])
);
const byNameNorm = new Map<string, ExerciseMetadata>(
  EXERCISE_METADATA_LIBRARY.map((e) => [norm(e.name), e])
);

export function getExerciseById(id: string): ExerciseMetadata | undefined {
  return byId.get(id);
}

export function getExerciseByName(name: string): ExerciseMetadata | undefined {
  const n = norm(name);
  const exact = byNameNorm.get(n);
  if (exact) return exact;
  return EXERCISE_METADATA_LIBRARY.find((e) => n.includes(norm(e.name)) || norm(e.name).includes(n));
}

export function getExerciseByIdOrName(key: string): ExerciseMetadata | undefined {
  return getExerciseById(key) ?? getExerciseByName(key);
}

export function filterExercisesByTag(tag: string): ExerciseMetadata[] {
  const t = norm(tag);
  return EXERCISE_METADATA_LIBRARY.filter((e) => e.tags.some((x) => norm(x) === t));
}

export function filterExercisesByRole(role: ExerciseRole): ExerciseMetadata[] {
  return EXERCISE_METADATA_LIBRARY.filter((e) => e.role === role);
}

export function filterExercisesByEquipment(equipment: string[] | string): ExerciseMetadata[] {
  const required = Array.isArray(equipment) ? equipment : [equipment];
  const req = uniq(required.map(norm));
  return EXERCISE_METADATA_LIBRARY.filter((e) => {
    const have = e.equipment.map(norm);
    return req.every((r) => have.includes(r));
  });
}

