"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { deleteWeighIn, saveSleepNight, saveWeighIn, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { logFood, removeSavedFood, toggleFavourite, type FoodInput } from "@/lib/physique/io/foodData";
import { dayTotals, formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import { latestTrend } from "@/lib/physique/weight";
import { targetInEffect } from "@/lib/physique/intake";
import { formatWeight } from "@/lib/units";
import WeightSheet from "@/components/physique/WeightSheet";
import LoggerSheet from "@/components/food/LoggerSheet";
import SleepSheet from "@/components/physique/SleepSheet";
import type { LocalDate } from "@/lib/dates";

type SheetKind = "weight" | "food" | "sleep" | null;

/**
 * Home's Today strip (05-design §9.3): Weight · Food · Sleep as three tiles
 * showing today's value or the action, each tapping straight into its sheet.
 */
export default function TodayStrip() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const data = useBodyData();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [weightDate, setWeightDate] = useState<LocalDate | null>(null);
  const today = now?.today ?? null;
  const wDate = weightDate ?? today ?? "";

  const day = useMemo(() => {
    if (!today) return null;
    const weighIn = data.weighIns.find((w) => w.date === today) ?? null;
    const lastWeighIn = data.weighIns.at(-1) ?? null;
    const totals = dayTotals(data.foodEntries, today);
    const target = targetInEffect(data.program, today);
    const night = data.sleepNights.find((n) => n.date === today) ?? null;
    const trend = latestTrend(data.weighIns);
    const onDate = data.weighIns.find((w) => w.date === wDate) ?? null;
    return { weighIn, lastWeighIn, totals, target, night, trend, onDate };
  }, [data, today, wDate]);

  const ready = hydrated && now && day;
  const nowIso = () => new Date().toISOString();
  const tile = "flex min-h-[76px] flex-col justify-between rounded-[12px] px-3 py-2.5 text-left transition-colors active:bg-[#1d1d20]";
  const tileStyle = { background: "#141416", border: "1px solid #2a2a2e" };
  const value = (v: string | null, action: string) => (
    <span className="text-[17px] font-semibold leading-tight" style={{ color: v ? "#f2f2f0" : "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
      {v ?? action}
    </span>
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Today">
        <button type="button" className={tile} style={tileStyle} onClick={() => { setWeightDate(null); setSheet("weight"); }} disabled={!ready} aria-label={day?.weighIn ? `Weight today ${formatWeight(day.weighIn.kg, unit)}. Edit` : "Weigh in"}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>Weight</span>
          {value(ready && day?.weighIn ? formatWeight(day.weighIn.kg, unit) : null, "Weigh in")}
          <span className="text-[11px]" style={{ color: "#6f6f76" }}>{ready && day ? (day.weighIn ? "logged" : day.lastWeighIn ? `last ${formatWeight(day.lastWeighIn.kg, unit)}` : "no entries yet") : " "}</span>
        </button>
        <button type="button" className={tile} style={tileStyle} onClick={() => setSheet("food")} disabled={!ready} aria-label={`Food today ${day ? Math.round(day.totals.kcal) : 0} kcal. Add food`}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>Food</span>
          {value(ready && day && day.totals.entries > 0 ? `${Math.round(day.totals.kcal).toLocaleString("en-GB")}` : null, "Log food")}
          <span className="text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
            {ready && day ? (day.target ? `${Math.max(0, Math.round(day.target.kcal - day.totals.kcal)).toLocaleString("en-GB")} left of ${day.target.kcal.toLocaleString("en-GB")}` : day.totals.entries > 0 ? "kcal today" : "nothing yet") : " "}
          </span>
        </button>
        <button type="button" className={tile} style={tileStyle} onClick={() => setSheet("sleep")} disabled={!ready} aria-label={day?.night ? `Sleep ${formatHoursMin(day.night.asleepMin)}. Edit` : "Log sleep"}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>Sleep</span>
          {value(ready && day?.night ? formatHoursMin(day.night.asleepMin) : null, "Log sleep")}
          <span className="text-[11px]" style={{ color: "#6f6f76" }}>{ready && day ? (day.night ? "last night" : "last night") : " "}</span>
        </button>
      </div>
      {ready && today && (
        <>
          <WeightSheet
            open={sheet === "weight"}
            onClose={() => setSheet(null)}
            unit={unit}
            date={wDate}
            today={today}
            onDateChange={setWeightDate}
            lastKg={day.onDate?.kg ?? day.lastWeighIn?.kg ?? null}
            trendKg={day.trend?.trendKg ?? null}
            hasEntry={day.onDate != null}
            onSave={(kg, d) => saveWeighIn(d, kg, nowIso())}
            onDelete={async () => (day.onDate ? deleteWeighIn(day.onDate.id) : { ok: true as const })}
          />
          <LoggerSheet
            state={sheet === "food" ? {} : null}
            onClose={() => setSheet(null)}
            date={today}
            today={today}
            tz={now.tz}
            consumedKcal={day.totals.kcal}
            targetKcal={day.target?.kcal ?? null}
            entries={data.foodEntries}
            saved={data.savedFoods}
            onLog={(food: FoodInput, savedFoodId?: string) => logFood(today, food, nowIso(), savedFoodId)}
            onToggleFavourite={toggleFavourite}
            onRemoveSaved={removeSavedFood}
          />
          <SleepSheet open={sheet === "sleep"} onClose={() => setSheet(null)} prefill={sleepPrefill(data.sleepNights)} existing={day.night} dateLabel="today" onSave={(input: SleepInput) => saveSleepNight(today, input, nowIso())} />
        </>
      )}
    </>
  );
}
