"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useSingleton } from "@/lib/storage/useStored";
import { type LocalDate, type Now } from "@/lib/dates";
import { saveSleepNight, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { profileStore } from "@/lib/physique/io/repos";
import { clampSleepGoal, nightsByDate } from "@/lib/physique/sleep";
import { formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import { sleepInsight, trendBars } from "@/lib/physique/sleepView";
import { nightScore, sleepTrends, wakeConsistency } from "@/lib/physique/sleepScore";
import { recoveryRead } from "@/lib/physique/recovery";
import { STATUS_HEX } from "@/lib/ui/status";
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import NightHero from "@/components/sleep/NightHero";
import ConsistencyCard from "@/components/sleep/ConsistencyCard";
import NightBars from "@/components/sleep/NightBars";
import { TrendLines } from "@/components/sleep/TrendLines";
import RecoveryCard from "@/components/sleep/RecoveryCard";
import { Chevron, SCaption } from "@/components/sleep/parts";
import AppleHealthSheet from "@/components/health/AppleHealthSheet";
import { useHealthAutoPull, useHealthLink } from "@/lib/physique/io/healthLink";
import type { SleepStatus } from "@/lib/physique/types";

const READ_DOT: Record<SleepStatus, string> = { ok: STATUS_HEX.good, short: STATUS_HEX.watch, severe: STATUS_HEX.attention, unknown: STATUS_HEX.unknown };

/**
 * The Sleep tab (05-design §9.6, rev 4 after WHOOP and Bevel, in Sleep's
 * own colours): last night's score against the goal with why, wake-time
 * consistency, two weeks of nights, the last week against the 30 nights
 * before it, and recovery. Missing nights are empty slots, never a list.
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
  const profile = useSingleton(profileStore);
  const goalH = clampSleepGoal(profile?.sleepGoalH);
  const healthLink = useHealthLink();
  const [healthOpen, setHealthOpen] = useState(false);
  useHealthAutoPull(!!healthLink?.token);
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
      score: nightScore(data.sleepNights, night, goalH),
      consistency: wakeConsistency(data.sleepNights, today),
      bars: trendBars(data.sleepNights, now),
      // HRV and resting heart rate have their own card below.
      trends: sleepTrends(data.sleepNights, today).filter((r) => r.id !== "hrv" && r.id !== "rhr"),
      recovery: recoveryRead(data.sleepNights, today, read ? read.status === "short" || read.status === "severe" : false),
      insight: read ? sleepInsight(read, goalH) : null,
      prefill: sleepPrefill(data.sleepNights),
      anyNight: byDate.size > 0,
    };
  }, [data.sleepNights, today, night, now, goalH, analysis]);

  const nowIso = () => new Date().toISOString();

  return (
    <main className="theme-sleep min-h-screen pb-28">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 sm:px-6">
        <PageHeader caption={`Sleep goal ${formatHoursMin(goalH * 60)}`} title="Sleep" action={{ label: "Add a night", onClick: () => setSheetDate(night) }} />

        <NightHero night={model.selected} score={model.score} date={night} today={today} waiting={!!healthLink?.token} onDateChange={(d) => setNight(d > today ? today : d)} onLog={() => setSheetDate(night)} />

        {model.anyNight && <ConsistencyCard read={model.consistency} />}

        {model.anyNight && (
          <NightBars
            bars={model.bars}
            goalH={goalH}
            selected={night}
            onSelect={setNight}
            note={
              <div className="flex flex-col gap-3">
                {analysis && model.insight && (
                  <p className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: "var(--sl-text-secondary)" }}>
                    <span className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: READ_DOT[analysis.sleep.status] }} aria-hidden />
                    {model.insight}
                  </p>
                )}
                <TrendLines rows={model.trends} />
              </div>
            }
          />
        )}

        <RecoveryCard read={model.recovery} />

        {/* Set up from here until connected; after that it is managed in Profile (B2). */}
        {!healthLink && (
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

        <div className="pb-2">
          <SCaption>Logged values stay on this device. Export a backup from Profile.</SCaption>
        </div>
      </div>

      <SleepSheet
        open={sheetDate !== null}
        onClose={() => setSheetDate(null)}
        prefill={model.prefill}
        existing={sheetDate ? (model.byDate.get(sheetDate)?.night ?? null) : null}
        dateLabel={!sheetDate || sheetDate === today ? "today" : longLocalDate(sheetDate)}
        onSave={(input: SleepInput) => saveSleepNight(sheetDate ?? today, input, nowIso())}
      />
    </main>
  );
}
