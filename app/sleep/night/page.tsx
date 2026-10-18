"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import { nightLabel } from "@/components/sleep/NightHero";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import Hypnogram from "@/components/sleep/Hypnogram";
import StageTiles from "@/components/sleep/StageTiles";
import { RATE_COLOR, SBar, SCaption, SCard, SRow, STAGE_COLOR, ScoreRing } from "@/components/sleep/parts";
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
        <PageHeader caption="Sleep" captionHref="/sleep" captionLabel="Back to Sleep" title={title} />

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
              <section aria-label="Stages" className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <SCaption>Stages</SCaption>
                  <SCaption>From the watch</SCaption>
                </div>
                {night.segments?.length && night.bedtime ? (
                  <div className="rounded-[16px] px-4 py-4" style={{ background: "var(--sl-surface)" }}>
                    <Hypnogram segments={night.segments} bedtime={night.bedtime} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 rounded-[16px] px-4 py-4" style={{ background: "var(--sl-surface)" }}>
                    <div className="flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
                      {(["deep", "core", "rem", "awake"] as const).map((k) => {
                        const total = split.asleepMin + split.awakeMin;
                        const min = k === "deep" ? split.deepMin : k === "core" ? split.coreMin : k === "rem" ? split.remMin : split.awakeMin;
                        return <div key={k} style={{ width: `${(min / total) * 100}%`, background: STAGE_COLOR[k] }} />;
                      })}
                    </div>
                    <p className="text-[12px] leading-snug" style={{ color: "var(--sl-text-tertiary)" }}>
                      For the stages across the night, turn off Aggregate for sleep in Health Auto Export.
                    </p>
                  </div>
                )}
                <StageTiles split={split} typical={typical} />
              </section>
            )}

            <SCard title="Score" label="What the score is made of" className="divide-y divide-[var(--sl-border)]">
              {score.parts.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px]">{p.label}</span>
                    <span className="text-[13px] font-semibold" style={{ color: RATE_COLOR[p.word] }}>
                      {p.word}
                    </span>
                  </div>
                  <SBar fill={p.score / 100} color={RATE_COLOR[p.word]} />
                  <span className="text-[12px]" style={{ color: "var(--sl-text-tertiary)" }}>
                    {p.detail}
                  </span>
                </div>
              ))}
              <p className="px-4 py-3 text-[12px] leading-snug" style={{ color: "var(--sl-text-tertiary)" }}>
                The score is your hours against your sleep goal. Waking off your usual time or a restless night takes points off. Stages are shown, not scored: a watch tells them apart less reliably than a sleep lab.
              </p>
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
