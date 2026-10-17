"use client";

import { Caption, Chevron, RowGroup } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { LocalDate, SleepNight } from "@/lib/physique/types";

const WAKEUPS_COPY: Record<NonNullable<SleepNight["wakeups"]>, string> = {
  "0": "no wake-ups",
  "1-2": "1 to 2 wake-ups",
  "3+": "3 or more wake-ups",
};

/** The logged nights of the window, newest first: date, hours, bed → wake. Tap opens the sheet for that night. */
export default function NightsList({ nights, today, onEdit }: { nights: readonly SleepNight[]; today: LocalDate; onEdit: (night: SleepNight) => void }) {
  if (nights.length === 0) return null;
  return (
    <section aria-label="Nights">
      <div className="mb-2">
        <Caption>Nights</Caption>
      </div>
      <RowGroup>
        {nights.map((n) => {
          const sub = [n.bedtime && n.wakeTime ? `${n.bedtime} → ${n.wakeTime}` : null, n.wakeups ? WAKEUPS_COPY[n.wakeups] : null].filter(Boolean).join(" · ");
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onEdit(n)}
              className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors active:bg-[#1d1d20]"
              aria-label={`Edit sleep for ${longLocalDate(n.date)}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px]" style={{ color: "#f2f2f0" }}>
                  {n.date === today ? "Last night" : longLocalDate(n.date)}
                </span>
                {sub && (
                  <span className="mt-0.5 text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                    {sub}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                  {formatHoursMin(n.asleepMin)}
                </span>
                <Chevron />
              </span>
            </button>
          );
        })}
      </RowGroup>
    </section>
  );
}
