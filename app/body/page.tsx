"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { latestTrend } from "@/lib/physique/weight";
import { deleteWeighIn, saveWaist, saveWeighIn, useBodyData } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import PageHeader from "@/components/ui/PageHeader";
import WeightSheet from "@/components/physique/WeightSheet";
import WaistSheet from "@/components/physique/WaistSheet";
import { formatRate } from "@/components/physique/WeightChartCard";
import GoalProgress from "@/components/physique/GoalProgress";
import { goalEta } from "@/lib/physique/goalEta";
import WeightEntries from "@/components/physique/WeightEntries";
import AutoCheckIn from "@/components/physique/AutoCheckIn";
import ThisWeekCard from "@/components/progress/ThisWeekCard";
import Timeline, { type TimelineFocus } from "@/components/progress/Timeline";
import FindingsCard from "@/components/report/Findings";
import ConnectionsCard, { CONNECTION_COLOR } from "@/components/report/Connections";
import { progressTimeline, type ProgressRange } from "@/lib/physique/progressTimeline";
import { connections, type ConnectionId } from "@/lib/physique/connections";
import { FIND_WINDOW_DAYS, findings, type FindingId } from "@/lib/physique/findings";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { Chevron, Row } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";

type SheetKind = "weight" | "waist" | null;

/** The charts each finding is about (PR2). */
const FINDING_CHARTS: Record<FindingId, string[]> = {
  underlog: ["calories", "weight"],
  "sleep-lifts": ["sleep", "strength"],
  "protein-low": ["protein"],
  "gain-fast": ["weight", "calories"],
  "cut-fast-lifts": ["weight", "strength"],
};
/** The chart each connection's condition lives on, beside strength (PR2). */
const CONNECTION_CHART: Record<ConnectionId, string> = { sleep: "sleep", calories: "calories", protein: "protein", rate: "weight", rest: "training", hrv: "sleep" };

type Picked = { kind: "finding" | "connection"; id: string } | null;

export default function BodyPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <Shell />;
  return <BodyContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function Shell() {
  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto max-w-2xl px-5 pt-5 sm:px-6">
        <div className="h-11 rounded-[16px]" style={{ background: "var(--surface)" }} />
      </div>
    </main>
  );
}

/** `/body?date=YYYY-MM-DD` opens the weigh-in sheet on that day (the verdict's confirm-days link). Client only. */
function dateFromQuery(): LocalDate | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("date");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Progress (PR1, the Body tab renamed): everything the app keeps, in one
 * place. This week's check-in first, then every measure on one timeline
 * (weight, calories against maintenance, protein, training, strength,
 * sleep) over a month to the whole history, then what lines up with the
 * lifts and what the last four weeks show against the evidence, then the
 * goal and the weigh-ins.
 */
function BodyContent({ now, unit }: { now: Now; unit: WeightUnit }) {
  const today = now.today;
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);
  const workouts = useWorkouts();
  const expenditure = useExpenditure(now);
  const [range, setRange] = useState<ProgressRange>("3M");
  const timeline = useMemo(
    () => progressTimeline({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, workouts, program: data.program, expenditure: expenditure?.series ?? null, unit }, range, now),
    [data, workouts, expenditure, unit, range, now]
  );
  // PR2: connections read the chosen range, never less than the 16 weeks their minimums need.
  const connDays = range === "6M" || range === "All" ? dayDiff(timeline.from, today) + 1 : 0;
  const conn = useMemo(
    () => connections({ workouts, sleepNights: data.sleepNights, foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, unit }, now, { days: connDays }),
    [workouts, data, unit, now, connDays]
  );
  const found = useMemo(() => {
    const p = getPhysiqueProfileSync();
    const sleepLink = conn.items.find((c) => c.id === "sleep" && c.state === "linked");
    const goal = data.goal && !data.goal.completedAt ? data.goal : null;
    return findings({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, goal, program: data.program, profile: { sex: p.sex, age: p.age, heightCm: p.heightCm }, workouts, unit, sleepConnectionPct: sleepLink?.diffPct ?? null }, today);
  }, [data, workouts, unit, conn, today]);

  // A tapped finding or connection shows on the timeline; tapping it again clears it.
  const [picked, setPicked] = useState<Picked>(null);
  function pick(next: NonNullable<Picked>) {
    const same = picked?.kind === next.kind && picked.id === next.id;
    setPicked(same ? null : next);
    if (!same) window.setTimeout(() => document.getElementById("timeline")?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  }
  const focus = useMemo<TimelineFocus | null>(() => {
    if (!picked) return null;
    const clear = () => setPicked(null);
    if (picked.kind === "finding") {
      const f = found.find((x) => x.id === picked.id);
      return f ? { label: f.title, charts: FINDING_CHARTS[f.id], from: addDays(today, -(FIND_WINDOW_DAYS - 1)), onClear: clear } : null;
    }
    const c = conn.items.find((x) => x.id === picked.id);
    if (!c) return null;
    return {
      label: c.state === "linked" ? c.text : `${c.label}: no clear difference (${c.high.value} against ${c.low.value})`,
      charts: ["strength", CONNECTION_CHART[c.id]],
      sessions: { high: c.points.high, low: c.points.low, color: CONNECTION_COLOR[c.id], highLabel: c.high.value, lowLabel: c.low.value },
      onClear: clear,
    };
  }, [picked, found, conn, today]);

  // Home's tiles link to a chart (`/body#calories`): scroll to it once the timeline is drawn.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
    return () => window.clearTimeout(t);
  }, []);
  const [sheet, setSheet] = useState<SheetKind>(() => (dateFromQuery() ? "weight" : null));
  const [weightDate, setWeightDate] = useState<LocalDate>(() => dateFromQuery() ?? today);
  const wDate = weightDate <= today ? weightDate : today;

  const model = useMemo(() => {
    const onDate = data.weighIns.find((w) => w.date === wDate) ?? null;
    const lastWeighIn = data.weighIns.at(-1) ?? null;
    const lastWaist = data.waist.at(-1) ?? null;
    const trend = latestTrend(data.weighIns);
    return { onDate, lastWeighIn, lastWaist, trend };
  }, [data, wDate]);

  const nowIso = () => new Date().toISOString();
  const goal = analysis?.goal ?? data.goal;
  const eta = goalEta(goal, data.weighIns, data.dayFlags, today);
  const etaWord = eta ? (eta.reached ? "reached" : eta.date ? `ETA ${shortLocalDate(eta.date)}` : null) : null;
  const caption = goal
    ? `${formatWeight(goal.targetKg, unit)} · ${goal.type === "lose" ? "Cut" : goal.type === "gain" ? "Lean gain" : "Maintain"}${goal.type === "maintain" ? "" : ` · ${formatRate(goal.ratePctPerWeek)}`}${etaWord ? ` · ${etaWord}` : ""}`
    : "No goal set";

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader
          caption={caption}
          captionHref="/body/goal"
          captionLabel="Goal. Change goal"
          title="Progress"
          action={{
            label: "Log weight",
            onClick: () => {
              setWeightDate(today);
              setSheet("weight");
            },
          }}
        />

        {/* A2: on the check-in day, targets follow the maintenance estimate without a button. */}
        <AutoCheckIn />

        {analysis && <ThisWeekCard analysis={analysis} program={data.program} today={today} />}
        {analysis && !analysis.goal && (
          <Link href="/body/goal" className="inline-flex h-[36px] w-fit items-center rounded-[12px] px-3 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
            Set goal
          </Link>
        )}

        <Timeline t={timeline} range={range} onRange={setRange} unit={unit} focus={focus} />

        <FindingsCard items={found} onSelect={(f) => pick({ kind: "finding", id: f.id })} selectedId={picked?.kind === "finding" ? picked.id : null} />

        <ConnectionsCard result={conn} onSelect={(c) => pick({ kind: "connection", id: c.id })} selectedId={picked?.kind === "connection" ? picked.id : null} />

        {/* The goal and the waist: one panel with hairlines between. */}
        <section className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="Goal">
          <GoalProgress goal={data.goal} weighIns={data.weighIns} dayFlags={data.dayFlags} today={today} unit={unit} bare />
          <Row
            label="Waist"
            sub={model.lastWaist ? `Last ${longLocalDate(model.lastWaist.date)}` : "Weekly, optional"}
            value={model.lastWaist ? `${model.lastWaist.cm.toFixed(1)} cm` : <span style={{ color: "var(--text-tertiary)" }}>Add</span>}
            trailing={<Chevron />}
            onClick={() => setSheet("waist")}
            ariaLabel="Log waist"
          />
        </section>

        <WeightEntries
          weighIns={data.weighIns}
          today={today}
          unit={unit}
          onOpen={(d) => {
            setWeightDate(d);
            setSheet("weight");
          }}
        />
      </div>

      <WeightSheet
        open={sheet === "weight"}
        onClose={() => setSheet(null)}
        unit={unit}
        date={wDate}
        today={today}
        onDateChange={setWeightDate}
        lastKg={model.onDate?.kg ?? model.lastWeighIn?.kg ?? null}
        trendKg={model.trend?.trendKg ?? null}
        hasEntry={model.onDate != null}
        onSave={(kg, d) => saveWeighIn(d, kg, nowIso())}
        onDelete={async () => (model.onDate ? deleteWeighIn(model.onDate.id) : { ok: true as const })}
      />
      <WaistSheet open={sheet === "waist"} onClose={() => setSheet(null)} lastCm={model.lastWaist?.cm ?? null} dateLabel="Today" onSave={(cm) => saveWaist(today, cm, nowIso())} />
    </main>
  );
}
