"use client";

import { useState } from "react";
import type { Finding, FindingId } from "@/lib/physique/findings";
import { findingSubject } from "@/lib/physique/askAbout";
import AskWhy from "@/components/progress/AskWhy";

/** One outline glyph per finding (24 × 24, stroked). */
const ICON: Record<FindingId, string[]> = {
  underlog: ["M6 3h12v18H6z", "M9 8h6M9 12h6M9 16h3"],
  "sleep-lifts": ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
  "protein-low": ["M12 3c-3.5 0-6.5 5.5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8.5 15.5 3 12 3z"],
  "gain-fast": ["M4 17l6-6 4 4 6-7", "M15 8h5v5"],
  "cut-fast-lifts": ["M4 7l6 6 4-4 6 7", "M15 16h5v-5"],
};

const divider = { borderTop: "1px solid var(--border)" };

/**
 * Findings (E1, PR3d): what the last four weeks show against what studies
 * support. One row each: a short title and the person's numbers in one
 * line, in kilos (the founder: read at a glance, the explaining left to
 * the assistant). A row opens the one sentence of evidence and, on
 * Progress, the way to its charts. Facts, not advice. Silent when nothing
 * crosses its evidence threshold.
 */
export default function FindingsCard({ items, onSelect, selectedId }: { items: Finding[]; /** Progress (PR2): show a finding's charts and weeks on the timeline. */ onSelect?: (f: Finding) => void; selectedId?: string | null }) {
  const [open, setOpen] = useState<FindingId | null>(null);
  if (!items.length) return null;
  const sources = [...new Set(items.flatMap((f) => f.sources))];
  return (
    <section aria-label="Findings" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col gap-0.5 px-4 pb-3 pt-4">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          What the last 4 weeks show
        </span>
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          Against what studies support
        </span>
      </div>

      {items.map((f) => {
        const isOpen = open === f.id;
        const shown = selectedId === f.id;
        return (
          <div key={f.id} style={divider}>
            <button type="button" onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${f.title}: ${f.fact}. ${isOpen ? "Hide" : "Show"} what studies found`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "color-mix(in srgb, var(--status-watch) 16%, transparent)", color: "var(--status-watch)" }} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                  {ICON[f.id].map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
                  {f.title}
                </span>
                <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {f.fact}
                </span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--text-tertiary)", transform: isOpen ? "rotate(180deg)" : undefined }} aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-2.5 px-4 pb-3.5 pl-[60px]">
                <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
                  Studies: {f.evidence}
                </p>
                {onSelect && (
                  <button type="button" onClick={() => onSelect(f)} aria-pressed={shown} className="flex w-fit items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                    {shown ? "Shown on the charts below" : "Show on the charts"}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                )}
                <AskWhy subject={findingSubject(f)} />
              </div>
            )}
          </div>
        );
      })}

      <details className="px-4 pb-3.5 pt-2.5" style={divider}>
        <summary className="cursor-pointer text-[12px] font-medium" style={{ color: "var(--text-tertiary)" }}>
          Sources
        </summary>
        <ul className="mt-1.5 flex flex-col gap-1 text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
