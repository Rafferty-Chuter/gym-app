"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasActiveWorkout } from "@/lib/activeWorkout";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

export default function WorkoutStartPage() {
  const router = useRouter();
  const [hasActive, setHasActive] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  const refreshActive = useCallback(() => {
    if (typeof window === "undefined") return;
    setHasActive(hasActiveWorkout());
  }, []);

  useEffect(() => {
    setHasMounted(true);
    refreshActive();
  }, [refreshActive]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "activeWorkout") refreshActive();
    }
    function onVisible() {
      if (document.visibilityState === "visible") refreshActive();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshActive);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshActive);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshActive]);

  function startEmptyWorkout() {
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({ emptyWorkout: true, workoutName: "" })
    );
    router.push("/workout");
  }

  const cardBase =
    "block w-full rounded-2xl border px-4 py-4 text-left transition min-h-[3.25rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/45";

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="max-w-lg mx-auto">
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-app-secondary hover:text-white transition-colors mb-6"
        >
          ← Home
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Start Workout</h1>
          <p className="mt-2 text-sm text-app-secondary leading-relaxed">
            Choose how you want to begin this session.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {hasMounted && hasActive ? (
            <Link
              href="/workout"
              className={`${cardBase} border-emerald-500/40 bg-gradient-to-br from-emerald-950/50 to-zinc-900/90 shadow-[0_12px_32px_-18px_rgba(52,211,153,0.45)] hover:border-emerald-400/55`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200/85">In progress</p>
              <p className="mt-1 text-base font-bold text-white">Resume Workout</p>
              <p className="mt-1 text-sm text-app-secondary">Continue your saved session.</p>
            </Link>
          ) : null}

          <button
            type="button"
            onClick={startEmptyWorkout}
            className={`${cardBase} border-teal-900/40 bg-zinc-900/85 hover:border-teal-500/35 hover:bg-teal-950/20 active:scale-[0.99]`}
          >
            <p className="text-base font-bold text-white">Start Empty Workout</p>
            <p className="mt-1 text-sm text-app-secondary">Blank session — add exercises as you go.</p>
          </button>

          <Link
            href="/templates"
            className={`${cardBase} border-teal-900/40 bg-zinc-900/85 hover:border-teal-500/35 hover:bg-teal-950/20`}
          >
            <p className="text-base font-bold text-white">From Template</p>
            <p className="mt-1 text-sm text-app-secondary">Pick a saved routine, then start.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
