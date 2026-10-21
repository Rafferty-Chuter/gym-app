"use client";

import { entryClock, hourLabel, type DayTimeline } from "@/lib/physique/food/timeline";
import MacroText from "@/components/food/MacroText";
import type { FoodEntry } from "@/lib/physique/types";

type Props = {
  timeline: DayTimeline;
  tz: string;
  onAddAt: (hour: number) => void;
  onEdit: (entry: FoodEntry) => void;
  onCopyDay: () => void;
  onEditDay: () => void;
  /** Day status or override line shown above the hours ("Partial day", "Total set to 2,100 kcal"). */
  dayNote?: string | null;
};

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * Hour timeline (05-design §9.4): the hours you ate in, each with its
 * totals and a small + to add at that hour, its entries in one card with
 * name, coloured macros and kcal; tap a row to edit it. Empty hours are not shown (B2): the
 * "Add a food" bar logs at the current time and the logger's time chip
 * moves it. Copy day and Edit day sit under the list; Clear day lives
 * inside Edit day.
 */
export default function FoodTimeline({ timeline, tz, onAddAt, onEdit, onCopyDay, onEditDay, dayNote }: Props) {
  const rows = timeline.hours.filter((h) => h.entries.length > 0);
  return (
    <section aria-label="Timeline" className="flex flex-col">
      {dayNote && (
        <button type="button" onClick={onEditDay} className="mb-3 flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-[12px]" style={{ background: "var(--surface)", color: "var(--text-secondary)" }} aria-label={`${dayNote}. Edit day`}>
          <span>{dayNote}</span>
          <span className="shrink-0" style={{ color: "var(--text-tertiary)" }}>Edit</span>
        </button>
      )}
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-[16px] px-4 py-7 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[15px] font-medium" style={{ color: "var(--text)" }}>
            Nothing logged on this day
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            Search, scan or describe a meal below.
          </p>
        </div>
      )}
      {/* One card per hour, entries under hairlines (polish): the hour and its totals sit above, like MacroFactor's log. */}
      <ol className="flex flex-col gap-4">
        {rows.map((h) => (
          <li key={h.hour} className="flex flex-col gap-1.5">
            <div className="flex min-h-[28px] items-center justify-between gap-2 px-1">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {hourLabel(h.hour)}
                </span>
                <MacroText {...h.totals} />
              </span>
              <button
                type="button"
                onClick={() => onAddAt(h.hour)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors active:bg-[var(--surface-pressed)]"
                style={{ color: "var(--text-secondary)", background: "var(--surface)" }}
                aria-label={`Add food at ${hourLabel(h.hour)}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
              {h.entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(e)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]"
                    aria-label={`${e.label}, ${n(e.kcal)} kcal at ${entryClock(e, tz)}. Edit`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
                        {e.label}
                      </span>
                      <span className="flex min-w-0 items-baseline gap-1.5 truncate">
                        <MacroText kcal={e.kcal} proteinG={e.proteinG} fatG={e.fatG} carbsG={e.carbsG} showKcal={false} />
                        {(e.serving || e.method === "ai_text") && (
                          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                            {[e.serving, e.method === "ai_text" ? "est." : null].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                        {n(e.kcal)}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {entryClock(e, tz)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2 px-1">
        {[
          { label: "Copy day", onClick: onCopyDay, disabled: timeline.entries === 0 },
          { label: "Edit day", onClick: onEditDay, disabled: false },
        ].map((a) => (
          <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled} className="h-[30px] rounded-full px-3 text-[12px] font-medium transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40" style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}>
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}
