"use client";

import { SecondaryButton } from "@/components/physique/ui";
import SleepRing from "@/components/sleep/SleepRing";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { NightWord } from "@/lib/physique/sleepView";
import type { SleepNight } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";

const WORD_COLOR: Record<NightWord, string> = {
  Good: STATUS_HEX.good,
  OK: "#f2f2f0",
  Short: STATUS_HEX.watch,
  "Very short": STATUS_HEX.attention,
};

const WAKEUPS_COPY: Record<NonNullable<SleepNight["wakeups"]>, string> = {
  "0": "None",
  "1-2": "1 to 2",
  "3+": "3 or more",
};

function nightLabel(date: LocalDate, today: LocalDate): string {
  const back = dayDiff(date, today);
  if (back === 0) return "Last night";
  if (back === 1) return "The night before";
  return longLocalDate(date);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
        {label}
      </span>
      <span className="text-[17px] font-semibold leading-tight" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      {sub && (
        <span className="text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

const chevron = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
    <path d={d} />
  </svg>
);

/**
 * One night (05-design §9.6, rev 3 after Bevel and WHOOP): a ring of hours
 * asleep against the goal with the word in the centre, the key numbers
 * beside it, and arrows to step back through earlier nights. The night is
 * dated by the morning it ended.
 */
export default function SleepHero({
  night,
  date,
  today,
  word,
  goalH,
  onDateChange,
  onLog,
}: {
  night: SleepNight | null;
  date: LocalDate;
  today: LocalDate;
  word: NightWord | null;
  goalH: number;
  onDateChange: (d: LocalDate) => void;
  onLog: () => void;
}) {
  const span = `${longLocalDate(addDays(date, -1))} to ${longLocalDate(date)}`;
  const btn = "flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-[#26262a] disabled:opacity-30";
  const inBed = night?.inBedMin ?? null;
  const efficiency = night && inBed && inBed > 0 ? Math.round(Math.min(1, night.asleepMin / inBed) * 100) : null;
  const color = word ? WORD_COLOR[word] : "#a3a3a8";
  return (
    <section aria-label="Night" className="flex flex-col gap-4 rounded-[16px] p-4" style={{ background: "#141416" }}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onDateChange(addDays(date, -1))} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Earlier night">
          {chevron("M15 6l-6 6 6 6")}
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
            {nightLabel(date, today)}
          </span>
          <span className="truncate text-[11px]" style={{ color: "#6f6f76" }}>
            {span}
          </span>
        </div>
        <button type="button" onClick={() => onDateChange(addDays(date, 1))} disabled={date >= today} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Later night">
          {chevron("M9 6l6 6-6 6")}
        </button>
      </div>

      {night ? (
        <>
          <div className="flex items-center gap-5">
            <SleepRing fraction={night.asleepMin / (goalH * 60)} color={color} label={`${formatHoursMin(night.asleepMin)} asleep of a ${formatHoursMin(goalH * 60)} goal${word ? `, ${word}` : ""}`}>
              <span className="text-[24px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                {formatHoursMin(night.asleepMin)}
              </span>
              {word && (
                <span className="mt-1 text-[13px] font-semibold" style={{ color }}>
                  {word}
                </span>
              )}
              <span className="mt-0.5 text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                of {formatHoursMin(goalH * 60)}
              </span>
            </SleepRing>
            <div className="flex min-w-0 flex-col gap-3">
              <Stat label="In bed" value={inBed != null ? formatHoursMin(inBed) : "Not logged"} sub={night.bedtime && night.wakeTime ? `${night.bedtime} to ${night.wakeTime}` : null} />
              {efficiency != null && <Stat label="Efficiency" value={`${efficiency} %`} sub="asleep of time in bed" />}
              {night.wakeups && <Stat label="Wake-ups" value={WAKEUPS_COPY[night.wakeups]} />}
            </div>
          </div>
          {night.source !== "healthkit" && (
            <button type="button" onClick={onLog} className="w-fit text-[13px] font-semibold" style={{ color: "#a3a3a8" }}>
              Edit this night
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-[15px]" style={{ color: "#a3a3a8" }}>
            {date === today ? "Last night isn't logged yet." : "Nothing logged for this night."}
          </p>
          <SecondaryButton onClick={onLog}>Log this night</SecondaryButton>
        </div>
      )}
    </section>
  );
}
