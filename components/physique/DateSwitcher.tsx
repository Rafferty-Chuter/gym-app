"use client";

import { addDays, type LocalDate } from "@/lib/dates";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

/** ‹ date › header. Every logging control on the page acts on the selected day. */
export default function DateSwitcher({ date, today, onChange }: { date: LocalDate; today: LocalDate; onChange: (d: LocalDate) => void }) {
  const isToday = date === today;
  const label = isToday ? "Today" : date === addDays(today, -1) ? "Yesterday" : longLocalDate(date);
  const btn = "flex h-11 w-11 items-center justify-center rounded-[12px] transition-colors active:bg-[#26262a] disabled:opacity-30";
  return (
    <div className="flex items-center justify-between">
      <button type="button" onClick={() => onChange(addDays(date, -1))} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Previous day">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => !isToday && onChange(today)}
        className="flex flex-col items-center px-3"
        aria-label={isToday ? "Today" : `${label}. Tap to return to today`}
      >
        <span className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "#f2f2f0" }}>
          {label}
        </span>
        {!isToday && (
          <span className="text-[11px] font-medium tracking-[0.04em]" style={{ color: "#6f6f76" }}>
            Tap for today
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange(addDays(date, 1))}
        disabled={isToday}
        className={btn}
        style={{ background: "#1d1d20", color: "#f2f2f0" }}
        aria-label="Next day"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
