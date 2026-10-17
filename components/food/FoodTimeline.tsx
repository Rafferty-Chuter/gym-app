"use client";

import { entryClock, hourLabel, macroLine, type DayTimeline } from "@/lib/physique/food/timeline";
import type { FoodEntry } from "@/lib/physique/types";

type Props = {
  timeline: DayTimeline;
  tz: string;
  hideEmpty: boolean;
  onAddAt: (hour: number) => void;
  onEdit: (entry: FoodEntry) => void;
  onCopyDay: () => void;
  onClearDay: () => void;
  onToggleHideEmpty: () => void;
};

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * Hour timeline (05-design §9.4): one row per hour with a small + at the
 * right, entries under their hour with name, macro line and an edit
 * pencil, and hour totals on the hour row. Actions sit under the list.
 */
export default function FoodTimeline({ timeline, tz, hideEmpty, onAddAt, onEdit, onCopyDay, onClearDay, onToggleHideEmpty }: Props) {
  const rows = hideEmpty ? timeline.hours.filter((h) => h.entries.length > 0) : timeline.hours;
  return (
    <section aria-label="Timeline" className="flex flex-col">
      {rows.length === 0 && (
        <p className="py-6 text-center text-[13px]" style={{ color: "#6f6f76" }}>
          Nothing logged. Show empty hours to add at a time, or use the bar below.
        </p>
      )}
      <ol className="flex flex-col">
        {rows.map((h) => {
          const has = h.entries.length > 0;
          return (
            <li key={h.hour} className="flex gap-3">
              <div className="flex w-[44px] shrink-0 flex-col items-end pt-[9px]">
                <span className="text-[11px] font-medium" style={{ color: has ? "#a3a3a8" : "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                  {hourLabel(h.hour)}
                </span>
              </div>
              <div className="relative flex min-w-0 flex-1 flex-col pb-1" style={{ borderLeft: "1px solid #2a2a2e" }}>
                <div className="flex min-h-[36px] items-center justify-between gap-2 pl-3">
                  <span className="truncate text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                    {has ? macroLine(h.totals) : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddAt(h.hour)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors active:bg-[#26262a]"
                    style={{ color: "#a3a3a8", background: "#141416" }}
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
                          className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors active:bg-[#1d1d20]"
                          style={{ background: "#141416" }}
                          aria-label={`${e.label}, ${n(e.kcal)} kcal at ${entryClock(e, tz)}. Edit`}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px]" style={{ color: "#f2f2f0" }}>
                              {e.label}
                            </span>
                            <span className="truncate text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                              {macroLine(e)}
                              {e.serving ? ` · ${e.serving}` : ""}
                              {e.method === "ai_text" ? " · est." : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                              {entryClock(e, tz)}
                            </span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
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
          { label: "Clear day", onClick: onClearDay, disabled: timeline.entries === 0 },
          { label: hideEmpty ? "Show empty hours" : "Hide empty hours", onClick: onToggleHideEmpty, disabled: false },
        ].map((a) => (
          <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled} className="h-[30px] rounded-full px-3 text-[12px] font-medium transition-colors active:bg-[#26262a] disabled:opacity-40" style={{ background: "#1d1d20", color: "#a3a3a8" }}>
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}
