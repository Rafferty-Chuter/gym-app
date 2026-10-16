"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, type LocalDate } from "@/lib/dates";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { latestTrend, weighInsNeededForRate } from "@/lib/physique/weight";
import { dayTotals, formatHoursMin, recentFoods, sleepPrefill } from "@/lib/physique/dayTotals";
import { saveFoodEntry, saveSleepNight, saveWaist, saveWeighIn, useBodyData, type QuickFood, type SleepInput } from "@/lib/physique/io/bodyData";
import DateSwitcher from "@/components/physique/DateSwitcher";
import WeightSheet from "@/components/physique/WeightSheet";
import FoodQuickAddSheet from "@/components/physique/FoodQuickAddSheet";
import SleepSheet from "@/components/physique/SleepSheet";
import WaistSheet from "@/components/physique/WaistSheet";
import WeightChartCard from "@/components/physique/WeightChartCard";
import VerdictPlaceholder, { type CalibratingItem } from "@/components/physique/VerdictPlaceholder";
import { Caption, Chevron, PlusGlyph, Row, RowGroup } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

type SheetKind = "weight" | "food" | "sleep" | "waist" | null;

export default function BodyPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <Shell />;
  return <BodyContent today={now.today} unit={unit === "lb" ? "lb" : "kg"} />;
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

function BodyContent({ today, unit }: { today: LocalDate; unit: WeightUnit }) {
  const [selected, setSelected] = useState<LocalDate | null>(null);
  const date = selected && selected <= today ? selected : today;
  const [sheet, setSheet] = useState<SheetKind>(null);
  const data = useBodyData();

  const day = useMemo(() => {
    const weighIn = data.weighIns.find((w) => w.date === date) ?? null;
    const totals = dayTotals(data.foodEntries, date);
    const night = data.sleepNights.find((n) => n.date === date) ?? null;
    const lastWeighIn = [...data.weighIns].filter((w) => w.date <= date).at(-1) ?? data.weighIns.at(-1) ?? null;
    const lastWaist = data.waist.at(-1) ?? null;
    const trend = latestTrend(data.weighIns);
    return { weighIn, totals, night, lastWeighIn, lastWaist, trend };
  }, [data, date]);

  const calibrating = useMemo<CalibratingItem[]>(() => {
    const items: CalibratingItem[] = [];
    const needed = weighInsNeededForRate(data.weighIns, today);
    if (needed > 0) items.push({ text: `${needed} more weigh-in${needed === 1 ? "" : "s"} for a first read on your rate` });
    const weekStart = addDays(today, -6);
    const foodDays = new Set(data.foodEntries.filter((f) => f.date >= weekStart && f.date <= today).map((f) => f.date)).size;
    if (foodDays < 4) items.push({ text: `Log food on ${4 - foodDays} more day${4 - foodDays === 1 ? "" : "s"} this week to estimate maintenance` });
    const nights = data.sleepNights.filter((n) => n.date >= addDays(today, -13) && n.date <= today).length;
    if (nights < 10) items.push({ text: `${nights} of 14 nights logged (10 needed for a sleep read)` });
    return items.slice(0, 3);
  }, [data, today]);

  const dateLabel = date === today ? "Today" : longLocalDate(date);
  const nowIso = () => new Date().toISOString();
  const recent = recentFoods(data.savedFoods, 8);
  const prefill = sleepPrefill(data.sleepNights);
  const goalLine = data.goal
    ? `${formatWeight(data.goal.targetKg, unit)} · ${data.goal.type === "lose" ? "Cut" : data.goal.type === "gain" ? "Lean gain" : "Maintain"}${data.goal.type === "maintain" ? "" : ` · ${data.goal.ratePctPerWeek > 0 ? "+" : "−"}${Math.abs(data.goal.ratePctPerWeek).toFixed(2)} %/wk`}`
    : null;

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-4 sm:px-6">
        <DateSwitcher date={date} today={today} onChange={setSelected} />

        {goalLine && (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
            <span aria-hidden>→</span>
            <span>{goalLine}</span>
          </div>
        )}

        <VerdictPlaceholder hasGoal={data.goal != null} items={calibrating} />

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
              sub={day.totals.entries > 0 ? `P ${Math.round(day.totals.proteinG)} · C ${Math.round(day.totals.carbsG)} · F ${Math.round(day.totals.fatG)} g · ${day.totals.entries} ${day.totals.entries === 1 ? "entry" : "entries"}` : undefined}
              value={day.totals.entries > 0 ? `${Math.round(day.totals.kcal).toLocaleString("en-GB")} kcal` : <span style={{ color: "#6f6f76" }}>Add</span>}
              trailing={<PlusGlyph />}
              onClick={() => setSheet("food")}
              ariaLabel={`Food for ${dateLabel}, ${Math.round(day.totals.kcal)} kcal. Add food`}
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
