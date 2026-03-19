"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTrainingFocus, type TrainingFocus } from "@/lib/trainingFocus";

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

function getFocusAwareInsightMessage(
  focus: TrainingFocus,
  groupLabel: string,
  status: "low" | "good" | "high"
): string {
  if (focus === "Hypertrophy") {
    if (status === "low") return `${groupLabel} volume is low for muscle growth — consider adding sets.`;
    if (status === "good") return `${groupLabel} volume is in a good range for hypertrophy.`;
    return `${groupLabel} volume is on the higher side — prioritize recovery.`;
  }
  if (focus === "Powerlifting") {
    if (status === "low") return `${groupLabel}: ${status} volume this week.`;
    return `${groupLabel}: ${status} volume.`;
  }
  if (focus === "General Fitness") {
    return `${groupLabel} volume this week: ${status}.`;
  }
  return `${groupLabel} volume is ${status}.`;
}

export default function VolumePage() {
  const { focus } = useTrainingFocus();
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

  function getStatusChipClass(status: "low" | "good" | "high") {
    if (status === "low") return "chip-low";
    if (status === "good") return "chip-moderate";
    return "chip-high";
  }

  function getBarColor(status: "low" | "good" | "high") {
    if (status === "low") return "bg-rose-400/60";
    if (status === "good") return "bg-emerald-400/60";
    return "bg-sky-400/60";
  }

  const insights = (() => {
    const labelGroup = (g: string) => labels[g] ?? g;
    const entries = (Object.keys(volume) as (keyof typeof volume)[]).map((g) => {
      const sets = volume[g] ?? 0;
      const status = getStatus(sets);
      const msg = getFocusAwareInsightMessage(focus, labelGroup(String(g)), status);
      return { group: String(g), sets, status, msg };
    });
    const lows = entries.filter((e) => e.status === "low").sort((a, b) => a.sets - b.sets);
    const highs = entries.filter((e) => e.status === "high").sort((a, b) => b.sets - a.sets);
    const picked: string[] = [];
    if (lows[0]) picked.push(lows[0].msg);
    if (picked.length < 2 && highs[0]) picked.push(highs[0].msg);
    if (picked.length < 2) {
      const good = entries.find((e) => e.status === "good");
      if (good) picked.push(getFocusAwareInsightMessage(focus, labelGroup(good.group), "good"));
    }
    return picked.slice(0, 2);
  })();

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link href="/" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Home
          </Link>
          <h1 className="text-3xl font-bold text-white">Weekly Volume</h1>
        </div>
        <p className="text-app-secondary text-sm mb-6">
          Total sets per muscle group in the last 7 days
        </p>

        {insights.length > 0 && (
          <div className="card-app mb-4">
            <p className="label-section mb-2">Insights</p>
            <ul className="text-sm text-app-secondary space-y-1">
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
            const chipClass = getStatusChipClass(status);
            const pct = Math.max(0, Math.min(100, Math.round((Math.min(sets, 30) / 30) * 100)));

            return (
              <li key={group} className="card-app">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{labels[group]}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${chipClass}`}>
                      {status}
                    </span>
                    <span className="text-app-meta tabular-nums">{sets} sets</span>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-zinc-800/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getBarColor(status)}`}
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
