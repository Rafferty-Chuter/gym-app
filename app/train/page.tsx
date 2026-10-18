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
import { getHardSets } from "@/lib/completedSets";
import { localDateKey, addDays, type Now } from "@/lib/dates";
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
import { endDeload, startDeload, useDeload } from "@/lib/physique/io/deload";
import type { Phase } from "@/lib/training/progression";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { goalStore } from "@/lib/physique/io/repos";
import { useSingleton } from "@/lib/storage/useStored";
import { buildIndicators, INDICATOR_DOT_COLOR, INDICATOR_WINDOW_LABEL } from "@/lib/trainSignals";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

/**
 * Train (TR3, after Hevy's Workout tab): start an empty workout or resume
 * one, every routine with its own Start, then the week, the deload, the
 * analysis rows and one row into History.
 */
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
  const deloadText = deloadLine(deload);

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
    return { week, weekCount, weekVolume, latest, weekSets, total: workouts.length };
  }, [workouts, now, unit]);

  // The three training reads (plateau, volume, progress), from the same rules as their signal pages.
  const indicators = useMemo(() => {
    const list = [...workouts]; // the rules take a mutable array; the store hands out a readonly one
    const coach = list.length === 0 ? EMPTY_COACH_STRUCTURED_ANALYSIS : buildCoachStructuredAnalysis(list, { focus, experienceLevel, goal, unit });
    return buildIndicators(coach, list, model.weekSets, model.weekCount, bandsFor(priorities, phase));
  }, [workouts, focus, experienceLevel, goal, unit, model.weekSets, model.weekCount, priorities, phase]);

  const maxVol = Math.max(1, ...model.week.map((d) => d.volume));
  const fmtVol = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}k kg` : `${Math.round(kg)} kg`);

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={`${model.weekCount} ${model.weekCount === 1 ? "workout" : "workouts"} · last 7 days`} title="Train" action={{ label: "New routine", href: "/templates/new" }} />

        <button
          type="button"
          onClick={() => {
            if (!inProgress) queueEmptyWorkout();
            router.push("/workout");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] py-3.5 text-center text-[15px] font-semibold transition-colors duration-150 active:bg-[#26262a]"
          style={inProgress ? { background: "#f2f2f0", color: "#0a0a0b" } : { background: "#1d1d20", color: "#f2f2f0" }}
        >
          {inProgress ? "Resume workout" : "+ Start empty workout"}
        </button>

        <section aria-label="Your routines">
          <div className="mb-2 flex items-center justify-between">
            <Caption>Routines</Caption>
            <Link href="/templates/new" className="text-[12px] font-medium" style={{ color: "#a3a3a8" }}>
              New routine ›
            </Link>
          </div>
          {templates.length > 0 ? (
            <RoutineList templates={templates} onChanged={() => setTemplates(getStoredTemplates())} />
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[12px] px-4 py-4" style={{ background: "#141416" }}>
              <span className="text-[15px] font-semibold">No routines yet</span>
              <span className="-mt-2 text-[13px]" style={{ color: "#a3a3a8" }}>
                Save the exercises and sets you repeat, then start them in one tap.
              </span>
              <Link href="/templates/new" className="h-[36px] rounded-[10px] px-3 text-[13px] font-semibold leading-[36px]" style={{ background: "#1d1d20", color: "#f2f2f0" }}>
                New routine
              </Link>
            </div>
          )}
        </section>

        {deloadText && (
          <section className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3" style={{ background: "#141416" }} aria-label="Deload">
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px]" style={{ color: "#f2f2f0" }}>
                {deloadText}
              </span>
              <span className="text-[11px]" style={{ color: "#6f6f76" }}>
                {deload.state === "active" ? "Half the sets, loads 10 % lighter, four in reserve. Trends skip this week." : "A week at half the sets and lighter loads, then the block restarts."}
              </span>
            </div>
            <SecondaryButton small onClick={() => void (deload.state === "active" ? endDeload(now.today) : startDeload(now.today, deload.state === "due" ? deload.reason : "manual", new Date().toISOString()))}>
              {deload.state === "active" ? "End" : "Start"}
            </SecondaryButton>
          </section>
        )}

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

        <section aria-label="Analysis">
          <div className="mb-2">
            <Caption>Analysis</Caption>
          </div>
          <RowGroup>
            {indicators.map((ind) => (
              <Row
                key={ind.key}
                label={ind.label}
                sub={`${INDICATOR_WINDOW_LABEL[ind.key]} · ${ind.context}`}
                value={
                  <span className="flex items-center gap-2">
                    <StatusDot color={INDICATOR_DOT_COLOR[ind.state]} />
                    {ind.status}
                  </span>
                }
                trailing={<Chevron />}
                onClick={() => router.push(`/signal/${ind.key}`)}
                ariaLabel={`${ind.label}: ${ind.status}. ${ind.context} Open`}
              />
            ))}
          </RowGroup>
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
        </RowGroup>
      </div>
    </main>
  );
}
