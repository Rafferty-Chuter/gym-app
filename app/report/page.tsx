"use client";

import { bandsFor, emphasisedGroups } from "@/lib/training/volumeTargets";
import type { Phase } from "@/lib/training/progression";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { buildWeekReport, defaultReportWeek, reportWeekStart, type WeekReport } from "@/lib/physique/weekReport";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import { goalEta } from "@/lib/physique/goalEta";
import { goalProgress } from "@/lib/physique/goalProgress";
import { phasePlan } from "@/lib/physique/phasePlan";
import { recoveryRead } from "@/lib/physique/recovery";
import { buildWeeklyInsight } from "@/lib/physique/weeklyInsight";
import { useReview } from "@/lib/physique/io/review";
import { useDeload } from "@/lib/physique/io/deload";
import { readDeload } from "@/lib/training/deload";
import ReviewDecision from "@/components/report/ReviewDecision";
import { FixesCard, SummaryCard } from "@/components/report/InsightCards";
import ReportSections from "@/components/report/ReportSections";
import LinkedReasonsCard from "@/components/report/LinkedReasons";
import { linkedReasons } from "@/lib/physique/linkedReasons";
import { coverageLine, scorecard } from "@/lib/physique/weekScorecard";
import { rateBands } from "@/lib/physique/targets";

/**
 * The weekly report (W1, W3, W6, with G3's decision): where the goal is
 * heading, what is behind it, then the week's numbers as a report (body
 * weight first, its change as a share of body weight, then nutrition,
 * training, sleep and recovery, each against last week), up to three
 * things to fix, and the week's decision while the review is due. One
 * weekly page; /review sends here. Nothing is folded away, so a saved PDF
 * is the whole report.
 */
export default function ReportPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;
  return <ReportContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function weekFromQuery(): LocalDate | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("week");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? reportWeekStart(v) : null;
}


function ReportContent({ now, unit }: { now: Now; unit: WeightUnit }) {
  const today = now.today;
  const data = useBodyData();
  const workouts = useWorkouts();
  const expenditure = useExpenditure(now);
  const analysis = usePhysiqueAnalysis(now, unit);
  const priorities = useMusclePriorities();
  const phase: Phase = data.goal?.type === "lose" ? "cut" : data.goal?.type === "gain" ? "lean_bulk" : "maintain";
  const reviewModel = useReview(now, unit);
  const reviewWeek = reviewModel ? reportWeekStart(addDays(reviewModel.plan.weekStart, -1)) : null;
  const reviewDue = !!reviewModel && reviewModel.hasProgram && !reviewModel.reviewed;
  const [start, setStart] = useState<LocalDate>(() => weekFromQuery() ?? (reviewDue && reviewWeek ? reviewWeek : defaultReportWeek(today)));
  const thisWeek = reportWeekStart(today);
  const deloadRecord = useDeload();

  const reportInputs = useMemo(
    () => ({
      weighIns: data.weighIns,
      foodEntries: data.foodEntries,
      dayFlags: data.dayFlags,
      sleepNights: data.sleepNights,
      workouts,
      program: data.program,
      goal: data.goal,
      weightUnit: unit,
      volumeBands: bandsFor(priorities, phase),
      emphasised: emphasisedGroups(priorities),
      waist: data.waist,
      steps: data.steps,
      expenditure: expenditure?.series ?? null,
    }),
    [data, workouts, unit, priorities, phase, expenditure]
  );
  const report: WeekReport = useMemo(
    () => buildWeekReport({ ...reportInputs, verdict: start === thisWeek && analysis ? { title: analysis.verdict.title, detail: analysis.verdict.detail, state: analysis.status.state } : null }, start, now),
    [reportInputs, analysis, start, thisWeek, now]
  );
  // Last week, for "vs last week" on the scorecard.
  const prevReport: WeekReport = useMemo(() => buildWeekReport(reportInputs, addDays(start, -7), now), [reportInputs, start, now]);
  const activeGoal = data.goal && !data.goal.completedAt ? data.goal : null;
  const tiles = useMemo(
    () => scorecard({ report, prev: prevReport.hasData ? prevReport : null, unit, goalType: activeGoal?.type ?? null, strength: analysis?.strength ?? null, planRatePct: activeGoal?.ratePctPerWeek ?? null, gainCeilingPct: activeGoal?.type === "gain" ? rateBands(activeGoal.trainingStatusAtCreation).gain.ceiling : null }),
    [report, prevReport, unit, activeGoal, analysis]
  );

  const plannedSessions = useMemo(() => {
    const n = Number(loadOnboardingProfile()?.daysPerWeek);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, []);
  const insight = useMemo(() => {
    if (!analysis) return null;
    const eta = goalEta(data.goal, data.weighIns, data.dayFlags, today);
    const plan = phasePlan(data.goal, goalProgress(data.goal, data.weighIns, today), eta, today);
    const deload = readDeload({ workouts: [...workouts], unit, now, status: data.goal?.trainingStatusAtCreation ?? "intermediate", record: deloadRecord });
    const sleepShort = analysis.sleep.status === "short" || analysis.sleep.status === "severe";
    const recovery = recoveryRead(data.sleepNights, today, sleepShort);
    const fmt = { kg: (kg: number) => formatWeight(kg, unit), date: (d: LocalDate) => shortLocalDate(d) };
    // On the review's week, a pending decision that starts the deload already says so.
    const decisionDeload = reviewModel && start === reviewWeek && !reviewModel.reviewed && reviewModel.review.decision.kind === "accept" && reviewModel.review.decision.changes.some((c) => c.kind === "deload");
    const out = buildWeeklyInsight({ report, analysis, goal: data.goal, eta, plan, deload, recovery: recovery.status === "none" ? null : recovery, plannedSessions, today, fmt, exclude: decisionDeload ? ["deload"] : [] });
    return out;
  }, [analysis, data, workouts, unit, now, today, deloadRecord, report, plannedSessions, reviewModel, start, reviewWeek]);

  // W5: what happened tied to why. Lifts and recovery read as of today, so only this week and last week carry them.
  const links = useMemo(() => {
    if (!analysis || !report.hasData) return [];
    const sleepShort = analysis.sleep.status === "short" || analysis.sleep.status === "severe";
    const recovery = recoveryRead(data.sleepNights, today, sleepShort);
    return linkedReasons({
      report,
      prev: prevReport.hasData ? prevReport : null,
      analysis,
      goal: activeGoal,
      recovery: recovery.status === "none" ? null : recovery,
      plannedSessions,
      kg: (x: number) => formatWeight(x, unit, 1),
      current: dayDiff(report.end, today) <= 7,
    });
  }, [analysis, report, prevReport, data.sleepNights, today, activeGoal, plannedSessions, unit]);

  // The strength engine's change since the phase began, per lift, for the training rows.
  const sincePhase = useMemo(() => new Map((analysis?.strength.lifts ?? []).map((l) => [l.name, l.changePct ?? null] as const)), [analysis]);

  const caption = `${shortLocalDate(report.start)} to ${shortLocalDate(report.end)} · ${report.complete ? "complete" : `${report.daysCovered} of 7 days so far`}`;

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <header className="sticky top-0 z-30 -mx-5 px-5 pb-3 pt-4 sm:-mx-6 sm:px-6" style={{ background: "var(--page-bg)" }}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="block truncate text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
                {caption}
              </span>
              <h1 className="mt-0.5 text-[34px] font-semibold leading-none tracking-[-0.02em]">Weekly report</h1>
            </div>
            <div data-no-print className="flex shrink-0 items-center gap-1 pb-0.5">
              <button type="button" onClick={() => setStart(addDays(start, -7))} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Previous week">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" onClick={() => setStart(addDays(start, 7))} disabled={start >= thisWeek} className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Next week">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <SummaryCard verdict={report.verdict} heading={insight?.heading ?? null} />

        <LinkedReasonsCard links={links} />

        {report.hasData && <ReportSections report={report} prev={prevReport.hasData ? prevReport : null} tiles={tiles} unit={unit} goal={activeGoal} sincePhase={sincePhase} />}

        {insight && report.hasData && <FixesCard fixes={insight.fixes} more={insight.more} goingWell={insight.goingWell} />}

        {reviewModel && start === reviewWeek && reviewModel.hasProgram && <ReviewDecision key={reviewModel.plan.weekStart} model={reviewModel} now={now} unit={unit} />}

        {!report.hasData && (
          <p className="rounded-[16px] px-4 py-3 text-[13px]" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
            {report.complete ? "Nothing was logged this week." : "Nothing logged this week yet."} Food, weigh-ins, nights and workouts show here as they are logged.
          </p>
        )}

        <footer className="flex flex-col gap-3 pb-2">
          {report.hasData && (
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              Based on {coverageLine(report)}.
            </p>
          )}
          {report.hasData && (
            <button type="button" data-no-print onClick={() => window.print()} className="h-[44px] w-full rounded-[12px] text-[15px] font-semibold transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
              Save as PDF
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}
