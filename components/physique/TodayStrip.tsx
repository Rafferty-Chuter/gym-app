"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useHealthAutoPull, useHealthLink } from "@/lib/physique/io/healthLink";
import { useNativeHealth, useNativeHealthSync } from "@/lib/physique/io/nativeHealth";
import { useUnit } from "@/lib/unit-preference";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { deleteWeighIn, saveSleepNight, saveWeighIn, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { logFood, removeSavedFood, saveRecipe, setFoodPrefs, toggleFavourite, useFoodPrefs, type FoodInput } from "@/lib/physique/io/foodData";
import { dayTotals, formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import { latestTrend } from "@/lib/physique/weight";
import { scaleJump, withWeighIn, type ScaleJumpInputs } from "@/lib/physique/scaleJump";
import { jumpShort } from "@/lib/physique/scaleJumpWords";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { nightsByDate } from "@/lib/physique/sleep";
import { targetInEffect } from "@/lib/physique/intake";
import { formatBodyWeight } from "@/lib/units";
import { splitValue } from "@/components/physique/PulseTile";
import { MacroBars, NutritionRing } from "@/components/food/NutritionRing";
import WeightSheet from "@/components/physique/WeightSheet";
import ScaleJumpCard from "@/components/physique/ScaleJumpCard";
import LoggerSheet from "@/components/food/LoggerSheet";
import SleepSheet from "@/components/physique/SleepSheet";
import type { LocalDate } from "@/lib/dates";

type SheetKind = "weight" | "food" | "sleep" | null;

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * Home's Today section (R7, compact tiles in H2): the day's energy as a
 * ring with the macro bars, then today's weigh-in and last night's sleep.
 * Each surface taps straight into its sheet; the week behind weight and
 * sleep is drawn in the "Last 7 days" tiles below, so it is not repeated
 * here.
 */
export default function TodayStrip() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const data = useBodyData();
  const prefs = useFoodPrefs();
  const workouts = useWorkouts();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [weightDate, setWeightDate] = useState<LocalDate | null>(null);
  const today = now?.today ?? null;
  const wDate = weightDate ?? today ?? "";
  const healthLink = useHealthLink();
  const nativeHealth = useNativeHealth();
  // In the iPhone app, Apple Health is read on the phone (B11) and replaces the Health Auto Export pull.
  useHealthAutoPull(hydrated && !!healthLink?.token && !nativeHealth);
  useNativeHealthSync(hydrated && !!nativeHealth);

  const day = useMemo(() => {
    if (!today || !now) return null;
    const weighIn = data.weighIns.find((w) => w.date === today) ?? null;
    const lastWeighIn = data.weighIns.at(-1) ?? null;
    const totals = dayTotals(data.foodEntries, today);
    const target = targetInEffect(data.program, today);
    // The same night the Sleep tab shows: the watch's first, never an imported or typed one stored earlier.
    const night = nightsByDate(data.sleepNights).get(today)?.night ?? null;
    const trend = latestTrend(data.weighIns);
    const onDate = data.weighIns.find((w) => w.date === wDate) ?? null;
    return { weighIn, lastWeighIn, totals, target, night, trend, onDate };
  }, [data, today, now, wDate]);

  // IN2: why today's weigh-in jumped, when it did.
  const jumpInputs = useMemo<ScaleJumpInputs | null>(() => (now ? { weighIns: data.weighIns, foodEntries: data.foodEntries, dayFlags: data.dayFlags, workouts, tz: now.tz } : null), [data, workouts, now]);
  const jump = useMemo(() => (jumpInputs && today && day?.weighIn ? scaleJump(jumpInputs, today) : null), [jumpInputs, today, day]);
  const explain = (kg: number, d: LocalDate) => {
    const j = jumpInputs ? scaleJump(withWeighIn(jumpInputs, d, kg), d) : null;
    return j ? jumpShort(j, unit, d === today) : null;
  };

  const ready = hydrated && now && day;
  const nowIso = () => new Date().toISOString();
  const tile = "flex flex-col rounded-[16px] px-3.5 pb-3 pt-3.5 text-left transition-colors active:bg-[var(--surface-raised)] disabled:opacity-60";
  const tileStyle = { background: "var(--surface)" };

  // Weight tile words: the trend under today's weigh-in; the rate is on the Weight tile below.
  const weightSub = !ready || !day ? " " : day.trend ? `Trend ${formatBodyWeight(day.trend.trendKg, unit)}` : day.lastWeighIn ? `Last ${formatBodyWeight(day.lastWeighIn.kg, unit)}` : "No entries yet";
  const sleepSub = !ready || !day ? " " : "Last night";
  const weightValue = ready && day?.weighIn ? splitValue(formatBodyWeight(day.weighIn.kg, unit)) : null;
  const sleepValue = ready && day?.night ? splitValue(formatHoursMin(day.night.asleepMin)) : null;

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[16px] p-4" style={{ background: "var(--surface)" }} aria-label="Nutrition today">
        <div className="flex items-center justify-between">
          <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
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

      <div className="mt-2.5 grid grid-cols-2 gap-2.5" role="group" aria-label="Weight and sleep">
        <button type="button" className={tile} style={tileStyle} onClick={() => { setWeightDate(null); setSheet("weight"); }} disabled={!ready} aria-label={day?.weighIn ? `Weight today ${formatBodyWeight(day.weighIn.kg, unit)}. ${weightSub}. Edit` : `Weigh in. ${weightSub}`}>
          <TileHead title="Weight" sub={weightSub} />
          <TileValue value={weightValue} empty="Weigh in" />
        </button>
        <button type="button" className={tile} style={tileStyle} onClick={() => setSheet("sleep")} disabled={!ready} aria-label={day?.night ? `Sleep ${formatHoursMin(day.night.asleepMin)} ${sleepSub}. Edit` : "Log sleep"}>
          <TileHead title="Sleep" sub={sleepSub} />
          <TileValue value={sleepValue} empty="Log sleep" />
        </button>
      </div>

      {ready && jump && <ScaleJumpCard jump={jump} unit={unit} />}

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
            explain={explain}
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

function TileHead({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </span>
      <span className="mt-0.5 truncate text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
        {sub}
      </span>
    </>
  );
}

/** Today's number with its unit quieter, or what to do when there is none yet. */
function TileValue({ value, empty }: { value: { main: string; suffix: string } | null; empty: string }) {
  return (
    <span className="mt-3 text-[24px] font-semibold leading-none tracking-[-0.02em]" style={{ color: value ? "var(--text)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
      {value ? (
        <>
          {value.main}
          <span className="text-[13px] font-medium tracking-normal" style={{ color: "var(--text-tertiary)" }}>
            {value.suffix}
          </span>
        </>
      ) : (
        <span className="text-[17px]">{empty}</span>
      )}
    </span>
  );
}

export { n as formatCount };
