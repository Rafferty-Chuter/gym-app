import { getUserExercisesAsLibraryExercises } from "@/lib/userExerciseLibrary";
import { BASE_ALIASES, BASE_EQUIPMENT, EXTRA_EXERCISES } from "@/lib/exerciseCatalogExtra";

/** What the movement is done with; the picker filters on it and progression snaps loads by it. */
export type ExerciseEquipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "smith" | "kettlebell" | "band" | "other";

export type Exercise = {
  id: string;
  name: string;
  displayCategory:
    | "Chest"
    | "Back"
    | "Shoulders"
    | "Triceps"
    | "Biceps"
    | "Quads"
    | "Hamstrings"
    | "Glutes"
    | "Calves"
    | "Core"
    | "Compound / Full Body";
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementPattern:
    | "horizontal_push"
    | "vertical_push"
    | "horizontal_pull"
    | "vertical_pull"
    | "hinge"
    | "squat"
    | "isolation";
  fatigueCost: "low" | "moderate" | "high";
  bias?: string; // specific emphasis
  /** Set on every built-in entry (TR1); inferred from the name for anything else. */
  equipment?: ExerciseEquipment;
  /** Other names for the same movement (Hevy and Strong style, short forms). Matched exactly and by search. */
  aliases?: readonly string[];
};

const BASE_LIBRARY: Exercise[] = [
  // ================= CHEST =================
  {
    id: "barbell_bench_press",
    name: "Barbell Bench Press",
    displayCategory: "Chest",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "horizontal_push",
    fatigueCost: "high",
  },
  {
    id: "incline_db_press",
    name: "Incline Dumbbell Press",
    displayCategory: "Chest",
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["shoulders", "triceps"],
    movementPattern: "horizontal_push",
    fatigueCost: "moderate",
    bias: "upper chest",
  },
  {
    id: "chest_press_machine",
    name: "Chest Press Machine",
    displayCategory: "Chest",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps"],
    movementPattern: "horizontal_push",
    fatigueCost: "moderate",
  },
  {
    id: "cable_fly",
    name: "Cable Fly",
    displayCategory: "Chest",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "chest stretch and contraction",
  },
  {
    id: "incline_barbell_press",
    name: "Incline Barbell Press",
    displayCategory: "Chest",
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "horizontal_push",
    fatigueCost: "high",
    bias: "upper chest emphasis",
  },
  {
    id: "smith_incline_press",
    name: "Smith Incline Press",
    displayCategory: "Chest",
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "horizontal_push",
    fatigueCost: "moderate",
    bias: "guided incline pressing",
  },
  {
    id: "pec_deck",
    name: "Pec Deck",
    displayCategory: "Chest",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "shortened chest contraction",
  },
  {
    id: "machine_fly",
    name: "Machine Fly",
    displayCategory: "Chest",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "weighted_dip",
    name: "Weighted Dip",
    displayCategory: "Chest",
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["shoulders"],
    movementPattern: "vertical_push",
    fatigueCost: "high",
  },

  // ================= BACK =================
  {
    id: "lat_pulldown",
    name: "Lat Pulldown",
    displayCategory: "Back",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps"],
    movementPattern: "vertical_pull",
    fatigueCost: "moderate",
  },
  {
    id: "pull_up",
    name: "Pull Up",
    displayCategory: "Back",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "vertical_pull",
    fatigueCost: "high",
  },
  {
    id: "t_bar_row",
    name: "T-Bar Row",
    displayCategory: "Back",
    primaryMuscles: ["upper back"],
    secondaryMuscles: ["lats", "biceps"],
    movementPattern: "horizontal_pull",
    fatigueCost: "high",
    bias: "upper back thickness",
  },
  {
    id: "chest_supported_row",
    name: "Chest Supported Row",
    displayCategory: "Back",
    primaryMuscles: ["upper back"],
    secondaryMuscles: ["biceps"],
    movementPattern: "horizontal_pull",
    fatigueCost: "moderate",
    bias: "upper back stability",
  },
  {
    id: "seated_cable_row",
    name: "Seated Cable Row",
    displayCategory: "Back",
    primaryMuscles: ["lats", "upper back"],
    secondaryMuscles: ["biceps"],
    movementPattern: "horizontal_pull",
    fatigueCost: "moderate",
  },
  {
    id: "one_arm_db_row",
    name: "One-Arm Dumbbell Row",
    displayCategory: "Back",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["upper back", "biceps"],
    movementPattern: "horizontal_pull",
    fatigueCost: "moderate",
  },
  {
    id: "machine_row",
    name: "Machine Row",
    displayCategory: "Back",
    primaryMuscles: ["upper back", "lats"],
    secondaryMuscles: ["biceps"],
    movementPattern: "horizontal_pull",
    fatigueCost: "moderate",
  },
  {
    id: "cable_pullover",
    name: "Cable Pullover",
    displayCategory: "Back",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["core"],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "lat lengthened tension",
  },
  {
    id: "assisted_pull_up",
    name: "Assisted Pull-Up",
    displayCategory: "Back",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "vertical_pull",
    fatigueCost: "moderate",
  },
  {
    id: "neutral_grip_pulldown",
    name: "Neutral Grip Pulldown",
    displayCategory: "Back",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "vertical_pull",
    fatigueCost: "moderate",
    bias: "neutral shoulder position",
  },

  // ================= SHOULDERS =================
  {
    id: "shoulder_press",
    name: "Shoulder Press",
    displayCategory: "Shoulders",
    primaryMuscles: ["front delts"],
    secondaryMuscles: ["triceps"],
    movementPattern: "vertical_push",
    fatigueCost: "high",
  },
  {
    id: "lateral_raise",
    name: "Lateral Raise",
    displayCategory: "Shoulders",
    primaryMuscles: ["side delts"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "rear_delt_fly",
    name: "Rear Delt Fly",
    displayCategory: "Shoulders",
    primaryMuscles: ["rear delts"],
    secondaryMuscles: ["upper back"],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "smith_shoulder_press",
    name: "Smith Shoulder Press",
    displayCategory: "Shoulders",
    primaryMuscles: ["front delts"],
    secondaryMuscles: ["triceps"],
    movementPattern: "vertical_push",
    fatigueCost: "moderate",
  },
  {
    id: "machine_shoulder_press",
    name: "Machine Shoulder Press",
    displayCategory: "Shoulders",
    primaryMuscles: ["front delts"],
    secondaryMuscles: ["triceps"],
    movementPattern: "vertical_push",
    fatigueCost: "moderate",
  },
  {
    id: "cable_lateral_raise",
    name: "Cable Lateral Raise",
    displayCategory: "Shoulders",
    primaryMuscles: ["side delts"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "constant side delt tension",
  },
  {
    id: "upright_row",
    name: "Upright Row",
    displayCategory: "Shoulders",
    primaryMuscles: ["side delts", "upper traps"],
    secondaryMuscles: ["biceps"],
    movementPattern: "vertical_pull",
    fatigueCost: "moderate",
  },

  // ================= TRICEPS =================
  {
    id: "tricep_pushdown",
    name: "Tricep Pushdown",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "overhead_tricep_extension",
    name: "Overhead Tricep Extension",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "long head emphasis",
  },
  {
    id: "dips",
    name: "Dips",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest"],
    movementPattern: "vertical_push",
    fatigueCost: "high",
  },
  {
    id: "skull_crusher",
    name: "Skull Crusher",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "long head emphasis",
  },
  {
    id: "jm_press",
    name: "JM Press",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest", "shoulders"],
    movementPattern: "horizontal_push",
    fatigueCost: "moderate",
  },
  {
    id: "close_grip_bench_press",
    name: "Close Grip Bench Press",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest", "shoulders"],
    movementPattern: "horizontal_push",
    fatigueCost: "high",
  },
  {
    id: "single_arm_pushdown",
    name: "Single-Arm Pushdown",
    displayCategory: "Triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "unilateral lockout control",
  },

  // ================= BICEPS =================
  {
    id: "barbell_curl",
    name: "Barbell Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "incline_db_curl",
    name: "Incline Dumbbell Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "lengthened position",
  },
  {
    id: "hammer_curl",
    name: "Hammer Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["brachialis"],
    secondaryMuscles: ["biceps"],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "preacher_curl",
    name: "Preacher Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "shortened biceps tension",
  },
  {
    id: "cable_curl",
    name: "Cable Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "machine_curl",
    name: "Machine Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "concentration_curl",
    name: "Concentration Curl",
    displayCategory: "Biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "peak contraction",
  },

  // ================= LEGS =================
  {
    id: "barbell_squat",
    name: "Barbell Squat",
    displayCategory: "Compound / Full Body",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["back"],
    movementPattern: "squat",
    fatigueCost: "high",
  },
  {
    id: "leg_press",
    name: "Leg Press",
    displayCategory: "Quads",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    movementPattern: "squat",
    fatigueCost: "moderate",
  },
  {
    id: "leg_extension",
    name: "Leg Extension",
    displayCategory: "Quads",
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "hack_squat",
    name: "Hack Squat",
    displayCategory: "Quads",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    movementPattern: "squat",
    fatigueCost: "high",
  },
  {
    id: "split_squat",
    name: "Split Squat",
    displayCategory: "Quads",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["core"],
    movementPattern: "squat",
    fatigueCost: "moderate",
  },
  {
    id: "bulgarian_split_squat",
    name: "Bulgarian Split Squat",
    displayCategory: "Quads",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["core"],
    movementPattern: "squat",
    fatigueCost: "high",
  },
  {
    id: "pendulum_squat",
    name: "Pendulum Squat",
    displayCategory: "Quads",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    movementPattern: "squat",
    fatigueCost: "high",
    bias: "quad-dominant deep knee flexion",
  },
  {
    id: "romanian_deadlift",
    name: "Romanian Deadlift",
    displayCategory: "Compound / Full Body",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["back"],
    movementPattern: "hinge",
    fatigueCost: "high",
  },
  {
    id: "hip_thrust",
    name: "Hip Thrust",
    displayCategory: "Glutes",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    movementPattern: "hinge",
    fatigueCost: "moderate",
    bias: "glute lockout strength",
  },
  {
    id: "good_morning",
    name: "Good Morning",
    displayCategory: "Hamstrings",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["back"],
    movementPattern: "hinge",
    fatigueCost: "high",
  },
  {
    id: "leg_curl",
    name: "Leg Curl",
    displayCategory: "Hamstrings",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "seated_leg_curl",
    name: "Seated Leg Curl",
    displayCategory: "Hamstrings",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "hamstrings lengthened position",
  },
  {
    id: "lying_leg_curl",
    name: "Lying Leg Curl",
    displayCategory: "Hamstrings",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "glute_bridge",
    name: "Glute Bridge",
    displayCategory: "Glutes",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    movementPattern: "hinge",
    fatigueCost: "low",
  },

  // ================= CALVES =================
  {
    id: "calf_raise",
    name: "Calf Raise",
    displayCategory: "Calves",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "seated_calf_raise",
    name: "Seated Calf Raise",
    displayCategory: "Calves",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
    bias: "soleus emphasis",
  },

  // ================= CORE =================
  {
    id: "ab_crunch",
    name: "Ab Crunch",
    displayCategory: "Core",
    primaryMuscles: ["abs"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "plank",
    name: "Plank",
    displayCategory: "Core",
    primaryMuscles: ["core"],
    secondaryMuscles: [],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "hanging_leg_raise",
    name: "Hanging Leg Raise",
    displayCategory: "Core",
    primaryMuscles: ["abs", "hip flexors"],
    secondaryMuscles: ["core"],
    movementPattern: "isolation",
    fatigueCost: "moderate",
  },
  {
    id: "cable_crunch",
    name: "Cable Crunch",
    displayCategory: "Core",
    primaryMuscles: ["abs"],
    secondaryMuscles: ["core"],
    movementPattern: "isolation",
    fatigueCost: "low",
  },
  {
    id: "ab_wheel",
    name: "Ab Wheel",
    displayCategory: "Core",
    primaryMuscles: ["abs", "core"],
    secondaryMuscles: ["lats"],
    movementPattern: "isolation",
    fatigueCost: "moderate",
  },
];

/** Every built-in exercise: the first 61 with equipment and aliases, then the TR1 additions. */
export const EXERCISE_LIBRARY: Exercise[] = [
  ...BASE_LIBRARY.map((e) => ({ ...e, equipment: BASE_EQUIPMENT[e.id] ?? e.equipment, aliases: BASE_ALIASES[e.id] ?? e.aliases })),
  ...EXTRA_EXERCISES,
];

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Letters and digits only: "Pull-Up" and "pull up" meet. */
function looseKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Equipment for any exercise: the entry's own, else read from its name. */
export function exerciseEquipment(ex: Pick<Exercise, "name" | "equipment">): ExerciseEquipment {
  if (ex.equipment) return ex.equipment;
  const n = ex.name.toLowerCase();
  if (/smith/.test(n)) return "smith";
  if (/kettlebell|\bkb\b/.test(n)) return "kettlebell";
  if (/\bband/.test(n)) return "band";
  if (/dumbbell|\bdb\b/.test(n)) return "dumbbell";
  if (/cable|pulldown|pushdown|face pull/.test(n)) return "cable";
  if (/machine|pec deck|leg press|leg extension|leg curl|hack squat/.test(n)) return "machine";
  if (/push ?up|pull ?up|chin ?up|dip|plank|crunch|sit ?up|bodyweight/.test(n)) return "bodyweight";
  return "barbell";
}

/** Short forms people type, expanded before matching. */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  db: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  bss: "bulgarian split squat",
  cgbp: "close grip bench press",
  ez: "ez",
  lat: "lat",
};

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

function getMergedExercises(): Exercise[] {
  if (typeof window === "undefined") return EXERCISE_LIBRARY;
  return [...EXERCISE_LIBRARY, ...getUserExercisesAsLibraryExercises()];
}

export function getExerciseById(id: string): Exercise | null {
  const key = normalizeExerciseName(id);
  if (!key) return null;
  const fromBuiltIn = EXERCISE_LIBRARY.find((ex) => normalizeExerciseName(ex.id) === key);
  if (fromBuiltIn) return fromBuiltIn;
  return getMergedExercises().find((ex) => normalizeExerciseName(ex.id) === key) ?? null;
}

/**
 * The exercise a logged or typed name means: an exact name first, then a
 * name or alias that matches once punctuation and spacing are ignored.
 */
export function getExerciseByName(name: string): Exercise | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  const fromBuiltIn = EXERCISE_LIBRARY.find((ex) => normalizeExerciseName(ex.name) === key);
  if (fromBuiltIn) return fromBuiltIn;
  const merged = getMergedExercises();
  const exact = merged.find((ex) => normalizeExerciseName(ex.name) === key);
  if (exact) return exact;
  const loose = looseKey(name);
  if (!loose) return null;
  return merged.find((ex) => looseKey(ex.name) === loose || (ex.aliases ?? []).some((a) => looseKey(a) === loose)) ?? null;
}

/**
 * Search by words in any order, each word a prefix of a word in the name
 * or an alias ("db press", "press bench", "rdl"). Best matches first: the
 * exact name, then names starting with the query, then names matching
 * every word, then alias matches.
 */
export function searchExercises(query: string): Exercise[] {
  const merged = getMergedExercises();
  const key = normalizeExerciseName(query);
  if (!key) return merged;
  const terms = words(key).flatMap((w) => words(ABBREVIATIONS[w] ?? w));
  if (terms.length === 0) return merged;
  const hits = (text: string) => {
    const ws = words(text);
    return terms.every((t) => ws.some((w) => w.startsWith(t)));
  };
  const expanded = terms.join(" ");
  const scored: Array<{ ex: Exercise; score: number }> = [];
  for (const ex of merged) {
    const name = normalizeExerciseName(ex.name);
    const aliases = (ex.aliases ?? []).map(normalizeExerciseName);
    let score = -1;
    if (name === key || aliases.includes(key)) score = 0;
    else if (name.startsWith(key) || name.startsWith(expanded)) score = 1;
    else if (hits(ex.name)) score = 2;
    else if ((ex.aliases ?? []).some(hits)) score = 3;
    if (score >= 0) scored.push({ ex, score });
  }
  // Ties: the plainer (shorter) name first, so "Romanian Deadlift" leads its variants.
  return scored.sort((a, b) => a.score - b.score || a.ex.name.length - b.ex.name.length || a.ex.name.localeCompare(b.ex.name)).map((s) => s.ex);
}

const CATEGORY_ORDER: Exercise["displayCategory"][] = [
  "Chest",
  "Back",
  "Shoulders",
  "Triceps",
  "Biceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Compound / Full Body",
];

export function getExercisesGroupedByCategory(): Array<{
  category: Exercise["displayCategory"];
  exercises: Exercise[];
}> {
  const merged = getMergedExercises();
  return CATEGORY_ORDER.map((category) => ({
    category,
    exercises: merged.filter((ex) => ex.displayCategory === category),
  })).filter((row) => row.exercises.length > 0);
}

// ── Identity ──

const identityCache = new Map<string, string>();

/**
 * One key per movement (TR1): "id:<library id>" when the id or the name
 * (aliases included) resolves to the library, else the normalised name.
 * "Bench Press", "Bench Press (Barbell)" and "Barbell Bench Press" share a
 * history; anything unknown keeps its own name. Built-in hits are cached.
 */
export function exerciseIdentity(ex: { name?: string; exerciseId?: string }): string {
  const name = ex.name ?? "";
  const cacheKey = `${ex.exerciseId ?? ""}|${normalizeExerciseName(name)}`;
  const hit = identityCache.get(cacheKey);
  if (hit) return hit;
  const meta = (ex.exerciseId ? getExerciseById(ex.exerciseId) : null) ?? (name ? getExerciseByName(name) : null);
  const key = meta ? `id:${meta.id}` : `name:${normalizeExerciseName(name)}`;
  if (meta && EXERCISE_LIBRARY.some((e) => e.id === meta.id)) identityCache.set(cacheKey, key);
  return key;
}

/** Whether two logged or planned exercises are the same movement. */
export function sameExercise(a: { name?: string; exerciseId?: string }, b: { name?: string; exerciseId?: string }): boolean {
  if (a.exerciseId && b.exerciseId && a.exerciseId === b.exerciseId) return true;
  return exerciseIdentity(a) === exerciseIdentity(b);
}

export function resolveLoggedExerciseMeta(exercise: {
  exerciseId?: string;
  name: string;
}): Exercise | null {
  if (exercise.exerciseId) {
    const byId = getExerciseById(exercise.exerciseId);
    if (byId) return byId;
  }
  return getExerciseByName(exercise.name);
}
