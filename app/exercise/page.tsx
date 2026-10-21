"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { Caption, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import ExerciseChart from "@/components/training/ExerciseChart";
import { exerciseSubtitle } from "@/components/training/ExercisePickerSheet";
import { workoutHref, workoutTitle } from "@/components/training/WorkoutViews";
import { SET_TYPE_MARK } from "@/lib/completedSets";
import { getExerciseById, getExerciseByName } from "@/lib/exerciseLibrary";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { CHART_METRIC_LABEL, chartMetricsFor, chartSeries, exerciseRecords, exerciseSessions, type ChartMetric, type ExerciseSession } from "@/lib/training/exerciseHistory";
import { formatLoad, formatSet, formatVolume } from "@/lib/training/workoutSummary";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useUnit } from "@/lib/unit-preference";

/** Sessions shown before "Show all". OURS: a phone screen of history. */
const SESSIONS_SHOWN = 8;

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function setsLine(s: ExerciseSession, unit: string): string {
  return s.sets
    .map((x) => {
      const mark = SET_TYPE_MARK[x.type];
      const v = x.weight != null ? `${formatLoad(x.weight)} × ${x.reps}` : `${x.reps}`;
      return mark ? `${mark} ${v}` : v;
    })
    .join(", ")
    .concat(s.sets.some((x) => x.weight != null) ? ` ${unit}` : " reps");
}

function chartValue(v: number, metric: ChartMetric, unit: string): string {
  if (metric === "reps") return `${v} reps`;
  if (metric === "volume") return formatVolume(v, unit);
  return `${formatLoad(v)} ${unit}`;
}

/**
 * One exercise across every workout (TR6, after the exercise screens in
 * Hevy and Strong): a chart of estimated 1RM, heaviest weight or volume,
 * all-time records, the heaviest weight for each rep count and every
 * session. A movement logged under an old name joins its library entry.
 */
function ExerciseDetail() {
  const router = useRouter();
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const id = params.get("id") ?? undefined;
  const hydrated = useIsHydrated();
  const workouts = useWorkouts();
  const { unit } = useUnit();
  const u = unit === "lb" ? "lb" : "kg";

  const meta = useMemo(() => (id ? getExerciseById(id) : null) ?? (name ? getExerciseByName(name) : null), [id, name]);
  const title = meta?.name ?? (name || "Exercise");
  const sessions = useMemo(() => exerciseSessions(workouts, { name: title, ...(id ? { exerciseId: id } : {}) }), [workouts, title, id]);
  const records = useMemo(() => exerciseRecords(sessions), [sessions]);
  const metrics = useMemo(() => chartMetricsFor(sessions), [sessions]);
  const [picked, setPicked] = useState<ChartMetric | null>(null);
  const metric = picked && metrics.includes(picked) ? picked : metrics[0];
  const series = useMemo(() => chartSeries(sessions, metric), [sessions, metric]);
  const [showAll, setShowAll] = useState(false);

  const back = (
    <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/history"))} className="uppercase" aria-label="Back">
      ‹ Back
    </button>
  );

  if (!hydrated) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;

  const latest = series[series.length - 1];
  const best = series.length > 0 ? Math.max(...series.map((p) => p.value)) : null;
  const shown = showAll ? sessions : sessions.slice(0, SESSIONS_SHOWN);

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={back} title={title} />
        <p className="-mt-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {exerciseSubtitle(meta)}
          {sessions.length > 0 ? ` · ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}` : ""}
        </p>

        {sessions.length === 0 ? (
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            No sessions of {title} yet. Log it in a workout and its chart and records show here.
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-[16px] px-4 pb-3 pt-4" style={{ background: "var(--surface)" }} aria-label="Progress chart">
              {metrics.length > 1 && (
                <div className="grid gap-1 rounded-[10px] p-1" style={{ background: "var(--surface-raised)", gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Chart measure">
                  {metrics.map((m) => (
                    <button key={m} type="button" role="tab" aria-selected={m === metric} onClick={() => setPicked(m)} className="h-[30px] truncate rounded-[8px] px-2 text-[12px] font-semibold transition-colors" style={m === metric ? { background: "var(--primary)", color: "var(--text-on-primary)" } : { color: "var(--text-secondary)" }}>
                      {m === "e1rm" ? "Est. 1RM" : m === "heaviest" ? "Heaviest" : m === "volume" ? "Volume" : "Reps"}
                    </button>
                  ))}
                </div>
              )}
              {latest && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                      {CHART_METRIC_LABEL[metric]}, last session
                    </span>
                    <span className="text-[24px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {chartValue(latest.value, metric, u)}
                    </span>
                  </span>
                  {best != null && series.length > 1 && (
                    <span className="text-right text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      Best {chartValue(best, metric, u)}
                    </span>
                  )}
                </div>
              )}
              <ExerciseChart points={series} ariaLabel={`${CHART_METRIC_LABEL[metric]} for ${title} over time`} />
            </section>

            <section className="flex flex-col gap-2">
              <Caption>Records</Caption>
              <RowGroup>
                {records.e1rm && <Row label="Estimated 1RM" value={`${formatLoad(records.e1rm.value)} ${u}`} sub={`${formatLoad(records.e1rm.weight)} ${u} × ${records.e1rm.reps} · ${day(records.e1rm.completedAt)}`} />}
                {records.heaviest && <Row label="Heaviest weight" value={`${formatLoad(records.heaviest.value)} ${u}`} sub={`× ${records.heaviest.reps} · ${day(records.heaviest.completedAt)}`} />}
                {records.bestSetVolume && <Row label="Best set volume" value={formatVolume(records.bestSetVolume.value, u)} sub={`${formatLoad(records.bestSetVolume.weight)} ${u} × ${records.bestSetVolume.reps} · ${day(records.bestSetVolume.completedAt)}`} />}
                {records.bestSessionVolume && <Row label="Best session volume" value={formatVolume(records.bestSessionVolume.value, u)} sub={day(records.bestSessionVolume.completedAt)} />}
                {records.mostReps && <Row label="Most reps in a set" value={`${records.mostReps.value}`} sub={day(records.mostReps.completedAt)} />}
              </RowGroup>
            </section>

            {records.repRecords.length > 0 && (
              <section className="flex flex-col gap-2">
                <Caption>Heaviest for each rep count</Caption>
                <ul className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
                  {records.repRecords.map((r) => (
                    <li key={r.reps} className="grid min-h-[44px] grid-cols-[1fr_auto_auto] items-center gap-4 px-4 text-[15px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {r.reps} {r.reps === 1 ? "rep" : "reps"}
                      </span>
                      <span className="font-semibold">
                        {formatLoad(r.weight)} {u}
                      </span>
                      <span className="w-[86px] text-right text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        {day(r.completedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-2">
              <Caption>History</Caption>
              <ul className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
                {shown.map((s) => (
                  <li key={s.completedAt}>
                    <Link href={workoutHref(s)} className="flex flex-col gap-1 px-4 py-3 transition-colors active:bg-[var(--surface-raised)]">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[15px] font-medium">{workoutTitle({ name: s.workoutName, exercises: [] })}</span>
                        <span className="shrink-0 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                          {day(s.completedAt)}
                        </span>
                      </span>
                      <span className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {setsLine(s, u)}
                      </span>
                      <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        Best set {formatSet(s.best, u)}
                        {s.e1rm != null ? ` · est. 1RM ${formatLoad(s.e1rm)} ${u}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {!showAll && sessions.length > SESSIONS_SHOWN && (
                <SecondaryButton onClick={() => setShowAll(true)}>Show all {sessions.length} sessions</SecondaryButton>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function ExercisePage() {
  return (
    <Suspense fallback={<main className="min-h-screen" style={{ background: "var(--page)" }} />}>
      <ExerciseDetail />
    </Suspense>
  );
}
