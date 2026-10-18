/**
 * Catalogue additions (training redesign, TR1): the common lifts the first
 * library left out (deadlift, front squat, barbell row, chin up, push up,
 * face pull...), equipment for every built-in exercise so the picker can
 * filter by it, and the names other apps use (Hevy's "Bench Press
 * (Barbell)", Strong's "Squat (Barbell)", plain "Bench Press") so imported
 * and typed names resolve to the right movement and its muscles.
 *
 * Muscle tags use the vocabulary `classifyDetailedTag` reads in
 * lib/trainingMetrics.ts; tags it does not know (forearms, adductors,
 * lower back) are kept for display and count toward no weekly band.
 */

import type { Exercise, ExerciseEquipment } from "@/lib/exerciseLibrary";

type Extra = Omit<Exercise, "fatigueCost"> & { fatigueCost?: Exercise["fatigueCost"] };

const x = (e: Extra): Exercise => ({ fatigueCost: "moderate", ...e });

/** Equipment for the original 61 entries, by id. */
export const BASE_EQUIPMENT: Readonly<Record<string, ExerciseEquipment>> = {
  barbell_bench_press: "barbell",
  incline_db_press: "dumbbell",
  chest_press_machine: "machine",
  cable_fly: "cable",
  incline_barbell_press: "barbell",
  smith_incline_press: "smith",
  pec_deck: "machine",
  machine_fly: "machine",
  weighted_dip: "bodyweight",
  lat_pulldown: "cable",
  pull_up: "bodyweight",
  t_bar_row: "barbell",
  chest_supported_row: "dumbbell",
  seated_cable_row: "cable",
  one_arm_db_row: "dumbbell",
  machine_row: "machine",
  cable_pullover: "cable",
  assisted_pull_up: "machine",
  neutral_grip_pulldown: "cable",
  shoulder_press: "dumbbell",
  lateral_raise: "dumbbell",
  rear_delt_fly: "dumbbell",
  smith_shoulder_press: "smith",
  machine_shoulder_press: "machine",
  cable_lateral_raise: "cable",
  upright_row: "barbell",
  tricep_pushdown: "cable",
  overhead_tricep_extension: "dumbbell",
  dips: "bodyweight",
  skull_crusher: "barbell",
  jm_press: "barbell",
  close_grip_bench_press: "barbell",
  single_arm_pushdown: "cable",
  barbell_curl: "barbell",
  incline_db_curl: "dumbbell",
  hammer_curl: "dumbbell",
  preacher_curl: "barbell",
  cable_curl: "cable",
  machine_curl: "machine",
  concentration_curl: "dumbbell",
  barbell_squat: "barbell",
  leg_press: "machine",
  leg_extension: "machine",
  hack_squat: "machine",
  split_squat: "dumbbell",
  bulgarian_split_squat: "dumbbell",
  pendulum_squat: "machine",
  romanian_deadlift: "barbell",
  hip_thrust: "barbell",
  good_morning: "barbell",
  leg_curl: "machine",
  seated_leg_curl: "machine",
  lying_leg_curl: "machine",
  glute_bridge: "bodyweight",
  calf_raise: "machine",
  seated_calf_raise: "machine",
  ab_crunch: "bodyweight",
  plank: "bodyweight",
  hanging_leg_raise: "bodyweight",
  cable_crunch: "cable",
  ab_wheel: "other",
};

/** Other names for the original entries: Hevy and Strong style names, short forms, plain names. */
export const BASE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  barbell_bench_press: ["Bench Press", "Bench Press (Barbell)", "Flat Bench Press", "Barbell Bench", "Bench"],
  incline_db_press: ["Incline Bench Press (Dumbbell)", "Incline DB Press", "Incline Dumbbell Bench Press"],
  chest_press_machine: ["Chest Press (Machine)", "Machine Chest Press", "Chest Press"],
  cable_fly: ["Cable Crossover", "Chest Fly (Cable)", "Cable Chest Fly", "Cable Flye"],
  incline_barbell_press: ["Incline Bench Press", "Incline Bench Press (Barbell)", "Incline Barbell Bench Press"],
  smith_incline_press: ["Incline Bench Press (Smith Machine)", "Smith Machine Incline Press"],
  pec_deck: ["Butterfly (Pec Deck)", "Pec Fly", "Pec Deck Fly"],
  machine_fly: ["Chest Fly (Machine)"],
  weighted_dip: ["Weighted Dips", "Chest Dip (Weighted)"],
  lat_pulldown: ["Lat Pulldown (Cable)", "Wide Grip Lat Pulldown", "Pulldown"],
  pull_up: ["Pull-Up", "Pullup", "Pull Ups", "Pull Up (Bodyweight)", "Pull-Ups"],
  t_bar_row: ["T Bar Row", "T-Bar Row (Machine)"],
  chest_supported_row: ["Chest Supported Row (Dumbbell)", "Incline Dumbbell Row"],
  seated_cable_row: ["Seated Row", "Cable Row", "Seated Cable Row - V Grip (Cable)", "Seated Row (Cable)"],
  one_arm_db_row: ["Dumbbell Row", "Single Arm Dumbbell Row", "DB Row", "One Arm Dumbbell Row"],
  machine_row: ["Seated Row (Machine)", "Row (Machine)"],
  assisted_pull_up: ["Assisted Pull Up", "Pull Up (Assisted)", "Assisted Pullup"],
  neutral_grip_pulldown: ["Close Grip Lat Pulldown", "Lat Pulldown - Close Grip (Cable)"],
  shoulder_press: ["Dumbbell Shoulder Press", "Shoulder Press (Dumbbell)", "Seated Dumbbell Press", "DB Shoulder Press", "Seated Shoulder Press"],
  lateral_raise: ["Lateral Raise (Dumbbell)", "Side Lateral Raise", "Dumbbell Lateral Raise", "Side Raise"],
  rear_delt_fly: ["Reverse Fly", "Rear Delt Fly (Dumbbell)", "Reverse Dumbbell Fly", "Bent Over Reverse Fly"],
  smith_shoulder_press: ["Shoulder Press (Smith Machine)"],
  machine_shoulder_press: ["Shoulder Press (Machine)", "Seated Shoulder Press (Machine)"],
  cable_lateral_raise: ["Lateral Raise (Cable)"],
  upright_row: ["Upright Row (Barbell)"],
  tricep_pushdown: ["Triceps Pushdown", "Cable Pushdown", "Tricep Pushdown (Cable)", "Triceps Pushdown (Cable)"],
  overhead_tricep_extension: ["Overhead Triceps Extension", "Triceps Extension (Dumbbell)", "Overhead Tricep Extension (Dumbbell)"],
  dips: ["Dip", "Tricep Dips", "Chest Dip", "Triceps Dip"],
  skull_crusher: ["Skullcrusher", "Skull Crusher (Barbell)", "Lying Tricep Extension", "Skullcrushers"],
  close_grip_bench_press: ["Bench Press - Close Grip (Barbell)", "CGBP", "Close-Grip Bench Press"],
  barbell_curl: ["Bicep Curl (Barbell)", "Barbell Bicep Curl", "Biceps Curl (Barbell)"],
  incline_db_curl: ["Incline Curl", "Incline Dumbbell Bicep Curl"],
  hammer_curl: ["Hammer Curl (Dumbbell)", "Dumbbell Hammer Curl"],
  preacher_curl: ["Preacher Curl (Barbell)", "EZ Bar Preacher Curl"],
  cable_curl: ["Bicep Curl (Cable)", "Cable Bicep Curl"],
  machine_curl: ["Bicep Curl (Machine)", "Preacher Curl (Machine)"],
  barbell_squat: ["Squat", "Back Squat", "Squat (Barbell)", "High Bar Squat", "Low Bar Squat", "BB Squat", "Barbell Back Squat"],
  leg_press: ["Leg Press (Machine)", "45 Degree Leg Press"],
  leg_extension: ["Leg Extension (Machine)", "Leg Extensions"],
  hack_squat: ["Hack Squat (Machine)"],
  bulgarian_split_squat: ["Bulgarian Split Squat (Dumbbell)", "BSS", "Rear Foot Elevated Split Squat"],
  romanian_deadlift: ["RDL", "Romanian Deadlift (Barbell)", "Barbell RDL"],
  hip_thrust: ["Hip Thrust (Barbell)", "Barbell Hip Thrust"],
  leg_curl: ["Leg Curl (Machine)", "Hamstring Curl"],
  seated_leg_curl: ["Seated Leg Curl (Machine)"],
  lying_leg_curl: ["Lying Leg Curl (Machine)"],
  calf_raise: ["Standing Calf Raise", "Calf Raise (Machine)", "Standing Calf Raise (Machine)", "Calf Raises"],
  seated_calf_raise: ["Seated Calf Raise (Machine)"],
  ab_crunch: ["Crunch", "Crunches"],
  hanging_leg_raise: ["Hanging Leg Raises"],
  ab_wheel: ["Ab Wheel Rollout", "Ab Rollout"],
};

/** Common movements the first library did not have. */
export const EXTRA_EXERCISES: Exercise[] = [
  // ── Chest ──
  x({ id: "db_bench_press", name: "Dumbbell Bench Press", displayCategory: "Chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front delts"], movementPattern: "horizontal_push", equipment: "dumbbell", aliases: ["Bench Press (Dumbbell)", "DB Bench Press", "Flat Dumbbell Press"] }),
  x({ id: "decline_bench_press", name: "Decline Bench Press", displayCategory: "Chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], movementPattern: "horizontal_push", equipment: "barbell", aliases: ["Decline Bench Press (Barbell)"] }),
  x({ id: "db_fly", name: "Dumbbell Fly", displayCategory: "Chest", primaryMuscles: ["chest"], secondaryMuscles: ["front delts"], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Chest Fly (Dumbbell)", "Dumbbell Flye", "DB Fly"] }),
  x({ id: "incline_cable_fly", name: "Incline Cable Fly", displayCategory: "Chest", primaryMuscles: ["upper chest"], secondaryMuscles: ["front delts"], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Low to High Cable Fly"] }),
  x({ id: "push_up", name: "Push Up", displayCategory: "Chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front delts"], movementPattern: "horizontal_push", fatigueCost: "low", equipment: "bodyweight", aliases: ["Push-Up", "Push Ups", "Pushup", "Press Up", "Push-Ups"] }),
  x({ id: "smith_bench_press", name: "Smith Bench Press", displayCategory: "Chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], movementPattern: "horizontal_push", equipment: "smith", aliases: ["Bench Press (Smith Machine)", "Smith Machine Bench Press"] }),
  x({ id: "incline_machine_press", name: "Incline Chest Press Machine", displayCategory: "Chest", primaryMuscles: ["upper chest"], secondaryMuscles: ["triceps"], movementPattern: "horizontal_push", equipment: "machine", aliases: ["Incline Chest Press (Machine)", "Incline Machine Press"] }),
  x({ id: "incline_db_fly", name: "Incline Dumbbell Fly", displayCategory: "Chest", primaryMuscles: ["upper chest"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Incline Chest Fly (Dumbbell)"] }),

  // ── Back ──
  x({ id: "deadlift", name: "Deadlift", displayCategory: "Compound / Full Body", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["upper back", "lower back", "quads", "forearms"], movementPattern: "hinge", fatigueCost: "high", equipment: "barbell", aliases: ["Conventional Deadlift", "Deadlift (Barbell)", "Barbell Deadlift", "Deadlifts"] }),
  x({ id: "sumo_deadlift", name: "Sumo Deadlift", displayCategory: "Compound / Full Body", primaryMuscles: ["glutes", "quads", "hamstrings"], secondaryMuscles: ["upper back", "adductors"], movementPattern: "hinge", fatigueCost: "high", equipment: "barbell", aliases: ["Sumo Deadlift (Barbell)"] }),
  x({ id: "trap_bar_deadlift", name: "Trap Bar Deadlift", displayCategory: "Compound / Full Body", primaryMuscles: ["quads", "glutes", "hamstrings"], secondaryMuscles: ["upper back"], movementPattern: "hinge", fatigueCost: "high", equipment: "barbell", aliases: ["Hex Bar Deadlift", "Trap Bar Deadlift (Trap Bar)"] }),
  x({ id: "rack_pull", name: "Rack Pull", displayCategory: "Back", primaryMuscles: ["upper back", "glutes"], secondaryMuscles: ["hamstrings", "upper traps"], movementPattern: "hinge", fatigueCost: "high", equipment: "barbell", aliases: ["Rack Pulls"] }),
  x({ id: "barbell_row", name: "Barbell Row", displayCategory: "Back", primaryMuscles: ["upper back", "lats"], secondaryMuscles: ["biceps", "rear delts"], movementPattern: "horizontal_pull", fatigueCost: "high", equipment: "barbell", aliases: ["Bent Over Row", "Bent Over Row (Barbell)", "BB Row", "Bent Over Barbell Row"] }),
  x({ id: "pendlay_row", name: "Pendlay Row", displayCategory: "Back", primaryMuscles: ["upper back", "lats"], secondaryMuscles: ["biceps"], movementPattern: "horizontal_pull", fatigueCost: "high", equipment: "barbell", aliases: ["Pendlay Row (Barbell)"] }),
  x({ id: "chin_up", name: "Chin Up", displayCategory: "Back", primaryMuscles: ["lats"], secondaryMuscles: ["biceps"], movementPattern: "vertical_pull", equipment: "bodyweight", aliases: ["Chin-Up", "Chinup", "Chin Ups", "Chin-Ups"] }),
  x({ id: "weighted_pull_up", name: "Weighted Pull Up", displayCategory: "Back", primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "upper back"], movementPattern: "vertical_pull", fatigueCost: "high", equipment: "bodyweight", aliases: ["Weighted Pull-Up", "Pull Up (Weighted)"] }),
  x({ id: "straight_arm_pulldown", name: "Straight Arm Pulldown", displayCategory: "Back", primaryMuscles: ["lats"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Straight Arm Lat Pulldown (Cable)", "Straight-Arm Pulldown"] }),
  x({ id: "db_pullover", name: "Dumbbell Pullover", displayCategory: "Back", primaryMuscles: ["lats"], secondaryMuscles: ["chest"], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Pullover (Dumbbell)"] }),
  x({ id: "seal_row", name: "Seal Row", displayCategory: "Back", primaryMuscles: ["upper back"], secondaryMuscles: ["lats", "rear delts"], movementPattern: "horizontal_pull", equipment: "barbell", aliases: ["Seal Row (Barbell)"] }),
  x({ id: "inverted_row", name: "Inverted Row", displayCategory: "Back", primaryMuscles: ["upper back"], secondaryMuscles: ["lats", "biceps"], movementPattern: "horizontal_pull", fatigueCost: "low", equipment: "bodyweight", aliases: ["Bodyweight Row", "Australian Pull Up"] }),
  x({ id: "single_arm_cable_row", name: "Single-Arm Cable Row", displayCategory: "Back", primaryMuscles: ["lats"], secondaryMuscles: ["upper back"], movementPattern: "horizontal_pull", fatigueCost: "low", equipment: "cable", aliases: ["One Arm Cable Row", "Single Arm Cable Row"] }),
  x({ id: "shrug", name: "Shrug", displayCategory: "Back", primaryMuscles: ["upper traps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "barbell", aliases: ["Barbell Shrug", "Shrug (Barbell)", "Shrugs"] }),
  x({ id: "db_shrug", name: "Dumbbell Shrug", displayCategory: "Back", primaryMuscles: ["upper traps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Shrug (Dumbbell)"] }),
  x({ id: "back_extension", name: "Back Extension", displayCategory: "Hamstrings", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["lower back"], movementPattern: "hinge", fatigueCost: "low", equipment: "bodyweight", aliases: ["Hyperextension", "45 Degree Back Extension", "Back Extension (Hyperextension)", "Back Extensions"] }),

  // ── Shoulders ──
  x({ id: "overhead_press", name: "Overhead Press", displayCategory: "Shoulders", primaryMuscles: ["front delts"], secondaryMuscles: ["triceps", "side delts"], movementPattern: "vertical_push", fatigueCost: "high", equipment: "barbell", aliases: ["OHP", "Military Press", "Overhead Press (Barbell)", "Standing Press", "Barbell Overhead Press", "Strict Press"] }),
  x({ id: "arnold_press", name: "Arnold Press", displayCategory: "Shoulders", primaryMuscles: ["front delts", "side delts"], secondaryMuscles: ["triceps"], movementPattern: "vertical_push", equipment: "dumbbell", aliases: ["Arnold Press (Dumbbell)"] }),
  x({ id: "machine_lateral_raise", name: "Machine Lateral Raise", displayCategory: "Shoulders", primaryMuscles: ["side delts"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "machine", aliases: ["Lateral Raise (Machine)"] }),
  x({ id: "front_raise", name: "Front Raise", displayCategory: "Shoulders", primaryMuscles: ["front delts"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Front Raise (Dumbbell)", "Dumbbell Front Raise"] }),
  x({ id: "reverse_pec_deck", name: "Reverse Pec Deck", displayCategory: "Shoulders", primaryMuscles: ["rear delts"], secondaryMuscles: ["upper back"], movementPattern: "isolation", fatigueCost: "low", equipment: "machine", aliases: ["Rear Delt Machine", "Reverse Fly (Machine)", "Rear Delt Fly (Machine)"] }),
  x({ id: "cable_rear_delt_fly", name: "Cable Rear Delt Fly", displayCategory: "Shoulders", primaryMuscles: ["rear delts"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Rear Delt Fly (Cable)", "Reverse Cable Fly"] }),
  x({ id: "face_pull", name: "Face Pull", displayCategory: "Shoulders", primaryMuscles: ["rear delts"], secondaryMuscles: ["upper back"], movementPattern: "horizontal_pull", fatigueCost: "low", equipment: "cable", aliases: ["Face Pull (Cable)", "Face Pulls", "Rope Face Pull"] }),
  x({ id: "landmine_press", name: "Landmine Press", displayCategory: "Shoulders", primaryMuscles: ["front delts"], secondaryMuscles: ["upper chest", "triceps"], movementPattern: "vertical_push", equipment: "barbell", aliases: ["Landmine Press (Barbell)"] }),

  // ── Triceps ──
  x({ id: "rope_pushdown", name: "Rope Pushdown", displayCategory: "Triceps", primaryMuscles: ["triceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Triceps Rope Pushdown", "Tricep Rope Pushdown", "Rope Tricep Pushdown"] }),
  x({ id: "cable_overhead_extension", name: "Cable Overhead Tricep Extension", displayCategory: "Triceps", primaryMuscles: ["triceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Overhead Triceps Extension (Cable)", "Cable Overhead Extension"] }),
  x({ id: "tricep_kickback", name: "Tricep Kickback", displayCategory: "Triceps", primaryMuscles: ["triceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Triceps Kickback (Dumbbell)", "Kickback"] }),
  x({ id: "bench_dip", name: "Bench Dip", displayCategory: "Triceps", primaryMuscles: ["triceps"], secondaryMuscles: ["chest"], movementPattern: "vertical_push", fatigueCost: "low", equipment: "bodyweight", aliases: ["Bench Dips"] }),
  x({ id: "diamond_push_up", name: "Diamond Push Up", displayCategory: "Triceps", primaryMuscles: ["triceps"], secondaryMuscles: ["chest"], movementPattern: "horizontal_push", fatigueCost: "low", equipment: "bodyweight", aliases: ["Diamond Push-Up", "Close Grip Push Up"] }),

  // ── Biceps and forearms ──
  x({ id: "db_curl", name: "Dumbbell Curl", displayCategory: "Biceps", primaryMuscles: ["biceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Bicep Curl (Dumbbell)", "Dumbbell Bicep Curl", "DB Curl", "Bicep Curl", "Biceps Curl", "Alternating Dumbbell Curl"] }),
  x({ id: "ez_bar_curl", name: "EZ Bar Curl", displayCategory: "Biceps", primaryMuscles: ["biceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "barbell", aliases: ["EZ Curl", "EZ-Bar Curl", "EZ Bar Biceps Curl"] }),
  x({ id: "spider_curl", name: "Spider Curl", displayCategory: "Biceps", primaryMuscles: ["biceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Spider Curl (Dumbbell)"] }),
  x({ id: "bayesian_curl", name: "Bayesian Curl", displayCategory: "Biceps", primaryMuscles: ["biceps"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Bayesian Cable Curl"] }),
  x({ id: "reverse_curl", name: "Reverse Curl", displayCategory: "Biceps", primaryMuscles: ["brachialis"], secondaryMuscles: ["forearms"], movementPattern: "isolation", fatigueCost: "low", equipment: "barbell", aliases: ["Reverse Curl (Barbell)", "Reverse Grip Curl"] }),
  x({ id: "wrist_curl", name: "Wrist Curl", displayCategory: "Biceps", primaryMuscles: ["forearms"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "dumbbell", aliases: ["Wrist Curl (Dumbbell)", "Wrist Curls"] }),

  // ── Quads ──
  x({ id: "front_squat", name: "Front Squat", displayCategory: "Quads", primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "abs"], movementPattern: "squat", fatigueCost: "high", equipment: "barbell", aliases: ["Front Squat (Barbell)", "Barbell Front Squat"] }),
  x({ id: "goblet_squat", name: "Goblet Squat", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: [], movementPattern: "squat", equipment: "dumbbell", aliases: ["Goblet Squat (Dumbbell)", "Goblet Squat (Kettlebell)"] }),
  x({ id: "smith_squat", name: "Smith Squat", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: [], movementPattern: "squat", equipment: "smith", aliases: ["Squat (Smith Machine)", "Smith Machine Squat"] }),
  x({ id: "lunge", name: "Lunge", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"], movementPattern: "squat", equipment: "dumbbell", aliases: ["Dumbbell Lunge", "Lunges", "Lunge (Dumbbell)", "Forward Lunge"] }),
  x({ id: "walking_lunge", name: "Walking Lunge", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"], movementPattern: "squat", equipment: "dumbbell", aliases: ["Walking Lunges", "Walking Lunge (Dumbbell)"] }),
  x({ id: "reverse_lunge", name: "Reverse Lunge", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: [], movementPattern: "squat", equipment: "dumbbell", aliases: ["Reverse Lunge (Dumbbell)", "Reverse Lunges"] }),
  x({ id: "step_up", name: "Step Up", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: [], movementPattern: "squat", equipment: "dumbbell", aliases: ["Step-Up", "Step Ups", "Dumbbell Step Up"] }),
  x({ id: "sissy_squat", name: "Sissy Squat", displayCategory: "Quads", primaryMuscles: ["quads"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "bodyweight", aliases: [] }),
  x({ id: "belt_squat", name: "Belt Squat", displayCategory: "Quads", primaryMuscles: ["quads", "glutes"], secondaryMuscles: [], movementPattern: "squat", equipment: "machine", aliases: ["Belt Squat (Machine)"] }),

  // ── Hamstrings and glutes ──
  x({ id: "db_rdl", name: "Dumbbell Romanian Deadlift", displayCategory: "Hamstrings", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: [], movementPattern: "hinge", equipment: "dumbbell", aliases: ["Romanian Deadlift (Dumbbell)", "DB RDL", "Dumbbell RDL"] }),
  x({ id: "stiff_leg_deadlift", name: "Stiff-Leg Deadlift", displayCategory: "Hamstrings", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["lower back"], movementPattern: "hinge", fatigueCost: "high", equipment: "barbell", aliases: ["Stiff Leg Deadlift", "SLDL", "Straight Leg Deadlift"] }),
  x({ id: "single_leg_rdl", name: "Single-Leg Romanian Deadlift", displayCategory: "Hamstrings", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: [], movementPattern: "hinge", equipment: "dumbbell", aliases: ["Single Leg RDL", "Single Leg Romanian Deadlift (Dumbbell)"] }),
  x({ id: "nordic_curl", name: "Nordic Curl", displayCategory: "Hamstrings", primaryMuscles: ["hamstrings"], secondaryMuscles: [], movementPattern: "isolation", equipment: "bodyweight", aliases: ["Nordic Hamstring Curl", "Nordic Curls"] }),
  x({ id: "hip_abduction", name: "Hip Abduction", displayCategory: "Glutes", primaryMuscles: ["glutes"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "machine", aliases: ["Hip Abduction (Machine)", "Abductor Machine", "Seated Hip Abduction"] }),
  x({ id: "hip_adduction", name: "Hip Adduction", displayCategory: "Glutes", primaryMuscles: ["adductors"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "machine", aliases: ["Hip Adduction (Machine)", "Adductor Machine"] }),
  x({ id: "cable_pull_through", name: "Cable Pull Through", displayCategory: "Glutes", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: [], movementPattern: "hinge", fatigueCost: "low", equipment: "cable", aliases: ["Pull Through (Cable)"] }),
  x({ id: "cable_kickback", name: "Cable Glute Kickback", displayCategory: "Glutes", primaryMuscles: ["glutes"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: ["Glute Kickback (Cable)", "Cable Kickback"] }),
  x({ id: "kettlebell_swing", name: "Kettlebell Swing", displayCategory: "Compound / Full Body", primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["lower back"], movementPattern: "hinge", equipment: "kettlebell", aliases: ["KB Swing", "Kettlebell Swings"] }),

  // ── Calves ──
  x({ id: "leg_press_calf_raise", name: "Leg Press Calf Raise", displayCategory: "Calves", primaryMuscles: ["calves"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "machine", aliases: ["Calf Press (Machine)", "Calf Press on Leg Press"] }),
  x({ id: "smith_calf_raise", name: "Smith Calf Raise", displayCategory: "Calves", primaryMuscles: ["calves"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "smith", aliases: ["Calf Raise (Smith Machine)"] }),

  // ── Core ──
  x({ id: "lying_leg_raise", name: "Lying Leg Raise", displayCategory: "Core", primaryMuscles: ["abs", "hip flexors"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "bodyweight", aliases: ["Leg Raise", "Leg Raises", "Lying Leg Raises"] }),
  x({ id: "russian_twist", name: "Russian Twist", displayCategory: "Core", primaryMuscles: ["abs"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "bodyweight", aliases: ["Russian Twists"] }),
  x({ id: "side_plank", name: "Side Plank", displayCategory: "Core", primaryMuscles: ["core"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "bodyweight", aliases: [] }),
  x({ id: "sit_up", name: "Sit Up", displayCategory: "Core", primaryMuscles: ["abs"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "bodyweight", aliases: ["Sit-Up", "Sit Ups", "Decline Sit Up"] }),
  x({ id: "pallof_press", name: "Pallof Press", displayCategory: "Core", primaryMuscles: ["core"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "cable", aliases: [] }),
  x({ id: "dead_bug", name: "Dead Bug", displayCategory: "Core", primaryMuscles: ["core"], secondaryMuscles: [], movementPattern: "isolation", fatigueCost: "low", equipment: "bodyweight", aliases: ["Dead Bugs"] }),

  // ── Full body ──
  x({ id: "power_clean", name: "Power Clean", displayCategory: "Compound / Full Body", primaryMuscles: ["glutes", "hamstrings", "quads"], secondaryMuscles: ["upper traps", "upper back"], movementPattern: "hinge", fatigueCost: "high", equipment: "barbell", aliases: ["Power Clean (Barbell)", "Clean"] }),
  x({ id: "thruster", name: "Thruster", displayCategory: "Compound / Full Body", primaryMuscles: ["quads", "front delts"], secondaryMuscles: ["glutes", "triceps"], movementPattern: "squat", fatigueCost: "high", equipment: "barbell", aliases: ["Thruster (Barbell)"] }),
  x({ id: "farmers_carry", name: "Farmer's Carry", displayCategory: "Compound / Full Body", primaryMuscles: ["forearms", "upper traps"], secondaryMuscles: ["core"], movementPattern: "isolation", equipment: "dumbbell", aliases: ["Farmers Walk", "Farmer's Walk", "Farmers Carry"] }),
];
