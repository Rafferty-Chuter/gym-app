"use client";

import Link from "next/link";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { Chevron, ScoreRing } from "@/components/sleep/parts";
import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { efficiencyOf } from "@/lib/physique/sleepView";
import type { NightScore } from "@/lib/physique/sleepScore";
import type { SleepNight } from "@/lib/physique/types";

function nightLabel(date: LocalDate, today: LocalDate): string {
  const back = dayDiff(date, today);
  if (back === 0) return "Last night";
  if (back === 1) return "The night before";
  return longLocalDate(date);
}

const arrow = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
    <path d={d} />
  </svg>
);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[12px]" style={{ color: "var(--sl-text-secondary)" }}>
        {label}
      </span>
      <span className="text-[22px] font-semibold tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * One night, open on the page (S8, after Bevel's sleep home and WHOOP's
 * Sleep Performance): the score ring, time asleep against what the night
 * needed, the clock span, one sentence on why, and the way into the
 * night's detail. Arrows step back through earlier nights.
 */
export default function NightHero({
  night,
  score,
  date,
  today,
  waiting,
  onDateChange,
  onLog,
}: {
  night: SleepNight | null;
  score: NightScore | null;
  date: LocalDate;
  today: LocalDate;
  /** Apple Health is connected, so an empty last night is still on its way. */
  waiting: boolean;
  onDateChange: (d: LocalDate) => void;
  onLog: () => void;
}) {
  const btn = "flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-[var(--sl-surface-pressed)] disabled:opacity-30";
  const eff = night ? efficiencyOf(night) : null;
  const span = night?.bedtime && night.wakeTime ? `${night.bedtime} to ${night.wakeTime}` : null;
  return (
    <section aria-label="Night" className="flex flex-col items-center gap-4 pt-1">
      <div className="flex w-full items-center justify-between gap-2">
        <button type="button" onClick={() => onDateChange(addDays(date, -1))} className={btn} style={{ background: "var(--sl-surface-raised)" }} aria-label="Earlier night">
          {arrow("M15 6l-6 6 6 6")}
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-[15px] font-semibold">{nightLabel(date, today)}</span>
          <span className="truncate text-[11px]" style={{ color: "var(--sl-text-tertiary)" }}>
            {longLocalDate(addDays(date, -1))} to {longLocalDate(date)}
          </span>
        </div>
        <button type="button" onClick={() => onDateChange(addDays(date, 1))} disabled={date >= today} className={btn} style={{ background: "var(--sl-surface-raised)" }} aria-label="Later night">
          {arrow("M9 6l6 6-6 6")}
        </button>
      </div>

      {night && score ? (
        <>
          <ScoreRing score={score.score} word={score.word} label={`Sleep score ${score.score}, ${score.word}`} />
          <div className="grid w-full grid-cols-2">
            <Stat label="Time asleep" value={formatHoursMin(night.asleepMin)} />
            <div style={{ borderLeft: "1px solid var(--sl-border)" }}>
              <Stat label="Sleep goal" value={formatHoursMin(score.goalH * 60)} />
            </div>
          </div>
          {(span || eff !== null) && (
            <p className="-mt-1 text-[12px]" style={{ color: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {[span, eff !== null ? `${Math.round(eff * 100)}% efficiency` : null].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="w-full rounded-[16px] px-4 py-3 text-[15px] leading-snug" style={{ background: "var(--sl-surface)", color: "var(--sl-text)" }}>
            {score.reason}
          </p>
          <Link href={`/sleep/night?date=${date}`} className="-mt-1 flex w-full items-center justify-between rounded-[16px] px-4 py-3 text-[15px] transition-colors active:bg-[var(--sl-surface-raised)]" style={{ background: "var(--sl-surface)" }}>
            <span>Night details</span>
            <span className="flex items-center gap-1 text-[13px]" style={{ color: "var(--sl-text-tertiary)" }}>
              Stages, score, recovery <Chevron />
            </span>
          </Link>
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-3 rounded-[16px] px-4 py-8 text-center" style={{ background: "var(--sl-surface)" }}>
          <p className="text-[15px]" style={{ color: "var(--sl-text-secondary)" }}>
            {waiting && date === today ? "Last night is on its way from Apple Health." : "No sleep for this night."}
          </p>
          <button type="button" onClick={onLog} className="h-[40px] rounded-[12px] px-4 text-[15px] font-semibold" style={{ background: "var(--sl-surface-raised)" }}>
            Add it yourself
          </button>
        </div>
      )}
    </section>
  );
}
