"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getWorkoutHistory,
  getStats,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
  generateFeedback,
  type CoachFeedbackSections,
} from "@/lib/trainingAnalysis";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";

export default function CoachPage() {
  const { unit, setUnit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<CoachFeedbackSections | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    function refresh() {
      const workouts = getWorkoutHistory();
      setStats(getStats(workouts));
    }
    refresh();
    window.addEventListener("workoutHistoryChanged", refresh);
    return () => window.removeEventListener("workoutHistoryChanged", refresh);
  }, []);

  async function handleAnalyze() {
    const allWorkouts = getWorkoutHistory();
    const recentWorkouts = getWorkoutsFromLast7Days(allWorkouts);
    const weeklyVolume = getVolumeByMuscleGroup(recentWorkouts);
    const statsSnapshot = getStats(allWorkouts);

    const recentExerciseNames = new Set<string>();
    const sorted = [...allWorkouts].sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const w of sorted.slice(0, 5)) {
      for (const ex of w.exercises ?? []) {
        if (ex.name?.trim()) recentExerciseNames.add(ex.name.trim());
      }
    }

    const trainingSummary = {
      totalWorkouts: statsSnapshot.totalWorkouts,
      weeklyVolume,
      recentExercises: Array.from(recentExerciseNames),
      totalSets: statsSnapshot.totalSets,
    };

    setIsLoading(true);
    try {
      const res = await fetch("/api/coach-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trainingSummary),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.analysis)) {
        setAnalysis({
          volume: [],
          progression: [],
          recommendations: data.analysis,
        });
        return;
      }
    } catch {
      // fall through to rule-based feedback
    } finally {
      setIsLoading(false);
    }

    setAnalysis(generateFeedback(allWorkouts, recentWorkouts, weeklyVolume, unit, focus, experienceLevel));
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Home
          </Link>
          <h1 className="text-3xl font-bold text-white">Coach</h1>
          <div className="inline-flex items-center rounded-full border border-teal-900/40 bg-zinc-900/70 p-0.5">
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`min-w-[2.25rem] rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  unit === u ? "bg-teal-500/25 text-teal-100 shadow-sm shadow-teal-950/30" : "text-app-tertiary hover:text-app-secondary"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <section className="card-app mb-6">
          <h2 className="label-section mb-2">Your stats</h2>
          <ul className="space-y-2 text-app-secondary text-sm">
            <li>Total workouts logged: <span className="text-white font-medium">{stats.totalWorkouts}</span></li>
            <li>Total exercises logged: <span className="text-white font-medium">{stats.totalExercises}</span></li>
            <li>Total sets logged: <span className="text-white font-medium">{stats.totalSets}</span></li>
          </ul>
        </section>

        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full py-3 rounded-xl btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Analyzing…" : "Analyze Recent Training"}
        </button>

        {analysis !== null && (
          <div className="card-app mt-6">
            <h2 className="text-lg font-bold text-white mb-4">Analysis</h2>

            {analysis.volume.length > 0 && (
              <div className="mb-4">
                <h3 className="label-section mb-2">Volume</h3>
                <ul className="list-disc list-inside space-y-1.5 text-app-secondary text-sm">
                  {analysis.volume.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.progression.length > 0 && (
              <div className="mb-4">
                <h3 className="label-section mb-2">Progression</h3>
                <ul className="list-disc list-inside space-y-1.5 text-app-secondary text-sm">
                  {analysis.progression.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations.length > 0 && (
              <div>
                <h3 className="label-section mb-2">Recommendations</h3>
                <ul className="list-disc list-inside space-y-1.5 text-app-secondary text-sm">
                  {analysis.recommendations.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
