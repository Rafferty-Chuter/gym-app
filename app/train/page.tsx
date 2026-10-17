"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getStoredTemplates } from "@/lib/templateStorage";
import { getCompletedLoggedSets } from "@/lib/completedSets";
import { localDateKey, addDays, type Now } from "@/lib/dates";
import { useUnit } from "@/lib/unit-preference";
import { parseWeightText } from "@/lib/units";
import PageHeader from "@/components/ui/PageHeader";
import { Caption } from "@/components/physique/ui";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

/** Hevy's home, in our language: Start workout, latest routines, the week, volume, and the recent feed. */
export default function TrainPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "#0a0a0b" }} />;
  return <TrainContent now={now} />;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function workoutDay(w: StoredWorkout, tz: string): string | null {
  const d = new Date(w.completedAt);
  return Number.isNaN(d.getTime()) ? null : localDateKey(d, tz);
}

function volumeKg(w: StoredWorkout, unit: "kg" | "lb"): number {
  let total = 0;
  for (const ex of w.exercises) {
    for (const s of getCompletedLoggedSets(ex.sets)) {
      const kg = parseWeightText(s.weight, unit);
      const reps = Number(s.reps);
      if (kg != null && Number.isFinite(reps)) total += kg * reps;
    }
  }
  return total;
}

function setCount(w: StoredWorkout): number {
  return w.exercises.reduce((n, ex) => n + getCompletedLoggedSets(ex.sets).length, 0);
}

function formatDuration(sec: number | undefined): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
}

function TrainContent({ now }: { now: Now }) {
  const workouts = useWorkouts();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const templates = useMemo(() => getStoredTemplates().slice(0, 4), []);

  const model = useMemo(() => {
    const today = now.today;
    const from = addDays(today, -6);
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    const byDay = new Map<string, { n: number; volume: number }>();
    for (const w of workouts) {
      const d = workoutDay(w, now.tz);
      if (!d || d < from || d > today) continue;
      const cur = byDay.get(d) ?? { n: 0, volume: 0 };
      cur.n += 1;
      cur.volume += volumeKg(w, unit);
      byDay.set(d, cur);
    }
    const week = days.map((d) => ({ date: d, letter: DAY_LETTERS[new Date(`${d}T00:00:00Z`).getUTCDay()], n: byDay.get(d)?.n ?? 0, volume: byDay.get(d)?.volume ?? 0 }));
    const weekCount = week.reduce((n, d) => n + d.n, 0);
    const weekVolume = week.reduce((n, d) => n + d.volume, 0);
    const recent = [...workouts].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)).slice(0, 5);
    return { week, weekCount, weekVolume, recent };
  }, [workouts, now, unit]);

  const maxVol = Math.max(1, ...model.week.map((d) => d.volume));
  const fmtVol = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}k kg` : `${Math.round(kg)} kg`);

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={`${model.weekCount} ${model.weekCount === 1 ? "workout" : "workouts"} · last 7 days`} title="Train" />

        <Link
          href="/workout/start"
          className="block w-full rounded-[12px] py-4 text-center text-[17px] font-semibold tracking-[-0.01em] transition-colors duration-150 hover:bg-white active:translate-y-[1px]"
          style={{ background: "#f2f2f0", color: "#0a0a0b" }}
        >
          Start workout
        </Link>

        <section aria-label="Routines">
          <div className="mb-2 flex items-center justify-between">
            <Caption>Latest routines</Caption>
            <Link href="/templates" className="text-[12px] font-medium" style={{ color: "#a3a3a8" }}>
              All templates ›
            </Link>
          </div>
          {templates.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {templates.map((t) => (
                <Link key={t.id} href={`/templates/${t.id}`} className="flex min-h-[72px] flex-col justify-between rounded-[12px] px-3 py-2.5 transition-colors active:bg-[#1d1d20]" style={{ background: "#141416", border: "1px solid #2a2a2e" }}>
                  <span className="truncate text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>{t.name}</span>
                  <span className="text-[11px]" style={{ color: "#6f6f76" }}>
                    {t.exercises.length} {t.exercises.length === 1 ? "exercise" : "exercises"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Link href="/templates/new" className="block rounded-[12px] px-4 py-3 text-[13px]" style={{ background: "#141416", color: "#a3a3a8" }}>
              No routines yet. Build one ›
            </Link>
          )}
        </section>

        <section className="rounded-[12px] p-4" style={{ background: "#141416" }} aria-label="This week">
          <div className="flex items-baseline justify-between">
            <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
              {model.weekCount} {model.weekCount === 1 ? "workout" : "workouts"}
            </span>
            <Caption>last 7 days · {fmtVol(model.weekVolume)}</Caption>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {model.week.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <div className="flex h-10 w-full items-end justify-center" aria-hidden>
                  <div className="w-3 rounded-[2px]" style={{ height: `${Math.max(d.volume > 0 ? 6 : 2, (d.volume / maxVol) * 40)}px`, background: d.volume > 0 ? "#f2f2f0" : "#2a2a2e" }} />
                </div>
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: d.n > 0 ? "#f2f2f0" : "#1d1d20", color: d.n > 0 ? "#0a0a0b" : "#6f6f76" }}>
                  {d.letter}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Recent workouts">
          <div className="mb-2 flex items-center justify-between">
            <Caption>Recent</Caption>
            <Link href="/history" className="text-[12px] font-medium" style={{ color: "#a3a3a8" }}>
              All history ›
            </Link>
          </div>
          {model.recent.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {model.recent.map((w) => {
                const dur = formatDuration(w.durationSec);
                const vol = volumeKg(w, unit);
                const sets = setCount(w);
                const d = new Date(w.completedAt);
                return (
                  <li key={w.completedAt} className="rounded-[12px] px-4 py-3" style={{ background: "#141416" }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>{w.name?.trim() || "Workout"}</span>
                      <span className="shrink-0 text-[11px]" style={{ color: "#6f6f76" }}>
                        {Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-4 text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                      {dur && <span>{dur}</span>}
                      <span>{fmtVol(vol)}</span>
                      <span>{sets} sets</span>
                    </div>
                    <ul className="mt-2 flex flex-col gap-0.5">
                      {w.exercises.slice(0, 3).map((ex, i) => (
                        <li key={i} className="text-[13px]" style={{ color: "#a3a3a8" }}>
                          {getCompletedLoggedSets(ex.sets).length} × {ex.name}
                        </li>
                      ))}
                      {w.exercises.length > 3 && (
                        <li className="text-[12px]" style={{ color: "#6f6f76" }}>
                          {w.exercises.length - 3} more
                        </li>
                      )}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
              No workouts logged yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
