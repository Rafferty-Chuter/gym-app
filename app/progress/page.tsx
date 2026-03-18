"use client";

import { useState, useEffect } from "react";
import { useUnit } from "@/lib/unit-preference";

const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string; notes?: string }[] }[];
};

function getWorkoutHistory(): StoredWorkout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getUniqueExerciseNames(workouts: StoredWorkout[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      const name = ex.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function getAllSetsForExercise(
  workouts: StoredWorkout[],
  exerciseName: string
): { weight: string; reps: string; notes?: string }[] {
  const normalized = exerciseName.trim().toLowerCase();
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const sets: { weight: string; reps: string; notes?: string }[] = [];
  for (const workout of sorted) {
    const exercise = workout.exercises?.find(
      (ex) => ex.name?.trim().toLowerCase() === normalized
    );
    if (exercise?.sets?.length) {
      for (const set of exercise.sets) {
        if (set?.weight != null && set?.reps != null)
          sets.push({ weight: String(set.weight), reps: String(set.reps), notes: (set as { notes?: string }).notes });
      }
    }
  }
  return sets;
}

export default function ProgressPage() {
  const { unit } = useUnit();
  const [workouts, setWorkouts] = useState<StoredWorkout[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useEffect(() => {
    function apply() {
      setWorkouts(getWorkoutHistory());
    }
    apply();
    window.addEventListener("workoutHistoryChanged", apply);
    return () => window.removeEventListener("workoutHistoryChanged", apply);
  }, []);

  const exerciseNames = getUniqueExerciseNames(workouts);
  const selectedSets =
    selectedExercise != null
      ? getAllSetsForExercise(workouts, selectedExercise)
      : [];

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Progress</h1>

        {exerciseNames.length === 0 ? (
          <p className="text-zinc-400">
            No exercises in history yet. Complete workouts to see progress here.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6">
            <section className="flex-1">
              <h2 className="text-lg font-semibold mb-3 text-zinc-200">
                Exercises
              </h2>
              <ul className="space-y-1">
                {exerciseNames.map((name) => (
                  <li key={name}>
                    <button
                      onClick={() =>
                        setSelectedExercise((prev) => (prev === name ? null : name))
                      }
                      className={`w-full text-left px-4 py-2 rounded-lg transition ${
                        selectedExercise === name
                          ? "bg-zinc-600 text-white"
                          : "bg-zinc-900 text-zinc-200 hover:bg-zinc-800 border border-zinc-800"
                      }`}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex-1 min-w-0">
              {selectedExercise == null ? (
                <p className="text-zinc-500 text-sm">
                  Select an exercise to view all logged sets.
                </p>
              ) : (
                <>
                  <h2 className="text-lg font-semibold mb-3 text-white">
                    {selectedExercise}
                  </h2>
                  {selectedSets.length === 0 ? (
                    <p className="text-zinc-500 text-sm">
                      No sets logged for this exercise yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {selectedSets.map((set, index) => (
                        <li
                          key={index}
                          className="text-zinc-200 py-1 border-b border-zinc-800 last:border-0"
                        >
                          {set.weight}{unit} × {set.reps}
                          {set.notes?.trim() && (
                            <p className="text-xs text-zinc-500 mt-0.5">{set.notes.trim()}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
