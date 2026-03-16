"use client";

import { useState, useEffect } from "react";

const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
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

function getStats(workouts: StoredWorkout[]) {
  let totalExercises = 0;
  let totalSets = 0;
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      totalExercises += 1;
      totalSets += ex.sets?.length ?? 0;
    }
  }
  return {
    totalWorkouts: workouts.length,
    totalExercises,
    totalSets,
  };
}

const MOCK_ANALYSIS = `Your recent training looks consistent.
Chest and back volume are decent.
Leg volume may be slightly low compared to upper body.
Continue progressing your main lifts.`;

export default function CoachPage() {
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<string | null>(null);

  useEffect(() => {
    const workouts = getWorkoutHistory();
    setStats(getStats(workouts));
  }, []);

  function handleAnalyze() {
    setAnalysis(MOCK_ANALYSIS);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Coach</h1>

        <section className="mb-6 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-3 text-zinc-200">Your stats</h2>
          <ul className="space-y-2 text-zinc-300">
            <li>Total workouts logged: {stats.totalWorkouts}</li>
            <li>Total exercises logged: {stats.totalExercises}</li>
            <li>Total sets logged: {stats.totalSets}</li>
          </ul>
        </section>

        <button
          onClick={handleAnalyze}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-zinc-100 transition"
        >
          Analyze Recent Training
        </button>

        {analysis !== null && (
          <div className="mt-6 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-2 text-zinc-200">Analysis</h2>
            <p className="text-zinc-300 whitespace-pre-line text-sm">{analysis}</p>
          </div>
        )}
      </div>
    </main>
  );
}
