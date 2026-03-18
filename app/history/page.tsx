"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import { useWorkoutStore } from "@/lib/workout-store";
import { useUnit } from "@/lib/unit-preference";

type WorkoutRow = {
  completedAt: string;
  name?: string;
  durationSec?: number;
  totalExercises: number;
  totalSets: number;
  exercises: { name: string; restSec?: number; sets: { weight: string; reps: string; notes?: string }[] }[];
};

function mapStoredToRows(stored: ReturnType<typeof getWorkoutHistory>): WorkoutRow[] {
  return stored.map((w) => ({
    completedAt: w.completedAt,
    name: w.name,
    durationSec: w.durationSec,
    totalExercises: w.exercises?.length ?? 0,
    totalSets: w.exercises?.reduce((sum, ex) => sum + (ex.sets?.length ?? 0), 0) ?? 0,
    exercises:
      w.exercises?.map((ex) => ({
        name: ex.name,
        restSec: ex.restSec,
        sets: ex.sets?.map((s) => ({ weight: String(s.weight), reps: String(s.reps), notes: s.notes })) ?? [],
      })) ?? [],
  }));
}

export default function HistoryPage() {
  const { removeWorkoutAtIndex } = useWorkoutStore();
  const { unit, setUnit } = useUnit();
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  const reload = useCallback(() => {
    setWorkouts(mapStoredToRows(getWorkoutHistory()));
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener("workoutHistoryChanged", onChange);
    return () => window.removeEventListener("workoutHistoryChanged", onChange);
  }, [reload]);

  function formatDuration(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatDateTime(isoString: string) {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function workoutDisplayName(w: WorkoutRow) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  function confirmDelete() {
    if (pendingDeleteIndex === null) return;
    removeWorkoutAtIndex(pendingDeleteIndex);
    setPendingDeleteIndex(null);
    setExpandedKey(null);
    reload();
  }

  const pendingWorkout =
    pendingDeleteIndex !== null ? workouts[pendingDeleteIndex] : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="text-zinc-400 hover:text-white transition text-sm"
          >
            ← Home
          </Link>
          <h1 className="text-3xl font-bold">Workout History</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-500">Units:</span>
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  unit === u
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {workouts.length === 0 ? (
          <p className="text-zinc-400">
            No completed workouts yet. Finish a workout on the Start Workout
            page to see it here.
          </p>
        ) : (
          <ul className="space-y-4">
            {workouts.map((workout, i) => {
              const key = `${workout.completedAt}-${i}`;
              const isOpen = expandedKey === key;
              const displayName = workoutDisplayName(workout);
              return (
                <li
                  key={key}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedKey((prev) => (prev === key ? null : key))}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-zinc-200 font-medium mb-1">{displayName}</p>
                      <p className="text-zinc-400 text-sm mb-2">
                        {formatDateTime(workout.completedAt)}
                      </p>
                      <p className="text-zinc-300 mb-2">
                        {workout.totalExercises} exercise
                        {workout.totalExercises !== 1 ? "s" : ""} · {workout.totalSets}{" "}
                        total sets
                      </p>

                      {!isOpen ? (
                        <ul className="text-sm text-zinc-200 space-y-1">
                          {workout.exercises.map((ex, j) => (
                            <li key={j}>{ex.name}</li>
                          ))}
                        </ul>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteIndex(i);
                      }}
                      className="shrink-0 text-xs text-zinc-500 hover:text-red-400 px-2 py-1.5 rounded-lg border border-transparent hover:border-red-900/40 hover:bg-red-950/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <p className="text-zinc-100 font-medium mb-2">{displayName}</p>
                      <p className="text-zinc-400 text-sm mb-3">
                        {formatDateTime(workout.completedAt)}
                        {typeof workout.durationSec === "number"
                          ? ` · ${formatDuration(workout.durationSec)}`
                          : ""}
                        {" · "}
                        {workout.totalExercises} exercise{workout.totalExercises !== 1 ? "s" : ""}{" "}
                        · {workout.totalSets} total sets
                      </p>

                      <div className="space-y-4">
                        {workout.exercises.map((ex, exIdx) => (
                          <div key={exIdx}>
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-zinc-200 font-medium">{ex.name}</p>
                              {typeof ex.restSec === "number" && (
                                <span className="text-xs text-zinc-500 tabular-nums">
                                  Rest {ex.restSec}s
                                </span>
                              )}
                            </div>
                            {ex.sets.length === 0 ? (
                              <p className="text-zinc-500 text-sm">No sets logged.</p>
                            ) : (
                              <ul className="space-y-1 text-sm text-zinc-300">
                                {ex.sets.map((s, setIdx) => (
                                  <li key={setIdx} className="tabular-nums">
                                    Set {setIdx + 1} — {s.weight}{unit} × {s.reps}
                                    {s.notes?.trim() && (
                                      <p className="text-xs text-zinc-500 mt-0.5 pl-0">{s.notes.trim()}</p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingDeleteIndex !== null && pendingWorkout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-workout-title"
          onClick={() => setPendingDeleteIndex(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-workout-title" className="text-zinc-100 font-semibold">
              Delete workout?
            </h2>
            <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
              Remove{" "}
              <span className="text-zinc-300">{workoutDisplayName(pendingWorkout)}</span>{" "}
              from your history. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-6 justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteIndex(null)}
                className="px-3 py-2 rounded-lg text-sm text-zinc-300 border border-zinc-700 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-red-950/80 text-red-300 border border-red-900/60 hover:bg-red-900/50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
