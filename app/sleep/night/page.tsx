"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import { nightLabel } from "@/components/sleep/NightHero";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import Hypnogram from "@/components/sleep/Hypnogram";
import StageBars from "@/components/sleep/StageBars";
import { SCaption, SCard, SRow, ScoreRing } from "@/components/sleep/parts";
import { addDays, type LocalDate } from "@/lib/dates";
import { formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import { saveSleepNight, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { profileStore } from "@/lib/physique/io/repos";
import { recoveryRead, stageSplit, stageTypical } from "@/lib/physique/recovery";
import { clampSleepGoal, nightsByDate } from "@/lib/physique/sleep";
import { nightScore } from "@/lib/physique/sleepScore";
import { bedTime } from "@/lib/physique/sleepView";
import { useSingleton } from "@/lib/storage/useStored";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";

/**
 * One night in full (S8, after Bevel's "Primary sleep" and WHOOP's sleep
 * detail): the score with why, the clock times, the stages across the
 * night and as tiles, what the score is made of, and that morning's HRV
 * and resting heart rate against usual.
 */
function NightDetail() {
  const params = useSearchParams();
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const profile = useSingleton(profileStore);
  const goalH = clampSleepGoal(profile?.sleepGoalH);
  const today = now?.today ?? null;
  const q = params.get("date");
  const date: LocalDate | null = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
  const [editing, setEditing] = useState(false);

  const model = useMemo(() => {
    if (!date) return null;
    const byDate = nightsByDate(data.sleepNights);
    const night = byDate.get(date)?.night ?? null;
    const rec = recoveryRead(data.sleepNights, date);
    return {
      night,
      score: nightScore(data.sleepNights, date, goalH),
      split: night ? stageSplit(night) : null,
      typical: stageTypical(data.sleepNights, addDays(date, -1)),
      bed: night ? bedTime(night) : null,
      hrvUsual: rec.hrv?.baseline ?? null,
      rhrUsual: rec.rhr?.baseline ?? null,
    };
  }, [data.sleepNights, date, goalH]);

  if (!hydrated || !today || !date || !model) return <main className="theme-sleep min-h-screen" />;

  const { night, score, split, typical, bed } = model;
  const title = nightLabel(date, today);

  return (
    <main className="theme-sleep min-h-screen pb-28">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 sm:px-6">
        <PageHeader back={{ href: "/sleep", label: "Sleep" }} title={title} />

        {!night || !score ? (
          <p className="text-[15px]" style={{ color: "var(--sl-text-secondary)" }}>
            No sleep for this night.
          </p>
        ) : (
          <>
            <section aria-label="Score" className="flex items-center gap-5">
              <ScoreRing score={score.score} word={score.word} size={128} stroke={10} label={`Sleep score ${score.score}, ${score.word}`} />
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-[13px]" style={{ color: "var(--sl-text-secondary)" }}>
                  {longLocalDate(addDays(date, -1))} to {longLocalDate(date)}
                </span>
                <p className="text-[15px] leading-snug">{score.reason}</p>
              </div>
            </section>

            <SCard label="Times" className="grid grid-cols-2">
              <TimeCell label="Asleep" value={formatHoursMin(night.asleepMin)} />
              <TimeCell label={bed?.kind === "in_bed" ? "In bed" : "Sleep period"} value={bed ? formatHoursMin(bed.min) : "–"} left />
              <TimeCell label="Fell asleep" value={night.bedtime ?? "–"} top />
              <TimeCell label="Woke" value={night.wakeTime ?? "–"} left top />
            </SCard>

            {split && (
              <SCard title="Stages" aside={<SCaption>From the watch</SCaption>} label="Stages" className="flex flex-col gap-4 px-4 py-4">
                {night.segments?.length && night.bedtime ? <Hypnogram segments={night.segments} bedtime={night.bedtime} /> : null}
                <StageBars split={split} typical={typical} />
                {!night.segments?.length && (
                  <p className="text-[12px] leading-snug" style={{ color: "var(--sl-text-tertiary)" }}>
                    For the stages across the night, turn off Aggregate for sleep in Health Auto Export.
                  </p>
                )}
              </SCard>
            )}

            <SCard title="Score" label="How the score adds up" className="divide-y divide-[var(--sl-border)]">
              {score.parts.map((p) => (
                <ScoreLine key={p.id} label={p.label} value={p.value} points={p.points} />
              ))}
              <ScoreLine label="Score" points={score.score} total />
            </SCard>

            {(night.hrvMs || night.restingHr) && (
              <SCard title="That morning" label="Recovery that morning" className="divide-y divide-[var(--sl-border)]">
                {night.hrvMs ? <SRow label="HRV" sub={model.hrvUsual ? `Usually ${model.hrvUsual} ms` : "No baseline yet"} value={`${Math.round(night.hrvMs)} ms`} /> : null}
                {night.restingHr ? <SRow label="Resting heart rate" sub={model.rhrUsual ? `Usually ${model.rhrUsual} bpm` : "No baseline yet"} value={`${Math.round(night.restingHr)} bpm`} /> : null}
              </SCard>
            )}

            {night.source !== "healthkit" && (
              <button type="button" onClick={() => setEditing(true)} className="h-[44px] w-full rounded-[12px] text-[15px] font-semibold" style={{ background: "var(--sl-surface-raised)" }}>
                Edit this night
              </button>
            )}
          </>
        )}
      </div>

      <SleepSheet
        open={editing}
        onClose={() => setEditing(false)}
        prefill={sleepPrefill(data.sleepNights)}
        existing={night}
        nightTitle={nightLabel(date, today)}
        onSave={(input: SleepInput) => saveSleepNight(date, input, new Date().toISOString())}
      />
    </main>
  );
}

/** One line of the score: the part, the night's data for it and the points it adds or takes off. */
function ScoreLine({ label, value, points, total }: { label: string; value?: string; points: number; total?: boolean }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4 py-2.5">
      <span className={`w-[5.5rem] shrink-0 text-[15px] ${total ? "font-semibold" : ""}`}>{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--sl-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span className={`shrink-0 text-right text-[15px] ${total ? "font-semibold" : ""}`} style={{ fontVariantNumeric: "tabular-nums", color: !total && points < 0 ? "var(--sl-text-secondary)" : "var(--sl-text)" }}>
        {points < 0 ? `\u2212${-points}` : points}
      </span>
    </div>
  );
}

function TimeCell({ label, value, left, top }: { label: string; value: string; left?: boolean; top?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3" style={{ borderLeft: left ? "1px solid var(--sl-border)" : undefined, borderTop: top ? "1px solid var(--sl-border)" : undefined }}>
      <span className="text-[12px]" style={{ color: "var(--sl-text-secondary)" }}>
        {label}
      </span>
      <span className="text-[20px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

export default function SleepNightPage() {
  return (
    <Suspense fallback={<main className="theme-sleep min-h-screen" />}>
      <NightDetail />
    </Suspense>
  );
}
