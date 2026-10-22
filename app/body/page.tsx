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
import WeightEntries, { ENTRY_DAYS } from "@/components/physique/WeightEntries";
import { scaleJump, scaleJumps, withWeighIn, type ScaleJumpInputs } from "@/lib/physique/scaleJump";
import { jumpShort } from "@/lib/physique/scaleJumpWords";
import { weightGapFromRecords } from "@/lib/physique/weightGap";
import { weightGapShort } from "@/lib/physique/weightGapWords";
import { LINK_MIN_FOOD_SHARE, LINK_ON_PLAN_PCT } from "@/lib/physique/linkedReasons";
import { stuckLifts } from "@/lib/physique/liftPlateau";
import StalledLifts from "@/components/progress/StalledLifts";
import AutoCheckIn from "@/components/physique/AutoCheckIn";
import GoalCard from "@/components/progress/GoalCard";
import FirstUse from "@/components/progress/FirstUse";
import { progressUnlocks } from "@/lib/physique/progressUnlocks";
import type { ExampleBundle } from "@/lib/physique/exampleData";
import Timeline, { type TimelineFocus } from "@/components/progress/Timeline";
import FindingsCard from "@/components/report/Findings";
import ConnectionsCard from "@/components/report/Connections";
import { defaultRange, progressTimeline, type ProgressRange } from "@/lib/physique/progressTimeline";
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
  const liveData = useBodyData();
  const liveAnalysis = usePhysiqueAnalysis(now, unit);
  const liveWorkouts = useWorkouts();
  const liveExpenditure = useExpenditure(now);
  // PR5: "See an example" draws the whole screen from made-up data held in memory; nothing is read from or written to storage.
  const [example, setExample] = useState<ExampleBundle | null>(null);
  const [exampleLoading, setExampleLoading] = useState(false);
  async function showExample() {
    setExampleLoading(true);
    const { exampleBundle } = await import("@/lib/physique/exampleData");
    setExample(exampleBundle(now, unit));
    setExampleLoading(false);
    window.scrollTo({ top: 0 });
  }
  const ex = example?.scenario ?? null;
  const data = useMemo(() => (ex ? { ...liveData, weighIns: ex.weighIns, foodEntries: ex.foodEntries, sleepNights: ex.sleepNights, waist: ex.waist, dayFlags: ex.dayFlags, goal: ex.goal, program: ex.program } : liveData), [ex, liveData]);
  const workouts = ex ? ex.workouts : liveWorkouts;
  const expenditure = example ? example.expenditure : liveExpenditure;
  const analysis = example ? example.analysis : liveAnalysis;
  const timelineInputs = useMemo(
    () => ({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, workouts, program: data.program, expenditure: expenditure?.series ?? null, unit }),
    [data, workouts, expenditure, unit]
  );
  // PR3e: a short history opens on all of it, so the charts are not mostly empty; a range picked stays picked.
  const [pickedRange, setRange] = useState<ProgressRange | null>(null);
  const range = pickedRange ?? defaultRange(timelineInputs, now);
  const timeline = useMemo(() => progressTimeline(timelineInputs, range, now), [timelineInputs, range, now]);
  // PR2: connections read the chosen range, never less than the 16 weeks their minimums need.
  const connDays = range === "6M" || range === "All" ? dayDiff(timeline.from, today) + 1 : 0;
  const conn = useMemo(
    () => connections({ workouts, sleepNights: data.sleepNights, foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, expenditure: expenditure?.series ?? null, unit }, now, { days: connDays }),
    [workouts, data, expenditure, unit, now, connDays]
  );
  const found = useMemo(() => {
    const p = ex ? ex.profile : getPhysiqueProfileSync();
    const sleepLink = conn.items.find((c) => c.id === "sleep" && c.state === "linked");
    const goal = data.goal && !data.goal.completedAt ? data.goal : null;
    return findings({ weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, sleepNights: data.sleepNights, goal, program: data.program, profile: { sex: p.sex, age: p.age, heightCm: p.heightCm }, workouts, unit, sleepConnectionPct: sleepLink?.diffPct ?? null }, today);
  }, [data, workouts, unit, conn, today, ex]);

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
  // IN4: main lifts flat or dropping, and what changed since their best.
  const stalled = useMemo(
    () => stuckLifts({ workouts, sleepNights: data.sleepNights, foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, expenditure: expenditure?.series ?? null, goal: data.goal && !data.goal.completedAt ? data.goal : null, unit }, now),
    [workouts, data, expenditure, unit, now]
  );
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

  // The weigh-in and waist sheets always work on the person's own records.
  const model = useMemo(() => {
    const onDate = liveData.weighIns.find((w) => w.date === wDate) ?? null;
    const lastWeighIn = liveData.weighIns.at(-1) ?? null;
    const lastWaist = liveData.waist.at(-1) ?? null;
    const trend = latestTrend(liveData.weighIns);
    return { onDate, lastWeighIn, lastWaist, trend };
  }, [liveData, wDate]);

  // IN2: why a weigh-in jumped, on the person's own records (the list and the sheet are never the example's).
  const jumpInputs = useMemo<ScaleJumpInputs>(() => ({ weighIns: liveData.weighIns, foodEntries: liveData.foodEntries, dayFlags: liveData.dayFlags, workouts: liveWorkouts, tz: now.tz }), [liveData, liveWorkouts, now.tz]);
  const jumps = useMemo(() => (showWeighIns ? scaleJumps(jumpInputs, addDays(today, -(ENTRY_DAYS - 1)), today) : undefined), [showWeighIns, jumpInputs, today]);
  const explain = (kg: number, d: LocalDate) => {
    const j = scaleJump(withWeighIn(jumpInputs, d, kg), d);
    return j ? jumpShort(j, unit, d === today) : null;
  };

  const nowIso = () => new Date().toISOString();
  const goal = analysis?.goal ?? data.goal;
  // IN3: when the rate is off the plan, the one fact behind it under the goal (the weekly report has the rest). The person's own records only.
  const why = useMemo(() => {
    const w = analysis?.weight;
    const g = goal && !goal.completedAt ? goal : null;
    if (example || !g || !w || w.trendKg == null || w.ratePctPerWeek == null || w.rateWindowDays == null) return null;
    const planned = g.type === "maintain" ? 0 : (g.ratePctPerWeek / 100) * w.trendKg;
    const actual = (w.ratePctPerWeek / 100) * w.trendKg;
    if (Math.abs(actual - planned) < (LINK_ON_PLAN_PCT / 100) * w.trendKg) return null;
    // The rate's window ends at the last weigh-in; read the food and steps over the same days.
    const through = liveData.weighIns.reduce<LocalDate>((m, x) => (x.date <= today && x.date > m ? x.date : m), "");
    if (!through) return null;
    const read = weightGapFromRecords(
      { foodEntries: liveData.foodEntries, dayFlags: liveData.dayFlags, steps: liveData.steps, expenditure: liveExpenditure?.series ?? null, goalStart: g.startDate, through, today, bodyKg: w.trendKg, windowDays: w.rateWindowDays, ratePctPerWeek: w.ratePctPerWeek },
      LINK_MIN_FOOD_SHARE
    );
    return read ? weightGapShort(read) : null;
  }, [example, analysis, goal, liveData, liveExpenditure, today]);
  const unlocks = useMemo(
    () => progressUnlocks({ goal: data.goal, weighIns: data.weighIns, sleepNights: data.sleepNights, workouts, expenditure, connections: conn, unit }, now),
    [data, workouts, expenditure, conn, unit, now]
  );
  const firstUse = !example && unlocks.some((u) => !u.done);
  const connectionsReady = unlocks.find((u) => u.id === "connections")?.done ?? false;
  const hasGoalOrWeight = (!!goal && !goal.completedAt) || data.weighIns.length > 0;
  const logWeight = () => {
    setWeightDate(today);
    setSheet("weight");
  };

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader title="Progress" action={example ? undefined : { label: "Log weight", onClick: logWeight }} />

        {example && (
          <div className="flex items-center justify-between gap-3 rounded-[16px] px-4 py-3" style={{ background: "color-mix(in srgb, var(--primary) 18%, var(--surface))" }} role="status">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                Example
              </span>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                16 weeks of made-up data. Nothing is saved.
              </span>
            </span>
            <button type="button" onClick={() => setExample(null)} className="h-[32px] shrink-0 rounded-full px-3.5 text-[12px] font-semibold" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}>
              Back to mine
            </button>
          </div>
        )}

        {/* A2: on the check-in day, targets follow the maintenance estimate without a button. */}
        <AutoCheckIn />

        {/* PR3: the goal first, then what lined up with the lifts, then every measure over time. PR5: before there's a goal or a weigh-in, the first-use list says what each part needs. */}
        {(example || hasGoalOrWeight) && <GoalCard analysis={analysis} goal={goal} weighIns={data.weighIns} dayFlags={data.dayFlags} today={today} unit={unit} example={!!example} why={why} />}

        <StalledLifts lifts={stalled} unit={unit} linkable={!example} />

        {firstUse && <FirstUse unlocks={unlocks} onLogWeight={logWeight} onExample={() => void showExample()} />}
        {exampleLoading && (
          <p className="text-center text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            Loading the example…
          </p>
        )}

        {(example || !firstUse || connectionsReady) && <ConnectionsCard result={conn} lift={lift} unit={unit} />}

        <FindingsCard items={found} onSelect={(f) => pick(f.id)} selectedId={picked} />

        <Timeline t={timeline} range={range} onRange={setRange} unit={unit} goalKg={goal && !goal.completedAt && goal.type !== "maintain" ? goal.targetKg : null} focus={focus} logIncomplete={found.some((f) => f.id === "underlog")} readOnly={!!example} />

        {/* The records behind the weight line, one tap away (PR3). Not in the example: these are the person's own. */}
        {!example && (
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

        )}

        {!example && showWeighIns && (
          <WeightEntries
            weighIns={data.weighIns}
            today={today}
            unit={unit}
            jumps={jumps}
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
        explain={explain}
      />
      <WaistSheet open={sheet === "waist"} onClose={() => setSheet(null)} lastCm={model.lastWaist?.cm ?? null} dateLabel="Today" onSave={(cm) => saveWaist(today, cm, nowIso())} />
    </main>
  );
}
