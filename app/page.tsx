"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
} from "@/lib/trainingAnalysis";
import { hasActiveWorkout } from "@/lib/activeWorkout";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus, TRAINING_FOCUS_OPTIONS, type TrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel, EXPERIENCE_LEVEL_OPTIONS, type ExperienceLevel } from "@/lib/experienceLevel";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
  const [templateNames, setTemplateNames] = useState<string[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasActive, setHasActive] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
      setTemplateNames(readTemplateNames());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
  }, []);

  useEffect(() => {
    if (hasMounted && pathname === "/") setHasActive(hasActiveWorkout());
  }, [hasMounted, pathname]);

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
    "block w-full rounded-2xl border border-teal-950/40 bg-gradient-to-br from-zinc-900 from-[42%] via-zinc-900 to-teal-950/35 p-5 shadow-lg shadow-black/50 transition-all duration-200 ease-out will-change-transform hover:-translate-y-0.5 hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.55),0_0_48px_-20px_rgba(45,212,191,0.14)] hover:border-teal-500/22 active:scale-[0.995] text-left group";

  const fabClass =
    "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--color-accent)] to-teal-500 text-[color:var(--color-accent-foreground)] shadow-[0_6px_28px_rgba(45,212,191,0.32),0_4px_18px_rgba(0,0,0,0.5)] ring-1 ring-teal-300/25 transition-all duration-150 ease-out hover:scale-[1.05] hover:shadow-[0_8px_36px_rgba(45,212,191,0.4),0_6px_20px_rgba(0,0,0,0.45)] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/55 bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))]";

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function chipClass(text: string) {
    if (text.endsWith("— Low"))
      return "bg-rose-500/16 border-rose-400/35 text-rose-100 shadow-sm shadow-rose-950/20";
    if (text.endsWith("— High"))
      return "bg-sky-500/16 border-sky-400/35 text-sky-100 shadow-sm shadow-sky-950/25";
    return "bg-emerald-500/15 border-emerald-400/32 text-emerald-100 shadow-sm shadow-emerald-950/20";
  }

  const heroCard =
    "lg:col-span-2 rounded-2xl border border-teal-950/40 bg-gradient-to-br from-zinc-900 from-[42%] to-teal-950/35 p-5 shadow-lg shadow-black/50 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.55),0_0_48px_-20px_rgba(45,212,191,0.12)] hover:border-teal-500/22";

  const statCard =
    "rounded-2xl border border-teal-950/40 bg-gradient-to-br from-zinc-900 from-[42%] to-cyan-950/30 p-5 shadow-lg shadow-black/50 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.55),0_0_48px_-20px_rgba(34,211,238,0.1)] hover:border-cyan-500/20";

  const coachShell =
    "rounded-2xl border border-teal-950/40 bg-gradient-to-br from-zinc-900 from-[38%] via-zinc-900 to-teal-950/38 shadow-lg shadow-black/50 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.55),0_0_48px_-20px_rgba(45,212,191,0.12)] hover:border-teal-500/22 overflow-hidden";

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_90%_45%_at_50%_-8%,rgba(45,212,191,0.09),transparent_58%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <header className="mb-7">
          <p className="text-sm text-home-tertiary">{greeting()}</p>
          <h1 className="text-4xl font-bold tracking-tight mt-1.5 leading-tight text-white">
            Ready to train?
          </h1>
          <p className="text-home-secondary mt-2 text-sm">Pick up where you left off.</p>
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

        <div className="relative isolate mb-5 mt-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-28 -translate-y-1/2 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 58% 75% at 50% 50%, rgba(52, 211, 153, 0.12) 0%, rgba(20, 184, 166, 0.06) 42%, transparent 68%)",
            }}
          />
          <Link
            href="/workout"
            className="relative z-10 block w-full rounded-2xl py-8 text-center text-lg font-bold tracking-tight text-white transition-all duration-150 ease-out will-change-transform overflow-hidden bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 shadow-[0_4px_0_0_rgba(6,95,70,0.55),0_16px_44px_-8px_rgba(34,197,94,0.35),0_22px_50px_-12px_rgba(20,184,166,0.28),0_10px_32px_rgba(0,0,0,0.48)] ring-1 ring-emerald-200/20 hover:shadow-[0_4px_0_0_rgba(6,95,70,0.48),0_20px_52px_-6px_rgba(52,211,153,0.38),0_28px_60px_-14px_rgba(20,184,166,0.3),0_12px_36px_rgba(0,0,0,0.52)] hover:scale-[1.02] hover:brightness-[1.04] active:translate-y-[2px] active:scale-[0.99]"
          >
            {hasMounted && hasActive ? "Resume Workout" : "Start Workout"}
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5 items-stretch">
          <section className={`${heroCard} flex flex-col min-h-[8rem]`}>
            <div className="flex flex-1 items-start justify-between gap-4">
              <div className="min-w-0 flex flex-col">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">
                  Last session
                </p>
                {lastWorkout ? (
                  <>
                    <p className="mt-1.5 text-lg font-bold text-white truncate">
                      {workoutDisplayName(lastWorkout)}
                    </p>
                    <p className="mt-auto pt-2 text-sm text-home-secondary">
                      {formatDateTime(lastWorkout.completedAt)}
                      {lastWorkoutAgo ? ` · ${lastWorkoutAgo}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-home-secondary leading-relaxed flex-1">
                    No sessions yet. Tap Start Workout above.
                  </p>
                )}
              </div>
              <Link
                href="/history"
                className="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border border-teal-800/35 bg-teal-950/25 text-home-secondary transition-all duration-150 hover:border-teal-500/30 hover:bg-teal-950/40 hover:text-teal-200 active:scale-[0.98]"
              >
                History
              </Link>
            </div>
          </section>

          <section className={`${statCard} flex flex-col min-h-[8rem]`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary mb-1.5">
              Weekly stats
            </p>
            <div className="flex items-baseline justify-between gap-2 text-sm font-medium text-home-secondary">
              <span>
                {thisWeek.workoutsCount} workout{thisWeek.workoutsCount !== 1 ? "s" : ""}
              </span>
              <span className="tabular-nums text-home-meta">{thisWeek.totalSets} sets</span>
            </div>
            {thisWeek.volumeLabels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {thisWeek.volumeLabels.map((t) => (
                  <span
                    key={t}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${chipClass(t)}`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-auto pt-3">
              <Link href="/volume" className="link-home-accent text-xs inline-flex">
                Volume detail →
              </Link>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/templates" className={cardClass}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">
                  Templates
                </p>
                <h2 className="mt-1.5 text-lg font-bold text-white">Routines</h2>
                <p className="mt-2 text-sm text-home-secondary leading-relaxed">{templatesPreview}</p>
              </div>
              <span
                className="shrink-0 text-teal-500/45 group-hover:text-teal-400/70 text-sm pt-1 transition-colors"
                aria-hidden
              >
                →
              </span>
            </div>
          </Link>

          <Link href="/history" className={cardClass}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">
                  History
                </p>
                <h2 className="mt-1.5 text-lg font-bold text-white">Past sessions</h2>
                {recentWorkoutsPreview.length === 0 ? (
                  <p className="mt-2 text-sm text-home-secondary leading-relaxed">
                    No workouts logged yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {recentWorkoutsPreview.map((w) => (
                      <li key={w.completedAt + workoutDisplayName(w)} className="truncate">
                        <span className="text-white font-medium">{workoutDisplayName(w)}</span>
                        <span className="text-home-meta"> · {formatShortAgo(w.completedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span
                className="shrink-0 text-teal-500/45 group-hover:text-teal-400/70 text-sm pt-1 transition-colors"
                aria-hidden
              >
                →
              </span>
            </div>
          </Link>

          <div className={coachShell}>
            <Link
              href="/assistant"
              className="block p-5 text-left transition-colors hover:bg-teal-950/15 active:bg-teal-950/25"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">
                Assistant
              </p>
              <h2 className="mt-1.5 text-lg font-bold text-white">AI Coach</h2>
              <p className="mt-2 text-sm text-home-secondary leading-relaxed">{coachCardPreview}</p>
              <p className="mt-4 text-sm link-home-accent">Ask a question →</p>
            </Link>
            <div className="border-t border-teal-950/50 bg-gradient-to-r from-zinc-950/60 via-teal-950/10 to-zinc-950/60 px-5 py-3">
              <Link
                href="/coach"
                className="group/coachrow flex items-center justify-between gap-3 text-sm text-home-secondary transition-colors duration-150 hover:text-teal-300"
              >
                <span>Weekly AI training report</span>
                <span
                  className="text-teal-500/45 shrink-0 transition-colors group-hover/coachrow:text-teal-400/85"
                  aria-hidden
                >
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