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

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";
const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string; notes?: string }[] }[];
};

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

function getLastPerformanceForExercise(exerciseName: string): { weight: string; reps: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return null;
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return null;
    const normalized = exerciseName.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const exercise = workout.exercises?.find(
        (ex) => ex.name?.trim().toLowerCase() === normalized
      );
      if (exercise?.sets?.length) {
        const lastSet = exercise.sets[exercise.sets.length - 1];
        if (lastSet?.weight != null && lastSet?.reps != null)
          return { weight: String(lastSet.weight), reps: String(lastSet.reps) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getLastSetsForExercise(exerciseName: string): {
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
    const normalized = exerciseName.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const exercise = workout.exercises?.find(
        (ex) => ex.name?.trim().toLowerCase() === normalized
      );
      if (exercise?.sets?.length) {
        return exercise.sets.map((s) => ({
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
      name: string;
      sets: { weight: string; reps: string; done?: boolean; notes?: string }[];
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
    startTime,
  });
  latestWorkoutRef.current = { exercises, workoutName, templateName, startTime };

  useEffect(() => {
    if (startTime === null) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startTime]);

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
        name,
        exercises: exercises.map((ex) => ({
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

  useEffect(() => {
    if (exercises.length === 0) {
      setLastPerformance({});
      setNextTarget({});
      return;
    }
    const lastMap: Record<string, { weight: string; reps: string } | null> = {};
    const targetMap: Record<string, string | null> = {};
    for (const ex of exercises) {
      lastMap[ex.name] = getLastPerformanceForExercise(ex.name);
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

    const fromTemplate = sessionStorage.getItem(TEMPLATE_FOR_WORKOUT_KEY);
    if (fromTemplate) {
      try {
        const data = JSON.parse(fromTemplate) as { exercises: unknown[]; templateName?: string };
        const exercisesData = data?.exercises;
        const tName = typeof data?.templateName === "string" ? data.templateName.trim() : "";
        sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
        if (Array.isArray(exercisesData) && exercisesData.length > 0) {
          if (tName) {
            setTemplateName(tName);
            setWorkoutName((prev) => (prev.trim() ? prev : tName));
          }
          const now = Date.now();
          setStartTime(now);
          const initial = exercisesData.map((ex, i) => {
            const name = typeof ex === "string" ? ex : (ex as { name?: string })?.name ?? "Exercise";
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
              () => ({ weight: "", reps: "", done: false, notes: "" } as { weight: string; reps: string; done?: boolean; notes?: string })
            );
            return {
              id: now + i,
              name,
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
        name: ex.name,
        sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, done: s.done, notes: s.notes })),
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
      exercises: exercises.map(({ name, sets, restSec }) => ({
        name,
        sets: sets.map(({ weight, reps, notes }) => {
          const out: { weight: string; reps: string; notes?: string } = { weight, reps };
          if (notes?.trim()) out.notes = notes.trim();
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
    setRestByExercise({});
    setShowSummary(false);
    setShowDiscardConfirm(false);
    router.push("/");
  }

  function addExercise(nameOverride?: string) {
    const trimmed = (nameOverride ?? exerciseName).trim();
    if (!trimmed) {
      addExerciseInputRef.current?.focus();
      return;
    }

    const newExercise = {
      id: Date.now(),
      name: trimmed,
      sets: [],
      restSec: 90,
    };

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
        startExerciseRest(exerciseId, ex.restSec ?? 90);
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
        <header className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/"
              className="shrink-0 flex items-center justify-center h-10 w-10 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800/60 hover:text-white transition"
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
              className="flex-1 min-w-0 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 focus-accent placeholder-zinc-500 text-base font-medium truncate"
            />
            {exercises.length > 0 ? (
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:bg-zinc-800/60 transition"
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
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span className="tabular-nums px-2 py-1 rounded-full bg-zinc-900/60 border border-zinc-800">
              {formatElapsed(elapsedSec)}
            </span>
            <span className="px-2 py-1 rounded-full bg-zinc-900/60 border border-zinc-800">
              <span className="text-zinc-500 mr-1">Exercises</span>
              <span className="tabular-nums text-zinc-300">{exercises.length}</span>
            </span>
            <span className="px-2 py-1 rounded-full bg-zinc-900/60 border border-zinc-800">
              <span className="text-zinc-500 mr-1">Sets</span>
              <span className="tabular-nums text-zinc-300">{totalSetsLogged}</span>
            </span>
          </div>
        </header>

        {exercises.length === 0 ? (
          <div className="min-h-[min(62vh,460px)] flex items-center justify-center px-2 lg:items-start lg:pt-10">
            <div className="w-full max-w-md rounded-3xl bg-zinc-900/60 border border-zinc-800 shadow-md shadow-black/35 p-6 sm:p-7">
              <div className="mb-5">
                <p className="text-xl font-semibold tracking-tight text-white">
                  Start your workout
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  Add your first exercise to begin logging sets.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  ref={addExerciseInputRef}
                  placeholder="Exercise name"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    addExercise((e.target as HTMLInputElement).value);
                  }}
                  className="w-full p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 focus-accent text-base shadow-sm shadow-black/10"
                />
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="w-full py-4 rounded-2xl btn-primary text-base"
                >
                  + Add Exercise
                </button>
                <p className="text-xs text-zinc-500 text-center pt-1">
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
                  className="p-4 rounded-2xl border bg-zinc-900/60 border-zinc-800 shadow-sm shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold tracking-tight truncate">{exercise.name}</h3>
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5">
                        <p className="text-xs text-zinc-400">
                          {lastPerformance[exercise.name]
                            ? `Last: ${lastPerformance[exercise.name]!.weight}${unit} × ${lastPerformance[exercise.name]!.reps}`
                            : "No previous data"}
                        </p>
                        {nextTarget[exercise.name] && (
                          <p className="text-xs text-zinc-500">
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

                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    {(() => {
                      const lastSets = getLastSetsForExercise(exercise.name);
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
                          <ul className="space-y-2 text-sm text-zinc-100">
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
                                        <div className="mb-1 text-xs text-zinc-300">
                                          <span className="text-zinc-500">Rest </span>
                                          <span className="tabular-nums text-[color:var(--color-accent)]">
                                            {formatRest(timer.remainingSec)}
                                          </span>
                                        </div>
                                      )}
                                      <div
                                        className={`grid grid-cols-[58px_1fr_1fr_66px] sm:grid-cols-[64px_1fr_1fr_72px] gap-2 items-center rounded-xl ${
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
                                                  : "border-zinc-800 text-zinc-300 hover:bg-zinc-800/40"
                                              }`}
                                              aria-label={`Mark set ${index + 1} complete`}
                                            >
                                              ✓
                                            </button>
                                          ) : (
                                            <span className="h-8 w-8" />
                                          )}
                                          <span className="text-xs text-zinc-400 tabular-nums">
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
                                      const repsKey = `${exercise.id}-${index}-reps`;
                                      setInputRefs.current[repsKey]?.focus();
                                      setInputRefs.current[repsKey]?.select?.();
                                    }}
                                    disabled={!isEditable}
                                    aria-label={`Set ${index + 1} weight (${unit})`}
                                    className="w-full h-11 px-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-sm focus-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder-zinc-600 tabular-nums"
                                  />
                                  <input
                                    ref={(el) => {
                                      setInputRefs.current[`${exercise.id}-${index}-reps`] = el;
                                    }}
                                    type="text"
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
                                      // If this is the last editable row, add another set for fast logging.
                                      if (index === exercise.sets.length - 1) {
                                        addSetRow(exercise.id);
                                        return;
                                      }
                                      const nextWeightKey = `${exercise.id}-${index + 1}-weight`;
                                      setInputRefs.current[nextWeightKey]?.focus();
                                      setInputRefs.current[nextWeightKey]?.select?.();
                                    }}
                                    disabled={!isEditable}
                                    aria-label={`Set ${index + 1} reps`}
                                    className="w-full h-11 px-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-sm focus-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder-zinc-600 tabular-nums"
                                  />
                                  <div className="flex justify-end">
                                    {isEditable ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteSet(exercise.id, index);
                                        }}
                                        className="h-11 px-3 rounded-xl border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-800/60 transition"
                                      >
                                        Delete
                                      </button>
                                    ) : (
                                      <span className="text-[11px] text-zinc-500 text-right">
                                        {hasLast ? " " : " "}
                                      </span>
                                    )}
                                  </div>
                                      </div>
                                    </>
                                  );
                                })()}
                                {hasLast && (
                                  <p className="mt-1 text-[11px] text-zinc-500/90">
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
                                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                                                hasNote
                                                  ? "border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/12 text-teal-200/95 hover:bg-[color:var(--color-accent)]/18"
                                                  : "border-zinc-600 text-zinc-300 hover:bg-zinc-800/80 hover:border-zinc-500"
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
                                              <p className="mt-1 text-[11px] text-zinc-500/90 leading-snug">
                                                Last session set {index + 1} note: {lastNote}
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <div
                                            className="rounded-lg border border-zinc-700/90 bg-zinc-900/90 p-2.5 shadow-sm"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="text"
                                              placeholder={notePlaceholder}
                                              value={set?.notes ?? ""}
                                              onChange={(e) =>
                                                updateSetNotes(exercise.id, index, e.target.value)
                                              }
                                              className="w-full px-2.5 py-2 rounded-md bg-zinc-950/80 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus-accent"
                                              autoFocus
                                            />
                                            <div className="mt-2 flex justify-end gap-2">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedNoteKey(null)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition"
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
                                    <span className="text-xs text-zinc-500">Rest</span>
                                    <span
                                      className={`tabular-nums px-2 py-1 rounded-full border ${
                                        isActive
                                          ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-zinc-100"
                                          : "border-zinc-800 bg-zinc-950/60 text-zinc-300"
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
                                        className="text-xs px-2.5 py-1.5 rounded-full border border-zinc-800 text-zinc-200 hover:bg-zinc-800/60 transition"
                                      >
                                        Reset
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => startExerciseRest(exercise.id, rest)}
                                        className="text-xs px-2.5 py-1.5 rounded-full border border-zinc-800 text-zinc-200 hover:bg-zinc-800/60 transition"
                                      >
                                        Start
                                      </button>
                                    )}

                                    <details className="relative">
                                      <summary className="list-none cursor-pointer select-none text-xs px-2.5 py-1.5 rounded-full border border-zinc-800 text-zinc-200 hover:bg-zinc-800/60 transition">
                                        Rest options
                                      </summary>
                                      <div className="absolute right-0 mt-2 w-56 rounded-xl bg-zinc-950 border border-zinc-800 shadow-xl p-2 z-10">
                                        <div className="flex flex-wrap gap-2 p-2">
                                          <button
                                            type="button"
                                            onClick={() => adjustExerciseRest(exercise.id, -15)}
                                            className="text-xs px-2 py-1.5 rounded-full border border-zinc-800 text-zinc-200 hover:bg-zinc-900 transition"
                                          >
                                            −15s
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => adjustExerciseRest(exercise.id, 15)}
                                            className="text-xs px-2 py-1.5 rounded-full border border-zinc-800 text-zinc-200 hover:bg-zinc-900 transition"
                                          >
                                            +15s
                                          </button>
                                          {[60, 90, 120, 180].map((s) => (
                                            <button
                                              key={s}
                                              type="button"
                                              onClick={() => {
                                                setExerciseRest(exercise.id, s);
                                                startExerciseRest(exercise.id, s);
                                              }}
                                              className="text-xs px-2 py-1.5 rounded-full border border-zinc-800 text-zinc-200 hover:bg-zinc-900 transition"
                                            >
                                              {s / 60}m
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </details>
                                  </div>
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

            <section className="mt-8 mb-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-sm shadow-black/20">
              <label className="block text-xs text-zinc-500 mb-2">Add another exercise</label>
              <div className="flex gap-2">
                <input
                  ref={addExerciseInputRef}
                  placeholder="Exercise name"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    addExercise((e.target as HTMLInputElement).value);
                  }}
                  className="flex-1 min-w-0 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 focus-accent text-base"
                />
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="shrink-0 px-4 py-3 rounded-xl btn-primary"
                >
                  Add
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
                className="w-full max-w-sm p-6 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="discard-title" className="text-lg font-semibold text-zinc-100 mb-2">
                  Discard workout?
                </h2>
                <p className="text-sm text-zinc-400 mb-6">
                  Progress will be lost. This cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="px-4 py-2.5 rounded-xl text-sm border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition"
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
                className="w-full max-w-md p-6 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">Workout Summary</h2>
                <p className="text-zinc-200 font-medium mb-2">{getWorkoutDisplayName()}</p>
                <p className="text-zinc-300 mb-4">
                  {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} ·{" "}
                  {exercises.reduce((total, ex) => total + ex.sets.length, 0)} total sets
                </p>
                <ul className="space-y-2 text-sm text-zinc-200 mb-6">
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
                    className="w-full py-3 rounded-xl font-semibold border border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:bg-zinc-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {routineSaved ? "Routine Saved" : "Save as Routine"}
                  </button>
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

    </main>
  )
}