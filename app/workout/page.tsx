"use client";
import { useState } from "react";
import { useWorkoutStore } from "@/lib/workout-store";

export default function WorkoutPage() {
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

  function finishWorkout() {
    if (exercises.length === 0) return;
    const totalSets = exercises.reduce((total, ex) => total + ex.sets.length, 0);
    addWorkout({
      completedAt: new Date().toISOString(),
      exercises: exercises.map(({ name, sets }) => ({ name, sets })),
      totalExercises: exercises.length,
      totalSets,
    });
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
  }

  function deleteExercise(exerciseId: number) {
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
    setActiveExerciseId((current) =>
      current === exerciseId ? null : current
    );
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
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <h3 className="font-semibold">{exercise.name}</h3>
                    <div className="flex items-center gap-2">
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
                      <button
                        onClick={() => deleteExercise(exercise.id)}
                        className="text-xs px-2 py-1 rounded-full border border-red-500/70 text-red-300 hover:bg-red-900/30"
                      >
                        Delete Exercise
                      </button>
                    </div>
                  </div>

                  {exercise.sets.length === 0 ? (
                    <p className="text-zinc-400 text-xs">
                      No sets logged yet for this exercise.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm text-zinc-100">
                      {exercise.sets.map((set, index) => (
                        <li
                          key={index}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            Set {index + 1} — {set.weight}kg × {set.reps}
                          </span>
                          <button
                            onClick={() => deleteSet(exercise.id, index)}
                            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
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
            <section className="mt-6 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              <h2 className="text-xl font-semibold mb-4">Workout Summary</h2>
              <p className="text-zinc-300 mb-2">
                {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} ·{" "}
                {exercises.reduce((total, ex) => total + ex.sets.length, 0)} total sets
              </p>
              <ul className="space-y-2 text-sm text-zinc-200">
                {exercises.map((exercise) => (
                  <li key={exercise.id}>
                    {exercise.name} — {exercise.sets.length} set
                    {exercise.sets.length !== 1 ? "s" : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}