"use client";

import { bandLabel, bandsFor, emphasisedGroups } from "@/lib/training/volumeTargets";
import type { Phase } from "@/lib/training/progression";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useSingleton } from "@/lib/storage/useStored";
import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { profileStore } from "@/lib/physique/io/repos";
import { buildWeekReport, defaultReportWeek, reportWeekStart, type WeekReport } from "@/lib/physique/weekReport";
import { signedKcal } from "@/lib/physique/food/energy";
import { formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { formatRate } from "@/components/physique/WeightChartCard";
import { Caption, Row, RowGroup } from "@/components/physique/ui";
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
import Scorecard from "@/components/report/Scorecard";
import { FIBRE_TARGET_G, coverageLine, scorecard } from "@/lib/physique/weekScorecard";
import { rateBands } from "@/lib/physique/targets";

/**
 * The weekly report (W1, W3, with G3's decision): the verdict, where the
 * goal is heading, up to three things to fix, the week's decision while
 * the review is due, the week in three reads, then every number folded
 * away. One weekly page; /review sends here.
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

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const dash = <span style={{ color: "var(--text-tertiary)" }}>–</span>;

function ReportContent({ now, unit }: { now: Now; unit: WeightUnit }) {
  const today = now.today;
  const data = useBodyData();
  const workouts = useWorkouts();
  const expenditure = useExpenditure(now);
  const analysis = usePhysiqueAnalysis(now, unit);
  const profile = useSingleton(profileStore);
  const priorities = useMusclePriorities();
  const phase: Phase = data.goal?.type === "lose" ? "cut" : data.goal?.type === "gain" ? "lean_bulk" : "maintain";
  const reviewModel = useReview(now, unit);
  const reviewWeek = reviewModel ? reportWeekStart(addDays(reviewModel.plan.weekStart, -1)) : null;
  const reviewDue = !!reviewModel && reviewModel.hasProgram && !reviewModel.reviewed;
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  // A saved or printed report shows every number.
  useEffect(() => {
    const open = () => {
      if (detailsRef.current) detailsRef.current.open = true;
    };
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);
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
      sleepGoalH: profile?.sleepGoalH,
      weightUnit: unit,
      volumeBands: bandsFor(priorities, phase),
      emphasised: emphasisedGroups(priorities),
      waist: data.waist,
      steps: data.steps,
      expenditure: expenditure?.series ?? null,
    }),
    [data, workouts, profile, unit, priorities, phase, expenditure]
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

  const caption = `${shortLocalDate(report.start)} to ${shortLocalDate(report.end)} · ${report.complete ? "complete" : `${report.daysCovered} of 7 days so far`}`;
  const w = (kg: number | null) => (kg == null ? dash : formatWeight(kg, unit));
  const kgDelta = (kg: number | null) => (kg == null ? dash : `${kg > 0 ? "+" : kg < 0 ? "−" : ""}${Math.abs(kgToDisplay(kg, unit)).toFixed(1)} ${unit}`);

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

        {report.hasData && <Scorecard tiles={tiles} />}

        {insight && report.hasData && <FixesCard fixes={insight.fixes} more={insight.more} goingWell={insight.goingWell} />}

        {reviewModel && start === reviewWeek && reviewModel.hasProgram && <ReviewDecision key={reviewModel.plan.weekStart} model={reviewModel} now={now} unit={unit} />}

        {!report.hasData && (
          <p className="rounded-[12px] px-4 py-3 text-[13px]" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
            {report.complete ? "Nothing was logged this week." : "Nothing logged this week yet."} Food, weigh-ins, nights and workouts show here as they are logged.
          </p>
        )}

        <details ref={detailsRef} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-[12px] px-4 py-3 [&::-webkit-details-marker]:hidden" style={{ background: "var(--surface)" }}>
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              All the numbers
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </summary>
          <div className="mt-5 flex flex-col gap-5">
          <section aria-label="Weight">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">Weight</span>
              <Caption>{report.weight.weighIns} of {report.daysCovered} days weighed</Caption>
            </div>
            <RowGroup>
              <Row label="Trend" value={report.weight.endTrendKg == null ? dash : `${w(report.weight.startTrendKg)} → ${w(report.weight.endTrendKg)}`} sub={report.weight.deltaKg == null ? "Needs weigh-ins on both ends of the week" : `${kgDelta(report.weight.deltaKg)} over the week`} />
              <Row label="Rate" value={report.weight.ratePctPerWeek == null ? dash : formatRate(report.weight.ratePctPerWeek)} sub={report.weight.rateWindowDays ? `Over the last ${report.weight.rateWindowDays} days` : "Early read · not enough weigh-ins for a rate"} />
              {report.waist.latestCm != null && <Row label="Waist" value={`${report.waist.latestCm.toFixed(1)} cm`} sub={report.waist.deltaCm == null ? `${report.waist.entries} of 4 weekly measures in the last 4 weeks` : `${report.waist.deltaCm > 0 ? "+" : report.waist.deltaCm < 0 ? "−" : ""}${Math.abs(report.waist.deltaCm).toFixed(1)} cm over ${report.waist.weeks} weeks`} />}
            </RowGroup>
          </section>

          <section aria-label="Energy">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">Energy</span>
              <Caption>{report.food.daysLogged} of {report.daysCovered} days logged</Caption>
            </div>
            <RowGroup>
              <Row label="Expenditure" value={report.expenditure.endKcal == null ? dash : `${n(report.expenditure.endKcal)} kcal`} sub={report.expenditure.deltaKcal == null ? "Needs food and weigh-ins on the same days" : report.expenditure.state === "holding" ? "Holding until logging resumes" : `${signedKcal(report.expenditure.deltaKcal)} kcal over the week`} />
              <Row label="Intake" value={report.food.meanKcal == null ? dash : `${n(report.food.meanKcal)} kcal`} sub={report.food.targetKcal == null ? "Average of logged days · no target set" : report.food.deltaKcal == null ? `Target ${n(report.food.targetKcal)} kcal` : `${signedKcal(report.food.deltaKcal)} vs the ${n(report.food.targetKcal)} kcal target, averaged over logged days`} />
              <Row label="Protein" value={report.food.meanProteinG == null ? dash : `${n(report.food.meanProteinG)} g`} sub={report.food.meanProteinG == null ? "No complete days" : `${report.food.proteinGPerKg != null ? `${report.food.proteinGPerKg.toFixed(1)} g/kg` : ""}${report.food.targetProteinG != null ? ` · target ${n(report.food.targetProteinG)} g` : ""}`} />
              <Row label="Fibre" value={report.food.meanFibreG == null ? dash : `${n(report.food.meanFibreG)} g`} sub={report.food.meanFibreG == null ? `Read on days where most foods carry a fibre value · ${report.food.fibreDays} so far` : `Target ${FIBRE_TARGET_G} g · ${report.food.fibreDays} days read`} />
              {(report.food.partial > 0 || report.food.fasting > 0) && <Row label="Day status" value={`${report.food.complete} complete`} sub={`${report.food.partial} partial · ${report.food.fasting} fasting`} />}
            </RowGroup>
          </section>

          <section aria-label="Training">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">Training</span>
              <Caption>{report.training.sessions} {report.training.sessions === 1 ? "session" : "sessions"} · {report.training.hardSets} hard sets</Caption>
            </div>
            {report.training.sessions === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                No sessions logged this week.
              </p>
            ) : (
              <RowGroup>
                {report.training.lifts.map((l) => {
                  // The change shown is the strength engine's, since the phase began; this week's best e1RM is the raw number.
                  const since = analysis?.strength.lifts.find((x) => x.name === l.name)?.changePct ?? null;
                  return <Row key={l.name} label={l.name} value={`${formatWeight(l.e1rmKg, unit)}`} sub={since == null ? "Best e1RM this week" : `Best e1RM this week · ${since > 0 ? "+" : since < 0 ? "−" : ""}${Math.abs(since).toFixed(1)} % since the phase began`} />;
                })}
                <div className="px-4 py-3">
                  <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
                    Hard sets by muscle
                  </span>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {report.training.byMuscle.map((m) => {
                      const max = report.training.byMuscle[0]?.sets ?? 1;
                      return (
                        <div key={m.group} className="flex items-center gap-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                          <span className="w-[88px] shrink-0 truncate" style={{ color: "var(--text-secondary)" }}>
                            {m.label}
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
                            <div className="h-full rounded-full" style={{ width: `${(m.sets / max) * 100}%`, background: "var(--text-secondary)" }} />
                          </div>
                          <span className="w-[72px] shrink-0 text-right" style={{ color: m.read === "over" ? "var(--status-attention)" : m.read === "under" ? "var(--status-watch)" : m.read === "in_range" ? "var(--status-good)" : "var(--text)" }}>
                            {m.sets}
                            {m.band ? <span style={{ color: "var(--text-tertiary)" }}>{` · ${bandLabel(m.band)}`}</span> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </RowGroup>
            )}
          </section>

          <section aria-label="Sleep">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">Sleep</span>
              <Caption>{report.sleep.nights} of {report.daysCovered} nights</Caption>
            </div>
            <RowGroup>
              <Row label="Average" value={report.sleep.meanH == null ? dash : formatHoursMin(report.sleep.meanH * 60)} sub={report.sleep.meanH == null ? "No nights logged" : `Goal ${formatHoursMin(report.sleep.goalH * 60)} · ${report.sleep.shortNights} short ${report.sleep.shortNights === 1 ? "night" : "nights"}`} />
            </RowGroup>
          </section>

          {(report.health.meanSteps != null || report.health.meanRhr != null) && (
            <section aria-label="Health">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[17px] font-semibold">Health</span>
                <Caption>From Apple Health</Caption>
              </div>
              <RowGroup>
                {report.health.meanSteps != null && <Row label="Steps" value={n(report.health.meanSteps)} sub={`A day, over ${report.health.stepDays} days`} />}
                {report.health.meanRhr != null && <Row label="Resting heart rate" value={`${report.health.meanRhr} bpm`} sub={report.health.usualRhr != null ? `Usually ${report.health.usualRhr} bpm` : `${report.health.rhrNights} nights`} />}
              </RowGroup>
            </section>
          )}
          </div>
        </details>

        <footer className="flex flex-col gap-3 pb-2">
          {report.hasData && (
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              Based on {coverageLine(report)}.
            </p>
          )}
          <Caption>Numbers and fixes come from the engine. Nothing here is a guess.</Caption>
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
