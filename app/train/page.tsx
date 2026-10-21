"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getStoredTemplates } from "@/lib/templateStorage";
import RoutineList from "@/components/training/RoutineList";
import { queueEmptyWorkout, workoutInProgress } from "@/lib/training/startWorkout";
import { loggedExercises } from "@/lib/training/exerciseHistory";
import { getHardSets } from "@/lib/completedSets";
import { localDateKey, addDays, type Now } from "@/lib/dates";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { useUnit } from "@/lib/unit-preference";
import { parseWeightText } from "@/lib/units";
import PageHeader from "@/components/ui/PageHeader";
import { Caption, Chevron, Row, RowGroup, SecondaryButton, StatusDot } from "@/components/physique/ui";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import { buildCoachStructuredAnalysis, EMPTY_COACH_STRUCTURED_ANALYSIS } from "@/lib/coachStructuredAnalysis";
import { bandsFor } from "@/lib/training/volumeTargets";
import { deloadLine, readDeload } from "@/lib/training/deload";
import { endDeload, useDeload } from "@/lib/physique/io/deload";
import type { Phase } from "@/lib/training/progression";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { goalStore } from "@/lib/physique/io/repos";
import { useSingleton } from "@/lib/storage/useStored";
import { buildIndicators, INDICATOR_DOT_COLOR } from "@/lib/trainSignals";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import type { PhysiqueAnalysis, StrengthStatus } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

/**
 * Train (TR3, after Hevy's Workout tab): start an empty workout or resume
 * one, every routine with its own Start, then the week, the deload, the
 * analysis rows, then History and Exercises.
 */
export default function TrainPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;
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
    for (const s of getHardSets(ex.sets)) {
      const kg = parseWeightText(s.weight, unit);
      const reps = Number(s.reps);
      if (kg != null && Number.isFinite(reps)) total += kg * reps;
    }
  }
  return total;
}

function setCount(w: StoredWorkout): number {
  return w.exercises.reduce((n, ex) => n + getHardSets(ex.sets).length, 0);
}

function TrainContent({ now }: { now: Now }) {
  const workouts = useWorkouts();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const [templates, setTemplates] = useState(() => getStoredTemplates());
  const [inProgress] = useState(() => workoutInProgress());
  const router = useRouter();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const priorities = useMusclePriorities();
  const physiqueGoal = useSingleton(goalStore);
  const phase: Phase = physiqueGoal?.type === "lose" ? "cut" : physiqueGoal?.type === "gain" ? "lean_bulk" : "maintain";
  const deloadRecord = useDeload();
  const deload = useMemo(
    () => readDeload({ workouts: [...workouts], unit, now, status: physiqueGoal?.trainingStatusAtCreation ?? "intermediate", record: deloadRecord }),
    [workouts, unit, now, physiqueGoal?.trainingStatusAtCreation, deloadRecord]
  );
  // Z3: no deload prompts. The row shows only while a deload runs; lighter weeks are also found from set counts.
  const deloadText = deload.state === "active" ? deloadLine(deload) : null;

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
    const latest = workouts.reduce<string | null>((m, w) => (m == null || w.completedAt > m ? w.completedAt : m), null);
    const weekSets = workouts.reduce((n, w) => {
      const d = workoutDay(w, now.tz);
      return d && d >= from && d <= today ? n + setCount(w) : n;
    }, 0);
    return { week, weekCount, weekVolume, latest, weekSets, total: workouts.length, exercises: loggedExercises(workouts).length };
  }, [workouts, now, unit]);

  // Strength is the physique engine's read since the phase began: the same one Body, Home and the report use (B2).
  const analysis = usePhysiqueAnalysis(now, unit);
  // Volume only once muscle priorities are set: before that there is no band to read sets against. Same rules as its page.
  const volume = useMemo(() => {
    if (!priorities) return null;
    const list = [...workouts]; // the rules take a mutable array; the store hands out a readonly one
    const coach = list.length === 0 ? EMPTY_COACH_STRUCTURED_ANALYSIS : buildCoachStructuredAnalysis(list, { focus, experienceLevel, goal, unit });
    return buildIndicators(coach, list, model.weekSets, model.weekCount, bandsFor(priorities, phase)).find((i) => i.key === "volume") ?? null;
  }, [workouts, focus, experienceLevel, goal, unit, model.weekSets, model.weekCount, priorities, phase]);

  const maxVol = Math.max(1, ...model.week.map((d) => d.volume));
  const fmtVol = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}k kg` : `${Math.round(kg)} kg`);

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        {/* No header plus (B2): "New routine" sits with the routines it makes. */}
        {/* The date, as on the other tabs: the week's count is in the panel below. */}
        <PageHeader caption={`Today · ${longLocalDate(now.today)}`} title="Train" />

        <button
          type="button"
          onClick={() => {
            if (!inProgress) queueEmptyWorkout();
            router.push("/workout");
          }}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] text-center text-[17px] font-semibold transition-colors duration-150 active:bg-[var(--primary-pressed)]"
          style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}
        >
          {!inProgress && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
          {inProgress ? "Resume workout" : "Start empty workout"}
        </button>

        {/* This week, how training is going and the deload: one panel with hairlines, not four boxes (polish). */}
        <section className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="This week">
          <div className="p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
                {model.weekCount} {model.weekCount === 1 ? "workout" : "workouts"}
              </span>
              <Caption>last 7 days · {fmtVol(model.weekVolume)} lifted</Caption>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {model.week.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1.5">
                  <div className="flex h-10 w-full items-end justify-center" aria-hidden>
                    <div className="w-3 rounded-[2px]" style={{ height: `${Math.max(d.volume > 0 ? 6 : 2, (d.volume / maxVol) * 40)}px`, background: d.volume > 0 ? "var(--chart-training)" : "var(--border)" }} />
                  </div>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: d.n > 0 ? "var(--primary)" : "var(--surface-raised)", color: d.n > 0 ? "var(--text-on-primary)" : "var(--text-tertiary)" }}>
                    {d.letter}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {analysis && <StrengthRow strength={analysis.strength} onOpen={() => router.push("/exercises")} />}
          {volume && (
            <Row
              label="Volume"
              sub={`Last 7 days · ${volume.context}`}
              value={
                <span className="flex items-center gap-2">
                  <StatusDot color={INDICATOR_DOT_COLOR[volume.state]} />
                  {volume.status}
                </span>
              }
              trailing={<Chevron />}
              onClick={() => router.push("/signal/volume")}
              ariaLabel={`Volume: ${volume.status}. ${volume.context} Open`}
            />
          )}
          {deloadText && (
            <div className="flex items-center justify-between gap-3 px-4 py-3" aria-label="Deload">
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px]" style={{ color: "var(--text)" }}>
                  {deloadText}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Trends skip this week.
                </span>
              </div>
              <SecondaryButton small onClick={() => void endDeload(now.today)}>
                End
              </SecondaryButton>
            </div>
          )}
        </section>

        <section aria-label="Your routines">
          <div className="mb-2 flex items-center justify-between">
            <Caption>Routines</Caption>
            {templates.length > 0 && (
              <Link href="/templates/new" className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                New routine ›
              </Link>
            )}
          </div>
          {templates.length > 0 ? (
            <RoutineList templates={templates} onChanged={() => setTemplates(getStoredTemplates())} />
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[16px] px-4 py-4" style={{ background: "var(--surface)" }}>
              <span className="text-[15px] font-semibold">No routines yet</span>
              <span className="-mt-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Save the exercises and sets you repeat, then start them in one tap.
              </span>
              <Link href="/templates/new" className="h-[36px] rounded-[10px] px-3 text-[13px] font-semibold leading-[36px]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                New routine
              </Link>
            </div>
          )}
        </section>

        <RowGroup>
          <Row
            label="History"
            sub={model.latest ? `Last on ${new Date(model.latest).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}` : "Workouts land here when you finish them"}
            value={`${model.total}`}
            trailing={<Chevron />}
            onClick={() => router.push("/history")}
            ariaLabel={`History, ${model.total} workouts. Open`}
          />
          <Row
            label="Exercises"
            sub="Charts, records and past sessions"
            value={`${model.exercises}`}
            trailing={<Chevron />}
            onClick={() => router.push("/exercises")}
            ariaLabel={`Exercises, ${model.exercises} logged. Open`}
          />
        </RowGroup>
      </div>
    </main>
  );
}

const STRENGTH_WORD: Record<StrengthStatus, { word: string; color: string }> = {
  rising: { word: "Rising", color: "var(--status-good)" },
  holding: { word: "Holding", color: "var(--status-good)" },
  "one-lift": { word: "One lift down", color: "var(--status-watch)" },
  dropping: { word: "Dropping", color: "var(--status-watch)" },
  unclear: { word: "Early read", color: "var(--text-tertiary)" },
};

/** Main lifts since the phase began, from the strength engine: the status, and the two biggest movers. Opens the exercise charts. */
function StrengthRow({ strength, onOpen }: { strength: PhysiqueAnalysis["strength"]; onOpen: () => void }) {
  const w = STRENGTH_WORD[strength.status];
  const moved = strength.lifts.filter((l) => l.changePct != null).sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
  const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)}%`;
  const sub = moved.length ? `Since your goal started · ${moved.slice(0, 2).map((l) => `${l.name} ${pct(l.changePct as number)}`).join(", ")}` : strength.baselineMissing ? "Since your goal started · no lifts logged before it to compare" : "Since your goal started · a few more sessions to read";
  return (
    <Row
      label="Strength"
      sub={sub}
      value={
        <span className="flex items-center gap-2">
          <StatusDot color={w.color} />
          {w.word}
        </span>
      }
      trailing={<Chevron />}
      onClick={onOpen}
      ariaLabel={`Strength: ${w.word}. ${sub}. Open the exercise charts`}
    />
  );
}
