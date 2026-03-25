"use client";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
} from "@/lib/trainingAnalysis";
import {
  getActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  draftHasMeaningfulContent,
  type DraftWorkout,
} from "@/lib/activeWorkout";
import { useUnit } from "@/lib/unit-preference";
import {
  getExerciseByName,
  normalizeExerciseName,
  resolveLoggedExerciseMeta,
} from "@/lib/exerciseLibrary";
import ExercisePicker, { type ExercisePickerValue } from "@/components/ExercisePicker";
import CreateExerciseModal from "@/components/CreateExerciseModal";
import {
  USER_EXERCISE_LIBRARY_EVENT,
  userRecordToExercise,
  type UserExerciseRecord,
} from "@/lib/userExerciseLibrary";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";
const WORKOUT_HISTORY_KEY = "workoutHistory";
const WORKOUT_SUGGESTED_MUSCLE_KEY = "workoutSuggestedMuscle";
const KG_TO_LB = 2.2046226218;

function convertWeightValue(weight: string, from: "kg" | "lb", to: "kg" | "lb"): string {
  if (from === to) return weight;
  const raw = String(weight ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return raw;
  const converted = from === "kg" && to === "lb" ? n * KG_TO_LB : n / KG_TO_LB;
  const rounded = Math.round(converted * 10) / 10;
  if (!Number.isFinite(rounded)) return raw;
  if (Math.abs(rounded - Math.round(rounded)) < 0.000001) return String(Math.round(rounded));
  return rounded.toFixed(1).replace(/\.0$/, "");
}

type StoredWorkout = {
  completedAt: string;
  exercises: {
    exerciseId?: string;
    name: string;
    sets: { weight: string; reps: string; notes?: string; rir?: number }[];
  }[];
};

type ExerciseRef = { exerciseId?: string; name: string };

function getBestSet(sets: { weight: string; reps: string }[]): { weight: number; reps: number } | null {
  if (!sets?.length) return null;
  let best = { weight: 0, reps: 0 };
  for (const s of sets) {
    const w = parseFloat(String(s?.weight ?? 0)) || 0;
    const r = parseFloat(String(s?.reps ?? 0)) || 0;
    if (w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  }
  return best.weight > 0 || best.reps > 0 ? best : null;
}

function getLastPerformanceForExercise(exercise: ExerciseRef): { weight: string; reps: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return null;
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return null;
    const normalized = exercise.name.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const match = workout.exercises?.find(
        (ex) =>
          (exercise.exerciseId && ex.exerciseId && ex.exerciseId === exercise.exerciseId) ||
          ex.name?.trim().toLowerCase() === normalized
      );
      if (match?.sets?.length) {
        const lastSet = match.sets[match.sets.length - 1];
        if (lastSet?.weight != null && lastSet?.reps != null)
          return { weight: String(lastSet.weight), reps: String(lastSet.reps) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getLastSetsForExercise(exercise: ExerciseRef): {
  weight: string;
  reps: string;
  notes?: string;
}[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return [];
    const normalized = exercise.name.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const match = workout.exercises?.find(
        (ex) =>
          (exercise.exerciseId && ex.exerciseId && ex.exerciseId === exercise.exerciseId) ||
          ex.name?.trim().toLowerCase() === normalized
      );
      if (match?.sets?.length) {
        return match.sets.map((s) => ({
          weight: String(s?.weight ?? ""),
          reps: String(s?.reps ?? ""),
          notes: typeof s?.notes === "string" ? s.notes : undefined,
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
}

type ExerciseCategory =
  | "barbell_compound"
  | "machine_compound"
  | "dumbbell_compound"
  | "isolation";

const BARBELL_KEYWORDS = [
  "barbell",
  "bb ",
  " bb",
  "bench press",
  "squat",
  "deadlift",
  "barbell row",
  "bent over row",
  "ohp",
  "overhead press",
  "power clean",
  "front squat",
  "back squat",
];
const MACHINE_KEYWORDS = [
  "leg press",
  "hack squat",
  "pulldown",
  "lat pulldown",
  "chest press",
  "cable",
  "machine",
  "seated row",
  "pec deck",
];
const DUMBBELL_KEYWORDS = ["dumbbell", "dumbbells", "db ", " db", "kettlebell"];
const ISOLATION_KEYWORDS = [
  "curl",
  "hammer curl",
  "lateral raise",
  "tricep",
  "extension",
  "fly",
  "calf",
  "skullcrusher",
  "pushdown",
  "face pull",
];

function getExerciseCategory(name: string): ExerciseCategory {
  const meta = resolveLoggedExerciseMeta({ name });
  if (meta) {
    if (meta.movementPattern === "isolation") return "isolation";
    if (meta.fatigueCost === "high") return "barbell_compound";
    if (meta.fatigueCost === "moderate") return "machine_compound";
    return "dumbbell_compound";
  }
  const n = name.trim().toLowerCase();
  if (ISOLATION_KEYWORDS.some((kw) => n.includes(kw))) return "isolation";
  if (BARBELL_KEYWORDS.some((kw) => n.includes(kw))) return "barbell_compound";
  if (MACHINE_KEYWORDS.some((kw) => n.includes(kw))) return "machine_compound";
  if (DUMBBELL_KEYWORDS.some((kw) => n.includes(kw))) return "dumbbell_compound";
  return "machine_compound";
}

const TINY_LOAD_EXERCISES = [
  "lateral raise",
  "curl",
  "hammer curl",
  "tricep",
  "extension",
  "fly",
  "pushdown",
  "face pull",
];

function isTinyLoadExercise(name: string): boolean {
  const n = name.trim().toLowerCase();
  return TINY_LOAD_EXERCISES.some((kw) => n.includes(kw));
}

type TargetData = {
  baseTarget: string;
  recentPerformances: { weight: number; reps: number }[];
  exerciseType: "compound" | "isolation";
  weeklyVolume: Record<string, number>;
};

function computeConfidence(
  occurrences: { weight: number; reps: number }[],
  category: ExerciseCategory
): "low" | "medium" | "high" {
  if (occurrences.length < 3) return "low";
  const recent = occurrences[0];
  const repThreshold = category === "isolation" ? 10 : 8;
  const strongCount = occurrences.slice(0, 4).filter((o) => o.reps >= repThreshold).length;
  const improving = occurrences.slice(0, 3).every((_, i) => {
    if (i >= occurrences.length - 1) return true;
    const curr = occurrences[i];
    const older = occurrences[i + 1];
    return (
      curr.weight > older.weight ||
      (curr.weight === older.weight && curr.reps >= older.reps)
    );
  });
  const declined =
    occurrences.length >= 2 &&
    (recent.weight < occurrences[1].weight ||
      (recent.weight === occurrences[1].weight && recent.reps < occurrences[1].reps));
  if (declined || strongCount < 2) return "low";
  if (category === "isolation") {
    return strongCount >= 4 && improving ? "high" : "medium";
  }
  if (category === "dumbbell_compound") {
    return strongCount >= 4 && improving ? "high" : "medium";
  }
  return strongCount >= 3 && improving ? "high" : "medium";
}

function getTargetDataForExercise(exerciseName: string): TargetData | null {
  if (typeof window === "undefined") return null;
  try {
    const workouts = getWorkoutHistory();
    if (!workouts?.length) return null;
    const normalized = exerciseName.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    const occurrences: { weight: number; reps: number }[] = [];
    for (const workout of sorted) {
      const exercise = workout.exercises?.find(
        (ex) => ex.name?.trim().toLowerCase() === normalized
      );
      const best = exercise?.sets?.length ? getBestSet(exercise.sets) : null;
      if (best) occurrences.push(best);
      if (occurrences.length >= 5) break;
    }
    if (occurrences.length < 2) return null;

    const recent = occurrences[0];
    const category = getExerciseCategory(exerciseName);
    const confidence = computeConfidence(occurrences, category);
    const tinyLoad = isTinyLoadExercise(exerciseName);

    const repTarget = Math.min(recent.reps + 1, 12);
    const repTargetHi = Math.min(recent.reps + 2, 14);

    const defaultTarget = `${recent.weight}kg × ${repTarget}`;

    if (confidence === "low") {
      return buildTargetData(
        defaultTarget,
        occurrences,
        category,
        workouts
      );
    }

    let baseTarget: string;

    if (category === "isolation") {
      const strongCount = occurrences.slice(0, 4).filter((o) => o.reps >= 10).length;
      const canAddWeight = confidence === "high" && strongCount >= 4 && recent.reps >= 12;
      if (canAddWeight && tinyLoad) {
        const jump = recent.weight < 10 ? 0.5 : 1;
        const w = Math.round((recent.weight + jump) * 10) / 10;
        baseTarget = `${w}kg × 8–10`;
      } else if (canAddWeight && !tinyLoad) {
        const w = Math.round((recent.weight + 1.25) * 10) / 10;
        baseTarget = `${w}kg × 8–10`;
      } else {
        baseTarget = `${recent.weight}kg × ${repTarget}–${repTargetHi}`;
      }
    } else if (category === "dumbbell_compound") {
      const strongCount = occurrences.slice(0, 4).filter((o) => o.reps >= 8).length;
      const canAddWeight = confidence === "high" && strongCount >= 4 && recent.reps >= 10;
      if (canAddWeight) {
        const w = Math.round((recent.weight + 1.25) * 10) / 10;
        baseTarget = `${w}kg × ${Math.min(recent.reps, 10)}–${Math.min(recent.reps + 1, 12)}`;
      } else {
        baseTarget = `${recent.weight}kg × ${repTarget}–${repTargetHi}`;
      }
    } else if (category === "barbell_compound") {
      const strongCount = occurrences.slice(0, 3).filter((o) => o.reps >= 6).length;
      const canAddWeight = confidence === "high" && strongCount >= 3 && recent.reps >= 8;
      if (canAddWeight) {
        const w = Math.round((recent.weight + 2.5) * 10) / 10;
        const lo = Math.max(5, Math.min(recent.reps - 2, 8));
        const hi = Math.min(10, recent.reps);
        baseTarget = `${w}kg × ${lo}–${hi}`;
      } else {
        baseTarget = `${recent.weight}kg × ${repTarget}–${repTargetHi}`;
      }
    } else {
      const strongCount = occurrences.slice(0, 3).filter((o) => o.reps >= 8).length;
      const canAddWeight = confidence === "high" && strongCount >= 3 && recent.reps >= 10;
      if (canAddWeight) {
        const w = Math.round((recent.weight + 2) * 10) / 10;
        const lo = Math.max(6, Math.min(recent.reps - 2, 10));
        const hi = Math.min(12, recent.reps);
        baseTarget = `${w}kg × ${lo}–${hi}`;
      } else {
        baseTarget = `${recent.weight}kg × ${repTarget}–${repTargetHi}`;
      }
    }

    return buildTargetData(baseTarget, occurrences, category, workouts);
  } catch {
    return null;
  }
}

function buildTargetData(
  baseTarget: string,
  occurrences: { weight: number; reps: number }[],
  category: ExerciseCategory,
  workouts: StoredWorkout[]
): TargetData {
  const last7Days = getWorkoutsFromLast7Days(workouts);
  const weeklyVolume = getVolumeByMuscleGroup(last7Days);
  return {
    baseTarget,
    recentPerformances: occurrences,
    exerciseType: category === "isolation" ? "isolation" : "compound",
    weeklyVolume,
  };
}

function getNextTargetForExercise(exerciseName: string): string | null {
  return getTargetDataForExercise(exerciseName)?.baseTarget ?? null;
}

/** Digits and at most one decimal (. or , normalized to .). */
function sanitizeWeightInput(raw: string): string {
  let out = "";
  let seenDot = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if ((ch === "." || ch === ",") && !seenDot) {
      seenDot = true;
      out += ".";
    }
  }
  return out;
}

function sanitizeRepsInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Single digit 0–5; paste takes first digit, >5 clamps to 5. */
function sanitizeRirInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  const d = digits[0]!;
  const n = Number.parseInt(d, 10);
  if (n > 5) return "5";
  return d;
}

function isWeightDecimalKey(key: string, currentHasDot: boolean): boolean {
  if (key.length !== 1) return false;
  if (key >= "0" && key <= "9") return true;
  if ((key === "." || key === ",") && !currentHasDot) return true;
  return false;
}

function isNavigationOrShortcutKey(e: KeyboardEvent<HTMLElement>): boolean {
  return (
    e.key === "Backspace" ||
    e.key === "Delete" ||
    e.key === "Tab" ||
    e.key === "Enter" ||
    e.key === "Escape" ||
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "Home" ||
    e.key === "End" ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  );
}

export default function WorkoutPage() {
  const router = useRouter();
  const { addWorkout } = useWorkoutStore();
  const { unit } = useUnit();
  const [exerciseName, setExerciseName] = useState("");
  const [exercises, setExercises] = useState<
    {
      id: number;
      exerciseId?: string;
      name: string;
      sets: { weight: string; reps: string; done?: boolean; notes?: string; rir?: number }[];
      targetSets?: number;
      restSec: number;
    }[]
  >([]);
  const [expandedNoteKey, setExpandedNoteKey] = useState<string | null>(null);
  const [restAdjustExerciseId, setRestAdjustExerciseId] = useState<number | null>(null);
  const [exerciseMenuOpenId, setExerciseMenuOpenId] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [lastPerformance, setLastPerformance] = useState<
    Record<string, { weight: string; reps: string } | null>
  >({});
  const [nextTarget, setNextTarget] = useState<Record<string, string | null>>({});
  const [workoutName, setWorkoutName] = useState("");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [routineSaved, setRoutineSaved] = useState(false);
  const addExerciseInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const setDoneButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<{ exerciseId: number; setIndex: number } | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [restByExercise, setRestByExercise] = useState<Record<number, { remainingSec: number; running: boolean }>>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [createExerciseSeedName, setCreateExerciseSeedName] = useState("");
  const [userLibraryRevision, setUserLibraryRevision] = useState(0);
  const loadHandledRef = useRef(false);
  const persistReadyRef = useRef(false);
  /** After Finish or Discard, do not write activeWorkout again (state may still hold old exercises). */
  const persistEnabledRef = useRef(true);
  const latestWorkoutRef = useRef({
    exercises,
    workoutName,
    templateName,
    templateId,
    startTime,
  });
  latestWorkoutRef.current = { exercises, workoutName, templateName, templateId, startTime };

  useEffect(() => {
    if (startTime === null) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startTime]);

  useEffect(() => {
    function handleUnitConverted(event: Event) {
      const custom = event as CustomEvent<{ from?: "kg" | "lb"; to?: "kg" | "lb" }>;
      const from = custom.detail?.from;
      const to = custom.detail?.to;
      if (!from || !to || from === to) return;
      setExercises((prev) =>
        prev.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            weight:
              typeof set.weight === "string"
                ? convertWeightValue(set.weight, from, to)
                : set.weight,
          })),
        }))
      );
    }
    window.addEventListener("weightUnitConverted", handleUnitConverted as EventListener);
    return () => {
      window.removeEventListener("weightUnitConverted", handleUnitConverted as EventListener);
    };
  }, []);

  useEffect(() => {
    const anyRunning = Object.values(restByExercise).some((t) => t.running && t.remainingSec > 0);
    if (!anyRunning) return;
    const id = window.setInterval(() => {
      setRestByExercise((prev) => {
        const next: typeof prev = { ...prev };
        for (const [k, t] of Object.entries(prev)) {
          const idNum = Number(k);
          if (!t?.running || t.remainingSec <= 0) continue;
          const remainingSec = t.remainingSec - 1;
          next[idNum] = remainingSec <= 0 ? { remainingSec: 0, running: false } : { remainingSec, running: true };
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [restByExercise]);

  useEffect(() => {
    if (restAdjustExerciseId === null) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setRestAdjustExerciseId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restAdjustExerciseId]);

  useEffect(() => {
    if (restAdjustExerciseId === null) return;
    if (!exercises.some((e) => e.id === restAdjustExerciseId)) setRestAdjustExerciseId(null);
  }, [exercises, restAdjustExerciseId]);

  useEffect(() => {
    if (!pendingFocus) return;
    const key = `${pendingFocus.exerciseId}-${pendingFocus.setIndex}-weight`;
    const el = setInputRefs.current[key];
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.select?.();
    });
    setPendingFocus(null);
  }, [pendingFocus]);

  const totalSetsLogged = exercises.reduce((total, ex) => total + ex.sets.length, 0);
  const workoutHistory = getWorkoutHistory();
  const lastLoggedWorkout = [...workoutHistory].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  )[0];

  const recentExerciseHint = useMemo(() => {
    const exs = lastLoggedWorkout?.exercises ?? [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const ex of exs) {
      const n = ex.name?.trim();
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(n);
      if (names.length >= 5) break;
    }
    return names;
  }, [lastLoggedWorkout]);

  useEffect(() => {
    function bump() {
      setUserLibraryRevision((r) => r + 1);
    }
    window.addEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
    return () => window.removeEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
  }, []);

  const showWorkoutStats = exercises.length > 0;

  function workoutDisplayName(w: { name?: string; exercises?: { name: string }[] }) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  function formatElapsed(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatRest(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function startExerciseRest(exerciseId: number, seconds: number) {
    setRestByExercise((prev) => ({
      ...prev,
      [exerciseId]: { remainingSec: Math.max(0, seconds), running: seconds > 0 },
    }));
  }

  function resetExerciseRest(exerciseId: number) {
    setRestByExercise((prev) => ({
      ...prev,
      [exerciseId]: { remainingSec: 0, running: false },
    }));
  }

  function adjustExerciseRest(exerciseId: number, delta: number) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? { ...ex, restSec: Math.max(0, Math.min(600, (ex.restSec ?? 90) + delta)) }
          : ex
      )
    );
  }

  function setExerciseRest(exerciseId: number, restSec: number) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId ? { ...ex, restSec: Math.max(0, Math.min(600, restSec)) } : ex
      )
    );
  }

  function saveAsRoutineFromSession() {
    if (typeof window === "undefined") return;
    try {
      const STORAGE_KEY = "workoutTemplates";
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const templates = Array.isArray(existing) ? existing : [];

      const name =
        getWorkoutDisplayName().trim() ||
        `Routine ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

      const routine = {
        id: `tpl_${Date.now()}`,
        name,
        exercises: exercises.map((ex) => ({
          ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
          name: ex.name,
          targetSets: Math.max(
            1,
            Math.min(20, (ex.targetSets ?? (ex.sets.length || 3)))
          ),
          restSec: ex.restSec ?? 90,
        })),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify([...templates, routine]));
      setRoutineSaved(true);
    } catch {
      // ignore
    }
  }

  function overwriteTemplateFromSession() {
    if (typeof window === "undefined" || !templateId) return;
    try {
      const STORAGE_KEY = "workoutTemplates";
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const templates = Array.isArray(existing) ? existing : [];
      const updated = templates.map((tpl) =>
        tpl && typeof tpl === "object" && (tpl as { id?: string }).id === templateId
          ? {
              ...tpl,
              name: getWorkoutDisplayName().trim() || (tpl as { name?: string }).name || "Template",
              exercises: exercises.map((ex) => ({
                ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
                name: ex.name,
                targetSets: Math.max(1, Math.min(20, ex.targetSets ?? ex.sets.length ?? 3)),
                restSec: ex.restSec ?? 90,
              })),
            }
          : tpl
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setRoutineSaved(true);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (exercises.length === 0) {
      setLastPerformance({});
      setNextTarget({});
      return;
    }
    const lastMap: Record<string, { weight: string; reps: string } | null> = {};
    const targetMap: Record<string, string | null> = {};
    for (const ex of exercises) {
      lastMap[ex.name] = getLastPerformanceForExercise({
        exerciseId: ex.exerciseId,
        name: ex.name,
      });
      targetMap[ex.name] = getNextTargetForExercise(ex.name);
    }
    setLastPerformance(lastMap);
    setNextTarget(targetMap);

    const ac = new AbortController();
    for (const ex of exercises) {
      const data = getTargetDataForExercise(ex.name);
      if (!data) continue;
      fetch("/api/refine-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseName: ex.name,
          recentPerformances: data.recentPerformances,
          exerciseType: data.exerciseType,
          weeklyVolume: data.weeklyVolume,
          baseTarget: data.baseTarget,
        }),
        signal: ac.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Refine failed"))))
        .then((res: { target?: string }) => {
          const t = res?.target;
          if (typeof t === "string" && t.trim()) {
            setNextTarget((prev) => ({ ...prev, [ex.name]: t }));
          }
        })
        .catch(() => {});
    }
    return () => ac.abort();
  }, [exercises.map((e) => e.name).join(",")]);

  useEffect(() => {
    if (typeof window === "undefined" || loadHandledRef.current) return;
    loadHandledRef.current = true;
    const suggestedMuscle = sessionStorage.getItem(WORKOUT_SUGGESTED_MUSCLE_KEY);
    if (suggestedMuscle) {
      sessionStorage.removeItem(WORKOUT_SUGGESTED_MUSCLE_KEY);
      const suggestion = suggestedMuscle.trim();
      if (suggestion) {
        setExerciseName(suggestion);
      }
    }

    const fromTemplate = sessionStorage.getItem(TEMPLATE_FOR_WORKOUT_KEY);
    if (fromTemplate) {
      try {
        const data = JSON.parse(fromTemplate) as {
          exercises?: unknown[];
          templateName?: string;
          templateId?: string;
          emptyWorkout?: boolean;
          workoutName?: string;
        };
        const exercisesData = data?.exercises;
        const tName = typeof data?.templateName === "string" ? data.templateName.trim() : "";
        const tId = typeof data?.templateId === "string" ? data.templateId.trim() : "";
        sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);

        if (data.emptyWorkout === true) {
          clearActiveWorkout();
          setTemplateName(null);
          setTemplateId(null);
          const wn = typeof data.workoutName === "string" ? data.workoutName.trim() : "";
          setWorkoutName(wn);
          setStartTime(null);
          setElapsedSec(0);
          setExercises([]);
          persistReadyRef.current = true;
          return;
        }

        if (Array.isArray(exercisesData) && exercisesData.length > 0) {
          if (tName) {
            setTemplateName(tName);
            setWorkoutName((prev) => (prev.trim() ? prev : tName));
          }
          if (tId) setTemplateId(tId);
          const now = Date.now();
          setStartTime(now);
          const initial = exercisesData.map((ex, i) => {
            const name = typeof ex === "string" ? ex : (ex as { name?: string })?.name ?? "Exercise";
            const normalized = normalizeExerciseName(name);
            const byName = getExerciseByName(normalized);
            const exerciseIdFromTemplate =
              typeof ex === "object" && ex !== null && "exerciseId" in ex
                ? (ex as { exerciseId?: string }).exerciseId
                : undefined;
            const targetSets = typeof ex === "object" && ex !== null && "targetSets" in ex
              ? Math.max(1, Math.min(20, Number((ex as { targetSets?: number }).targetSets) || 3))
              : undefined;
            const rawRest = typeof ex === "object" && ex !== null && "restSec" in ex ? (ex as { restSec?: number }).restSec : undefined;
            const restSec =
              rawRest != null && Number.isFinite(Number(rawRest))
                ? Math.max(0, Math.min(600, Number(rawRest)))
                : 0;
            const plannedSets = targetSets ?? 0;
            const sets = Array.from(
              { length: Math.max(0, plannedSets) },
              () =>
                ({
                  weight: "",
                  reps: "",
                  done: false,
                  notes: "",
                } as {
                  weight: string;
                  reps: string;
                  done?: boolean;
                  notes?: string;
                  rir?: number;
                })
            );
            return {
              id: now + i,
              ...(exerciseIdFromTemplate || byName?.id
                ? { exerciseId: exerciseIdFromTemplate ?? byName?.id }
                : {}),
              name: byName?.name ?? name,
              sets,
              targetSets,
              restSec,
            };
          });
          setExercises(initial);
        }
      } catch {
        sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
      }
      persistReadyRef.current = true;
      return;
    }

    const draft = getActiveWorkout();
    if (draft && draftHasMeaningfulContent(draft)) {
      setWorkoutName(draft.workoutName);
      setTemplateName(draft.templateName);
      setExercises(
        draft.exercises.map((ex) => ({
          ...ex,
          sets:
            ex.sets && ex.sets.length > 0
              ? ex.sets
              : [{ weight: "", reps: "", done: false, notes: "" }],
        }))
      );
      setStartTime(draft.startedAt);
      setElapsedSec(Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000)));
    }
    persistReadyRef.current = true;
  }, []);

  useEffect(() => {
    persistEnabledRef.current = true;
  }, []);

  const persistActiveDraftRef = useRef<() => void>(() => {});
  persistActiveDraftRef.current = () => {
    if (typeof window === "undefined" || !persistReadyRef.current || !persistEnabledRef.current) return;
    const { exercises: exs, workoutName: wn, templateName: tn, startTime: st } = latestWorkoutRef.current;
    const pseudo: DraftWorkout = {
      startedAt: 0,
      workoutName: wn,
      templateName: tn,
      exercises: exs.map((ex) => ({
        id: ex.id,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
        name: ex.name,
        sets: ex.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          done: s.done,
          notes: s.notes,
          ...(typeof s.rir === "number" && Number.isFinite(s.rir) ? { rir: s.rir } : {}),
        })),
        targetSets: ex.targetSets,
        restSec: ex.restSec ?? 90,
      })),
    };
    if (!draftHasMeaningfulContent(pseudo)) {
      clearActiveWorkout();
      return;
    }
    let started = st;
    if (started === null) {
      started = Date.now();
      setStartTime(started);
    }
    const draft: DraftWorkout = {
      ...pseudo,
      startedAt: started,
    };
    saveActiveWorkout(draft);
  };

  useLayoutEffect(() => {
    persistActiveDraftRef.current();
  }, [exercises, workoutName, templateName, startTime]);

  useEffect(() => {
    const flush = () => persistActiveDraftRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function getWorkoutDisplayName() {
    const user = workoutName.trim();
    if (user) return user;
    const t = (templateName ?? "").trim();
    if (t) return t;
    const first = exercises[0]?.name?.trim();
    if (first) return `${first} Workout`;
    const d = new Date();
    const short = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `Workout · ${short}`;
  }

  function finishWorkout() {
    if (exercises.length === 0) return;
    setRoutineSaved(false);
    setRestByExercise({});
    const totalSets = exercises.reduce((total, ex) => total + ex.sets.length, 0);
    const finalName = getWorkoutDisplayName();
    const completed = {
      completedAt: new Date().toISOString(),
      name: finalName,
      durationSec: elapsedSec,
      exercises: exercises.map(({ exerciseId, name, sets, restSec }) => ({
        ...(exerciseId ? { exerciseId } : {}),
        name,
        sets: sets.map(({ weight, reps, notes, rir }) => {
          const out: { weight: string; reps: string; notes?: string; rir?: number } = { weight, reps };
          if (notes?.trim()) out.notes = notes.trim();
          if (typeof rir === "number" && Number.isFinite(rir)) out.rir = rir;
          return out;
        }),
        restSec,
      })),
      totalExercises: exercises.length,
      totalSets,
    };
    addWorkout(completed);
    clearActiveWorkout();
    persistEnabledRef.current = false;
    setShowSummary(true);
  }

  function discardWorkout() {
    persistEnabledRef.current = false;
    clearActiveWorkout();
    setExercises([]);
    setWorkoutName("");
    setTemplateName(null);
    setTemplateId(null);
    setRestByExercise({});
    setShowSummary(false);
    setShowDiscardConfirm(false);
    router.push("/");
  }

  function openCreateExerciseFlow(seedName: string) {
    setCreateExerciseSeedName(seedName.trim());
    setCreateExerciseOpen(true);
  }

  function appendExerciseFromLibrary(matched: { id: string; name: string }) {
    const newExercise = {
      id: Date.now(),
      exerciseId: matched.id,
      name: matched.name,
      sets: [{ weight: "", reps: "", done: false, notes: "" }],
      restSec: 90,
    };
    setExercises((prev) => [...prev, newExercise]);
    setExerciseName("");
  }

  function handleUserExerciseCreated(record: UserExerciseRecord) {
    const ex = userRecordToExercise(record);
    appendExerciseFromLibrary({ id: ex.id, name: ex.name });
    setUserLibraryRevision((r) => r + 1);
  }

  function addExercise(selection?: ExercisePickerValue) {
    const trimmed = (selection?.name ?? exerciseName).trim();
    if (!trimmed) {
      addExerciseInputRef.current?.focus();
      return;
    }

    const selectedFromPicker = selection?.exerciseId
      ? { id: selection.exerciseId, name: selection.name }
      : null;
    const matched = selectedFromPicker ?? getExerciseByName(trimmed);

    if (!matched) {
      openCreateExerciseFlow(trimmed);
      return;
    }

    appendExerciseFromLibrary({ id: matched.id, name: matched.name });
  }

  function addSetRow(exerciseId: number) {
    const ex = exercises.find((e) => e.id === exerciseId);
    const nextIndex = ex?.sets?.length ?? 0;
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [...exercise.sets, { weight: "", reps: "", done: false, notes: "" }],
            }
          : exercise
      )
    );
    setPendingFocus({ exerciseId, setIndex: nextIndex });
  }

  function updateSetValue(
    exerciseId: number,
    setIndex: number,
    field: "weight" | "reps",
    value: string
  ) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        sets[setIndex] = { ...sets[setIndex], [field]: value };
        return { ...exercise, sets };
      })
    );
  }

  function updateSetRir(exerciseId: number, setIndex: number, raw: string) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        const cur = sets[setIndex];
        const trimmed = raw.trim();
        if (trimmed === "") {
          const { rir: _drop, ...rest } = cur;
          sets[setIndex] = rest;
          return { ...exercise, sets };
        }
        const n = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(n)) return { ...exercise, sets };
        const clamped = Math.max(0, Math.min(5, n));
        sets[setIndex] = { ...cur, rir: clamped };
        return { ...exercise, sets };
      })
    );
  }

  function updateSetNotes(exerciseId: number, setIndex: number, value: string) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        sets[setIndex] = { ...sets[setIndex], notes: value };
        return { ...exercise, sets };
      })
    );
  }

  function toggleSetDone(exerciseId: number, setIndex: number) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        if (setIndex < 0) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        const current = sets[setIndex] ?? { weight: "", reps: "", done: false, notes: "" };
        const done = !Boolean(current.done);
        sets[setIndex] = { ...current, done };
        return { ...exercise, sets };
      })
    );

    // When a set is completed, start the rest timer for this exercise.
    const ex = exercises.find((e) => e.id === exerciseId);
    if (ex) {
      const current = ex.sets[setIndex];
      const willBeDone = !Boolean(current?.done);
      if (willBeDone) {
        const isFinalPlannedSet =
          (typeof ex.targetSets === "number" && ex.targetSets > 0 && setIndex >= ex.targetSets - 1) ||
          setIndex >= ex.sets.length - 1;
        if (!isFinalPlannedSet) {
          startExerciseRest(exerciseId, ex.restSec ?? 90);
        } else {
          resetExerciseRest(exerciseId);
        }
        // If planned sets exist and we just completed the last logged set, auto-create the next slot.
        if (ex.targetSets && ex.sets.length < ex.targetSets && setIndex === ex.sets.length - 1) {
          setExercises((prev) =>
            prev.map((exercise) =>
              exercise.id === exerciseId
                ? { ...exercise, sets: [...exercise.sets, { weight: "", reps: "", done: false, notes: "" }] }
                : exercise
            )
          );
        }
      }
    }
  }

  function deleteSet(exerciseId: number, setIndex: number) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const next = exercise.sets.filter((_, index) => index !== setIndex);
        return {
          ...exercise,
          sets:
            next.length === 0
              ? [{ weight: "", reps: "", done: false, notes: "" }]
              : next,
        };
      })
    );
  }

  function deleteExercise(exerciseId: number) {
    setExerciseMenuOpenId(null);
    setRestAdjustExerciseId((id) => (id === exerciseId ? null : id));
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-8">
      {/* subtle depth on large screens */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-zinc-900/10 via-transparent to-transparent" />

      <div className="relative max-w-[560px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/workout/start"
              className="shrink-0 flex touch-manipulation items-center justify-center h-10 w-10 rounded-xl border border-teal-800/40 bg-zinc-800/30 text-teal-200/80 hover:bg-zinc-800/50 hover:text-white transition active:opacity-90"
              aria-label="Back to workout start"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <input
              type="text"
              placeholder={exercises.length === 0 ? "Optional workout name" : "Workout name"}
              aria-label="Workout name"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className={`input-app flex-1 min-w-0 p-3 text-base truncate touch-manipulation border-teal-700/45 bg-zinc-800/40 shadow-sm shadow-black/20 placeholder:text-zinc-500 ${
                workoutName.trim() ? "font-medium text-zinc-50" : "font-normal text-zinc-400"
              }`}
            />
            {exercises.length > 0 ? (
              <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="touch-manipulation px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl text-xs font-medium text-zinc-500 border border-transparent hover:text-zinc-300 hover:border-teal-800/30 hover:bg-zinc-800/40 active:opacity-80 transition"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={finishWorkout}
                  className="touch-manipulation px-4 py-2.5 sm:py-3 rounded-xl btn-primary text-sm font-semibold shadow-md shadow-black/25 active:scale-[0.98]"
                >
                  Finish
                </button>
              </div>
            ) : (
              <span className="shrink-0 w-[72px]" />
            )}
          </div>
          {showWorkoutStats && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300/90">
              <span className="tabular-nums px-2 py-1 rounded-full bg-zinc-800/55 border border-teal-700/40 shadow-sm shadow-black/20">
                {formatElapsed(elapsedSec)}
              </span>
              <span className="px-2 py-1 rounded-full bg-zinc-800/55 border border-teal-700/40 shadow-sm shadow-black/20">
                <span className="text-teal-200/65 mr-1">Exercises</span>
                <span className="tabular-nums text-white">{exercises.length}</span>
              </span>
              <span className="px-2 py-1 rounded-full bg-zinc-800/55 border border-teal-700/40 shadow-sm shadow-black/20">
                <span className="text-teal-200/65 mr-1">Sets</span>
                <span className="tabular-nums text-white">{totalSetsLogged}</span>
              </span>
            </div>
          )}
        </header>

        {exercises.length === 0 ? (
          <div className="min-h-[min(52vh,400px)] flex items-start justify-center px-1 pt-2 sm:pt-6 lg:pt-10">
            <div className="w-full max-w-lg rounded-3xl border border-teal-950/40 bg-gradient-to-br from-zinc-900/95 to-teal-950/25 shadow-md shadow-black/35 p-5 sm:p-7">
              <div className="mb-4">
                <p className="text-xl font-semibold tracking-tight text-white">Add your first exercise</p>
                <p className="text-sm text-app-secondary mt-1.5 leading-relaxed">
                  Your workout starts once you add the first movement.
                </p>
              </div>

              <div className="space-y-3">
                <ExercisePicker
                  value={exerciseName}
                  onValueChange={setExerciseName}
                  onSelect={(exercise) => addExercise(exercise)}
                  onRequestCreateExercise={openCreateExerciseFlow}
                  inputRef={addExerciseInputRef}
                  placeholder="Search or type a movement"
                  inputClassName="input-app w-full p-3 text-base shadow-sm shadow-black/10"
                  dropdownClassName="rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                  libraryRevision={userLibraryRevision}
                />
                {recentExerciseHint.length > 0 && (
                  <p className="text-[11px] text-app-meta/90 leading-snug px-0.5">
                    Recent: {recentExerciseHint.join(", ")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="w-full py-3.5 rounded-2xl btn-primary text-base font-semibold"
                >
                  Add exercise
                </button>
                <p className="text-[11px] text-app-meta text-center">Tip: Enter selects a match or opens create when there’s no result.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="space-y-2 sm:space-y-2.5">
              {exercises.map((exercise) => {
                const lastP = lastPerformance[exercise.name];
                const lastStr = lastP
                  ? `Last: ${lastP.weight} ${unit} × ${lastP.reps}`
                  : "Last: —";
                const targetRaw = nextTarget[exercise.name];
                const targetStr = targetRaw
                  ? (targetRaw ?? "").replace(/\bkg\b/g, unit).replace(/\s*×\s*/g, "×").trim()
                  : null;
                const contextLine =
                  targetStr != null && targetStr.length > 0
                    ? `${lastStr} · Target: ${targetStr}`
                    : lastStr;

                return (
                  <div
                    key={exercise.id}
                    className="rounded-xl border border-teal-700/45 bg-gradient-to-b from-zinc-800/40 via-zinc-900/90 to-zinc-950/85 shadow-md shadow-black/35 ring-1 ring-teal-400/[0.07] px-3 py-2.5 sm:px-3.5 sm:py-3"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold tracking-tight text-white truncate leading-snug">
                          {exercise.name}
                        </h3>
                        <p className="text-[11px] text-zinc-300/90 mt-0.5 leading-snug line-clamp-2">
                          {contextLine}
                        </p>
                      </div>
                      <div className="relative shrink-0" data-exercise-menu-root>
                        <button
                          type="button"
                          onClick={() =>
                            setExerciseMenuOpenId((id) => (id === exercise.id ? null : exercise.id))
                          }
                          className="h-8 w-8 rounded-lg border border-teal-700/40 bg-zinc-800/40 text-teal-200/80 hover:text-white hover:bg-zinc-700/45 transition flex items-center justify-center"
                          aria-label="Exercise options"
                          aria-expanded={exerciseMenuOpenId === exercise.id}
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                        {exerciseMenuOpenId === exercise.id && (
                          <div
                            className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-teal-700/45 bg-zinc-800/95 py-0.5 shadow-lg shadow-black/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-teal-100/90 hover:bg-zinc-700/45 transition"
                              onClick={() => {
                                setRestAdjustExerciseId(exercise.id);
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Adjust rest
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-red-300/85 hover:bg-red-950/35 transition"
                              onClick={() => {
                                deleteExercise(exercise.id);
                              }}
                            >
                              Delete exercise
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-teal-800/35">
                      {(() => {
                        const lastSets = getLastSetsForExercise({
                          exerciseId: exercise.exerciseId,
                          name: exercise.name,
                        });
                        const nextIdx = exercise.sets.findIndex((s) => !s?.done);
                        const effectiveNextIdx = nextIdx === -1 ? exercise.sets.length : nextIdx;
                        const logInputShell =
                          "relative min-w-0 h-9 rounded-xl bg-zinc-800/35 border border-teal-700/40 flex items-center transition-colors duration-150 focus-within:ring-2 focus-within:ring-teal-400/45 focus-within:border-teal-500/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]";
                        const rowIconBtn =
                          "min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 shrink-0 rounded-lg border border-teal-700/20 bg-zinc-800/25 flex items-center justify-center touch-manipulation select-none transition active:scale-[0.96] active:opacity-90";
                        const logInputInner =
                          "min-w-0 flex-1 h-full bg-transparent border-0 rounded-xl px-2 text-xs tabular-nums text-zinc-50 focus:outline-none focus:ring-0 disabled:opacity-55 disabled:cursor-not-allowed placeholder:text-teal-200/40";

                        return (
                          <div className="overflow-x-auto -mx-0.5 px-0.5">
                            <div className="min-w-[min(100%,20rem)]">
                            <div className="mb-1 grid grid-cols-[1.125rem_1fr_1fr_2rem_2.75rem_2.75rem_2.75rem] gap-x-2 items-center px-0.5">
                              <span className="text-[9px] font-medium uppercase tracking-wide text-teal-200/60 text-center">
                                #
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-teal-200/60 pl-0.5">
                                Weight
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-teal-200/60 pl-0.5">
                                Reps
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-teal-200/60 text-center">
                                RIR
                              </span>
                              <span className="sr-only">Done</span>
                              <span className="sr-only">Note</span>
                              <span className="sr-only">Remove</span>
                            </div>

                            <ul className="space-y-1 text-zinc-200/95">
                              {exercise.sets.map((set, index) => {
                                const lastSet = lastSets[index];
                                const prevWeightStr =
                                  lastSet &&
                                  lastSet.weight !== undefined &&
                                  String(lastSet.weight).trim() !== ""
                                    ? String(lastSet.weight).trim()
                                    : null;
                                const prevRepsStr =
                                  lastSet &&
                                  lastSet.reps !== undefined &&
                                  String(lastSet.reps).trim() !== ""
                                    ? String(lastSet.reps).trim()
                                    : null;
                                const noteKey = `${exercise.id}-${index}`;
                                const isNoteExpanded = expandedNoteKey === noteKey;
                                const isDone = Boolean(set.done);
                                const isNext = !isDone && index === effectiveNextIdx;
                                const note = (set.notes ?? "").trim();
                                const hasNote = note.length > 0;

                                return (
                                  <li key={`${exercise.id}-set-${index}`} className="rounded-lg">
                                    {(() => {
                                      const timer = restByExercise[exercise.id] ?? {
                                        remainingSec: 0,
                                        running: false,
                                      };
                                      const isActive = timer.running && timer.remainingSec > 0;
                                      return (
                                        <>
                                          {isNext && isActive && (
                                            <div className="mb-0.5 text-[10px] tabular-nums text-teal-200/70">
                                              <span className="text-zinc-500">Rest </span>
                                              <span className="text-[color:var(--color-accent)] font-semibold">
                                                {formatRest(timer.remainingSec)}
                                              </span>
                                            </div>
                                          )}
                                          <div
                                            className={`grid grid-cols-[1.125rem_1fr_1fr_2rem_2.75rem_2.75rem_2.75rem] gap-x-2 items-center rounded-lg py-0.5 ${
                                              isNext
                                                ? "ring-1 ring-[color:var(--color-accent)]/45 bg-zinc-800/30 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12)]"
                                                : ""
                                            } ${isDone ? "opacity-[0.78]" : ""}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                              if (
                                                e.target instanceof HTMLInputElement ||
                                                e.target instanceof HTMLButtonElement
                                              )
                                                return;
                                              setInputRefs.current[
                                                `${exercise.id}-${index}-weight`
                                              ]?.focus();
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.target instanceof HTMLInputElement) return;
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setInputRefs.current[
                                                  `${exercise.id}-${index}-weight`
                                                ]?.focus();
                                              }
                                            }}
                                          >
                                            <span className="text-center text-[11px] text-teal-200/75 tabular-nums font-semibold">
                                              {index + 1}
                                            </span>
                                            <div className={logInputShell}>
                                              <input
                                                ref={(el) => {
                                                  setInputRefs.current[`${exercise.id}-${index}-weight`] =
                                                    el;
                                                }}
                                                type="text"
                                                inputMode="decimal"
                                                enterKeyHint="next"
                                                autoComplete="off"
                                                autoCorrect="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                                placeholder={prevWeightStr ?? "—"}
                                                value={set.weight ?? ""}
                                                onChange={(e) =>
                                                  updateSetValue(
                                                    exercise.id,
                                                    index,
                                                    "weight",
                                                    sanitizeWeightInput(e.target.value)
                                                  )
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const repsKey = `${exercise.id}-${index}-reps`;
                                                    const next = setInputRefs.current[repsKey];
                                                    next?.focus();
                                                    next?.select?.();
                                                    return;
                                                  }
                                                  if (isNavigationOrShortcutKey(e)) return;
                                                  const cur = (e.target as HTMLInputElement).value;
                                                  if (isWeightDecimalKey(e.key, cur.includes("."))) return;
                                                  e.preventDefault();
                                                }}
                                                aria-label={`Set ${index + 1} weight (${unit}), numbers and decimal only`}
                                                className={`${logInputInner} pl-2 pr-1`}
                                              />
                                              <span
                                                className="shrink-0 pr-2 text-[9px] font-semibold uppercase tracking-wide text-teal-200/45 tabular-nums select-none"
                                                aria-hidden
                                              >
                                                {unit}
                                              </span>
                                            </div>
                                            <div className={logInputShell}>
                                              <input
                                                ref={(el) => {
                                                  setInputRefs.current[`${exercise.id}-${index}-reps`] = el;
                                                }}
                                                type="text"
                                                inputMode="numeric"
                                                enterKeyHint="next"
                                                autoComplete="off"
                                                autoCorrect="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                                pattern="[0-9]*"
                                                placeholder={prevRepsStr ?? "—"}
                                                value={set.reps ?? ""}
                                                onChange={(e) =>
                                                  updateSetValue(
                                                    exercise.id,
                                                    index,
                                                    "reps",
                                                    sanitizeRepsInput(e.target.value)
                                                  )
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const rirKey = `${exercise.id}-${index}-rir`;
                                                    const next = setInputRefs.current[rirKey];
                                                    next?.focus();
                                                    next?.select?.();
                                                    return;
                                                  }
                                                  if (isNavigationOrShortcutKey(e)) return;
                                                  if (e.key >= "0" && e.key <= "9") return;
                                                  e.preventDefault();
                                                }}
                                                aria-label={`Set ${index + 1} reps, whole numbers only`}
                                                className={`${logInputInner} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                              />
                                            </div>
                                            <input
                                              ref={(el) => {
                                                setInputRefs.current[`${exercise.id}-${index}-rir`] = el;
                                              }}
                                              type="text"
                                              inputMode="numeric"
                                              enterKeyHint={
                                                set.rir === undefined ? "done" : index === exercise.sets.length - 1 ? "done" : "next"
                                              }
                                              autoComplete="off"
                                              autoCorrect="off"
                                              autoCapitalize="off"
                                              spellCheck={false}
                                              pattern="[0-5]*"
                                              maxLength={1}
                                              placeholder="—"
                                              value={set.rir === undefined ? "" : String(set.rir)}
                                              onChange={(e) =>
                                                updateSetRir(
                                                  exercise.id,
                                                  index,
                                                  sanitizeRirInput(e.target.value)
                                                )
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  const rirUnset = set.rir === undefined;
                                                  if (rirUnset) {
                                                    const doneKey = `${exercise.id}-${index}`;
                                                    setDoneButtonRefs.current[doneKey]?.focus();
                                                    return;
                                                  }
                                                  if (index === exercise.sets.length - 1) {
                                                    addSetRow(exercise.id);
                                                    return;
                                                  }
                                                  const nextWeightKey = `${exercise.id}-${index + 1}-weight`;
                                                  const nw = setInputRefs.current[nextWeightKey];
                                                  nw?.focus();
                                                  nw?.select?.();
                                                  return;
                                                }
                                                if (isNavigationOrShortcutKey(e)) return;
                                                if (e.key >= "0" && e.key <= "5") return;
                                                e.preventDefault();
                                              }}
                                              aria-label={`Set ${index + 1} RIR 0–5, optional`}
                                              className="h-8 sm:h-9 min-h-0 w-full rounded-lg border border-teal-700/35 bg-zinc-800/40 px-1 text-center text-[11px] tabular-nums text-zinc-50 placeholder:text-teal-200/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] focus:outline-none focus:ring-1 focus:ring-teal-400/40 focus:border-teal-500/45 disabled:opacity-55 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <div className="flex justify-center">
                                              <button
                                                type="button"
                                                ref={(el) => {
                                                  setDoneButtonRefs.current[`${exercise.id}-${index}`] = el;
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleSetDone(exercise.id, index);
                                                }}
                                                className={`${rowIconBtn} rounded-full ${
                                                  isDone
                                                    ? "border border-[color:var(--color-accent)]/70 bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)] shadow-sm shadow-[color:var(--color-accent)]/10"
                                                    : "border-teal-700/25 text-teal-200/70 hover:bg-zinc-800/55 hover:border-teal-600/30 hover:text-teal-100"
                                                }`}
                                                aria-label={`Mark set ${index + 1} complete`}
                                              >
                                                <span className="text-sm sm:text-xs font-semibold leading-none">
                                                  ✓
                                                </span>
                                              </button>
                                            </div>
                                            <div className="flex justify-center">
                                              {!isNoteExpanded ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedNoteKey(noteKey);
                                                  }}
                                                  className={`${rowIconBtn} relative border-teal-700/20 text-teal-200/55 hover:border-teal-600/30 hover:bg-zinc-800/45 hover:text-teal-100/90`}
                                                  aria-label={hasNote ? "Edit set note" : "Add set note"}
                                                >
                                                  <svg
                                                    className="h-4 w-4 sm:h-3.5 sm:w-3.5"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth={1.5}
                                                    viewBox="0 0 24 24"
                                                    aria-hidden
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                    />
                                                  </svg>
                                                  {hasNote && (
                                                    <span className="absolute top-2 right-2 sm:top-1.5 sm:right-1.5 h-1 w-1 rounded-full bg-[color:var(--color-accent)] ring-1 ring-zinc-900/80" />
                                                  )}
                                                </button>
                                              ) : (
                                                <span className="min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8" />
                                              )}
                                            </div>
                                            <div className="flex justify-center">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  deleteSet(exercise.id, index);
                                                }}
                                                className={`${rowIconBtn} text-zinc-500 hover:border-red-500/25 hover:bg-red-950/20 hover:text-red-300/90`}
                                                aria-label={`Remove set ${index + 1}`}
                                              >
                                                <svg
                                                  className="h-4 w-4 sm:h-3.5 sm:w-3.5"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  strokeWidth={1.5}
                                                  viewBox="0 0 24 24"
                                                  aria-hidden
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                  />
                                                </svg>
                                              </button>
                                            </div>
                                          </div>

                                          {isNoteExpanded &&
                                            (() => {
                                              const lastSetInner = lastSets[index];
                                              const lastNoteInner = (lastSetInner?.notes ?? "").trim();
                                              const notePlaceholderInner =
                                                !(set.notes ?? "").trim() && lastNoteInner
                                                  ? lastNoteInner.length > 96
                                                    ? `${lastNoteInner.slice(0, 96)}…`
                                                    : lastNoteInner
                                                  : "Note…";
                                              return (
                                                <div
                                                  className="mt-1 rounded-md border border-teal-700/40 bg-zinc-800/45 px-2 py-1.5 shadow-sm shadow-black/20"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <input
                                                    type="text"
                                                    placeholder={notePlaceholderInner}
                                                    value={set.notes ?? ""}
                                                    onChange={(e) =>
                                                      updateSetNotes(exercise.id, index, e.target.value)
                                                    }
                                                    className="input-app w-full h-8 min-h-0 px-2 py-1 text-xs"
                                                    autoFocus
                                                  />
                                                  <div className="mt-1 flex justify-end">
                                                    <button
                                                      type="button"
                                                      onClick={() => setExpandedNoteKey(null)}
                                                      className="text-[10px] px-2 py-1 rounded-md text-teal-200/70 hover:text-white hover:bg-zinc-700/70 transition"
                                                    >
                                                      Done
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })()}
                                        </>
                                      );
                                    })()}
                                  </li>
                                );
                              })}
                            </ul>

                            </div>

                            {(() => {
                              const rest = exercise.restSec ?? 90;
                              const timer = restByExercise[exercise.id] ?? {
                                remainingSec: 0,
                                running: false,
                              };
                              const isActive = timer.running && timer.remainingSec > 0;

                              return (
                                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                  <div
                                    className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm shadow-black/15 ${
                                      isActive
                                        ? "border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/8 text-zinc-100"
                                        : "border-teal-700/40 bg-zinc-800/35 text-zinc-200"
                                    }`}
                                  >
                                    {isActive ? (
                                      <span className="tabular-nums font-semibold text-[color:var(--color-accent)]">
                                        {formatRest(timer.remainingSec)}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-teal-200/55">Rest</span>
                                        <span className="tabular-nums font-medium text-zinc-100">
                                          {formatRest(rest)}
                                        </span>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        isActive
                                          ? resetExerciseRest(exercise.id)
                                          : startExerciseRest(exercise.id, rest)
                                      }
                                      className="rounded-md border border-teal-600/40 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-100/95 hover:bg-zinc-700/80 hover:border-teal-500/45 transition touch-manipulation"
                                    >
                                      {isActive ? "Stop" : "Start"}
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => addSetRow(exercise.id)}
                                    className="text-[10px] px-2.5 py-1.5 rounded-lg btn-primary font-semibold ml-auto sm:ml-0 touch-manipulation"
                                  >
                                    + Set
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="mt-5 mb-3 rounded-xl border border-teal-700/45 bg-zinc-800/35 p-3 shadow-md shadow-black/25 ring-1 ring-teal-400/[0.06]">
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0">
                  <ExercisePicker
                    value={exerciseName}
                    onValueChange={setExerciseName}
                    onSelect={(exercise) => addExercise(exercise)}
                    onRequestCreateExercise={openCreateExerciseFlow}
                    inputRef={addExerciseInputRef}
                    placeholder="Next exercise…"
                    inputClassName="input-app flex-1 min-w-0 py-2.5 px-3 text-sm sm:text-base"
                    dropdownClassName="mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                    libraryRevision={userLibraryRevision}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="shrink-0 self-center min-h-[44px] px-4 rounded-xl btn-primary text-sm font-semibold sm:min-h-0 sm:py-3"
                >
                  Add
                </button>
              </div>
            </section>
          </>
        )}

        <CreateExerciseModal
          open={createExerciseOpen}
          initialName={createExerciseSeedName}
          onClose={() => setCreateExerciseOpen(false)}
          onCreated={handleUserExerciseCreated}
        />

        <div className="mt-4">
          {showDiscardConfirm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
              role="dialog"
              aria-modal="true"
              aria-labelledby="discard-title"
              onClick={() => setShowDiscardConfirm(false)}
            >
              <div
                className="w-full max-w-sm p-6 rounded-2xl border border-teal-950/50 bg-gradient-to-b from-zinc-900 to-teal-950/30 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="discard-title" className="text-lg font-bold text-white mb-2">
                  Discard workout?
                </h2>
                <p className="text-sm text-app-secondary mb-6">
                  Progress will be lost. This cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={discardWorkout}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-950/80 border border-red-900/60 text-red-200 hover:bg-red-900/60 transition"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSummary && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
              onClick={(e) => e.target === e.currentTarget && router.push("/")}
            >
              <div
                className="w-full max-w-md p-6 rounded-2xl border border-teal-950/50 bg-gradient-to-b from-zinc-900 to-teal-950/30 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">Workout Summary</h2>
                <p className="text-white font-bold mb-2">{getWorkoutDisplayName()}</p>
                <p className="text-app-secondary mb-4">
                  {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} ·{" "}
                  {exercises.reduce((total, ex) => total + ex.sets.length, 0)} total sets
                </p>
                <ul className="space-y-2 text-sm text-app-secondary mb-6">
                  {exercises.map((exercise) => (
                    <li key={exercise.id}>
                      {exercise.name} — {exercise.sets.length} set
                      {exercise.sets.length !== 1 ? "s" : ""}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <button
                    onClick={saveAsRoutineFromSession}
                    disabled={routineSaved || exercises.length === 0}
                    className="w-full py-3 rounded-xl font-semibold border border-teal-500/50 text-teal-300 hover:bg-teal-950/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {routineSaved ? "Routine Saved" : "Save as Routine"}
                  </button>
                  {templateId && (
                    <button
                      onClick={overwriteTemplateFromSession}
                      disabled={exercises.length === 0}
                      className="w-full py-3 rounded-xl font-semibold border border-teal-900/50 text-app-secondary hover:bg-teal-950/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Update Existing Template
                    </button>
                  )}
                  <button
                    onClick={() => router.push("/")}
                    className="w-full py-3 rounded-xl btn-primary"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {restAdjustExerciseId !== null &&
        (() => {
          const exAdj = exercises.find((e) => e.id === restAdjustExerciseId);
          if (!exAdj) return null;
          const rAdj = exAdj.restSec ?? 90;
          return (
            <div
              className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 p-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:items-center sm:pb-3"
              onClick={() => setRestAdjustExerciseId(null)}
            >
              <div
                role="dialog"
                aria-labelledby="rest-adjust-title"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-teal-700/45 bg-zinc-900/98 p-4 shadow-2xl shadow-black/55 ring-1 ring-teal-400/10"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="rest-adjust-title" className="text-sm font-semibold text-white">
                  Adjust rest · {exAdj.name}
                </h2>
                <p className="mt-1 text-[11px] leading-snug text-teal-200/60">
                  Default duration for this exercise when the timer runs after a set.
                </p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-teal-200/65">
                  <span>Duration</span>
                  <span className="tabular-nums text-zinc-200">{formatRest(rAdj)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={15}
                  value={rAdj}
                  onChange={(e) =>
                    setExerciseRest(
                      exAdj.id,
                      Math.max(0, Math.min(300, Number(e.target.value) || 0))
                    )
                  }
                  className="mt-1.5 w-full accent-teal-400 h-2"
                  aria-label={`Rest duration for ${exAdj.name}`}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[60, 90, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setExerciseRest(exAdj.id, sec)}
                      className="text-[10px] px-2 py-1 rounded-md border border-teal-700/40 bg-zinc-800/50 text-teal-200/80 hover:text-white hover:bg-zinc-700/45"
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-teal-700/45 bg-zinc-800/60 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700/55 transition"
                  onClick={() => setRestAdjustExerciseId(null)}
                >
                  Done
                </button>
              </div>
            </div>
          );
        })()}
    </main>
  );
}