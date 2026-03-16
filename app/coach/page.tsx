"use client";

import { useState, useEffect } from "react";

const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
};

const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  chest: ["bench", "incline", "chest press", "fly"],
  back: ["row", "pulldown", "pull up", "pull-up", "lat"],
  legs: ["squat", "leg press", "hack", "calf", "leg curl", "leg extension", "rdl"],
  shoulders: ["shoulder press", "overhead press", "lateral raise"],
  arms: ["curl", "hammer curl", "tricep", "pushdown", "jm press", "skullcrusher"],
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

function getWorkoutsFromLast7Days(workouts: StoredWorkout[]): StoredWorkout[] {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - sevenDaysMs;
  return workouts.filter((w) => new Date(w.completedAt).getTime() >= cutoff);
}

function getMuscleGroupForExercise(exerciseName: string): string | null {
  const name = exerciseName.trim().toLowerCase();
  for (const [group, keywords] of Object.entries(MUSCLE_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => name.includes(kw))) return group;
  }
  return null;
}

function getVolumeByMuscleGroup(workouts: StoredWorkout[]): Record<string, number> {
  const counts: Record<string, number> = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
  };
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      const group = getMuscleGroupForExercise(ex.name);
      if (group && group in counts) {
        counts[group] += ex.sets?.length ?? 0;
      }
    }
  }
  return counts;
}

function generateFeedback(
  allWorkouts: StoredWorkout[],
  recentWorkouts: StoredWorkout[],
  weeklyVolume: Record<string, number>
): string[] {
  const feedback: string[] = [];

  if (allWorkouts.length === 0) {
    feedback.push("There isn't enough data yet. Log some workouts to get feedback.");
    return feedback;
  }

  const workoutsLast7Days = recentWorkouts.length;
  if (workoutsLast7Days <= 1) {
    feedback.push("Training frequency may be low. Aim for at least 2–3 sessions per week if you can.");
  }

  const chest = weeklyVolume.chest ?? 0;
  const back = weeklyVolume.back ?? 0;
  const legs = weeklyVolume.legs ?? 0;
  const upperTotal = chest + back;

  if (upperTotal > 0 && legs < upperTotal * 0.5) {
    feedback.push("Leg volume is low compared to upper body. Consider adding more squat, hinge, or leg work.");
  }

  if (chest >= 10 && chest <= 20) {
    feedback.push("Chest volume looks reasonable for the week.");
  } else if (chest > 20) {
    feedback.push("Chest volume is on the higher side. Ensure you're recovering well.");
  }

  if (back > 0 && chest > 0 && back > chest * 1.5) {
    feedback.push("Back volume is high relative to chest. Consider balancing push and pull for upper body.");
  }

  if (chest >= 10 && back >= 10 && legs >= 8 && workoutsLast7Days >= 2 && feedback.length === 0) {
    feedback.push("Your recent training looks consistent. Keep progressing your main lifts.");
  }

  if (feedback.length === 0 && allWorkouts.length > 0) {
    feedback.push("Keep logging workouts. More data will allow better feedback.");
  }

  return feedback;
}

export default function CoachPage() {
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<string[] | null>(null);

  useEffect(() => {
    const workouts = getWorkoutHistory();
    setStats(getStats(workouts));
  }, []);

  function handleAnalyze() {
    const allWorkouts = getWorkoutHistory();
    const recentWorkouts = getWorkoutsFromLast7Days(allWorkouts);
    const weeklyVolume = getVolumeByMuscleGroup(recentWorkouts);
    setAnalysis(generateFeedback(allWorkouts, recentWorkouts, weeklyVolume));
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
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 text-sm">
              {analysis.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
