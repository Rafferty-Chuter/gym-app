"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  draftHasMeaningfulContent,
  getActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function draftDisplayName(d: DraftWorkout): string {
  const w = d.workoutName?.trim();
  if (w) return w;
  const t = d.templateName?.trim();
  if (t) return t;
  const first = d.exercises?.[0]?.name?.trim();
  if (first) return `${first} Workout`;
  return "Workout";
}

export default function WorkoutStartPage() {
  const router = useRouter();
  const [activeDraft, setActiveDraft] = useState<DraftWorkout | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const refreshDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    const d = getActiveWorkout();
    if (d && draftHasMeaningfulContent(d)) {
      setActiveDraft(d);
      setElapsedSec(Math.max(0, Math.floor((Date.now() - d.startedAt) / 1000)));
    } else {
      setActiveDraft(null);
    }
  }, []);

  useEffect(() => {
    refreshDraft();
  }, [refreshDraft]);

  useEffect(() => {
    function onChanged() {
      refreshDraft();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === "activeWorkout") refreshDraft();
    }
    window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshDraft);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshDraft);
    };
  }, [refreshDraft]);

  useEffect(() => {
    if (!activeDraft) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - activeDraft.startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeDraft]);

  function startEmptyWorkout() {
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({ emptyWorkout: true, workoutName: "" })
    );
    router.push("/workout");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white pb-28">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-teal-950/25 via-zinc-950/80 to-transparent"
        aria-hidden
      />
      <div className="relative max-w-lg mx-auto px-4 pt-4 sm:px-6 sm:pt-5">
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-app-secondary hover:text-white transition-colors mb-4"
        >
          ← Home
        </Link>

        <header className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-400/75 mb-1.5">
            Session
          </p>
          <h1 className="text-[1.65rem] sm:text-3xl font-bold tracking-tight text-white leading-tight">
            Start Workout
          </h1>
          <p className="mt-2 text-sm text-app-secondary leading-snug max-w-[22rem]">
            Pick how you want to begin — you can always adjust exercises on the floor.
          </p>
        </header>

        {activeDraft ? (
          <Link
            href="/workout"
            className="mb-5 flex w-full items-center gap-3 rounded-xl border border-teal-500/35 bg-gradient-to-r from-teal-950/50 to-zinc-900/90 px-3.5 py-3 text-left shadow-md shadow-black/25 ring-1 ring-teal-400/10 transition hover:border-teal-400/45 hover:ring-teal-400/20 active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-accent)]/18 text-[color:var(--color-accent)]">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/80">
                In progress
              </p>
              <p className="truncate text-sm font-semibold text-white">{draftDisplayName(activeDraft)}</p>
              <p className="text-[11px] tabular-nums text-teal-200/65">{formatElapsed(elapsedSec)}</p>
            </div>
            <span className="shrink-0 text-teal-300/90" aria-hidden>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        ) : null}

        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">New session</p>

        <div className="flex flex-col gap-3">
          {/* Primary */}
          <button
            type="button"
            onClick={startEmptyWorkout}
            className="group relative w-full overflow-hidden rounded-2xl border-2 border-teal-500/45 bg-gradient-to-br from-teal-950/55 via-zinc-900/95 to-zinc-950/90 px-4 py-5 text-left shadow-[0_16px_40px_-20px_rgba(20,184,166,0.45)] ring-1 ring-teal-400/15 transition hover:border-teal-400/55 hover:shadow-[0_20px_44px_-18px_rgba(45,212,191,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 active:scale-[0.99]"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[color:var(--color-accent)]/10 blur-2xl transition group-hover:bg-[color:var(--color-accent)]/15" />
            <div className="relative flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--color-accent)]/20 text-[color:var(--color-accent)] ring-1 ring-teal-400/25">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-lg font-bold tracking-tight text-white">Start Empty Workout</p>
                <p className="mt-1.5 text-sm text-app-secondary leading-snug">
                  Open a blank log and build the session as you train.
                </p>
              </div>
            </div>
          </button>

          {/* Secondary */}
          <Link
            href="/templates"
            className="group flex w-full items-start gap-3.5 rounded-2xl border border-teal-800/35 bg-zinc-900/70 px-4 py-4 text-left shadow-sm shadow-black/20 ring-1 ring-white/[0.03] transition hover:border-teal-600/40 hover:bg-zinc-800/65 hover:ring-teal-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-teal-700/30 bg-zinc-800/80 text-teal-200/80">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-base font-semibold text-zinc-100">Start From Template</p>
              <p className="mt-1 text-sm text-app-meta leading-snug">
                Load a saved routine — sets and exercises prefilled.
              </p>
            </div>
            <span className="mt-1 shrink-0 text-teal-500/50 transition group-hover:text-teal-400/80" aria-hidden>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
