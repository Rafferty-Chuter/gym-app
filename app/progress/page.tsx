"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import { useUnit } from "@/lib/unit-preference";
import { LiftProgressionSection } from "@/components/LiftProgressionSection";

export default function ProgressPage() {
  const { unit } = useUnit();
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_90%_45%_at_50%_-8%,rgba(45,212,191,0.07),transparent_58%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <header className="mb-8 flex items-center gap-4">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-900/30 bg-zinc-900/70 text-zinc-400 transition hover:border-teal-700/40 hover:text-white active:scale-95"
            aria-label="Back to home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Lift Progression</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Track your strength over time</p>
          </div>
        </header>

        {workouts.length === 0 ? (
          <div className="rounded-2xl border border-teal-900/20 bg-zinc-900/60 px-6 py-10 text-center">
            <p className="text-zinc-400 text-sm">No workouts logged yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Complete a session to see your progression charts.</p>
            <Link
              href="/workout/start"
              className="mt-5 inline-block rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 active:scale-95"
            >
              Start a workout
            </Link>
          </div>
        ) : (
          <LiftProgressionSection workouts={workouts} unit={unit} />
        )}
      </div>
    </main>
  );
}
