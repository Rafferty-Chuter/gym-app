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
    }[]
  >([]);
  const [activeExerciseId, setActiveExerciseId] = useState<number | null>(null);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [editingSet, setEditingSet] = useState<{
    exerciseId: number;
    setIndex: number;
  } | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [lastPerformance, setLastPerformance] = useState<
    Record<string, { weight: string; reps: string } | null>
  >({});
  const [nextTarget, setNextTarget] = useState<Record<string, string | null>>({});

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
      const { exercises: exerciseNames } = JSON.parse(raw) as {
        exercises: string[];
      };
      sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
      if (!Array.isArray(exerciseNames) || exerciseNames.length === 0) return;
      const now = Date.now();
      const initial = exerciseNames.map((name, i) => ({
        id: now + i,
        name,
        sets: [] as { weight: string; reps: string }[],
      }));
      setExercises(initial);
      setActiveExerciseId(initial[0].id);
    } catch {
      sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
    }
  }, []);

  function finishWorkout() {
    if (exercises.length === 0) return;
    const totalSets = exercises.reduce((total, ex) => total + ex.sets.length, 0);
    const completed = {
      completedAt: new Date().toISOString(),
      exercises: exercises.map(({ name, sets }) => ({ name, sets })),
      totalExercises: exercises.length,
      totalSets,
    };
    addWorkout(completed);
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
        const history: StoredWorkout[] = raw ? JSON.parse(raw) : [];
        if (Array.isArray(history)) {
          history.push({
            completedAt: completed.completedAt,
            exercises: completed.exercises,
          });
          localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(history));
        }
      } catch {
        // ignore
      }
    }
    setShowSummary(true);
  }

  function addExercise() {
    const trimmed = exerciseName.trim();
    if (!trimmed) return;

    const newExercise = {
      id: Date.now(),
      name: trimmed,
      sets: [],
    };

    setExercises((prev) => [...prev, newExercise]);
    setActiveExerciseId(newExercise.id);
    setExerciseName("");
    setWeight("");
    setReps("");
  }

  function addSet() {
    if (activeExerciseId === null || !weight.trim() || !reps.trim()) return;

    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === activeExerciseId
          ? {
              ...exercise,
              sets: [...exercise.sets, { weight: weight.trim(), reps: reps.trim() }],
            }
          : exercise
      )
    );

    setWeight("");
    setReps("");
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
    if (editingSet?.exerciseId === exerciseId) setEditingSet(null);
  }

  function deleteExercise(exerciseId: number) {
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
    setActiveExerciseId((current) =>
      current === exerciseId ? null : current
    );
    if (editingSet?.exerciseId === exerciseId) setEditingSet(null);
  }

  function startEditingSet(exerciseId: number, setIndex: number) {
    const exercise = exercises.find((ex) => ex.id === exerciseId);
    const set = exercise?.sets[setIndex];
    if (!set) return;
    setEditingSet({ exerciseId, setIndex });
    setEditWeight(set.weight);
    setEditReps(set.reps);
  }

  function saveSetEdit() {
    if (editingSet === null || !editWeight.trim() || !editReps.trim()) return;
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === editingSet.exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set, index) =>
                index === editingSet.setIndex
                  ? { weight: editWeight.trim(), reps: editReps.trim() }
                  : set
              ),
            }
          : exercise
      )
    );
    setEditingSet(null);
    setEditWeight("");
    setEditReps("");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Start Workout</h1>

        <div className="space-y-4 mb-8">
          <input
            placeholder="Exercise name"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />

          <button
            onClick={addExercise}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-100 transition"
          >
            Add Exercise
          </button>

          <div className="h-px bg-zinc-800" />

          <input
            placeholder="Weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />

          <input
            placeholder="Reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />

          <button
            onClick={addSet}
            className="w-full bg-zinc-200 text-black py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-100 transition"
            disabled={activeExerciseId === null}
          >
            Add Set
          </button>
          {activeExerciseId === null && (
            <p className="text-sm text-zinc-400">
              Add an exercise first, then log sets for it.
            </p>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Logged Exercises</h2>

          {exercises.length === 0 ? (
            <p className="text-zinc-400 text-sm">
              No exercises logged yet. Start by adding one above.
            </p>
          ) : (
            <div className="space-y-4">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className={`p-4 rounded-xl border ${
                    exercise.id === activeExerciseId
                      ? "bg-zinc-800 border-zinc-400 ring-2 ring-zinc-400/50"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{exercise.name}</h3>
                      {exercise.id === activeExerciseId && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-500 text-white">
                          Logging here
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveExerciseId(exercise.id);
                          setWeight("");
                          setReps("");
                        }}
                        className={`text-xs px-2 py-1 rounded-full border ${
                          exercise.id === activeExerciseId
                            ? "border-zinc-400 bg-zinc-600 text-white"
                            : "border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                        }`}
                      >
                        Log sets
                      </button>
                      <button
                        onClick={() => deleteExercise(exercise.id)}
                        className="text-xs px-2 py-1 rounded-full border border-red-500/70 text-red-300 hover:bg-red-900/30"
                      >
                        Delete Exercise
                      </button>
                    </div>
                  </div>

                  <div className="mb-2 space-y-0.5">
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

                  {exercise.sets.length === 0 ? (
                    <p className="text-zinc-400 text-xs">
                      No sets logged yet for this exercise.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm text-zinc-100">
                      {exercise.sets.map((set, index) => {
                        const isEditing =
                          editingSet?.exerciseId === exercise.id &&
                          editingSet?.setIndex === index;
                        return (
                          <li
                            key={index}
                            className="flex items-center justify-between gap-2 flex-wrap"
                          >
                            {isEditing ? (
                              <>
                                <span className="text-zinc-400">
                                  Set {index + 1}
                                </span>
                                <input
                                  type="text"
                                  value={editWeight}
                                  onChange={(e) => setEditWeight(e.target.value)}
                                  placeholder="Weight"
                                  className="w-20 p-2 rounded bg-zinc-800 border border-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                />
                                <input
                                  type="text"
                                  value={editReps}
                                  onChange={(e) => setEditReps(e.target.value)}
                                  placeholder="Reps"
                                  className="w-16 p-2 rounded bg-zinc-800 border border-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                                />
                                <button
                                  onClick={saveSetEdit}
                                  className="text-xs px-2 py-1 rounded border border-zinc-500 bg-zinc-700 text-white hover:bg-zinc-600"
                                >
                                  Save
                                </button>
                              </>
                            ) : (
                              <>
                                <span>
                                  Set {index + 1} — {set.weight}kg × {set.reps}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() =>
                                      startEditingSet(exercise.id, index)
                                    }
                                    className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteSet(exercise.id, index)}
                                    className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <button
            onClick={finishWorkout}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={exercises.length === 0}
          >
            Finish Workout
          </button>

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
                <button
                  onClick={() => router.push("/")}
                  className="w-full bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-100 transition"
                >
                  Back to Home
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}