"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useSingleton } from "@/lib/storage/useStored";
import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { saveSleepNight, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { profileStore } from "@/lib/physique/io/repos";
import { savePhysiqueProfile } from "@/lib/physique/io/profile";
import { SLEEP_WINDOW_NIGHTS, clampSleepGoal, nightsByDate } from "@/lib/physique/sleep";
import { sleepPrefill } from "@/lib/physique/dayTotals";
import { bedtimePlan, nightWord, sleepContributors, sleepInsight, trendBars } from "@/lib/physique/sleepView";
import { recoveryRead, stageSplit, stageTypical } from "@/lib/physique/recovery";
import { STATUS_HEX } from "@/lib/ui/status";
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import GapRows from "@/components/physique/GapRows";
import { findGaps, gapLines } from "@/lib/physique/gaps";
import { Caption } from "@/components/physique/ui";
import type { SleepStatus } from "@/lib/physique/types";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import SleepHero from "@/components/sleep/SleepHero";
import StageCard from "@/components/sleep/StageCard";
import RecoveryCard from "@/components/sleep/RecoveryCard";
import SleepContributors from "@/components/sleep/SleepContributors";
import BedtimePlanner from "@/components/sleep/BedtimePlanner";
import SleepTrend from "@/components/sleep/SleepTrend";
import { StatusDot } from "@/components/physique/ui";
import AppleHealthSheet from "@/components/health/AppleHealthSheet";
import { receivedLabel, useHealthAutoPull, useHealthLink } from "@/lib/physique/io/healthLink";

const READ_DOT: Record<SleepStatus, string> = { ok: STATUS_HEX.good, short: STATUS_HEX.watch, severe: STATUS_HEX.attention, unknown: STATUS_HEX.unknown };

/**
 * The Sleep tab (05-design §9.6, rev 3 after Bevel and WHOOP): one night
 * as a ring with its numbers and arrows to step back, its stages, recovery,
 * tonight's lights-out, 14 nights with the engine's read, contributors.
 */
export default function SleepPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <Shell />;
  return <SleepContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
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

function SleepContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);
  const profile = useSingleton(profileStore);
  const goalH = clampSleepGoal(profile?.sleepGoalH);
  const wakeSetting = profile?.wakeTimeHHMM;
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
    const from = addDays(today, -(SLEEP_WINDOW_NIGHTS - 1));
    const nights = [...byDate.values()]
      .filter((n) => n.date >= from && n.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((n) => n.night);
    const lastNight = byDate.get(night)?.night ?? null;
    const prefill = sleepPrefill(data.sleepNights);
    const read = analysis?.sleep ?? null;
    const gapRows = gapLines(findGaps({ foodEntries: [], dayFlags: {}, weighIns: [], sleepNights: data.sleepNights }, today, ["sleep"]), today);
    return {
      gapRows,
      byDate,
      nights,
      lastNight,
      prefill,
      word: lastNight ? nightWord(lastNight.asleepMin / 60, goalH) : null,
      split: lastNight ? stageSplit(lastNight) : null,
      typical: stageTypical(data.sleepNights, today),
      contributors: sleepContributors(data.sleepNights, now, goalH),
      plan: bedtimePlan(wakeSetting ?? prefill.wakeTime, goalH, read?.debt7h ?? null),
      bars: trendBars(data.sleepNights, now),
      insight: read ? sleepInsight(read, goalH) : null,
      recovery: recoveryRead(data.sleepNights, today, read ? read.status === "short" || read.status === "severe" : false),
    };
  }, [data.sleepNights, today, night, now, goalH, wakeSetting, analysis]);

  const nowIso = () => new Date().toISOString();
  async function saveProfile(patch: { sleepGoalH?: number; wakeTimeHHMM?: string }) {
    try {
      await savePhysiqueProfile(patch);
    } catch {
      // Storage full or blocked: the planner keeps showing the derived values.
    }
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={`Sleep goal ${formatHoursMin(goalH * 60)}`} title="Sleep" action={{ label: "Log sleep", onClick: () => setSheetDate(night) }} />

        <SleepHero night={model.lastNight} date={night} today={today} word={model.word} goalH={goalH} onDateChange={(d) => setNight(d > today ? today : d)} onLog={() => setSheetDate(night)} />

        <GapRows lines={model.gapRows} onSelect={(l) => setSheetDate(l.date)} />

        {model.split && <StageCard split={model.split} typical={model.typical} />}

        <RecoveryCard read={model.recovery} />

        <BedtimePlanner plan={model.plan} onWakeChange={(hhmm) => void saveProfile({ wakeTimeHHMM: hhmm })} />

        {model.nights.length > 0 && (
          <SleepTrend bars={model.bars} goalH={goalH} selected={night} onSelect={setNight}>
            {analysis && model.insight && (
              <p className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: "#a3a3a8" }}>
                <span className="mt-[6px] flex">
                  <StatusDot color={READ_DOT[analysis.sleep.status]} />
                </span>
                {model.insight}
              </p>
            )}
          </SleepTrend>
        )}

        {model.nights.length > 0 && <SleepContributors items={model.contributors} />}

        <button type="button" onClick={() => setHealthOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-left transition-colors active:bg-[#1d1d20]" style={{ background: "#141416" }} aria-label="Apple Health. Open settings">
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
              Apple Health
            </span>
            <span className="text-[12px]" style={{ color: "#a3a3a8" }}>
              {healthLink ? (healthLink.lastPayloadAt ? `Auto-upload on · last received ${receivedLabel(healthLink.lastPayloadAt, new Date())}` : healthLink.lastError === "not_configured" ? "Token ready · server not set up yet" : "Token ready · waiting for the first upload") : "Sleep, HRV and weight arrive on their own"}
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <AppleHealthSheet open={healthOpen} onClose={() => setHealthOpen(false)} />

        <div className="pb-2">
          <Caption>Logged values stay on this device. Export a backup from Profile.</Caption>
        </div>
      </div>

      <SleepSheet
        open={sheetDate !== null}
        onClose={() => setSheetDate(null)}
        prefill={model.prefill}
        existing={sheetDate ? (model.byDate.get(sheetDate)?.night ?? null) : null}
        dateLabel={!sheetDate || sheetDate === today ? "today" : longLocalDate(sheetDate)}
        onSave={(input: SleepInput) => saveSleepNight(sheetDate ?? today, input, nowIso())}
        goalH={goalH}
        onGoalChange={(h) => saveProfile({ sleepGoalH: h })}
      />
    </main>
  );
}
