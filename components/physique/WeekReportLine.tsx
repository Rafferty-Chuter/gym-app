"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useRepo, useSingleton } from "@/lib/storage/useStored";
import { checkInsRepo, profileStore } from "@/lib/physique/io/repos";
import { checkInWeekStart, isCheckInDue } from "@/lib/physique/judge";
import { addDays } from "@/lib/dates";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { buildWeekReport, defaultReportWeek, reportWeekStart } from "@/lib/physique/weekReport";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";

/**
 * Home's one-line entry to the weekly report (W1, W3): which week, and how
 * many gaps it has, with "Review ready" while the week's decision is due.
 * States the count; never nudges.
 */
export default function WeekReportLine() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const workouts = useWorkouts();
  const checkIns = useRepo(checkInsRepo);
  const profile = useSingleton(profileStore);
  const model = useMemo(() => {
    if (!hydrated || !now) return null;
    // The stored profile is a dependency so a changed check-in day recomputes; the resolver fills defaults.
    void profile;
    const weekday = getPhysiqueProfileSync().checkInWeekday;
    const due = isCheckInDue(data.goal, data.program, checkIns, now.today, weekday);
    // While the review is due, the line names the week it covers, which is where the report opens.
    const start = due ? reportWeekStart(addDays(checkInWeekStart(now.today, weekday), -1)) : defaultReportWeek(now.today);
    const r = buildWeekReport({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, workouts, program: data.program, goal: data.goal, weightUnit: "kg", expenditure: null }, start, now);
    return { start, end: r.end, complete: r.complete, gaps: r.gaps.length, days: r.daysCovered, hasData: r.hasData, due };
  }, [hydrated, now, data, workouts, checkIns, profile]);
  if (!model) return <div className="h-[44px] rounded-[12px]" style={{ background: "#141416" }} aria-hidden />;
  const gapWord = !model.hasData ? "nothing logged yet" : model.gaps === 0 ? "nothing missing" : `${model.gaps} ${model.gaps === 1 ? "gap" : "gaps"}`;
  return (
    <Link href={model.due ? "/report" : `/report?week=${model.start}`} className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 transition-colors active:bg-[#1d1d20]" style={{ background: "#141416" }} aria-label={`Week report ${shortLocalDate(model.start)} to ${shortLocalDate(model.end)}, ${gapWord}. Open`}>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
            Weekly report
          </span>
          {model.due && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "#1d1d20", color: "#a3a3a8" }}>
              Review ready
            </span>
          )}
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
