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
        const setCount = ex.sets?.length ?? 0;
        counts[group] += setCount;
      }
    }
  }
  return counts;
}

export default function VolumePage() {
  const [volume, setVolume] = useState<Record<string, number>>({
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
  });

  useEffect(() => {
    const all = getWorkoutHistory();
    const recent = getWorkoutsFromLast7Days(all);
    setVolume(getVolumeByMuscleGroup(recent));
  }, []);

  const labels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Weekly Volume</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Total sets per muscle group in the last 7 days
        </p>

        <ul className="space-y-3">
          {(Object.keys(volume) as (keyof typeof volume)[]).map((group) => (
            <li
              key={group}
              className="flex items-center justify-between py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800"
            >
              <span className="font-medium text-zinc-100">{labels[group]}</span>
              <span className="text-zinc-300">{volume[group]} sets</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
