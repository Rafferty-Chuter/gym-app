"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { buildWeekReport, defaultReportWeek } from "@/lib/physique/weekReport";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";

/**
 * Home's one-line entry to the weekly report (Sprint 0, W1): which week,
 * and how many gaps it has. States the count; never nudges.
 */
export default function WeekReportLine() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const workouts = useWorkouts();
  const model = useMemo(() => {
    if (!hydrated || !now) return null;
    const start = defaultReportWeek(now.today);
    const r = buildWeekReport({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, workouts, program: data.program, goal: data.goal, weightUnit: "kg", expenditure: null }, start, now);
    return { start, end: r.end, complete: r.complete, gaps: r.gaps.length, days: r.daysCovered, hasData: r.hasData };
  }, [hydrated, now, data, workouts]);
  if (!model) return <div className="h-[44px] rounded-[12px]" style={{ background: "#141416" }} aria-hidden />;
  const gapWord = !model.hasData ? "nothing logged yet" : model.gaps === 0 ? "nothing missing" : `${model.gaps} ${model.gaps === 1 ? "gap" : "gaps"}`;
  return (
    <Link href={`/report?week=${model.start}`} className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 transition-colors active:bg-[#1d1d20]" style={{ background: "#141416" }} aria-label={`Week report ${shortLocalDate(model.start)} to ${shortLocalDate(model.end)}, ${gapWord}. Open`}>
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
          Week report
        </span>
        <span className="text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
          {shortLocalDate(model.start)} to {shortLocalDate(model.end)} · {model.complete ? "complete" : `${model.days} of 7 days`} · {gapWord}
        </span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
