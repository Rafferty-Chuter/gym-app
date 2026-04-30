"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTrainingFocus, type TrainingFocus } from "@/lib/trainingFocus";
import {
  getDetailedMuscleGroupsForLoggedExercise,
  DEFAULT_DETAILED_MUSCLE_GROUPS,
  OPTIONAL_DETAILED_MUSCLE_GROUPS,
  type DetailedMuscleGroup,
} from "@/lib/trainingMetrics";
import { countCompletedLoggedSets } from "@/lib/completedSets";

const WORKOUT_HISTORY_KEY = "workoutHistory";
const ENABLED_OPTIONAL_KEY = "volumeEnabledOptionalGroups";

const LABELS: Record<DetailedMuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  quads: "Quads",
  glutes: "Glutes",
  hamstrings: "Hamstrings",
  calves: "Calves",
  biceps: "Biceps",
  triceps: "Triceps",
  shoulders: "Shoulders",
  abs: "Abs",
  traps: "Traps",
  "rear-delts": "Rear Delts",
};

type StoredWorkout = {
  completedAt: string;
  exercises: {
    exerciseId?: string;
    name: string;
    sets: { weight: string; reps: string; notes?: string }[];
  }[];
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

function readEnabledOptional(): Set<DetailedMuscleGroup> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ENABLED_OPTIONAL_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((s): s is DetailedMuscleGroup =>
        OPTIONAL_DETAILED_MUSCLE_GROUPS.includes(s as DetailedMuscleGroup)
      )
    );
  } catch {
    return new Set();
  }
}

function saveEnabledOptional(set: Set<DetailedMuscleGroup>) {
  try {
    localStorage.setItem(ENABLED_OPTIONAL_KEY, JSON.stringify([...set]));
  } catch {}
}

function getWorkoutsFromLast7Days(workouts: StoredWorkout[]): StoredWorkout[] {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - sevenDaysMs;
  return workouts.filter((w) => new Date(w.completedAt).getTime() >= cutoff);
}

function computeVolume(
  workouts: StoredWorkout[],
  groups: DetailedMuscleGroup[],
  enabledOptional: Set<DetailedMuscleGroup>
): Record<DetailedMuscleGroup, number> {
  const counts = {} as Record<DetailedMuscleGroup, number>;
  for (const g of groups) counts[g] = 0;
  for (const workout of workouts) {
    for (const ex of workout.exercises ?? []) {
      const buckets = getDetailedMuscleGroupsForLoggedExercise(ex, { enabledOptional });
      if (buckets.length === 0) continue;
      const sets = countCompletedLoggedSets(ex.sets);
      for (const b of buckets) {
        if (b in counts) counts[b] += sets;
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
  const [workouts, setWorkouts] = useState<StoredWorkout[]>([]);
  const [enabledOptional, setEnabledOptional] = useState<Set<DetailedMuscleGroup>>(
    () => new Set()
  );
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setEnabledOptional(readEnabledOptional());
  }, []);

  useEffect(() => {
    function apply() {
      setWorkouts(getWorkoutsFromLast7Days(getWorkoutHistory()));
    }
    apply();
    window.addEventListener("workoutHistoryChanged", apply);
    return () => window.removeEventListener("workoutHistoryChanged", apply);
  }, []);

  const activeGroups: DetailedMuscleGroup[] = [
    ...DEFAULT_DETAILED_MUSCLE_GROUPS,
    ...OPTIONAL_DETAILED_MUSCLE_GROUPS.filter((g) => enabledOptional.has(g)),
  ];
  const volume = computeVolume(workouts, activeGroups, enabledOptional);
  const availableToAdd = OPTIONAL_DETAILED_MUSCLE_GROUPS.filter(
    (g) => !enabledOptional.has(g)
  );

  function toggleOptional(group: DetailedMuscleGroup) {
    setEnabledOptional((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      saveEnabledOptional(next);
      return next;
    });
  }

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
    const entries = activeGroups.map((g) => {
      const sets = volume[g] ?? 0;
      const status = getStatus(sets);
      const msg = getFocusAwareInsightMessage(focus, LABELS[g], status);
      return { group: g, sets, status, msg };
    });
    const lows = entries.filter((e) => e.status === "low").sort((a, b) => a.sets - b.sets);
    const highs = entries.filter((e) => e.status === "high").sort((a, b) => b.sets - a.sets);
    const picked: string[] = [];
    if (lows[0]) picked.push(lows[0].msg);
    if (picked.length < 2 && highs[0]) picked.push(highs[0].msg);
    if (picked.length < 2) {
      const good = entries.find((e) => e.status === "good");
      if (good) picked.push(getFocusAwareInsightMessage(focus, LABELS[good.group], "good"));
    }
    return picked.slice(0, 2);
  })();

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="text-app-secondary hover:text-white transition-colors text-sm font-medium"
          >
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
          {activeGroups.map((group) => {
            const sets = volume[group] ?? 0;
            const status = getStatus(sets);
            const chipClass = getStatusChipClass(status);
            const pct = Math.max(0, Math.min(100, Math.round((Math.min(sets, 30) / 30) * 100)));
            const isOptional = OPTIONAL_DETAILED_MUSCLE_GROUPS.includes(group);

            return (
              <li key={group} className="card-app">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <p className="font-semibold text-white">{LABELS[group]}</p>
                    {isOptional && (
                      <button
                        type="button"
                        onClick={() => toggleOptional(group)}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors text-xs leading-none"
                        aria-label={`Remove ${LABELS[group]}`}
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
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

        {availableToAdd.length > 0 && (
          <div className="mt-4">
            {!showAdd ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="w-full rounded-xl border border-dashed border-teal-900/40 bg-zinc-900/40 px-4 py-3 text-sm font-medium text-zinc-400 hover:border-teal-700/60 hover:text-zinc-200 transition-colors"
              >
                + Add muscle group
              </button>
            ) : (
              <div className="rounded-xl border border-teal-900/30 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white">Add a muscle group</p>
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs font-medium"
                  >
                    Done
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableToAdd.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleOptional(g)}
                      className="rounded-full border border-teal-900/40 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-teal-700/60 hover:text-white transition-colors"
                    >
                      + {LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
