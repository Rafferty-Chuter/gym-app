"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useUnit } from "@/lib/unit-preference";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useRepo, useSingleton } from "@/lib/storage/useStored";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { bandsFor, emphasisedGroups } from "@/lib/training/volumeTargets";
import type { Phase } from "@/lib/training/progression";
import { rateBands } from "@/lib/physique/targets";
import { checkInsRepo, profileStore } from "@/lib/physique/io/repos";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { checkInWeekStart, isCheckInDue } from "@/lib/physique/judge";
import { addDays } from "@/lib/dates";
import { buildWeekReport, defaultReportWeek, reportWeekStart, type WeekReportInputs } from "@/lib/physique/weekReport";
import { howItsGoing, pulseWindows, trainedRecently } from "@/lib/physique/howItsGoing";
import { STATUS_HEX } from "@/lib/ui/status";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { StatusDot } from "@/components/physique/ui";
import { pulseChart } from "@/lib/physique/pulseCharts";
import PulseTile from "@/components/physique/PulseTile";

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Home's "How it's going" (H1, tailored in B3, tiles in H2): the engine's
 * verdict with the way into the weekly report, then the last 7 days as up
 * to six tiles chosen by the goal (a cut leads with the rate against plan,
 * a recomp with the waist, no goal with the health reads), each one
 * number, one judgement and the week behind it as a chart. Home says how
 * things are going, not what was skipped.
 */
export default function HowItsGoing() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const analysis = usePhysiqueAnalysis(hydrated ? now : null, unit);
  const priorities = useMusclePriorities();
  const data = useBodyData();
  const workouts = useWorkouts();
  const checkIns = useRepo(checkInsRepo);
  const profile = useSingleton(profileStore);
  const strength = analysis?.strength.status ?? null;
  const model = useMemo(() => {
    if (!hydrated || !now) return null;
    // The stored profile is a dependency so a changed goal or check-in day recomputes; the resolver fills defaults.
    void profile;
    const p = getPhysiqueProfileSync();
    const phase: Phase = data.goal?.type === "lose" ? "cut" : data.goal?.type === "gain" ? "lean_bulk" : "maintain";
    const inputs: WeekReportInputs = { weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, workouts, program: data.program, goal: data.goal, weightUnit: "kg", expenditure: null, waist: data.waist, steps: data.steps, volumeBands: bandsFor(priorities, phase), emphasised: emphasisedGroups(priorities) };
    const { recentStart, foodStart } = pulseWindows(now.today);
    const goal = data.goal && !data.goal.completedAt ? data.goal : null;
    const recent = buildWeekReport(inputs, recentStart, now);
    const food = buildWeekReport(inputs, foodStart, now);
    const rows = howItsGoing({ recent, food, trainedRecently: trainedRecently(workouts, now), strength, goalType: goal?.type ?? null, planRatePct: goal?.ratePctPerWeek ?? null, gainCeilingPct: goal?.type === "gain" ? rateBands(goal.trainingStatusAtCreation).gain.ceiling : null, unit });
    // The charts read the same two reports as the rows, so a chart never disagrees with its words.
    const tiles = rows.map((row) => ({ row, chart: pulseChart(row.id, { recent, food, waist: data.waist }) }));
    // The report link names the week it opens: last week while its review is due, else the default week.
    const due = isCheckInDue(data.goal, data.program, checkIns, now.today, p.checkInWeekday);
    const weekStart = due ? reportWeekStart(addDays(checkInWeekStart(now.today, p.checkInWeekday), -1)) : defaultReportWeek(now.today);
    return { tiles, due, weekStart, weekEnd: addDays(weekStart, 6) };
  }, [hydrated, now, data, workouts, checkIns, profile, strength, priorities, unit]);

  if (!analysis || !model) return <div className="h-[220px] rounded-[16px]" style={{ background: "var(--surface)" }} aria-hidden />;
  const v = analysis.verdict;
  return (
    <>
      <section aria-label="How it's going" className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
        <Link href="/body" className="flex flex-col gap-1 px-4 pb-3.5 pt-3.5 transition-colors active:bg-[var(--surface-raised)]" aria-label={`${v.title}. ${v.detail} Open Body`}>
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <StatusDot color={STATUS_HEX[analysis.status.state]} />
              <span className="truncate text-[17px] font-semibold" style={{ color: "var(--text)" }}>
                {v.title}
              </span>
            </span>
            <ChevronRight />
          </span>
          <span className="pl-4 text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {v.detail}
          </span>
        </Link>

        <Link href={model.due ? "/report" : `/report?week=${model.weekStart}`} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 transition-colors active:bg-[var(--surface-raised)]" aria-label={`Weekly report, ${shortLocalDate(model.weekStart)} to ${shortLocalDate(model.weekEnd)}${model.due ? ", ready" : ""}. Open`}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Weekly report
            </span>
            <span className="truncate text-[13px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {shortLocalDate(model.weekStart)} to {shortLocalDate(model.weekEnd)}
            </span>
            {model.due && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--green-dim)", color: "var(--green-strong)" }}>
                Ready
              </span>
            )}
          </span>
          <ChevronRight />
        </Link>
      </section>

      {model.tiles.length > 0 && (
        <section aria-label="Last 7 days" className="pt-6">
          <h2 className="px-1 pb-2.5 text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
            Last 7 days
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {model.tiles.map((t, i) => (
              <PulseTile key={t.row.id} row={t.row} chart={t.chart} wide={i === model.tiles.length - 1 && model.tiles.length % 2 === 1} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
