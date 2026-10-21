"use client";

import { useEffect, useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { formatBodyWeight, type WeightUnit } from "@/lib/units";
import { latestTrend } from "@/lib/physique/weight";
import { deleteWeighIn, saveWaist, saveWeighIn, useBodyData } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import PageHeader from "@/components/ui/PageHeader";
import WeightSheet from "@/components/physique/WeightSheet";
import WaistSheet from "@/components/physique/WaistSheet";
import WeightEntries from "@/components/physique/WeightEntries";
import AutoCheckIn from "@/components/physique/AutoCheckIn";
import GoalCard from "@/components/progress/GoalCard";
import Timeline, { type TimelineFocus } from "@/components/progress/Timeline";
import FindingsCard from "@/components/report/Findings";
import ConnectionsCard from "@/components/report/Connections";
import { progressTimeline, type ProgressRange } from "@/lib/physique/progressTimeline";
import { connections } from "@/lib/physique/connections";
import { referenceLift } from "@/lib/physique/liftEffect";
import { FIND_WINDOW_DAYS, findings, type FindingId } from "@/lib/physique/findings";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { Chevron, Row } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

type SheetKind = "weight" | "waist" | null;

/** The charts each finding is about (PR2). */
const FINDING_CHARTS: Record<FindingId, string[]> = {
  underlog: ["calories", "weight"],
  "sleep-lifts": ["sleep", "strength"],
  "protein-low": ["protein"],
  "gain-fast": ["weight", "calories"],
  "cut-fast-lifts": ["weight", "strength"],
};

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
 * Progress (PR1, PR3): everything the app keeps, in one place. The goal
 * first (trend weight, what is left, when it lands, the rate in kilos),
 * then what lined up with the lifts and what the last four weeks show,
 * then every measure on one timeline (weight, calories against
 * maintenance, protein, training, each main lift, sleep) over a month to
 * the whole history, then the weigh-ins and the waist.
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
    () => connections({ workouts, sleepNights: data.sleepNights, foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, expenditure: expenditure?.series ?? null, unit }, now, { days: connDays }),
    [workouts, data, expenditure, unit, now, connDays]
  );
  const found = useMemo(() => {
    const p = getPhysiqueProfileSync();
    const sleepLink = conn.items.find((c) => c.id === "sleep" && c.state === "linked");
    const goal = data.goal && !data.goal.completedAt ? data.goal : null;
    return findings({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, goal, program: data.program, profile: { sex: p.sex, age: p.age, heightCm: p.heightCm }, workouts, unit, sleepConnectionPct: sleepLink?.diffPct ?? null }, today);
  }, [data, workouts, unit, conn, today]);

  // A tapped finding shows on the timeline; tapping it again clears it. A connection opens its own sessions in place (PR3).
  const [picked, setPicked] = useState<FindingId | null>(null);
  function pick(id: FindingId) {
    const same = picked === id;
    setPicked(same ? null : id);
    if (!same) window.setTimeout(() => document.getElementById("timeline")?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  }
  const focus = useMemo<TimelineFocus | null>(() => {
    const f = picked ? found.find((x) => x.id === picked) : null;
    return f ? { label: f.title, charts: FINDING_CHARTS[f.id], from: addDays(today, -(FIND_WINDOW_DAYS - 1)), onClear: () => setPicked(null) } : null;
  }, [picked, found, today]);
  const lift = useMemo(() => referenceLift(workouts, unit, now), [workouts, unit, now]);
  const [showWeighIns, setShowWeighIns] = useState(false);

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

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader
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

        {/* PR3: the goal first, then what lined up with the lifts, then every measure over time. */}
        <GoalCard analysis={analysis} goal={goal} weighIns={data.weighIns} dayFlags={data.dayFlags} today={today} unit={unit} />

        <ConnectionsCard result={conn} lift={lift} unit={unit} />

        <FindingsCard items={found} onSelect={(f) => pick(f.id)} selectedId={picked} />

        <Timeline t={timeline} range={range} onRange={setRange} unit={unit} goalKg={goal && !goal.completedAt && goal.type !== "maintain" ? goal.targetKg : null} focus={focus} />

        {/* The records behind the weight line, one tap away (PR3). */}
        <section className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="Weigh-ins and waist">
          <Row
            label="Weigh-ins"
            sub={model.lastWeighIn ? (model.lastWeighIn.date === today ? "Today" : longLocalDate(model.lastWeighIn.date)) : "None yet"}
            value={model.lastWeighIn ? formatBodyWeight(model.lastWeighIn.kg, unit) : <span style={{ color: "var(--text-tertiary)" }}>Add</span>}
            trailing={<span style={{ display: "inline-flex", transform: showWeighIns ? "rotate(90deg)" : undefined }}><Chevron /></span>}
            onClick={() => (model.lastWeighIn ? setShowWeighIns((v) => !v) : setSheet("weight"))}
            ariaLabel={model.lastWeighIn ? `${showWeighIns ? "Hide" : "Show"} weigh-ins` : "Log weight"}
          />
          <Row
            label="Waist"
            sub={model.lastWaist ? `Last ${longLocalDate(model.lastWaist.date)}` : "Weekly, optional"}
            value={model.lastWaist ? `${model.lastWaist.cm.toFixed(1)} cm` : <span style={{ color: "var(--text-tertiary)" }}>Add</span>}
            trailing={<Chevron />}
            onClick={() => setSheet("waist")}
            ariaLabel="Log waist"
          />
        </section>

        {showWeighIns && (
          <WeightEntries
            weighIns={data.weighIns}
            today={today}
            unit={unit}
            onOpen={(d) => {
              setWeightDate(d);
              setSheet("weight");
            }}
          />
        )}
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
