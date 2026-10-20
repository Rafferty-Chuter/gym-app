"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { type LocalDate, type Now } from "@/lib/dates";
import { saveSleepNight, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { SLEEP_REFERENCE_H, nightsByDate } from "@/lib/physique/sleep";
import { formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import { trendBars } from "@/lib/physique/sleepView";
import { nightAverages, nightScore, wakeConsistency, type NightAverages } from "@/lib/physique/sleepScore";
import { recoveryRead } from "@/lib/physique/recovery";
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import NightHero, { nightLabel } from "@/components/sleep/NightHero";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import ConsistencyCard from "@/components/sleep/ConsistencyCard";
import NightBars from "@/components/sleep/NightBars";
import RecoveryCard from "@/components/sleep/RecoveryCard";
import { Chevron } from "@/components/sleep/parts";
import AppleHealthSheet from "@/components/health/AppleHealthSheet";
import { useHealthAutoPull, useHealthLink } from "@/lib/physique/io/healthLink";
import { useNativeHealth, useNativeHealthSync } from "@/lib/physique/io/nativeHealth";

/**
 * The Sleep tab (05-design §9.6, rev 4 after WHOOP and Bevel, in Sleep's
 * own colours): last night's score against 8 hours with its bedtime and
 * wake time, wake-time consistency, two weeks of nights with their plain
 * averages, and recovery. Missing nights are empty slots, never a list.
 * Data here, reading in the weekly report (S10): no sentences about the
 * average and no week-against-month trends.
 * The Tonight planner and sleep debt went in S9: the goal and a steady
 * wake time are what a person can act on.
 */
export default function SleepPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="theme-sleep min-h-screen pb-28" />;
  return <SleepContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function SleepContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);
  const healthLink = useHealthLink();
  const nativeHealth = useNativeHealth();
  const [healthOpen, setHealthOpen] = useState(false);
  useHealthAutoPull(!!healthLink?.token && !nativeHealth);
  useNativeHealthSync(!!nativeHealth);
  // Nights arrive on their own from Health Auto Export or, in the iPhone app, from Apple Health directly (B11).
  const healthOn = !!healthLink?.token || !!nativeHealth;
  const [night, setNight] = useState<LocalDate>(today);
  const [sheetDate, setSheetDate] = useState<LocalDate | null>(() => {
    const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today ? q : null;
  });

  const model = useMemo(() => {
    const byDate = nightsByDate(data.sleepNights);
    const read = analysis?.sleep ?? null;
    return {
      byDate,
      selected: byDate.get(night)?.night ?? null,
      score: nightScore(data.sleepNights, night),
      consistency: wakeConsistency(data.sleepNights, today),
      bars: trendBars(data.sleepNights, now),
      averages: nightAverages(data.sleepNights, today),
      recovery: recoveryRead(data.sleepNights, today, read ? read.status === "short" || read.status === "severe" : false),
      prefill: sleepPrefill(data.sleepNights),
      anyNight: byDate.size > 0,
    };
  }, [data.sleepNights, today, night, now, analysis]);

  const nowIso = () => new Date().toISOString();

  return (
    <main className="theme-sleep min-h-screen pb-28">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 sm:px-6">
        {/* With Apple Health connected the watch is the record; a missing night is added from the night itself. */}
        <PageHeader caption={`Today · ${longLocalDate(today)}`} title="Sleep" action={healthOn ? undefined : { label: "Add a night", onClick: () => setSheetDate(night) }} />

        <NightHero night={model.selected} score={model.score} date={night} today={today} waiting={healthOn} onDateChange={(d) => setNight(d > today ? today : d)} onLog={() => setSheetDate(night)} />

        {model.anyNight && <ConsistencyCard read={model.consistency} />}

        {model.anyNight && (
          <NightBars
            bars={model.bars}
            refH={SLEEP_REFERENCE_H}
            selected={night}
            onSelect={setNight}
            note={<AverageStats averages={model.averages} />}
          />
        )}

        <RecoveryCard read={model.recovery} />

        {/* Set up from here until connected; after that it is managed in Profile (B2). */}
        {!healthLink && !nativeHealth && (
          <button type="button" onClick={() => setHealthOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-[16px] px-4 py-3 text-left transition-colors active:bg-[var(--sl-surface-raised)]" style={{ background: "var(--sl-surface)" }} aria-label="Apple Health. Open settings">
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold">Apple Health</span>
              <span className="text-[12px]" style={{ color: "var(--sl-text-secondary)" }}>
                Sleep, HRV and weight arrive on their own
              </span>
            </span>
            <span style={{ color: "var(--sl-text-tertiary)" }}>
              <Chevron />
            </span>
          </button>
        )}
        <AppleHealthSheet open={healthOpen} onClose={() => setHealthOpen(false)} />
      </div>

      <SleepSheet
        open={sheetDate !== null}
        onClose={() => setSheetDate(null)}
        prefill={model.prefill}
        existing={sheetDate ? (model.byDate.get(sheetDate)?.night ?? null) : null}
        nightTitle={nightLabel(sheetDate ?? today, today)}
        onSave={(input: SleepInput) => saveSleepNight(sheetDate ?? today, input, nowIso())}
      />
    </main>
  );
}

/** The two weeks as three plain numbers: hours asleep, bedtime and wake time on average. */
function AverageStats({ averages }: { averages: NightAverages }) {
  const cells = [
    { label: "Asleep", value: averages.asleepH == null ? "–" : formatHoursMin(averages.asleepH * 60) },
    { label: "Bedtime", value: averages.bedtime ?? "–" },
    { label: "Wake", value: averages.wake ?? "–" },
  ];
  return (
    <div className="grid grid-cols-3" role="group" aria-label="Averages over the last 14 nights">
      {cells.map((c, i) => (
        <div key={c.label} className="flex flex-col" style={i > 0 ? { borderLeft: "1px solid var(--sl-border)", paddingLeft: 12 } : undefined}>
          <span className="text-[12px]" style={{ color: "var(--sl-text-secondary)" }}>
            Avg {c.label.toLowerCase()}
          </span>
          <span className="text-[20px] font-semibold tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}
