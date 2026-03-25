"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
} from "@/lib/trainingAnalysis";
import { ACTIVE_WORKOUT_CHANGED_EVENT, hasActiveWorkout } from "@/lib/activeWorkout";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus, TRAINING_FOCUS_OPTIONS, type TrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel, EXPERIENCE_LEVEL_OPTIONS, type ExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import {
  buildCoachStructuredAnalysis,
  EMPTY_COACH_STRUCTURED_ANALYSIS,
} from "@/lib/coachStructuredAnalysis";
import { buildHomePrimaryCoachingStory } from "@/lib/homeCoachingStory";
import { countCompletedLoggedSets } from "@/lib/completedSets";

type ProfileModalProps = {
  focus: TrainingFocus;
  setFocus: (f: TrainingFocus) => void;
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (e: ExperienceLevel) => void;
  unit: "kg" | "lb";
  setUnit: (u: "kg" | "lb") => void;
  onClose: () => void;
};

function ProfileModal({
  focus,
  setFocus,
  experienceLevel,
  setExperienceLevel,
  unit,
  setUnit,
  onClose,
}: ProfileModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="rounded-2xl border border-teal-950/50 bg-zinc-900 p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="profile-modal-title" className="text-lg font-bold text-white mb-4">
          Profile
        </h2>
        <p className="text-app-secondary text-sm mb-4">
          Edit your training preferences. Used to tailor advice across the app.
        </p>
        <div className="space-y-4">
          <div>
            <label className="label-section block mb-1.5">Training focus</label>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value as TrainingFocus)}
              className="input-app w-full px-3 py-2.5 text-sm"
            >
              {TRAINING_FOCUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-section block mb-1.5">Experience level</label>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
              className="input-app w-full px-3 py-2.5 text-sm"
            >
              {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-section block mb-1.5">Units</label>
            <div className="flex gap-2">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${
                    unit === u
                      ? "border-teal-500/50 bg-teal-950/40 text-teal-100"
                      : "border-teal-900/40 bg-zinc-800/80 text-app-secondary hover:text-white"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const pathname = usePathname();
  const { unit, setUnit } = useUnit();
  const { focus, setFocus } = useTrainingFocus();
  const { experienceLevel, setExperienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [profileOpen, setProfileOpen] = useState(false);
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasActive, setHasActive] = useState(false);

  const coachAnalysis = useMemo(() => {
    if (workouts.length === 0) return EMPTY_COACH_STRUCTURED_ANALYSIS;
    return buildCoachStructuredAnalysis(workouts, {
      focus,
      experienceLevel,
      goal,
      unit,
    });
  }, [workouts, focus, experienceLevel, goal, unit]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
  }, []);

  useEffect(() => {
    if (hasMounted && pathname === "/") setHasActive(hasActiveWorkout());
  }, [hasMounted, pathname]);

  useEffect(() => {
    function syncActive() {
      setHasActive(hasActiveWorkout());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === "activeWorkout") syncActive();
    }
    window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, syncActive);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncActive);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, syncActive);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncActive);
    };
  }, []);

  const lastWorkout = useMemo(() => {
    if (!workouts.length) return null;
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    return sorted[0] ?? null;
  }, [workouts]);

  function workoutDisplayName(w: (typeof workouts)[number]) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  const lastWorkoutAgo = useMemo(() => {
    if (!lastWorkout) return null;
    const ms = Date.now() - new Date(lastWorkout.completedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    return `${Math.max(0, minutes)}m ago`;
  }, [lastWorkout]);

  const thisWeek = useMemo(() => {
    const recent = getWorkoutsFromLast7Days(workouts);
    const weeklyVolume = getVolumeByMuscleGroup(recent);
    const workoutsCount = recent.length;
    const totalSets = recent.reduce(
      (sum, w) => sum + (w.exercises?.reduce((s, ex) => s + countCompletedLoggedSets(ex.sets), 0) ?? 0),
      0
    );

    return { workoutsCount, totalSets, weeklyVolume };
  }, [workouts]);

  const homeStory = useMemo(
    () =>
      buildHomePrimaryCoachingStory({
        hasActive,
        workoutCount: workouts.length,
        coachAnalysis,
        thisWeek,
        trainingFocus: focus,
      }),
    [coachAnalysis, focus, hasActive, thisWeek, workouts.length]
  );

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  const coachCardClass =
    "rounded-2xl border border-indigo-700/40 bg-gradient-to-br from-indigo-900/38 via-zinc-900/95 to-violet-900/28 p-6 shadow-[0_18px_42px_-16px_rgba(17,24,39,0.8),0_0_0_1px_rgba(99,102,241,0.14)]";

  const sectionCardClass = "rounded-2xl border border-zinc-800/80 bg-zinc-900/92 p-5";

  const ctaLabel = hasMounted && hasActive ? "Resume Workout" : "Start Workout";

  const weekPrimaryStats = useMemo(() => {
    if (workouts.length === 0) return "No workouts yet · 0 sets";
    return `${thisWeek.workoutsCount} workout${thisWeek.workoutsCount === 1 ? "" : "s"} · ${thisWeek.totalSets} sets`;
  }, [thisWeek.totalSets, thisWeek.workoutsCount, workouts.length]);

  const weekConfidenceHint = useMemo(() => {
    if (workouts.length === 0) return "Log a session to start your week.";
    if (workouts.length < 3)
      return "Still an early read — a few more sessions will make this weekly view much more reliable.";
    return null;
  }, [workouts.length]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_90%_45%_at_50%_-8%,rgba(45,212,191,0.09),transparent_58%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <header className="mb-9">
          <p className="text-sm text-home-tertiary">{greeting()}</p>
          <h1 className="text-4xl font-bold tracking-tight mt-1.5 leading-tight text-white">{homeStory.headline}</h1>
          <p className="text-home-secondary mt-2 text-sm">{homeStory.subline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center rounded-full border border-teal-900/40 bg-zinc-900/70 p-0.5"
              role="group"
              aria-label="Weight units"
            >
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-w-[2.25rem] rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    unit === u
                      ? "bg-teal-500/25 text-teal-100 shadow-sm shadow-teal-950/30"
                      : "text-home-tertiary hover:text-home-secondary"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-home-tertiary">Focus</span>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as typeof focus)}
                className="rounded-lg border border-teal-900/40 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] font-medium text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                aria-label="Training focus"
              >
                {TRAINING_FOCUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="text-[11px] font-medium text-home-tertiary hover:text-home-secondary transition"
            >
              Profile
            </button>
          </div>
        </header>

        {profileOpen && (
          <ProfileModal
            focus={focus}
            setFocus={setFocus}
            experienceLevel={experienceLevel}
            setExperienceLevel={setExperienceLevel}
            unit={unit}
            setUnit={setUnit}
            onClose={() => setProfileOpen(false)}
          />
        )}

        <div className="relative isolate mb-8 mt-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-28 -translate-y-1/2 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 58% 75% at 50% 50%, rgba(52, 211, 153, 0.12) 0%, rgba(20, 184, 166, 0.06) 42%, transparent 68%)",
            }}
          />
          <Link
            href={hasMounted && hasActive ? "/workout" : "/workout/start"}
            className="relative z-10 block w-full rounded-2xl py-8 text-center text-lg font-bold tracking-tight text-white transition-all duration-150 ease-out will-change-transform overflow-hidden bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 shadow-[0_4px_0_0_rgba(6,95,70,0.55),0_16px_44px_-8px_rgba(34,197,94,0.35),0_22px_50px_-12px_rgba(20,184,166,0.28),0_10px_32px_rgba(0,0,0,0.48)] ring-1 ring-emerald-200/20 hover:shadow-[0_4px_0_0_rgba(6,95,70,0.48),0_20px_52px_-6px_rgba(52,211,153,0.38),0_28px_60px_-14px_rgba(20,184,166,0.3),0_12px_36px_rgba(0,0,0,0.52)] hover:scale-[1.02] hover:brightness-[1.04] active:translate-y-[2px] active:scale-[0.99]"
          >
            {ctaLabel}
          </Link>
        </div>

        <section className={`${coachCardClass} mb-7`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-200/70">Coach Insight</p>
          </div>
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-200/80">
                  This week
                </span>
                <span className="text-sm font-semibold tabular-nums tracking-tight text-indigo-50">
                  {weekPrimaryStats}
                </span>
              </div>
              {weekConfidenceHint ? (
                <p className="mt-2 text-xs leading-snug text-indigo-200/75">{weekConfidenceHint}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-indigo-600/30 bg-indigo-950/24 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-200/75">Focus</p>
              <p className="mt-1 text-xl font-extrabold tracking-tight text-indigo-50">{homeStory.focusText}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-indigo-200/75">Next move</p>
              <p className="mt-1 text-sm text-indigo-100/90 leading-snug">{homeStory.nextMove}</p>
              <div
                className={
                  hasActive ? "mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap" : "mt-4 grid grid-cols-2 gap-2"
                }
              >
                <Link
                  href={workouts.length === 0 ? "/coach" : "/coach/review"}
                  className={
                    hasActive
                      ? "rounded-xl border border-indigo-800/45 bg-zinc-950/80 px-3 py-2 text-center text-xs font-semibold text-indigo-200/75 transition hover:border-indigo-600/40 hover:bg-indigo-950/20 hover:text-indigo-100"
                      : "rounded-xl border border-indigo-300/35 bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-600 px-3 py-2 text-center text-sm font-bold text-white shadow-[0_6px_20px_-10px_rgba(129,140,248,0.7)] transition hover:brightness-105 active:translate-y-[1px]"
                  }
                >
                  {workouts.length === 0 ? "Open Coach" : "Coach review"}
                </Link>
                <Link
                  href="/assistant"
                  className={
                    hasActive
                      ? "rounded-xl border border-indigo-800/45 bg-zinc-950/80 px-3 py-2 text-center text-xs font-semibold text-indigo-200/75 transition hover:border-indigo-600/40 hover:bg-indigo-950/20 hover:text-indigo-100"
                      : "rounded-xl border border-indigo-700/35 bg-zinc-900/72 px-3 py-2 text-center text-sm font-semibold text-indigo-100/90 transition hover:bg-indigo-900/22 hover:border-indigo-500/35"
                  }
                >
                  Ask the Coach
                </Link>
              </div>
            </div>
          </div>
        </section>

        <Link
          href="/history"
          className={`${sectionCardClass} mb-6 block text-left transition hover:border-teal-600/45 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/45 active:scale-[0.99]`}
          aria-label="Open workout history"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/95">Recent activity</p>
            <span className="shrink-0 text-xs font-semibold text-teal-300/90">View history →</span>
          </div>
          {lastWorkout ? (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-home-tertiary">Last logged</p>
              <p className="mt-1.5 text-lg font-bold leading-snug tracking-tight text-white">
                {workoutDisplayName(lastWorkout)}
              </p>
              <p className="mt-1 text-sm text-home-secondary">{lastWorkoutAgo ?? "recently"}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-home-secondary">No sessions yet.</p>
          )}
        </Link>
      </div>
    </main>
  );
}