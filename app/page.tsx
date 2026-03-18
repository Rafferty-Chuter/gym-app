 "use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
} from "@/lib/trainingAnalysis";

const TEMPLATES_STORAGE_KEY = "workoutTemplates";

function readTemplateNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => (t && typeof t === "object" && "name" in t ? String((t as { name: unknown }).name).trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export default function Home() {
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
  const [templateNames, setTemplateNames] = useState<string[]>([]);

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
      setTemplateNames(readTemplateNames());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
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

  function formatDateTime(isoString: string) {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function labelGroup(group: string) {
    const map: Record<string, string> = {
      chest: "Chest",
      back: "Back",
      legs: "Legs",
      shoulders: "Shoulders",
      arms: "Arms",
    };
    return map[group] ?? group;
  }

  function volumeLabel(sets: number): "Low" | "Moderate" | "High" {
    if (sets < 8) return "Low";
    if (sets <= 20) return "Moderate";
    return "High";
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
      (sum, w) => sum + (w.exercises?.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0) ?? 0),
      0
    );

    const entries = Object.entries(weeklyVolume).map(([group, sets]) => {
      const label = volumeLabel(sets);
      return { group, sets, label, text: `${labelGroup(group)} — ${label}` };
    });

    // Pick 2–3: the lowest, the highest, then a moderate (if distinct)
    const sortedAsc = [...entries].sort((a, b) => a.sets - b.sets);
    const sortedDesc = [...entries].sort((a, b) => b.sets - a.sets);
    const picked: string[] = [];
    if (sortedAsc[0]) picked.push(sortedAsc[0].text);
    if (sortedDesc[0] && sortedDesc[0].group !== sortedAsc[0]?.group) picked.push(sortedDesc[0].text);
    if (picked.length < 3) {
      const moderate = entries
        .filter((e) => e.label === "Moderate" && !picked.some((p) => p.startsWith(`${labelGroup(e.group)} —`)))
        .sort((a, b) => b.sets - a.sets)[0];
      if (moderate) picked.push(moderate.text);
    }

    return { workoutsCount, totalSets, volumeLabels: picked.slice(0, 3) };
  }, [workouts]);

  const recentWorkoutsPreview = useMemo(() => {
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    return sorted.slice(0, 2);
  }, [workouts]);

  const coachCardPreview = useMemo(() => {
    const recent = getWorkoutsFromLast7Days(workouts);
    if (workouts.length === 0) {
      return "Log a few sessions—then get feedback on volume and balance.";
    }
    if (recent.length === 0) {
      return "Nothing logged this week—Coach can still review your last block.";
    }
    const vol = getVolumeByMuscleGroup(recent);
    const entries = Object.entries(vol).filter(([, sets]) => sets > 0);
    const sortedLow = [...entries].sort((a, b) => a[1] - b[1]);
    const low = sortedLow[0];
    if (low && low[1] < 8) {
      return `${labelGroup(low[0])} is light this week—worth a focused check-in.`;
    }
    const total = recent.reduce(
      (s, w) => s + (w.exercises?.reduce((n, ex) => n + (ex.sets?.length ?? 0), 0) ?? 0),
      0
    );
    if (total >= 36) {
      return "High volume week—ask Coach about recovery and exercise order.";
    }
    return "Spot trends, gaps, and what to run next.";
  }, [workouts]);

  function formatShortAgo(isoString: string) {
    const ms = Date.now() - new Date(isoString).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    return `${Math.max(0, minutes)}m ago`;
  }

  const templatesPreview =
    templateNames.length === 0
      ? "No saved routines yet—create one for faster starts."
      : templateNames.length === 1
        ? `1 routine · ${templateNames[0]}`
        : `${templateNames.length} routines · ${templateNames[0]}, ${templateNames[1]}`;

  const cardClass =
    "block w-full rounded-2xl border border-zinc-600/50 bg-zinc-900 p-5 shadow-lg shadow-black/35 transition-all duration-150 ease-out will-change-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-black/45 hover:border-zinc-500/55 hover:scale-[1.01] active:scale-[0.99] text-left";

  const fabClass =
    "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--color-accent)] to-teal-600 text-[color:var(--color-accent-foreground)] shadow-[0_8px_32px_rgba(20,184,166,0.35),0_4px_16px_rgba(0,0,0,0.45)] ring-1 ring-white/15 transition-all duration-150 ease-out hover:scale-105 hover:shadow-[0_10px_40px_rgba(20,184,166,0.42)] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))]";

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function chipClass(text: string) {
    if (text.endsWith("— Low")) return "bg-red-500/10 border-red-500/20 text-red-200/90";
    if (text.endsWith("— High")) return "bg-amber-500/10 border-amber-500/20 text-amber-200/90";
    // Moderate
    return "bg-teal-500/10 border-teal-500/20 text-teal-200/90";
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <header className="mb-9">
          <p className="text-sm text-zinc-500/75">{greeting()}</p>
          <h1 className="text-4xl font-bold tracking-tight mt-2 leading-tight text-zinc-50">
            Ready to train?
          </h1>
          <p className="text-zinc-500/90 mt-2 text-sm">
            Pick up where you left off.
          </p>
        </header>

        <div className="relative isolate mb-4 mt-4">
          {/* Tighter, slightly upper-biased so nothing reads into the card row below */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[42%] z-0 h-8 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse min(72%, 220px) 14px at 50% 45%, rgba(16, 185, 129, 0.016) 0%, rgba(20, 184, 166, 0.006) 42%, transparent 52%)",
            }}
          />
          <Link
            href="/workout"
            className="relative z-10 block w-full rounded-2xl py-8 text-center text-lg font-bold tracking-tight text-white transition-all duration-150 ease-out will-change-transform overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-teal-600 shadow-[0_4px_0_0_rgba(6,95,70,0.5),0_14px_36px_-10px_rgba(20,184,166,0.38),0_18px_44px_-14px_rgba(16,185,129,0.22),0_10px_28px_rgba(0,0,0,0.45)] ring-1 ring-white/15 hover:shadow-[0_4px_0_0_rgba(6,95,70,0.45),0_16px_40px_-8px_rgba(20,184,166,0.42),0_22px_50px_-12px_rgba(16,185,129,0.26),0_12px_32px_rgba(0,0,0,0.5)] hover:scale-[1.02] hover:brightness-[1.05] active:translate-y-[2px] active:scale-[0.99] active:shadow-[0_2px_0_0_rgba(6,95,70,0.5),0_10px_26px_rgba(20,184,166,0.22)]"
          >
            Start Workout
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
          <section className="lg:col-span-2 rounded-2xl border border-zinc-600/50 bg-zinc-900 p-5 shadow-lg shadow-black/40 transition-all duration-150 ease-out will-change-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 hover:border-zinc-500/55">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-zinc-500/80">Last Workout</p>
                {lastWorkout ? (
                  <>
                    <p className="mt-1 text-lg font-semibold text-zinc-100 truncate">
                      {workoutDisplayName(lastWorkout)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatDateTime(lastWorkout.completedAt)}
                      {lastWorkoutAgo ? ` · ${lastWorkoutAgo}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
                    No sessions yet. Tap Start Workout above.
                  </p>
                )}
              </div>
              <Link
                href="/history"
                className="shrink-0 text-sm font-medium px-3 py-2 rounded-xl border border-zinc-600/60 bg-zinc-800/50 text-zinc-200 transition-all duration-150 ease-out hover:bg-zinc-800 hover:scale-[1.04] hover:border-zinc-500/50 active:scale-[0.98]"
              >
                History
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-600/50 bg-zinc-900 p-5 shadow-lg shadow-black/35 transition-all duration-150 ease-out will-change-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-black/45 hover:border-zinc-500/55">
            <p className="text-xs text-zinc-500/80 mb-2">Weekly stats</p>
            <div className="flex items-center justify-between text-sm text-zinc-300">
              <span>
                {thisWeek.workoutsCount} workout{thisWeek.workoutsCount !== 1 ? "s" : ""}
              </span>
              <span>{thisWeek.totalSets} sets</span>
            </div>
            {thisWeek.volumeLabels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {thisWeek.volumeLabels.map((t) => (
                  <span
                    key={t}
                    className={`text-xs px-2 py-1 rounded-full border ${chipClass(t)}`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <Link
              href="/volume"
              className="mt-3 inline-flex text-xs font-medium text-teal-400/90 hover:text-teal-300 transition-colors"
            >
              Volume detail →
            </Link>
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/templates" className={cardClass}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500/80">Templates</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-100">Routines</h2>
                <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{templatesPreview}</p>
              </div>
              <span className="shrink-0 text-zinc-600 text-sm pt-1" aria-hidden>
                →
              </span>
            </div>
          </Link>

          <Link href="/history" className={cardClass}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500/80">History</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-100">Past sessions</h2>
                {recentWorkoutsPreview.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500 leading-relaxed">No workouts logged yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm text-zinc-500">
                    {recentWorkoutsPreview.map((w) => (
                      <li key={w.completedAt + workoutDisplayName(w)} className="truncate">
                        <span className="text-zinc-300">{workoutDisplayName(w)}</span>
                        <span className="text-zinc-600"> · {formatShortAgo(w.completedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="shrink-0 text-zinc-600 text-sm pt-1" aria-hidden>
                →
              </span>
            </div>
          </Link>

          <div className="rounded-2xl border border-zinc-600/50 bg-zinc-900 shadow-lg shadow-black/35 transition-all duration-150 ease-out will-change-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-black/45 hover:border-zinc-500/55 hover:scale-[1.01] overflow-hidden">
            <Link
              href="/assistant"
              className="block p-5 text-left transition-colors hover:bg-zinc-800/25 active:bg-zinc-800/35"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500/80">Assistant</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-100">AI Coach</h2>
              <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{coachCardPreview}</p>
              <p className="mt-4 text-sm font-semibold text-teal-400/95">Ask a question →</p>
            </Link>
            <div className="border-t border-zinc-700/60 bg-zinc-950/40 px-5 py-3">
              <Link
                href="/coach"
                className="flex items-center justify-between gap-3 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <span>Weekly AI training report</span>
                <span className="text-zinc-600 shrink-0" aria-hidden>
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Link href="/assistant" className={fabClass} aria-label="Open assistant chat">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-6 w-6"
          aria-hidden
        >
          <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.498A22.065 22.065 0 0112 19.5c2.991 0 5.943.897 8.437 2.515l.17.107a.75.75 0 001.05-.497 4.47 4.47 0 002.433-3.984V10.65c0-2.244-1.682-4.238-4.04-4.434a53.366 53.366 0 00-8.42 0 4.407 4.407 0 00-1.032.211c-.114-1.866-1.483-3.478-3.405-3.727z" />
        </svg>
      </Link>
    </main>
  );
}