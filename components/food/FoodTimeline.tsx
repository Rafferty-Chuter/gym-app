"use client";

import { entryClock, hourLabel, macroLine, type DayTimeline } from "@/lib/physique/food/timeline";
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
 * total and a small + to add at that hour, entries under their hour with
 * name, macro line and an edit pencil. Empty hours are not shown (B2): the
 * "Add a food" bar logs at the current time and the logger's time chip
 * moves it. Copy day and Edit day sit under the list; Clear day lives
 * inside Edit day.
 */
export default function FoodTimeline({ timeline, tz, onAddAt, onEdit, onCopyDay, onEditDay, dayNote }: Props) {
  const rows = timeline.hours.filter((h) => h.entries.length > 0);
  return (
    <section aria-label="Timeline" className="flex flex-col">
      {dayNote && (
        <button type="button" onClick={onEditDay} className="mb-2 flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-[12px]" style={{ background: "var(--surface)", color: "var(--text-secondary)" }} aria-label={`${dayNote}. Edit day`}>
          <span>{dayNote}</span>
          <span className="shrink-0" style={{ color: "var(--text-tertiary)" }}>Edit</span>
        </button>
      )}
      {rows.length === 0 && (
        <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          Nothing logged on this day yet.
        </p>
      )}
      <ol className="flex flex-col">
        {rows.map((h) => {
          const has = h.entries.length > 0;
          return (
            <li key={h.hour} className="flex gap-3">
              <div className="flex w-[44px] shrink-0 flex-col items-end pt-[9px]">
                <span className="text-[11px] font-medium" style={{ color: has ? "var(--text-secondary)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                  {hourLabel(h.hour)}
                </span>
              </div>
              <div className="relative flex min-w-0 flex-1 flex-col pb-1" style={{ borderLeft: "1px solid var(--border)" }}>
                <div className="flex min-h-[36px] items-center justify-between gap-2 pl-3">
                  <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {has ? macroLine(h.totals) : ""}
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
                {has && (
                  <ul className="ml-3 flex flex-col gap-1.5 pb-2">
                    {h.entries.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onEdit(e)}
                          className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]"
                          style={{ background: "var(--surface)" }}
                          aria-label={`${e.label}, ${n(e.kcal)} kcal at ${entryClock(e, tz)}. Edit`}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
                              {e.label}
                            </span>
                            <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                              {macroLine(e)}
                              {e.serving ? ` · ${e.serving}` : ""}
                              {e.method === "ai_text" ? " · est." : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                              {entryClock(e, tz)}
                            </span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                              <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" />
                            </svg>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2 pl-[56px]">
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
