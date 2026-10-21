"use client";

import { Caption } from "@/components/physique/ui";
import type { Finding } from "@/lib/physique/findings";

/**
 * Findings (E1): what the last four weeks show, each with the person's own
 * numbers and then what studies found, the sources in small print at the
 * foot. Nothing to do and nothing planned: the reader draws the conclusion.
 * Silent when nothing crosses its evidence threshold.
 */
export default function FindingsCard({ items, onSelect, selectedId }: { items: Finding[]; /** Progress (PR2): tap one to see its charts and weeks on the timeline. */ onSelect?: (f: Finding) => void; selectedId?: string | null }) {
  if (!items.length) return null;
  const sources = [...new Set(items.flatMap((f) => f.sources))];
  return (
    <section aria-label="Findings" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Findings
        </span>
        <Caption>Last 4 weeks</Caption>
      </div>
      {items.map((f) => {
        const selected = selectedId === f.id;
        const body = (
          <>
            <span className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
              {f.title}
            </span>
            <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {f.data}
            </p>
            <p className="text-[13px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
              {f.evidence}
            </p>
            {onSelect && (
              <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                {selected ? "Shown on the charts above" : "Show on the charts"}
              </span>
            )}
          </>
        );
        const cls = "flex w-full flex-col gap-1.5 px-4 py-3.5 text-left";
        const style = { borderTop: "1px solid var(--border)", background: selected ? "var(--surface-raised)" : undefined };
        return onSelect ? (
          <button key={f.id} type="button" onClick={() => onSelect(f)} className={`${cls} transition-colors active:bg-[var(--surface-raised)]`} style={style} aria-pressed={selected}>
            {body}
          </button>
        ) : (
          <div key={f.id} className={cls} style={style}>
            {body}
          </div>
        );
      })}
      <details className="px-4 pb-3.5 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
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
