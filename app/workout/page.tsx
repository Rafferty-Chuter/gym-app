"use client";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
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

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";
const WORKOUT_HISTORY_KEY = "workoutHistory";
const WORKOUT_SUGGESTED_MUSCLE_KEY = "workoutSuggestedMuscle";
const TEMPLATES_STORAGE_KEY = "workoutTemplates";
const KG_TO_LB = 2.2046226218;

type QuickTemplate = {
  id?: string;
  name: string;
  exercises: Array<{
    exerciseId?: string;
    name: string;
    targetSets?: number;
    restSec?: number;
  }>;
};

function readTemplates(): QuickTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t, i) => {
        if (!t || typeof t !== "object") return null;
        const obj = t as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : `Template ${i + 1}`;
        const exercisesRaw = Array.isArray(obj.exercises) ? obj.exercises : [];
        const exercises = exercisesRaw
          .map((ex) => {
            if (!ex || typeof ex !== "object") return null;
            const e = ex as Record<string, unknown>;
            const exName = typeof e.name === "string" ? e.name.trim() : "";
            if (!exName) return null;
            return {
              ...(typeof e.exerciseId === "string" && e.exerciseId.trim()
                ? { exerciseId: e.exerciseId.trim() }
                : {}),
              name: exName,
              ...(Number.isFinite(Number(e.targetSets)) ? { targetSets: Number(e.targetSets) } : {}),
              ...(Number.isFinite(Number(e.restSec)) ? { restSec: Number(e.restSec) } : {}),
            };
          })
          .filter(Boolean) as QuickTemplate["exercises"];
        const fallbackId = `tpl_${i}_${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")}`;
        return {
          id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : fallbackId,
          name,
          exercises,
        };
      })
      .filter(Boolean) as QuickTemplate[];
  } catch {
    return [];
  }
}

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
  const [showSummary, setShowSummary] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [lastPerformance, setLastPerformance] = useState<
    Record<string, { weight: string; reps: string } | null>
  >({});
  const [nextTarget, setNextTarget] = useState<Record<string, string | null>>({});
  const [workoutName, setWorkoutName] = useState("");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<QuickTemplate[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [routineSaved, setRoutineSaved] = useState(false);
  const addExerciseInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<{ exerciseId: number; setIndex: number } | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [restByExercise, setRestByExercise] = useState<Record<number, { remainingSec: number; running: boolean }>>({});
  const [startTime, setStartTime] = useState<number | null>(null);
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

  function workoutDisplayName(w: { name?: string; exercises?: { name: string }[] }) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  function estimateTemplateMinutes(template: QuickTemplate) {
    const seconds = template.exercises.reduce((sum, ex) => {
      const sets = Number.isFinite(ex.targetSets) ? Math.max(1, Number(ex.targetSets)) : 3;
      const rest = Number.isFinite(ex.restSec) ? Math.max(30, Number(ex.restSec)) : 90;
      return sum + sets * (45 + rest);
    }, 0);
    return `${Math.max(20, Math.round(seconds / 60))} min`;
  }

  useEffect(() => {
    function loadTemplates() {
      setTemplateLibrary(readTemplates());
    }
    loadTemplates();
    window.addEventListener("workoutHistoryChanged", loadTemplates);
    return () => window.removeEventListener("workoutHistoryChanged", loadTemplates);
  }, []);

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
        setShowBuilder(true);
        setExerciseName(suggestion);
        setWorkoutName((prev) => (prev.trim() ? prev : `${suggestion} Focus`));
      }
    }

    const fromTemplate = sessionStorage.getItem(TEMPLATE_FOR_WORKOUT_KEY);
    if (fromTemplate) {
      try {
        const data = JSON.parse(fromTemplate) as {
          exercises: unknown[];
          templateName?: string;
          templateId?: string;
        };
        const exercisesData = data?.exercises;
        const tName = typeof data?.templateName === "string" ? data.templateName.trim() : "";
        const tId = typeof data?.templateId === "string" ? data.templateId.trim() : "";
        sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
        if (Array.isArray(exercisesData) && exercisesData.length > 0) {
          setShowBuilder(true);
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
      setShowBuilder(true);
      setWorkoutName(draft.workoutName);
      setTemplateName(draft.templateName);
      setExercises(draft.exercises);
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
    return "Workout";
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

  function startFromTemplateHub(template: QuickTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({
        ...(template.id ? { templateId: template.id } : {}),
        templateName: template.name,
        exercises: template.exercises,
      })
    );
    window.location.reload();
  }

  function openTemplateForEditing(template: QuickTemplate) {
    if (!template.id) {
      router.push("/templates");
      return;
    }
    router.push(`/templates/${encodeURIComponent(template.id)}`);
  }

  function addExercise(selection?: ExercisePickerValue, forceCustom = false) {
    const trimmed = (selection?.name ?? exerciseName).trim();
    if (!trimmed) {
      addExerciseInputRef.current?.focus();
      return;
    }

    const selectedFromPicker =
      !forceCustom && selection?.exerciseId
        ? { id: selection.exerciseId, name: selection.name }
        : null;
    const matched = forceCustom ? null : selectedFromPicker ?? getExerciseByName(trimmed);

    const newExercise = {
      id: Date.now(),
      ...(matched ? { exerciseId: matched.id } : {}),
      name: matched?.name ?? trimmed,
      sets: [],
      restSec: 90,
    };
    console.log("[workout] selected exerciseId:", newExercise.exerciseId ?? null, "name:", newExercise.name);

    setExercises((prev) => [...prev, newExercise]);
    setExerciseName("");
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
        if (setIndex < 0 || setIndex >= exercise.sets.length) return exercise;
        const sets = [...exercise.sets];
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
      prev.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.filter((_, index) => index !== setIndex),
            }
          : exercise
      )
    );
  }

  function deleteExercise(exerciseId: number) {
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-8">
      {/* subtle depth on large screens */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-zinc-900/10 via-transparent to-transparent" />

      <div className="relative max-w-[560px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6">
        {!showBuilder && exercises.length === 0 ? (
          <div className="space-y-5 pb-24">
            <header className="mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-white">Templates</h1>
              <p className="mt-1 text-sm text-app-secondary">Create templates and start workouts directly from your saved templates.</p>
            </header>

            <section className="rounded-2xl border border-teal-900/35 bg-zinc-900/90 p-4">
              <p className="label-section mb-2">Create New Template</p>
              <p className="text-sm text-app-secondary">
                Build a new template with your preferred exercises, sets, and rest times.
              </p>
              <Link
                href="/templates/new"
                className="mt-3 inline-flex rounded-xl border border-teal-300/35 bg-gradient-to-br from-teal-500 to-emerald-500 px-3 py-2 text-sm font-bold text-zinc-950 shadow-[0_6px_18px_-10px_rgba(20,184,166,0.7)] transition hover:brightness-105"
              >
                Create New Template
              </Link>
            </section>

            <section className="rounded-2xl border border-teal-900/35 bg-zinc-900/90 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="label-section">Saved Templates</p>
                <Link href="/templates" className="text-xs link-home-accent">
                  Manage →
                </Link>
              </div>
              {templateLibrary.length === 0 ? (
                <div className="rounded-xl border border-teal-900/35 bg-zinc-900/70 p-3">
                  <p className="text-sm text-app-secondary">No saved templates yet. Create one to speed up your sessions.</p>
                  <Link href="/templates" className="mt-2 inline-flex text-xs font-semibold text-teal-300 hover:text-teal-200 transition">
                    Create template →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {templateLibrary.slice(0, 4).map((template) => (
                    <div
                      key={template.id ?? template.name}
                      role="button"
                      tabIndex={0}
                      onClick={() => openTemplateForEditing(template)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openTemplateForEditing(template);
                        }
                      }}
                      className="w-full rounded-xl border border-teal-900/30 bg-zinc-900/70 px-3 py-2.5 transition hover:border-teal-500/30 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 text-sm font-semibold text-white truncate">{template.name}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-app-meta">
                        {template.exercises.length} exercise{template.exercises.length !== 1 ? "s" : ""} · {estimateTemplateMinutes(template)}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startFromTemplateHub(template);
                        }}
                        className="mt-2 rounded-lg border border-teal-800/35 bg-teal-950/25 px-2.5 py-1 text-[11px] font-semibold text-app-secondary transition hover:text-white hover:border-teal-500/30"
                      >
                        Start Workout
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <>
        <header className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/"
              className="shrink-0 flex items-center justify-center h-10 w-10 rounded-xl border border-teal-900/40 text-app-secondary hover:bg-teal-950/30 hover:text-white transition"
              aria-label="Back to Home"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <input
              type="text"
              placeholder="Workout name"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className="input-app flex-1 min-w-0 p-3 text-base font-medium truncate"
            />
            {exercises.length > 0 ? (
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="btn-secondary !py-2.5"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={finishWorkout}
                  className="px-4 py-3 rounded-xl btn-primary text-sm font-semibold"
                >
                  Finish
                </button>
              </div>
            ) : (
              <span className="shrink-0 w-[72px]" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-app-secondary">
            <span className="tabular-nums px-2 py-1 rounded-full bg-zinc-900/60 border border-teal-950/40">
              {formatElapsed(elapsedSec)}
            </span>
            <span className="px-2 py-1 rounded-full bg-zinc-900/60 border border-teal-950/40">
              <span className="text-app-meta mr-1">Exercises</span>
              <span className="tabular-nums text-white">{exercises.length}</span>
            </span>
            <span className="px-2 py-1 rounded-full bg-zinc-900/60 border border-teal-950/40">
              <span className="text-app-meta mr-1">Sets</span>
              <span className="tabular-nums text-white">{totalSetsLogged}</span>
            </span>
          </div>
        </header>

        {exercises.length === 0 ? (
          <div className="min-h-[min(62vh,460px)] flex items-center justify-center px-2 lg:items-start lg:pt-10">
            <div className="w-full max-w-md rounded-3xl border border-teal-950/40 bg-gradient-to-br from-zinc-900/95 to-teal-950/25 shadow-md shadow-black/35 p-6 sm:p-7">
              <div className="mb-5">
                <p className="text-xl font-semibold tracking-tight text-white">
                  Start your workout
                </p>
                <p className="text-sm text-app-secondary mt-1">
                  Add your first exercise to begin logging sets.
                </p>
              </div>

              <div className="space-y-3">
                <ExercisePicker
                  value={exerciseName}
                  onValueChange={setExerciseName}
                  onSelect={(exercise) => addExercise(exercise)}
                  inputRef={addExerciseInputRef}
                  placeholder="Exercise name"
                  inputClassName="input-app w-full p-3 text-base shadow-sm shadow-black/10"
                  dropdownClassName="rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                  customOptionLabel="Add custom exercise"
                  noMatchText="No matches. Use custom exercise."
                />
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="w-full py-4 rounded-2xl btn-primary text-base"
                >
                  + Add Exercise
                </button>
                <button
                  type="button"
                  onClick={() => addExercise(undefined, true)}
                  className="w-full py-3 rounded-2xl border border-teal-900/40 bg-zinc-900/70 text-sm text-app-secondary hover:text-white hover:border-teal-500/30 transition"
                >
                  + Add custom exercise
                </button>
                <p className="text-xs text-app-meta text-center pt-1">
                  Tip: press Enter to add quickly.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="space-y-3 sm:space-y-4">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="p-4 rounded-2xl border border-teal-950/40 bg-gradient-to-b from-zinc-900/95 to-teal-950/20 shadow-sm shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold tracking-tight truncate">{exercise.name}</h3>
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5">
                        <p className="text-xs text-app-secondary">
                          {lastPerformance[exercise.name]
                            ? `Last: ${lastPerformance[exercise.name]!.weight}${unit} × ${lastPerformance[exercise.name]!.reps}`
                            : "No previous data"}
                        </p>
                        {nextTarget[exercise.name] && (
                          <p className="text-xs text-app-meta">
                            Target: {(nextTarget[exercise.name] ?? "").replace(/\bkg\b/g, unit)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => deleteExercise(exercise.id)}
                        className="text-xs px-3 py-1.5 rounded-full border border-red-500/70 text-red-300 hover:bg-red-900/30 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-teal-900/30">
                    {(() => {
                      const lastSets = getLastSetsForExercise({
                        exerciseId: exercise.exerciseId,
                        name: exercise.name,
                      });
                      const hasTargetSets =
                        exercise.targetSets != null && exercise.targetSets > 0;
                      const planned = hasTargetSets ? exercise.targetSets! : 0;
                      const slots = Array.from(
                        { length: Math.max(planned, exercise.sets.length, 0) },
                        (_, i) => i
                      );
                      const nextIdx = exercise.sets.findIndex((s) => !s?.done);
                      const effectiveNextIdx = nextIdx === -1 ? exercise.sets.length : nextIdx;
                      return (
                        <div>
                          <ul className="space-y-2 text-sm text-app-secondary">
                          {slots.map((index) => {
                            const set = exercise.sets[index];
                            const lastSet = lastSets[index];
                            const hasLast = lastSet && (lastSet.weight || lastSet.reps);
                            const isEditable =
                              index < exercise.sets.length || (set != null && (planned > 0 || exercise.sets.length > 0));
                            const isDone = Boolean(set?.done);
                            const isNext = isEditable && !isDone && index === effectiveNextIdx;
                            const placeholder = hasLast
                              ? `${lastSet!.weight}${unit} × ${lastSet!.reps}`
                              : "";
                            return (
                              <li key={index}>
                                {(() => {
                                  const timer = restByExercise[exercise.id] ?? { remainingSec: 0, running: false };
                                  const isActive = timer.running && timer.remainingSec > 0;
                                  return (
                                    <>
                                      {isNext && isActive && (
                                        <div className="mb-1 text-xs text-app-meta">
                                          <span>Rest </span>
                                          <span className="tabular-nums text-[color:var(--color-accent)]">
                                            {formatRest(timer.remainingSec)}
                                          </span>
                                        </div>
                                      )}
                                      <div
                                        className={`grid grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)_3.25rem_66px] sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_3.5rem_72px] gap-2 items-center rounded-xl ${
                                          isNext ? "ring-1 ring-[color:var(--color-accent)]/40 bg-zinc-950/20" : ""
                                        } ${isDone ? "opacity-60" : ""} ${isEditable ? "cursor-text" : ""}`}
                                        role={isEditable ? "button" : undefined}
                                        tabIndex={isEditable ? 0 : undefined}
                                        onClick={
                                          isEditable
                                            ? (e) => {
                                                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
                                                setInputRefs.current[`${exercise.id}-${index}-weight`]?.focus();
                                              }
                                            : undefined
                                        }
                                        onKeyDown={
                                          isEditable
                                            ? (e) => {
                                                if (e.target instanceof HTMLInputElement) return;
                                                if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  setInputRefs.current[`${exercise.id}-${index}-weight`]?.focus();
                                                }
                                              }
                                            : undefined
                                        }
                                      >
                                        <div className="flex items-center gap-2">
                                          {isEditable ? (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSetDone(exercise.id, index);
                                              }}
                                              className={`h-8 w-8 rounded-full border flex items-center justify-center transition ${
                                                isDone
                                                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]"
                                                  : "border-teal-900/40 text-app-secondary hover:bg-teal-950/30"
                                              }`}
                                              aria-label={`Mark set ${index + 1} complete`}
                                            >
                                              ✓
                                            </button>
                                          ) : (
                                            <span className="h-8 w-8" />
                                          )}
                                          <span className="text-xs text-app-secondary tabular-nums">
                                            {index + 1}
                                          </span>
                                        </div>
                                  <input
                                    ref={(el) => {
                                      setInputRefs.current[`${exercise.id}-${index}-weight`] = el;
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    enterKeyHint="next"
                                    autoComplete="off"
                                    placeholder={
                                      hasLast && lastSet!.weight !== undefined && String(lastSet!.weight).trim() !== ""
                                        ? String(lastSet!.weight)
                                        : isEditable
                                          ? unit
                                          : placeholder
                                            ? `last: ${placeholder}`
                                            : unit
                                    }
                                    value={set?.weight ?? ""}
                                    onChange={(e) =>
                                      updateSetValue(exercise.id, index, "weight", e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter") return;
                                      e.preventDefault();
                                      const rirKey = `${exercise.id}-${index}-rir`;
                                      setInputRefs.current[rirKey]?.focus();
                                      setInputRefs.current[rirKey]?.select?.();
                                    }}
                                    disabled={!isEditable}
                                    aria-label={`Set ${index + 1} weight (${unit})`}
                                    className="input-app w-full h-11 px-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed tabular-nums"
                                  />
                                  <input
                                    ref={(el) => {
                                      setInputRefs.current[`${exercise.id}-${index}-reps`] = el;
                                    }}
                                    type="number"
                                    inputMode="numeric"
                                    enterKeyHint={index === exercise.sets.length - 1 ? "done" : "next"}
                                    autoComplete="off"
                                    placeholder={
                                      hasLast && lastSet!.reps !== undefined && String(lastSet!.reps).trim() !== ""
                                        ? String(lastSet!.reps)
                                        : "reps"
                                    }
                                    value={set?.reps ?? ""}
                                    onChange={(e) =>
                                      updateSetValue(exercise.id, index, "reps", e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter") return;
                                      e.preventDefault();
                                      const rirKey = `${exercise.id}-${index}-rir`;
                                      setInputRefs.current[rirKey]?.focus();
                                      setInputRefs.current[rirKey]?.select?.();
                                    }}
                                    disabled={!isEditable}
                                    aria-label={`Set ${index + 1} reps`}
                                    className="input-app w-full h-11 px-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed tabular-nums"
                                  />
                                  <input
                                    ref={(el) => {
                                      setInputRefs.current[`${exercise.id}-${index}-rir`] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    max={5}
                                    step={1}
                                    enterKeyHint={index === exercise.sets.length - 1 ? "done" : "next"}
                                    autoComplete="off"
                                    placeholder="RIR"
                                    value={set?.rir === undefined ? "" : set.rir}
                                    onChange={(e) => updateSetRir(exercise.id, index, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter") return;
                                      e.preventDefault();
                                      if (index === exercise.sets.length - 1) {
                                        addSetRow(exercise.id);
                                        return;
                                      }
                                      const nextWeightKey = `${exercise.id}-${index + 1}-weight`;
                                      setInputRefs.current[nextWeightKey]?.focus();
                                      setInputRefs.current[nextWeightKey]?.select?.();
                                    }}
                                    disabled={!isEditable}
                                    aria-label={`Set ${index + 1} RIR (reps in reserve)`}
                                    className="input-app w-full h-11 px-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed tabular-nums"
                                  />
                                  <div className="flex justify-end">
                                    {isEditable ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteSet(exercise.id, index);
                                        }}
                                        className="h-11 px-2 rounded-xl border border-teal-900/20 text-[11px] text-app-meta hover:bg-teal-950/20 transition"
                                      >
                                        Delete
                                      </button>
                                    ) : (
                                      <span className="text-[11px] text-app-meta text-right">
                                        {hasLast ? " " : " "}
                                      </span>
                                    )}
                                  </div>
                                      </div>
                                    </>
                                  );
                                })()}
                                {hasLast && (
                                  <p className="mt-1 text-[11px] text-app-meta">
                                    Last session set {index + 1}: {lastSet!.weight}{unit} × {lastSet!.reps}
                                  </p>
                                )}
                                {index < exercise.sets.length && (
                                  (() => {
                                    const noteKey = `${exercise.id}-${index}`;
                                    const isExpanded = expandedNoteKey === noteKey;
                                    const note = (set?.notes ?? "").trim();
                                    const hasNote = note.length > 0;
                                    const lastNote = (lastSet?.notes ?? "").trim();
                                    const hasLastNote = lastNote.length > 0;
                                    const notePlaceholder =
                                      !hasNote && hasLastNote
                                        ? lastNote.length > 80
                                          ? `${lastNote.slice(0, 80)}…`
                                          : lastNote
                                        : "Add a note for this set…";
                                    return (
                                      <div className="mt-2">
                                        {!isExpanded ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedNoteKey(noteKey);
                                              }}
                                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                                                hasNote
                                                  ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/12 text-teal-200/95 hover:bg-[color:var(--color-accent)]/18"
                                                  : "border-teal-500/40 text-teal-100 hover:bg-teal-950/40"
                                              }`}
                                              aria-label={hasNote ? "Edit note for this set" : "Add note for this set"}
                                            >
                                              <svg
                                                className="h-3.5 w-3.5 shrink-0 opacity-90"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                aria-hidden
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                />
                                              </svg>
                                              {hasNote ? "Edit note" : "+ Note"}
                                            </button>
                                            {hasLastNote && (
                                              <p className="mt-1 text-[11px] text-app-meta leading-snug">
                                                Last session set {index + 1} note: {lastNote}
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <div
                                            className="rounded-lg border border-teal-900/40 bg-zinc-900/95 p-2.5 shadow-sm"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="text"
                                              placeholder={notePlaceholder}
                                              value={set?.notes ?? ""}
                                              onChange={(e) =>
                                                updateSetNotes(exercise.id, index, e.target.value)
                                              }
                                              className="input-app w-full px-2.5 py-2 text-sm"
                                              autoFocus
                                            />
                                            <div className="mt-2 flex justify-end gap-2">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedNoteKey(null)}
                                                className="btn-secondary !py-1.5 !px-3 text-xs"
                                              >
                                                Done
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()
                                )}
                              </li>
                            );
                          })}
                          </ul>

                          {(() => {
                            const rest = exercise.restSec ?? 90;
                            const timer = restByExercise[exercise.id] ?? { remainingSec: 0, running: false };
                            const isActive = timer.running && timer.remainingSec > 0;
                            return (
                              <div className="mt-3 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-app-meta">Rest</span>
                                    <span
                                      className={`tabular-nums px-2 py-1 rounded-full border ${
                                        isActive
                                          ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-zinc-100"
                                          : "border-teal-900/40 bg-teal-950/20 text-app-secondary"
                                      }`}
                                    >
                                      {formatRest(isActive ? timer.remainingSec : rest)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isActive ? (
                                      <button
                                        type="button"
                                        onClick={() => resetExerciseRest(exercise.id)}
                                        className="text-xs px-2.5 py-1.5 rounded-full border border-teal-900/40 text-app-secondary hover:bg-teal-950/30 hover:text-white transition"
                                      >
                                        Reset
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => startExerciseRest(exercise.id, rest)}
                                        className="text-xs px-2.5 py-1.5 rounded-full border border-teal-900/40 text-app-secondary hover:bg-teal-950/30 hover:text-white transition"
                                      >
                                        Start
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-xl border border-teal-900/30 bg-zinc-900/60 px-3 py-2">
                                  <div className="flex items-center justify-between text-[11px] text-app-meta mb-1">
                                    <span>Rest duration</span>
                                    <span className="tabular-nums">{rest}s</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={0}
                                    max={300}
                                    step={15}
                                    value={rest}
                                    onChange={(e) =>
                                      setExerciseRest(
                                        exercise.id,
                                        Math.max(0, Math.min(300, Number(e.target.value) || 0))
                                      )
                                    }
                                    className="w-full accent-teal-400"
                                    aria-label={`Rest duration for ${exercise.name}`}
                                  />
                                </div>

                                <button
                                  onClick={() => addSetRow(exercise.id)}
                                  className="w-full py-3 rounded-xl btn-primary"
                                >
                                  Add Set
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </section>

            <section className="mt-8 mb-4 p-4 rounded-2xl border border-teal-950/40 bg-gradient-to-b from-zinc-900/95 to-teal-950/20 shadow-sm shadow-black/20">
              <label className="label-section block mb-2">Add another exercise</label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <ExercisePicker
                    value={exerciseName}
                    onValueChange={setExerciseName}
                    onSelect={(exercise) => addExercise(exercise)}
                    inputRef={addExerciseInputRef}
                    placeholder="Exercise name"
                    inputClassName="input-app flex-1 min-w-0 p-3 text-base"
                    dropdownClassName="mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                    customOptionLabel="Add custom exercise"
                    noMatchText="No matches. Use custom exercise."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="shrink-0 px-4 py-3 rounded-xl btn-primary"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => addExercise(undefined, true)}
                  className="shrink-0 px-4 py-3 rounded-xl border border-teal-900/40 bg-zinc-900/70 text-sm text-app-secondary hover:text-white hover:border-teal-500/30 transition"
                >
                  Custom
                </button>
              </div>
            </section>
          </>
        )}

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
        </>
        )}
      </div>

    </main>
  )
}