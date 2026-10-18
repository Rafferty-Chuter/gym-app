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
import { checkInsRepo, profileStore } from "@/lib/physique/io/repos";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { checkInWeekStart, isCheckInDue } from "@/lib/physique/judge";
import { addDays } from "@/lib/dates";
import { buildWeekReport, defaultReportWeek, reportWeekStart, type WeekReportInputs } from "@/lib/physique/weekReport";
import { howItsGoing, pulseWindows, trainedRecently } from "@/lib/physique/howItsGoing";
import type { Tone } from "@/lib/physique/weekScorecard";
import { STATUS_HEX } from "@/lib/ui/status";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { StatusDot } from "@/components/physique/ui";

const TONE_COLOR: Record<Tone, string> = { good: "var(--status-good)", watch: "var(--status-watch)", neutral: "var(--text-secondary)" };

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Home's "How it's going" (H1): the engine's verdict, then the last 7
 * days as one row per pillar (calories, protein, training, sleep), each
 * one number and one judgement, then the way into the weekly report. It
 * replaces the separate verdict card, the report line and the list of
 * missed days: Home says how things are going, not what was skipped.
 */
export default function HowItsGoing() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const analysis = usePhysiqueAnalysis(hydrated ? now : null, rawUnit === "lb" ? "lb" : "kg");
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
    const inputs: WeekReportInputs = { weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, workouts, program: data.program, goal: data.goal, sleepGoalH: p.sleepGoalH, weightUnit: "kg", expenditure: null };
    const { recentStart, foodStart } = pulseWindows(now.today);
    const rows = howItsGoing({ recent: buildWeekReport(inputs, recentStart, now), food: buildWeekReport(inputs, foodStart, now), trainedRecently: trainedRecently(workouts, now), strength });
    // The report link names the week it opens: last week while its review is due, else the default week.
    const due = isCheckInDue(data.goal, data.program, checkIns, now.today, p.checkInWeekday);
    const weekStart = due ? reportWeekStart(addDays(checkInWeekStart(now.today, p.checkInWeekday), -1)) : defaultReportWeek(now.today);
    return { rows, due, weekStart, weekEnd: addDays(weekStart, 6) };
  }, [hydrated, now, data, workouts, checkIns, profile, strength]);

  if (!analysis || !model) return <div className="h-[220px] rounded-[16px]" style={{ background: "var(--surface)" }} aria-hidden />;
  const v = analysis.verdict;
  return (
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

      {model.rows.length > 0 && (
        <div className="flex flex-col pb-1 pt-2.5">
          <span className="px-4 pb-1 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Last 7 days
          </span>
          <ul className="flex flex-col">
            {model.rows.map((r) => (
              <li key={r.id}>
                <Link href={r.href} className="flex min-h-[44px] items-center gap-3 px-4 py-2 transition-colors active:bg-[var(--surface-raised)]" aria-label={`${r.label}: ${r.value}, ${r.note}. Open`}>
                  <span className="w-[68px] shrink-0 text-[14px]" style={{ color: "var(--text-secondary)" }}>
                    {r.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {r.value}
                  </span>
                  <span className="shrink-0 text-right text-[13px] font-medium" style={{ color: TONE_COLOR[r.tone], fontVariantNumeric: "tabular-nums" }}>
                    {r.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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
  );
}
