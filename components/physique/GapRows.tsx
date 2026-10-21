"use client";

import { Caption, Chevron } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import type { GapLine } from "@/lib/physique/gaps";

type Props = {
  lines: readonly GapLine[];
  /** A tab fixes the gap in place; Home links to the tab. One of the two. */
  onSelect?: (line: GapLine) => void;
  hrefFor?: (line: GapLine) => string;
  /** Rows beyond this collapse into one plain line. */
  max?: number;
};

/**
 * "Thursday has no food logged" rows (Sprint 0, W2). Renders nothing when
 * there are no gaps. Each row is one tap into the fix for that day.
 */
export default function GapRows({ lines, onSelect, hrefFor, max }: Props) {
  if (lines.length === 0) return null;
  const shown = max != null && lines.length > max ? lines.slice(0, max) : lines;
  const hidden = lines.length - shown.length;
  const rowClass = "flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]";
  const label = (l: GapLine) => `${l.text}. ${longLocalDate(l.date)}. Fix`;
  return (
    <section aria-label="Not logged" className="flex flex-col gap-2">
      <Caption>Not logged</Caption>
      <div className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
        {shown.map((l) => {
          const inner = (
            <>
              <span className="min-w-0 text-[14px]" style={{ color: "var(--text)" }}>
                {l.text}
              </span>
              <Chevron />
            </>
          );
          const key = `${l.kind}-${l.date}`;
          if (hrefFor) {
            // A plain anchor: the tab reads `?date=` in a state initialiser, which a soft navigation would miss.
            return (
              <a key={key} href={hrefFor(l)} className={rowClass} aria-label={label(l)}>
                {inner}
              </a>
            );
          }
          return (
            <button key={key} type="button" onClick={() => onSelect?.(l)} className={rowClass} aria-label={label(l)}>
              {inner}
            </button>
          );
        })}
        {hidden > 0 && (
          <p className="px-4 py-2.5 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {hidden} more, shown on each tab
          </p>
        )}
      </div>
    </section>
  );
}
