"use client";

import { TREND_BASELINE_NIGHTS, TREND_RECENT_NIGHTS, type TrendRow } from "@/lib/physique/sleepScore";

const TONE_COLOR: Record<TrendRow["tone"], string> = {
  good: "var(--sl-rate-good)",
  bad: "var(--sl-rate-fair)",
  neutral: "var(--sl-text-secondary)",
};

function Arrow({ direction }: { direction: TrendRow["direction"] }) {
  if (direction === "steady") return null;
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <path d={direction === "up" ? "M6 2l4 5H2z" : "M6 10l4-5H2z"} fill="currentColor" />
    </svg>
  );
}

/** Trends no other card on Sleep shows: hours asleep is the chart, wake time is consistency, HRV and resting heart rate are recovery. */
const EXTRA_TRENDS: ReadonlySet<TrendRow["id"]> = new Set(["bedtime", "efficiency"]);

/**
 * The week against the 30 nights before it, as short lines inside the
 * 14-night card (B2). It replaces the separate trends card, which repeated
 * hours asleep and wake time. Nothing renders until both weeks have
 * enough nights.
 */
export function TrendLines({ rows }: { rows: TrendRow[] }) {
  const shown = rows.filter((r) => EXTRA_TRENDS.has(r.id));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--sl-border)] pt-3" aria-label={`Last ${TREND_RECENT_NIGHTS} nights against the previous ${TREND_BASELINE_NIGHTS}`}>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--sl-text-tertiary)" }}>
        Last {TREND_RECENT_NIGHTS} nights vs previous {TREND_BASELINE_NIGHTS}
      </span>
      {shown.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
          <span style={{ color: "var(--sl-text-secondary)" }}>{r.label}</span>
          <span className="flex items-center gap-2" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="font-semibold">{r.recentText}</span>
            <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: TONE_COLOR[r.tone] }}>
              <Arrow direction={r.direction} />
              {r.deltaText}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
