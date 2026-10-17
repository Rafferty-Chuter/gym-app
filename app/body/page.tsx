"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { type LocalDate, type Now } from "@/lib/dates";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { latestTrend } from "@/lib/physique/weight";
import { deleteWeighIn, saveWaist, saveWeighIn, useBodyData } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import PageHeader from "@/components/ui/PageHeader";
import WeightSheet from "@/components/physique/WeightSheet";
import WaistSheet from "@/components/physique/WaistSheet";
import WeightChartCard, { formatRate } from "@/components/physique/WeightChartCard";
import GoalProgress from "@/components/physique/GoalProgress";
import { goalEta } from "@/lib/physique/goalEta";
import { findGaps, gapLines } from "@/lib/physique/gaps";
import GapRows from "@/components/physique/GapRows";
import VerdictCard from "@/components/physique/VerdictCard";
import StrengthSleepRows from "@/components/physique/StrengthSleepRows";
import WeightEntries from "@/components/physique/WeightEntries";
import { Caption, Chevron, Row, RowGroup } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";

type SheetKind = "weight" | "waist" | null;

export default function BodyPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <Shell />;
  return <BodyContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function Shell() {
  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto max-w-2xl px-5 pt-5 sm:px-6">
        <div className="h-11 rounded-[12px]" style={{ background: "#141416" }} />
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

function BodyContent({ now, unit }: { now: Now; unit: WeightUnit }) {
  const today = now.today;
  const router = useRouter();
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);
  const [sheet, setSheet] = useState<SheetKind>(() => (dateFromQuery() ? "weight" : null));
  const [weightDate, setWeightDate] = useState<LocalDate>(() => dateFromQuery() ?? today);
  const wDate = weightDate <= today ? weightDate : today;

  const model = useMemo(() => {
    const onDate = data.weighIns.find((w) => w.date === wDate) ?? null;
    const lastWeighIn = data.weighIns.at(-1) ?? null;
    const lastWaist = data.waist.at(-1) ?? null;
    const trend = latestTrend(data.weighIns);
    const gapRows = gapLines(findGaps({ foodEntries: [], dayFlags: {}, weighIns: data.weighIns, sleepNights: [] }, today, ["weight"]), today);
    return { onDate, lastWeighIn, lastWaist, trend, gapRows };
  }, [data, wDate, today]);

  const nowIso = () => new Date().toISOString();
  const goal = analysis?.goal ?? data.goal;
  const eta = goalEta(goal, data.weighIns, data.dayFlags, today);
  const etaWord = eta ? (eta.reached ? "reached" : eta.date ? `ETA ${shortLocalDate(eta.date)}` : null) : null;
  const caption = goal
    ? `${formatWeight(goal.targetKg, unit)} · ${goal.type === "lose" ? "Cut" : goal.type === "gain" ? "Lean gain" : "Maintain"}${goal.type === "maintain" ? "" : ` · ${formatRate(goal.ratePctPerWeek)}`}${etaWord ? ` · ${etaWord}` : ""}`
    : "No goal yet";

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader
          caption={caption}
          captionHref="/body/goal"
          title="Body"
          action={{
            label: "Log weight",
            onClick: () => {
              setWeightDate(today);
              setSheet("weight");
            },
          }}
        />

        {analysis?.checkInDue && (
          <RowGroup>
            <Row label="Review" sub="Last week in three reads, then one decision" value={<span style={{ color: "#00e5b0" }}>Ready</span>} trailing={<Chevron />} onClick={() => router.push("/review")} ariaLabel="Open the review" />
          </RowGroup>
        )}
        {analysis && <VerdictCard analysis={analysis} now={now} unit={unit} />}
        {analysis && !analysis.goal && (
          <Link href="/body/goal" className="inline-flex h-[36px] w-fit items-center rounded-[12px] px-3 text-[13px] font-semibold" style={{ background: "#1d1d20", color: "#f2f2f0" }}>
            Set goal
          </Link>
        )}

        <WeightChartCard weighIns={data.weighIns} goal={data.goal} dayFlags={data.dayFlags} today={today} unit={unit} hero />

        <GapRows
          lines={model.gapRows}
          onSelect={(l) => {
            setWeightDate(l.date);
            setSheet("weight");
          }}
        />

        <GoalProgress goal={data.goal} weighIns={data.weighIns} dayFlags={data.dayFlags} today={today} unit={unit} />

        {analysis && <StrengthSleepRows analysis={analysis} showSleep={false} />}

        <RowGroup>
          <Row
            label="Waist"
            sub={model.lastWaist ? `Last ${longLocalDate(model.lastWaist.date)}` : "Weekly, optional"}
            value={model.lastWaist ? `${model.lastWaist.cm.toFixed(1)} cm` : <span style={{ color: "#6f6f76" }}>Add</span>}
            trailing={<Chevron />}
            onClick={() => setSheet("waist")}
            ariaLabel="Log waist"
          />
        </RowGroup>

        <WeightEntries
          weighIns={data.weighIns}
          today={today}
          unit={unit}
          onEdit={(w) => {
            setWeightDate(w.date);
            setSheet("weight");
          }}
        />

        <div className="pb-2">
          <Caption>Logged values stay on this device. Export a backup from Profile.</Caption>
        </div>
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
        bodyFatPct={model.onDate?.bodyFatPct ?? null}
        onSave={(kg, d, bf) => saveWeighIn(d, kg, nowIso(), bf)}
        onDelete={async () => (model.onDate ? deleteWeighIn(model.onDate.id) : { ok: true as const })}
      />
      <WaistSheet open={sheet === "waist"} onClose={() => setSheet(null)} lastCm={model.lastWaist?.cm ?? null} dateLabel="Today" onSave={(cm) => saveWaist(today, cm, nowIso())} />
    </main>
  );
}
