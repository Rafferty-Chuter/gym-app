"use client";

import { WEEKDAY_LETTERS } from "@/lib/physique/food/week";
import type { LocalDate } from "@/lib/dates";

type Props = {
  /** Seven dates, Monday first. */
  dates: readonly LocalDate[];
  selected: LocalDate;
  today: LocalDate;
  /** Dates with anything logged: a dot sits under them. */
  logged: ReadonlySet<LocalDate>;
  onSelect: (date: LocalDate) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

/**
 * Week strip (05-design §9.4): seven day pills, weekday letter over day
 * number, a dot under logged days, the selected day filled white. Days
 * after today cannot be selected. Chevrons move a week at a time.
 */
export default function WeekStrip({ dates, selected, today, logged, onSelect, onPrevWeek, onNextWeek }: Props) {
  const canGoNext = dates[6] < today;
  const chevron = (dir: "prev" | "next", enabled: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className="flex h-9 w-6 shrink-0 items-center justify-center rounded-full disabled:opacity-30"
      style={{ color: "var(--text-secondary)" }}
      aria-label={dir === "prev" ? "Previous week" : "Next week"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Week">
      {chevron("prev", true, onPrevWeek)}
      <div className="grid flex-1 grid-cols-7 gap-1">
        {dates.map((date, i) => {
          const isSelected = date === selected;
          const future = date > today;
          const isToday = date === today;
          const hasLog = logged.has(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              disabled={future}
              aria-pressed={isSelected}
              aria-label={`${date}${isToday ? ", today" : ""}${hasLog ? ", logged" : ""}`}
              className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[12px] transition-colors disabled:opacity-30"
              style={{ background: isSelected ? "var(--primary)" : "transparent", color: isSelected ? "var(--text-on-primary)" : "var(--text)" }}
            >
              <span className="text-[10px] font-medium tracking-[0.04em]" style={{ color: isSelected ? "var(--border-strong)" : "var(--text-tertiary)" }}>
                {WEEKDAY_LETTERS[i]}
              </span>
              <span className="text-[15px] font-semibold leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
                {Number(date.slice(8, 10))}
              </span>
              <span className="h-1 w-1 rounded-full" style={{ background: hasLog ? (isSelected ? "var(--text-on-primary)" : "var(--text-secondary)") : isToday && !isSelected ? "var(--border-strong)" : "transparent" }} aria-hidden />
            </button>
          );
        })}
      </div>
      {chevron("next", canGoNext, onNextWeek)}
    </div>
  );
}
