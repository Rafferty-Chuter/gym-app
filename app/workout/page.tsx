"use client";
import { useState } from "react";

export default function WorkoutPage() {
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
                      ? "bg-zinc-900 border-zinc-500"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{exercise.name}</h3>
                    {exercise.id !== activeExerciseId && (
                      <button
                        onClick={() => {
                          setActiveExerciseId(exercise.id);
                          setWeight("");
                          setReps("");
                        }}
                        className="text-xs px-2 py-1 rounded-full border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                      >
                        Log sets
                      </button>
                    )}
                  </div>

                  {exercise.sets.length === 0 ? (
                    <p className="text-zinc-400 text-xs">
                      No sets logged yet for this exercise.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm text-zinc-100">
                      {exercise.sets.map((set, index) => (
                        <li key={index}>
                          Set {index + 1} — {set.weight}kg × {set.reps}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}