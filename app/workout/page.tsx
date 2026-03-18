"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
} from "@/lib/trainingAnalysis";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";
const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
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

function getLastSetsForExercise(exerciseName: string): { weight: string; reps: string }[] {
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
  const [exerciseName, setExerciseName] = useState("");
  const [exercises, setExercises] = useState<
    {
      id: number;
      name: string;
      sets: { weight: string; reps: string }[];
      targetSets?: number;
    }[]
  >([]);
  const [showSummary, setShowSummary] = useState(false);
  const [lastPerformance, setLastPerformance] = useState<
    Record<string, { weight: string; reps: string } | null>
  >({});
  const [nextTarget, setNextTarget] = useState<Record<string, string | null>>({});
  const [workoutName, setWorkoutName] = useState("");
  const [routineSaved, setRoutineSaved] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const totalSetsLogged = exercises.reduce((total, ex) => total + ex.sets.length, 0);

  function formatElapsed(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function saveAsRoutineFromSession() {
    if (typeof window === "undefined") return;
    try {
      const STORAGE_KEY = "workoutTemplates";
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const templates = Array.isArray(existing) ? existing : [];

      const name =
        workoutName.trim() ||
        `Routine ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

      const routine = {
        name,
        exercises: exercises.map((ex) => ({
          name: ex.name,
          targetSets: Math.max(
            1,
            Math.min(20, (ex.targetSets ?? (ex.sets.length || 3)))
          ),
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
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(TEMPLATE_FOR_WORKOUT_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { exercises: unknown[] };
      const exercisesData = data?.exercises;
      sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
      if (!Array.isArray(exercisesData) || exercisesData.length === 0) return;
      const now = Date.now();
      const initial = exercisesData.map((ex, i) => {
        const name = typeof ex === "string" ? ex : (ex as { name?: string })?.name ?? "Exercise";
        const targetSets = typeof ex === "object" && ex !== null && "targetSets" in ex
          ? Math.max(1, Math.min(20, Number((ex as { targetSets?: number }).targetSets) || 3))
          : undefined;
        return {
          id: now + i,
          name,
          sets: [] as { weight: string; reps: string }[],
          targetSets,
        };
      });
      setExercises(initial);
    } catch {
      sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
    }
  }, []);

  function finishWorkout() {
    if (exercises.length === 0) return;
    setRoutineSaved(false);
    const totalSets = exercises.reduce((total, ex) => total + ex.sets.length, 0);
    const completed = {
      completedAt: new Date().toISOString(),
      name: workoutName.trim() || undefined,
      exercises: exercises.map(({ name, sets }) => ({ name, sets })),
      totalExercises: exercises.length,
      totalSets,
    };
    addWorkout(completed);
    setShowSummary(true);
  }

  function addExercise(nameOverride?: string) {
    const trimmed = (nameOverride ?? exerciseName).trim();
    if (!trimmed) return;

    const newExercise = {
      id: Date.now(),
      name: trimmed,
      sets: [],
    };

    setExercises((prev) => [...prev, newExercise]);
    setExerciseName("");
  }

  function addSetRow(exerciseId: number) {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [...exercise.sets, { weight: "", reps: "" }],
            }
          : exercise
      )
    );
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
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "" });
        sets[setIndex] = { ...sets[setIndex], [field]: value };
        return { ...exercise, sets };
      })
    );
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
    <main
      className={`min-h-screen bg-zinc-950 text-white ${
        exercises.length > 0 ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]" : "pb-6"
      }`}
    >
      <div className="max-w-3xl mx-auto px-4 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-5">
          <div className="mb-3">
            <label className="block text-xs text-zinc-500 mb-1">Workout name</label>
            <input
              type="text"
              placeholder="Push Day"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-600 placeholder-zinc-500 text-base"
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400 mb-3">
            <span className="tabular-nums">
              <span className="text-zinc-500">Time </span>
              {formatElapsed(elapsedSec)}
            </span>
            <span>
              <span className="text-zinc-500">Exercises </span>
              {exercises.length}
            </span>
            <span>
              <span className="text-zinc-500">Sets </span>
              {totalSetsLogged}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">Workout</h1>
        </header>

        {exercises.length === 0 ? (
          <div className="min-h-[min(60vh,420px)] flex flex-col items-center justify-center px-4 text-center">
            <p className="text-lg text-zinc-300 font-medium mb-6">Start your workout</p>
            <input
              placeholder="Exercise name"
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                addExercise((e.target as HTMLInputElement).value);
              }}
              className="w-full max-w-sm mb-4 p-3 rounded-xl bg-zinc-900 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-center"
            />
            <button
              type="button"
              onClick={() => addExercise()}
              disabled={!exerciseName.trim()}
              className="w-full max-w-sm py-4 rounded-2xl bg-white text-black text-lg font-semibold hover:bg-zinc-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Exercise
            </button>
          </div>
        ) : (
          <>
            <section className="space-y-3 sm:space-y-4">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className={`p-4 rounded-2xl border ${
                    "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{exercise.name}</h3>
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5">
                        <p className="text-xs text-zinc-400">
                          {lastPerformance[exercise.name]
                            ? `Last: ${lastPerformance[exercise.name]!.weight}kg × ${lastPerformance[exercise.name]!.reps}`
                            : "No previous data"}
                        </p>
                        {nextTarget[exercise.name] && (
                          <p className="text-xs text-zinc-500">
                            Target: {nextTarget[exercise.name]}
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
                      return (
                        <div>
                          <div className="grid grid-cols-[64px_1fr_1fr_72px] gap-2 text-xs text-zinc-500 mb-2">
                            <span>Set</span>
                            <span>Weight</span>
                            <span>Reps</span>
                            <span className="text-right"> </span>
                          </div>
                          <ul className="space-y-2 text-sm text-zinc-100">
                          {slots.map((index) => {
                            const set = exercise.sets[index];
                            const lastSet = lastSets[index];
                            const hasLast = lastSet && (lastSet.weight || lastSet.reps);
                            const isEditable = index < exercise.sets.length;
                            const placeholder = hasLast
                              ? `${lastSet!.weight}kg × ${lastSet!.reps}`
                              : "";
                            return (
                              <li key={index}>
                                <div className="grid grid-cols-[64px_1fr_1fr_72px] gap-2 items-center">
                                  <span className="text-xs text-zinc-400">
                                    Set {index + 1}
                                  </span>
                                  <input
                                    inputMode="decimal"
                                    placeholder={isEditable ? "kg" : placeholder ? `last: ${placeholder}` : "kg"}
                                    value={set?.weight ?? ""}
                                    onChange={(e) =>
                                      updateSetValue(exercise.id, index, "weight", e.target.value)
                                    }
                                    disabled={!isEditable}
                                    className="w-full p-2 rounded-lg bg-zinc-950/50 border border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed placeholder-zinc-600"
                                  />
                                  <input
                                    inputMode="numeric"
                                    placeholder={isEditable ? "reps" : (hasLast ? "reps" : "reps")}
                                    value={set?.reps ?? ""}
                                    onChange={(e) =>
                                      updateSetValue(exercise.id, index, "reps", e.target.value)
                                    }
                                    disabled={!isEditable}
                                    className="w-full p-2 rounded-lg bg-zinc-950/50 border border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed placeholder-zinc-600"
                                  />
                                  <div className="flex justify-end">
                                    {isEditable ? (
                                      <button
                                        onClick={() => deleteSet(exercise.id, index)}
                                        className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
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
                                {!isEditable && hasLast && (
                                  <p className="mt-1 text-[11px] text-zinc-500">
                                    Last: {lastSet!.weight}kg × {lastSet!.reps}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                          </ul>

                          <button
                            onClick={() => addSetRow(exercise.id)}
                            className="w-full mt-3 py-2.5 rounded-xl bg-white text-black font-semibold hover:bg-zinc-100 transition"
                          >
                            Add Set
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </section>

            <section className="mt-8 mb-4 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
              <label className="block text-xs text-zinc-500 mb-2">Add another exercise</label>
              <div className="flex gap-2">
                <input
                  placeholder="Exercise name"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    addExercise((e.target as HTMLInputElement).value);
                  }}
                  className="flex-1 min-w-0 p-3 rounded-xl bg-zinc-950 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-base"
                />
                <button
                  type="button"
                  onClick={() => addExercise()}
                  disabled={!exerciseName.trim()}
                  className="shrink-0 px-4 py-3 rounded-xl bg-zinc-200 text-black font-semibold hover:bg-zinc-100 transition disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </section>
          </>
        )}

        <div className="mt-4">
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
                {workoutName.trim() && (
                  <p className="text-zinc-200 font-medium mb-2">{workoutName.trim()}</p>
                )}
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
                    className="w-full py-3 rounded-xl font-semibold border border-zinc-600 text-zinc-100 hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {routineSaved ? "Routine Saved" : "Save as Routine"}
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-100 transition"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {exercises.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto">
            <button
              type="button"
              onClick={finishWorkout}
              className="w-full bg-white text-black py-3.5 rounded-xl font-semibold text-base hover:bg-zinc-100 transition"
            >
              Finish Workout
            </button>
          </div>
        </div>
      )}
    </main>
  )
}