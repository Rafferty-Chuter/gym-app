"use client";

import { SecondaryButton } from "@/components/physique/ui";
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
  "0": "No wake-ups",
  "1-2": "1 to 2 wake-ups",
  "3+": "3 or more wake-ups",
};

/**
 * Last night (05-design §9.6, after Bevel without the ring): hours asleep in
 * hero size with the word beside it and the goal under, then two tiles,
 * Time in bed and Asleep, with bed → wake and wake-ups under them.
 */
export default function SleepHero({ night, word, goalH, onLog }: { night: SleepNight | null; word: NightWord | null; goalH: number; onLog: () => void }) {
  if (!night) {
    return (
      <section aria-label="Last night" className="flex flex-col items-start gap-3">
        <p className="text-[15px]" style={{ color: "#a3a3a8" }}>
          Last night isn&apos;t logged yet.
        </p>
        <SecondaryButton onClick={onLog}>Log last night</SecondaryButton>
      </section>
    );
  }
  const inBed = night.inBedMin ?? null;
  const span = night.bedtime && night.wakeTime ? `${night.bedtime} → ${night.wakeTime}` : null;
  return (
    <section aria-label="Last night" className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
            {formatHoursMin(night.asleepMin)}
          </span>
          {word && (
            <span className="text-[15px] font-semibold" style={{ color: WORD_COLOR[word] }}>
              {word}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
          of {formatHoursMin(goalH * 60)} goal
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Time in bed" value={inBed != null ? formatHoursMin(inBed) : "Not logged"} sub={span} dim={inBed == null} />
        <Tile label="Asleep" value={formatHoursMin(night.asleepMin)} sub={night.wakeups ? WAKEUPS_COPY[night.wakeups] : null} />
      </div>
    </section>
  );
}

function Tile({ label, value, sub, dim }: { label: string; value: string; sub: string | null; dim?: boolean }) {
  return (
    <div className="rounded-[12px] px-4 py-3" style={{ background: "#141416" }}>
      <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
        {label}
      </p>
      <p className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: dim ? "#6f6f76" : "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      <p className="mt-0.5 min-h-[16px] text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
        {sub ?? ""}
      </p>
    </div>
  );
}
