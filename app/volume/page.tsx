"use client";

import { useState, useEffect } from "react";

const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredWorkout = {
  completedAt: string;
  exercises: { name: string; sets: { weight: string; reps: string; notes?: string }[] }[];
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
    function apply() {
      const all = getWorkoutHistory();
      const recent = getWorkoutsFromLast7Days(all);
      setVolume(getVolumeByMuscleGroup(recent));
    }
    apply();
    window.addEventListener("workoutHistoryChanged", apply);
    return () => window.removeEventListener("workoutHistoryChanged", apply);
  }, []);

  const labels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };

  function getStatus(sets: number): "low" | "good" | "high" {
    if (sets < 8) return "low";
    if (sets <= 20) return "good";
    return "high";
  }

  function getStatusClasses(status: "low" | "good" | "high") {
    if (status === "low") return "text-red-300/80 bg-red-500/10 border-red-500/20";
    if (status === "good") return "text-teal-300/80 bg-teal-500/10 border-teal-500/20";
    return "text-amber-300/80 bg-amber-500/10 border-amber-500/20";
  }

  function getBarColor(status: "low" | "good" | "high") {
    if (status === "low") return "bg-red-400/60";
    if (status === "good") return "bg-teal-400/60";
    return "bg-amber-400/60";
  }

  const insights = (() => {
    const labelGroup = (g: string) => labels[g] ?? g;
    const entries = (Object.keys(volume) as (keyof typeof volume)[]).map((g) => {
      const sets = volume[g] ?? 0;
      const status = getStatus(sets);
      return { group: String(g), sets, status, msg: `${labelGroup(String(g))} volume is ${status}` };
    });
    const lows = entries.filter((e) => e.status === "low").sort((a, b) => a.sets - b.sets);
    const highs = entries.filter((e) => e.status === "high").sort((a, b) => b.sets - a.sets);
    const picked: string[] = [];
    if (lows[0]) picked.push(lows[0].msg);
    if (picked.length < 2 && highs[0]) picked.push(highs[0].msg);
    if (picked.length < 2) {
      const good = entries.find((e) => e.status === "good");
      if (good) picked.push(`${labelGroup(good.group)} volume is good`);
    }
    return picked.slice(0, 2);
  })();

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Weekly Volume</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Total sets per muscle group in the last 7 days
        </p>

        {insights.length > 0 && (
          <div className="mb-4 rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500 mb-2">Insights</p>
            <ul className="text-sm text-zinc-300 space-y-1">
              {insights.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-3">
          {(Object.keys(volume) as (keyof typeof volume)[]).map((group) => {
            const sets = volume[group] ?? 0;
            const status = getStatus(sets);
            const statusClasses = getStatusClasses(status);

            // Visual indicator: 0–30 sets mapped to 0–100% (caps at 30)
            const pct = Math.max(0, Math.min(100, Math.round((Math.min(sets, 30) / 30) * 100)));

            return (
              <li
                key={group}
                className="py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-100">{labels[group]}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${statusClasses}`}
                    >
                      {status}
                    </span>
                    <span className="text-zinc-300 tabular-nums">{sets} sets</span>
                  </div>
                </div>

                <div className="mt-2 h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full ${getBarColor(status)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
