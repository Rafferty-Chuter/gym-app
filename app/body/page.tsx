"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { type LocalDate, type Now } from "@/lib/dates";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { latestTrend } from "@/lib/physique/weight";
import { dayTotals, formatHoursMin, recentFoods, sleepPrefill } from "@/lib/physique/dayTotals";
import { saveFoodEntry, saveSleepNight, saveWaist, saveWeighIn, useBodyData, type QuickFood, type SleepInput } from "@/lib/physique/io/bodyData";
import DateSwitcher from "@/components/physique/DateSwitcher";
import WeightSheet from "@/components/physique/WeightSheet";
import FoodQuickAddSheet from "@/components/physique/FoodQuickAddSheet";
import SleepSheet from "@/components/physique/SleepSheet";
import WaistSheet from "@/components/physique/WaistSheet";
import WeightChartCard from "@/components/physique/WeightChartCard";
import VerdictCard from "@/components/physique/VerdictCard";
import EnergyCard from "@/components/physique/EnergyCard";
import StrengthSleepRows from "@/components/physique/StrengthSleepRows";
import GoalHeader from "@/components/physique/GoalHeader";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { Caption, Chevron, MacroBar, PlusGlyph, Row, RowGroup } from "@/components/physique/ui";
import { targetInEffect } from "@/lib/physique/intake";
import Link from "next/link";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

type SheetKind = "weight" | "food" | "sleep" | "waist" | null;

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

/** `/body?date=YYYY-MM-DD` opens that day (the verdict's confirm-days link). Client only. */
function dateFromQuery(): LocalDate | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("date");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function BodyContent({ now, unit }: { now: Now; unit: WeightUnit }) {
  const today = now.today;
  const [selected, setSelected] = useState<LocalDate | null>(() => dateFromQuery());
  const date = selected && selected <= today ? selected : today;
  const [sheet, setSheet] = useState<SheetKind>(null);
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);

  const day = useMemo(() => {
    const weighIn = data.weighIns.find((w) => w.date === date) ?? null;
    const totals = dayTotals(data.foodEntries, date);
    const night = data.sleepNights.find((n) => n.date === date) ?? null;
    const lastWeighIn = [...data.weighIns].filter((w) => w.date <= date).at(-1) ?? data.weighIns.at(-1) ?? null;
    const lastWaist = data.waist.at(-1) ?? null;
    const trend = latestTrend(data.weighIns);
    const target = targetInEffect(data.program, date);
    return { weighIn, totals, night, lastWeighIn, lastWaist, trend, target };
  }, [data, date]);


  const dateLabel = date === today ? "Today" : longLocalDate(date);
  const nowIso = () => new Date().toISOString();
  const recent = recentFoods(data.savedFoods, 8);
  const prefill = sleepPrefill(data.sleepNights);

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-4 sm:px-6">
        <DateSwitcher date={date} today={today} onChange={setSelected} />

        {analysis && <GoalHeader analysis={analysis} unit={unit} />}

        {analysis && <VerdictCard analysis={analysis} now={now} unit={unit} />}
        {analysis && !analysis.goal && (
          <Link
            href="/body/goal"
            className="inline-flex h-[36px] w-fit items-center rounded-[12px] px-3 text-[13px] font-semibold"
            style={{ background: "#1d1d20", color: "#f2f2f0" }}
          >
            Set goal
          </Link>
        )}

        <section aria-label={`Log for ${dateLabel}`}>
          <RowGroup>
            <Row
              label="Weight"
              sub={day.weighIn ? undefined : day.lastWeighIn ? `Last ${formatWeight(day.lastWeighIn.kg, unit)}` : undefined}
              value={day.weighIn ? formatWeight(day.weighIn.kg, unit) : <span style={{ color: "#6f6f76" }}>Add</span>}
              trailing={<PlusGlyph />}
              onClick={() => setSheet("weight")}
              ariaLabel={`Weight for ${dateLabel}${day.weighIn ? `, ${formatWeight(day.weighIn.kg, unit)}` : ""}. Log weight`}
            />
            <Row
              label="Food"
              below={
                day.target ? (
                  <span className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-1.5" aria-hidden>
                    <MacroBar value={day.totals.kcal} target={day.target.kcal} color="#f2f2f0" />
                    <MacroBar value={day.totals.proteinG} target={day.target.proteinG} color="#f2f2f0" />
                    <MacroBar value={day.totals.carbsG} target={day.target.carbsG} color="#a3a3a8" />
                    <MacroBar value={day.totals.fatG} target={day.target.fatG} color="#6f6f76" />
                  </span>
                ) : undefined
              }
              sub={
                day.target ? (
                  `P ${Math.round(day.totals.proteinG)}/${day.target.proteinG} · C ${Math.round(day.totals.carbsG)}/${day.target.carbsG} · F ${Math.round(day.totals.fatG)}/${day.target.fatG} g`
                ) : day.totals.entries > 0 ? (
                  `P ${Math.round(day.totals.proteinG)} · C ${Math.round(day.totals.carbsG)} · F ${Math.round(day.totals.fatG)} g · ${day.totals.entries} ${day.totals.entries === 1 ? "entry" : "entries"}`
                ) : undefined
              }
              value={
                day.target ? (
                  <span>
                    {Math.round(day.totals.kcal).toLocaleString("en-GB")}
                    <span className="text-[13px] font-medium" style={{ color: "#6f6f76" }}>
                      {" "}/ {day.target.kcal.toLocaleString("en-GB")}
                    </span>
                  </span>
                ) : day.totals.entries > 0 ? (
                  `${Math.round(day.totals.kcal).toLocaleString("en-GB")} kcal`
                ) : (
                  <span style={{ color: "#6f6f76" }}>Add</span>
                )
              }
              trailing={<PlusGlyph />}
              onClick={() => setSheet("food")}
              ariaLabel={`Food for ${dateLabel}, ${Math.round(day.totals.kcal)} kcal${day.target ? ` of ${day.target.kcal}` : ""}. Add food`}
            />
            <Row
              label="Sleep"
              sub={day.night?.bedtime && day.night.wakeTime ? `${day.night.bedtime} → ${day.night.wakeTime}` : "Night before"}
              value={day.night ? formatHoursMin(day.night.asleepMin) : <span style={{ color: "#6f6f76" }}>Add</span>}
              trailing={<PlusGlyph />}
              onClick={() => setSheet("sleep")}
              ariaLabel={`Sleep for ${dateLabel}${day.night ? `, ${formatHoursMin(day.night.asleepMin)}` : ""}. Log sleep`}
            />
            <Row
              label="Waist"
              sub={day.lastWaist ? (day.lastWaist.date === date ? "Logged" : `Last ${longLocalDate(day.lastWaist.date)}`) : "Weekly, optional"}
              value={day.lastWaist ? `${day.lastWaist.cm.toFixed(1)} cm` : <span style={{ color: "#6f6f76" }}>Add</span>}
              trailing={<Chevron />}
              onClick={() => setSheet("waist")}
              ariaLabel="Log waist"
            />
          </RowGroup>
        </section>

        <WeightChartCard weighIns={data.weighIns} goal={data.goal} dayFlags={data.dayFlags} today={today} unit={unit} />

        {analysis && <EnergyCard analysis={analysis} />}

        {analysis && <StrengthSleepRows analysis={analysis} />}

        <div className="pb-2">
          <Caption>Logged values stay on this device. Export a backup from Profile.</Caption>
        </div>
      </div>

      <WeightSheet
        open={sheet === "weight"}
        onClose={() => setSheet(null)}
        unit={unit}
        lastKg={day.weighIn?.kg ?? day.lastWeighIn?.kg ?? null}
        trendKg={day.trend?.trendKg ?? null}
        dateLabel={dateLabel}
        onSave={(kg) => saveWeighIn(date, kg, nowIso())}
      />
      <FoodQuickAddSheet
        open={sheet === "food"}
        onClose={() => setSheet(null)}
        recent={recent}
        dateLabel={dateLabel.toLowerCase() === "today" ? "today" : dateLabel}
        onSave={(food: QuickFood, savedFoodId?: string) => saveFoodEntry(date, food, nowIso(), savedFoodId)}
      />
      <SleepSheet
        open={sheet === "sleep"}
        onClose={() => setSheet(null)}
        prefill={prefill}
        existing={day.night}
        dateLabel={dateLabel.toLowerCase() === "today" ? "today" : dateLabel}
        onSave={(input: SleepInput) => saveSleepNight(date, input, nowIso())}
      />
      <WaistSheet
        open={sheet === "waist"}
        onClose={() => setSheet(null)}
        lastCm={day.lastWaist?.cm ?? null}
        dateLabel={dateLabel}
        onSave={(cm) => saveWaist(date, cm, nowIso())}
      />
    </main>
  );
}
