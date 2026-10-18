"use client";

import { bandLabel, bandsFor } from "@/lib/training/volumeTargets";
import type { Phase } from "@/lib/training/progression";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { useMemo, useState } from "react";
import Link from "next/link";
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
import { buildWeekReport, defaultReportWeek, reportWeekStart, type WeekGap, type WeekReport } from "@/lib/physique/weekReport";
import { signedKcal } from "@/lib/physique/food/energy";
import { formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { formatRate } from "@/components/physique/WeightChartCard";
import { Caption, Row, RowGroup, StatusDot } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { STATUS_HEX } from "@/lib/ui/status";
import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import { goalEta } from "@/lib/physique/goalEta";
import { goalProgress } from "@/lib/physique/goalProgress";
import { phasePlan } from "@/lib/physique/phasePlan";
import { recoveryRead } from "@/lib/physique/recovery";
import { nutritionRead, sleepRead, trainingRead } from "@/lib/physique/review";
import { buildWeeklyInsight } from "@/lib/physique/weeklyInsight";
import { useReview } from "@/lib/physique/io/review";
import { useDeload } from "@/lib/physique/io/deload";
import { readDeload } from "@/lib/training/deload";
import ReviewDecision from "@/components/report/ReviewDecision";
import WeekReads from "@/components/report/WeekReads";
import { FixesCard, HeadingCard } from "@/components/report/InsightCards";

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
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "#0a0a0b" }} />;
  return <ReportContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function weekFromQuery(): LocalDate | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("week");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? reportWeekStart(v) : null;
}

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const dash = <span style={{ color: "#6f6f76" }}>–</span>;

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
  const [start, setStart] = useState<LocalDate>(() => weekFromQuery() ?? (reviewDue && reviewWeek ? reviewWeek : defaultReportWeek(today)));
  const thisWeek = reportWeekStart(today);
  const deloadRecord = useDeload();

  const report: WeekReport = useMemo(
    () =>
      buildWeekReport(
        {
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
          expenditure: expenditure?.series ?? null,
          verdict: start === thisWeek && analysis ? { title: analysis.verdict.title, detail: analysis.verdict.detail, state: analysis.status.state } : null,
        },
        start,
        now
      ),
    [data, workouts, profile, unit, priorities, phase, expenditure, analysis, start, thisWeek, now]
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
    const reads = { nutrition: nutritionRead(report), training: trainingRead(report, deload, plannedSessions), sleep: sleepRead(report) };
    return { ...out, reads };
  }, [analysis, data, workouts, unit, now, today, deloadRecord, report, plannedSessions, reviewModel, start, reviewWeek]);

  const caption = `${shortLocalDate(report.start)} to ${shortLocalDate(report.end)} · ${report.complete ? "complete" : `${report.daysCovered} of 7 days so far`}`;
  const w = (kg: number | null) => (kg == null ? dash : formatWeight(kg, unit));
  const kgDelta = (kg: number | null) => (kg == null ? dash : `${kg > 0 ? "+" : kg < 0 ? "−" : ""}${Math.abs(kgToDisplay(kg, unit)).toFixed(1)} ${unit}`);
  const gapHref = (g: WeekGap) => (g.kind === "food" ? `/food?date=${g.date}` : g.kind === "weight" ? `/body?date=${g.date}` : `/sleep?date=${g.date}`);
  const gapLabel = (g: WeekGap) => (g.kind === "food" ? "No food logged" : g.kind === "weight" ? "No weigh-in" : "No sleep logged");
  const byKind = (kind: WeekGap["kind"]) => report.gaps.filter((g) => g.kind === kind);

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <header className="sticky top-0 z-30 -mx-5 px-5 pb-3 pt-4 sm:-mx-6 sm:px-6" style={{ background: "#0a0a0b" }}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="block truncate text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
                {caption}
              </span>
              <h1 className="mt-0.5 text-[34px] font-semibold leading-none tracking-[-0.02em]">Weekly report</h1>
            </div>
            <div className="flex shrink-0 items-center gap-1 pb-0.5">
              <button type="button" onClick={() => setStart(addDays(start, -7))} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Previous week">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" onClick={() => setStart(addDays(start, 7))} disabled={start >= thisWeek} className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Next week">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {insight?.heading && analysis && (
          <Link href="/body" className="flex flex-col gap-1 rounded-[12px] px-4 py-3 transition-colors active:bg-[#1d1d20]" style={{ background: "#141416" }} aria-label={`${analysis.verdict.title}. Open Body`}>
            <span className="flex items-center gap-2">
              <StatusDot color={STATUS_HEX[analysis.status.state]} />
              <span className="text-[15px] font-semibold">{analysis.verdict.title}</span>
            </span>
            <span className="pl-4 text-[13px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
              {analysis.verdict.detail}
            </span>
          </Link>
        )}

        {insight?.heading && <HeadingCard heading={insight.heading} />}

        {insight && report.hasData && <FixesCard fixes={insight.fixes} more={insight.more} goingWell={insight.goingWell} />}

        {reviewModel && start === reviewWeek && reviewModel.hasProgram && <ReviewDecision key={reviewModel.plan.weekStart} model={reviewModel} now={now} unit={unit} />}

        {insight && report.hasData && <WeekReads nutrition={insight.reads.nutrition} training={insight.reads.training} sleep={insight.reads.sleep} />}

        {!report.hasData && (
          <p className="rounded-[12px] px-4 py-3 text-[13px]" style={{ background: "#141416", color: "#a3a3a8" }}>
            {report.complete ? "Nothing was logged this week." : "Nothing logged this week yet."} Food, weigh-ins, nights and workouts show here as they are logged.
          </p>
        )}

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-[12px] px-4 py-3 [&::-webkit-details-marker]:hidden" style={{ background: "#141416" }}>
            <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
              All the numbers
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </summary>
          <div className="mt-5 flex flex-col gap-5">
          {report.gaps.length > 0 && (
            <section aria-label="Gaps">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[17px] font-semibold">Not logged</span>
                <Caption>{report.gaps.length} {report.gaps.length === 1 ? "gap" : "gaps"}</Caption>
              </div>
              <RowGroup>
                {(["food", "weight", "sleep"] as const).map((kind) => {
                  const items = byKind(kind);
                  if (items.length === 0) return null;
                  return (
                    <div key={kind} className="flex flex-col gap-1.5 px-4 py-3">
                      <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
                        {gapLabel(items[0])} · {items.length} {items.length === 1 ? "day" : "days"}
                      </span>
                      {/* Plain anchors: the target page reads ?date= on mount, which a soft navigation would miss. */}
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((g) => (
                          <a key={`${g.kind}-${g.date}`} href={gapHref(g)} className="h-[30px] rounded-full px-3 text-[12px] font-medium leading-[30px] transition-colors active:bg-[#26262a]" style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label={`${gapLabel(g)} ${longLocalDate(g.date)}. Log it`}>
                            {longLocalDate(g.date)}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </RowGroup>
            </section>
          )}

          <section aria-label="Weight">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">Weight</span>
              <Caption>{report.weight.weighIns} of {report.daysCovered} days weighed</Caption>
            </div>
            <RowGroup>
              <Row label="Trend" value={report.weight.endTrendKg == null ? dash : `${w(report.weight.startTrendKg)} → ${w(report.weight.endTrendKg)}`} sub={report.weight.deltaKg == null ? "Needs weigh-ins on both ends of the week" : `${kgDelta(report.weight.deltaKg)} over the week`} />
              <Row label="Rate" value={report.weight.ratePctPerWeek == null ? dash : formatRate(report.weight.ratePctPerWeek)} sub={report.weight.rateWindowDays ? `Over the last ${report.weight.rateWindowDays} days` : "Early read · not enough weigh-ins for a rate"} />
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
              {(report.food.partial > 0 || report.food.fasting > 0) && <Row label="Day status" value={`${report.food.complete} complete`} sub={`${report.food.partial} partial · ${report.food.fasting} fasting`} />}
            </RowGroup>
          </section>

          <section aria-label="Training">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">Training</span>
              <Caption>{report.training.sessions} {report.training.sessions === 1 ? "session" : "sessions"} · {report.training.hardSets} hard sets</Caption>
            </div>
            {report.training.sessions === 0 ? (
              <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
                No sessions logged this week.
              </p>
            ) : (
              <RowGroup>
                {report.training.lifts.map((l) => (
                  <Row key={l.name} label={l.name} value={`${formatWeight(l.e1rmKg, unit)}`} sub={l.changePct == null ? "e1RM · no baseline in the previous 3 weeks" : `e1RM · ${l.changePct > 0 ? "+" : l.changePct < 0 ? "−" : ""}${Math.abs(l.changePct).toFixed(1)} % vs the previous 3 weeks`} />
                ))}
                <div className="px-4 py-3">
                  <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
                    Hard sets by muscle
                  </span>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {report.training.byMuscle.map((m) => {
                      const max = report.training.byMuscle[0]?.sets ?? 1;
                      return (
                        <div key={m.group} className="flex items-center gap-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                          <span className="w-[88px] shrink-0 truncate" style={{ color: "#a3a3a8" }}>
                            {m.label}
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
                            <div className="h-full rounded-full" style={{ width: `${(m.sets / max) * 100}%`, background: "#a3a3a8" }} />
                          </div>
                          <span className="w-[72px] shrink-0 text-right" style={{ color: m.read === "over" ? "#f26d7d" : m.read === "under" ? "#f5b544" : m.read === "in_range" ? "#00e5b0" : "#f2f2f0" }}>
                            {m.sets}
                            {m.band ? <span style={{ color: "#6f6f76" }}>{` · ${bandLabel(m.band)}`}</span> : null}
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
              <Row label="Debt" value={report.sleep.debtH == null ? dash : formatHoursMin(report.sleep.debtH * 60)} sub="Hours under the goal, added up over the logged nights" />
            </RowGroup>
          </section>
          </div>
        </details>

        <div className="pb-2">
          <Caption>Numbers and fixes come from the engine. Nothing here is a guess.</Caption>
        </div>
      </div>
    </main>
  );
}
