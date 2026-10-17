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
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import { Caption } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import SleepHero from "@/components/sleep/SleepHero";
import SleepInsight from "@/components/sleep/SleepInsight";
import SleepContributors from "@/components/sleep/SleepContributors";
import BedtimePlanner from "@/components/sleep/BedtimePlanner";
import SleepTrend from "@/components/sleep/SleepTrend";
import NightsList from "@/components/sleep/NightsList";

/** The Sleep tab (05-design §9.6): last night, the engine's read, contributors, the planner, 14 nights and the list. */
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
  const [sheetDate, setSheetDate] = useState<LocalDate | null>(null);

  const model = useMemo(() => {
    const byDate = nightsByDate(data.sleepNights);
    const from = addDays(today, -(SLEEP_WINDOW_NIGHTS - 1));
    const nights = [...byDate.values()]
      .filter((n) => n.date >= from && n.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((n) => n.night);
    const lastNight = byDate.get(today)?.night ?? null;
    const prefill = sleepPrefill(data.sleepNights);
    const read = analysis?.sleep ?? null;
    return {
      byDate,
      nights,
      lastNight,
      prefill,
      word: lastNight ? nightWord(lastNight.asleepMin / 60, goalH) : null,
      contributors: sleepContributors(data.sleepNights, now, goalH),
      plan: bedtimePlan(wakeSetting ?? prefill.wakeTime, goalH, read?.debt7h ?? null),
      bars: trendBars(data.sleepNights, now),
      insight: read ? sleepInsight(read, goalH) : null,
    };
  }, [data.sleepNights, today, now, goalH, wakeSetting, analysis]);

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
        <PageHeader caption={`Last night · ${longLocalDate(addDays(today, -1))} → ${longLocalDate(today)}`} title="Sleep" action={{ label: "Log sleep", onClick: () => setSheetDate(today) }} />

        <SleepHero night={model.lastNight} word={model.word} goalH={goalH} onLog={() => setSheetDate(today)} />

        {analysis && model.insight && <SleepInsight read={analysis.sleep} text={model.insight} />}

        {model.nights.length > 0 && <SleepContributors items={model.contributors} />}

        <BedtimePlanner plan={model.plan} onWakeChange={(hhmm) => void saveProfile({ wakeTimeHHMM: hhmm })} />

        {model.nights.length > 0 && <SleepTrend bars={model.bars} goalH={goalH} />}

        <NightsList nights={model.nights} today={today} onEdit={(n) => setSheetDate(n.date)} />

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
