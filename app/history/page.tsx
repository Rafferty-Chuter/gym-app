"use client";
import Link from "next/link";
import { useWorkoutStore } from "@/lib/workout-store";

export default function HistoryPage() {
  const { workouts } = useWorkoutStore();

  function formatDateTime(isoString: string) {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/"
            className="text-zinc-400 hover:text-white transition text-sm"
          >
            ← Home
          </Link>
          <h1 className="text-3xl font-bold">Workout History</h1>
        </div>

        {workouts.length === 0 ? (
          <p className="text-zinc-400">
            No completed workouts yet. Finish a workout on the Start Workout
            page to see it here.
          </p>
        ) : (
          <ul className="space-y-4">
            {workouts.map((workout) => (
              <li
                key={workout.id}
                className="p-4 rounded-xl bg-zinc-900 border border-zinc-800"
              >
                <p className="text-zinc-400 text-sm mb-2">
                  {formatDateTime(workout.completedAt)}
                </p>
                <p className="text-zinc-300 mb-2">
                  {workout.totalExercises} exercise
                  {workout.totalExercises !== 1 ? "s" : ""} · {workout.totalSets}{" "}
                  total sets
                </p>
                <ul className="text-sm text-zinc-200 space-y-1">
                  {workout.exercises.map((ex, i) => (
                    <li key={i}>{ex.name}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
