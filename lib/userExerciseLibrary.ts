import type { Exercise } from "@/lib/exerciseLibrary";

export const USER_EXERCISE_LIBRARY_KEY = "userExerciseLibrary";
export const USER_EXERCISE_LIBRARY_EVENT = "userExerciseLibraryUpdated";

/** Primary muscle taxonomy for custom exercises (maps into library-style metadata). */
export const PRIMARY_MUSCLE_OPTIONS = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "legs", label: "Legs" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "glutes", label: "Glutes" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "quads", label: "Quads" },
  { value: "calves", label: "Calves" },
  { value: "abs", label: "Abs / core" },
  { value: "forearms", label: "Forearms" },
  { value: "rear_delts", label: "Rear delts" },
] as const;

export type PrimaryMuscleValue = (typeof PRIMARY_MUSCLE_OPTIONS)[number]["value"];

export const EQUIPMENT_OPTIONS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "smith machine",
  "kettlebell",
  "band",
  "other",
] as const;

export type EquipmentValue = (typeof EQUIPMENT_OPTIONS)[number];

export const MOVEMENT_PATTERN_OPTIONS: { value: Exercise["movementPattern"]; label: string }[] = [
  { value: "horizontal_push", label: "Horizontal push" },
  { value: "vertical_push", label: "Vertical push" },
  { value: "horizontal_pull", label: "Horizontal pull" },
  { value: "vertical_pull", label: "Vertical pull" },
  { value: "hinge", label: "Hinge" },
  { value: "squat", label: "Squat / legs" },
  { value: "isolation", label: "Isolation" },
];

export type UserExerciseRecord = {
  id: string;
  name: string;
  primaryMuscle: PrimaryMuscleValue;
  equipment: EquipmentValue;
  secondaryMuscle?: PrimaryMuscleValue;
  movementPattern: Exercise["movementPattern"];
  laterality?: "unilateral" | "bilateral" | "either";
  createdAt: string;
};

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function primaryMuscleToDisplayCategory(primary: PrimaryMuscleValue): Exercise["displayCategory"] {
  const map: Record<PrimaryMuscleValue, Exercise["displayCategory"]> = {
    chest: "Chest",
    back: "Back",
    legs: "Compound / Full Body",
    shoulders: "Shoulders",
    biceps: "Biceps",
    triceps: "Triceps",
    glutes: "Glutes",
    hamstrings: "Hamstrings",
    quads: "Quads",
    calves: "Calves",
    abs: "Core",
    forearms: "Biceps",
    rear_delts: "Shoulders",
  };
  return map[primary];
}

function primaryMuscleToLibraryTags(primary: PrimaryMuscleValue): string[] {
  switch (primary) {
    case "chest":
      return ["chest"];
    case "back":
      return ["lats"];
    case "legs":
      return ["quads", "glutes"];
    case "shoulders":
      return ["shoulders"];
    case "biceps":
      return ["biceps"];
    case "triceps":
      return ["triceps"];
    case "glutes":
      return ["glutes"];
    case "hamstrings":
      return ["hamstrings"];
    case "quads":
      return ["quads"];
    case "calves":
      return ["calves"];
    case "abs":
      return ["abs"];
    case "forearms":
      return ["forearms"];
    case "rear_delts":
      return ["rear delts"];
    default:
      return ["chest"];
  }
}

function secondaryToLibraryTag(sec: PrimaryMuscleValue): string {
  return primaryMuscleToLibraryTags(sec)[0] ?? sec.replace(/_/g, " ");
}

export function userRecordToExercise(record: UserExerciseRecord): Exercise {
  const primaryMuscles = primaryMuscleToLibraryTags(record.primaryMuscle);
  const secondaryMuscles: string[] = [];
  if (record.secondaryMuscle && record.secondaryMuscle !== record.primaryMuscle) {
    secondaryMuscles.push(secondaryToLibraryTag(record.secondaryMuscle));
  }
  const parts: string[] = [`equipment:${record.equipment}`];
  if (record.laterality && record.laterality !== "either") {
    parts.push(`laterality:${record.laterality}`);
  }
  return {
    id: record.id,
    name: record.name,
    displayCategory: primaryMuscleToDisplayCategory(record.primaryMuscle),
    primaryMuscles,
    secondaryMuscles,
    movementPattern: record.movementPattern,
    fatigueCost: "moderate",
    bias: parts.join(" · "),
  };
}

export function loadUserExerciseRecords(): UserExerciseRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USER_EXERCISE_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is UserExerciseRecord =>
        row &&
        typeof row === "object" &&
        typeof (row as UserExerciseRecord).id === "string" &&
        typeof (row as UserExerciseRecord).name === "string" &&
        typeof (row as UserExerciseRecord).primaryMuscle === "string" &&
        typeof (row as UserExerciseRecord).equipment === "string" &&
        typeof (row as UserExerciseRecord).movementPattern === "string"
    );
  } catch {
    return [];
  }
}

export function getUserExercisesAsLibraryExercises(): Exercise[] {
  return loadUserExerciseRecords().map(userRecordToExercise);
}

function newUserExerciseId(name: string): string {
  const base = normalizeExerciseName(name).replace(/[^a-z0-9]+/g, "_").slice(0, 40) || "exercise";
  return `user_${base}_${Date.now()}`;
}

export function addUserExerciseRecord(input: Omit<UserExerciseRecord, "id" | "createdAt"> & { id?: string }): UserExerciseRecord {
  const record: UserExerciseRecord = {
    id: input.id ?? newUserExerciseId(input.name),
    name: input.name.trim(),
    primaryMuscle: input.primaryMuscle,
    equipment: input.equipment,
    secondaryMuscle: input.secondaryMuscle,
    movementPattern: input.movementPattern,
    laterality: input.laterality,
    createdAt: new Date().toISOString(),
  };
  const existing = loadUserExerciseRecords();
  const next = [...existing.filter((r) => r.id !== record.id), record];
  localStorage.setItem(USER_EXERCISE_LIBRARY_KEY, JSON.stringify(next));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(USER_EXERCISE_LIBRARY_EVENT));
  }
  return record;
}

export function getUserExerciseById(id: string): UserExerciseRecord | null {
  return loadUserExerciseRecords().find((r) => r.id === id) ?? null;
}

export function getUserExerciseByName(name: string): UserExerciseRecord | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return loadUserExerciseRecords().find((r) => normalizeExerciseName(r.name) === key) ?? null;
}
