"use client";

import { useState, useEffect } from "react";
import {
  getWorkoutHistory,
  getStats,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
  generateFeedback,
  type CoachFeedbackSections,
} from "@/lib/trainingAnalysis";

export default function CoachPage() {
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<CoachFeedbackSections | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const workouts = getWorkoutHistory();
    setStats(getStats(workouts));
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
          disabled={isLoading}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-zinc-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Analyzing…" : "Analyze Recent Training"}
        </button>

        {analysis !== null && (
          <div className="mt-6 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-4 text-zinc-200">Analysis</h2>

            {analysis.volume.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Volume</h3>
                <ul className="list-disc list-inside space-y-1.5 text-zinc-300 text-sm">
                  {analysis.volume.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.progression.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Progression</h3>
                <ul className="list-disc list-inside space-y-1.5 text-zinc-300 text-sm">
                  {analysis.progression.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Recommendations</h3>
                <ul className="list-disc list-inside space-y-1.5 text-zinc-300 text-sm">
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
