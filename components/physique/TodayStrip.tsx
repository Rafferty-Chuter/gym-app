"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useHealthAutoPull, useHealthLink } from "@/lib/physique/io/healthLink";
import { useUnit } from "@/lib/unit-preference";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useSingleton } from "@/lib/storage/useStored";
import { profileStore } from "@/lib/physique/io/repos";
import { deleteWeighIn, saveSleepNight, saveWeighIn, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { logFood, removeSavedFood, saveRecipe, setFoodPrefs, toggleFavourite, useFoodPrefs, type FoodInput } from "@/lib/physique/io/foodData";
import { dayTotals, formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import { displayRate, latestTrend, segmentStart, trendSeries } from "@/lib/physique/weight";
import { clampSleepGoal } from "@/lib/physique/sleep";
import { trendBars } from "@/lib/physique/sleepView";
import { targetInEffect } from "@/lib/physique/intake";
import { formatWeight } from "@/lib/units";
import { formatRate } from "@/components/physique/WeightChartCard";
import { MacroBars, NutritionRing } from "@/components/food/NutritionRing";
import WeightSheet from "@/components/physique/WeightSheet";
import LoggerSheet from "@/components/food/LoggerSheet";
import SleepSheet from "@/components/physique/SleepSheet";
import type { LocalDate } from "@/lib/dates";

type SheetKind = "weight" | "food" | "sleep" | null;

/** Trend points drawn in the weight tile. OURS. */
export const SPARK_DAYS = 14;
/** Nights drawn in the sleep tile. OURS. */
export const SLEEP_TILE_NIGHTS = 7;

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * Home's Today section (R7): the day's energy as a ring with the macro
 * bars, then Weight and Sleep tiles with a fortnight of trend and a week
 * of nights. Each surface taps straight into its sheet, as the old strip
 * did; the numbers are the engine's and the words are the tab's.
 */
export default function TodayStrip() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const data = useBodyData();
  const prefs = useFoodPrefs();
  const profile = useSingleton(profileStore);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [weightDate, setWeightDate] = useState<LocalDate | null>(null);
  const today = now?.today ?? null;
  const wDate = weightDate ?? today ?? "";
  const healthLink = useHealthLink();
  useHealthAutoPull(hydrated && !!healthLink?.token);

  const day = useMemo(() => {
    if (!today || !now) return null;
    const weighIn = data.weighIns.find((w) => w.date === today) ?? null;
    const lastWeighIn = data.weighIns.at(-1) ?? null;
    const totals = dayTotals(data.foodEntries, today);
    const target = targetInEffect(data.program, today);
    const night = data.sleepNights.find((n) => n.date === today) ?? null;
    const trend = latestTrend(data.weighIns);
    const series = trendSeries(data.weighIns).slice(-SPARK_DAYS);
    const rate = data.weighIns.length ? displayRate(data.weighIns, today, segmentStart({ goal: data.goal, dayFlags: data.dayFlags, today }), data.dayFlags) : null;
    const nights = trendBars(data.sleepNights, now).slice(-SLEEP_TILE_NIGHTS);
    const onDate = data.weighIns.find((w) => w.date === wDate) ?? null;
    return { weighIn, lastWeighIn, totals, target, night, trend, series, rate, nights, onDate };
  }, [data, today, now, wDate]);

  const goalH = clampSleepGoal(profile?.sleepGoalH);
  const ready = hydrated && now && day;
  const nowIso = () => new Date().toISOString();
  const tile = "flex min-h-[112px] flex-col justify-between rounded-[12px] px-3 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)] disabled:opacity-60";
  const tileStyle = { background: "var(--surface)" };

  // Weight tile words: the trend and its rate when the engine has one, else the last entry.
  const weightSub = !ready || !day ? " " : day.rate ? `Trend ${formatWeight(day.rate.result.bw, unit)} · ${formatRate(day.rate.result.ratePctPerWeek)}` : day.trend ? `Trend ${formatWeight(day.trend.trendKg, unit)}` : day.lastWeighIn ? `Last ${formatWeight(day.lastWeighIn.kg, unit)}` : "No entries yet";
  const sleepSub = !ready || !day ? " " : day.night ? `of ${formatHoursMin(goalH * 60)} goal` : "Last night";

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[12px] p-4" style={{ background: "var(--surface)" }} aria-label="Nutrition today">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Nutrition
          </span>
          <button type="button" onClick={() => setSheet("food")} disabled={!ready} className="flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-[var(--primary-pressed)] disabled:opacity-40" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }} aria-label="Log food">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <NutritionRing eatenKcal={ready && day ? day.totals.kcal : 0} targetKcal={ready && day?.target ? day.target.kcal : null} view={prefs.view} onToggleView={() => void setFoodPrefs({ view: prefs.view === "remaining" ? "consumed" : "remaining" })} />
        <MacroBars totals={ready && day ? day.totals : { proteinG: 0, fatG: 0, carbsG: 0 }} target={ready && day ? day.target : null} />
        {ready && day && !day.target && (
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            No targets yet.{" "}
            <Link href="/body/goal" className="underline" style={{ color: "var(--text-secondary)" }}>
              Set a goal
            </Link>{" "}
            to get them.
          </p>
        )}
      </section>

      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Weight and sleep">
        <button type="button" className={tile} style={tileStyle} onClick={() => { setWeightDate(null); setSheet("weight"); }} disabled={!ready} aria-label={day?.weighIn ? `Weight today ${formatWeight(day.weighIn.kg, unit)}. ${weightSub}. Edit` : `Weigh in. ${weightSub}`}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Weight
          </span>
          <span className="text-[22px] font-semibold leading-tight" style={{ color: ready && day?.weighIn ? "var(--text)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {ready && day?.weighIn ? formatWeight(day.weighIn.kg, unit) : "Weigh in"}
          </span>
          <Sparkline points={ready && day ? day.series.map((p) => p.trendKg) : []} />
          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {weightSub}
          </span>
        </button>
        <button type="button" className={tile} style={tileStyle} onClick={() => setSheet("sleep")} disabled={!ready} aria-label={day?.night ? `Sleep ${formatHoursMin(day.night.asleepMin)} ${sleepSub}. Edit` : "Log sleep"}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Sleep
          </span>
          <span className="text-[22px] font-semibold leading-tight" style={{ color: ready && day?.night ? "var(--text)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {ready && day?.night ? formatHoursMin(day.night.asleepMin) : "Log sleep"}
          </span>
          <NightBars nights={ready && day ? day.nights : []} goalH={goalH} />
          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {sleepSub}
          </span>
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
            bodyFatPct={day.onDate?.bodyFatPct ?? null}
            onSave={(kg, d, bf) => saveWeighIn(d, kg, nowIso(), bf)}
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
            onSaveRecipe={(draft) => saveRecipe(draft, nowIso())}
          />
          <SleepSheet open={sheet === "sleep"} onClose={() => setSheet(null)} prefill={sleepPrefill(data.sleepNights)} existing={day.night} nightTitle="Last night" onSave={(input: SleepInput) => saveSleepNight(today, input, nowIso())} />
        </>
      )}
    </>
  );
}

/** A fortnight of trend weight as one white line; nothing under two points. */
function Sparkline({ points }: { points: readonly number[] }) {
  const w = 120;
  const h = 28;
  if (points.length < 2) return <span className="block" style={{ height: h }} aria-hidden />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(0.2, max - min);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: h }} preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke="var(--text)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Seven nights as bars against the goal; a missing night is a short grey stub. */
function NightBars({ nights, goalH }: { nights: ReadonlyArray<{ date: string; asleepH: number | null }>; goalH: number }) {
  const h = 28;
  const max = Math.max(goalH, ...nights.map((x) => x.asleepH ?? 0), 1);
  return (
    <span className="flex items-end gap-1" style={{ height: h }} aria-hidden>
      {nights.map((x) => (
        <span key={x.date} className="flex-1 rounded-[2px]" style={{ height: x.asleepH != null ? `${Math.max(3, (x.asleepH / max) * h)}px` : "3px", background: x.asleepH != null ? (x.asleepH >= goalH ? "var(--sky)" : "color-mix(in srgb, var(--sky) 50%, transparent)") : "var(--border)" }} />
      ))}
    </span>
  );
}

export { n as formatCount };
