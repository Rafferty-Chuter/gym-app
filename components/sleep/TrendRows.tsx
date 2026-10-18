"use client";

import { SCard, SCaption } from "@/components/sleep/parts";
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

/**
 * The last week against the 30 nights before it (S8, after WHOOP's sleep
 * statistics): the week's value, and the change as words with an arrow,
 * green when it helps and amber when it does not. Clock shifts are just
 * shifts. Rows appear only once both weeks have enough nights.
 */
export default function TrendRows({ rows }: { rows: TrendRow[] }) {
  if (rows.length === 0) {
    return (
      <section aria-label="Trends" className="flex flex-col gap-2">
        <SCaption>Trends</SCaption>
        <p className="text-[13px]" style={{ color: "var(--sl-text-secondary)" }}>
          Trends start once there are two weeks of nights to compare.
        </p>
      </section>
    );
  }
  return (
    <SCard title={`Last ${TREND_RECENT_NIGHTS} nights`} aside={<SCaption>vs previous {TREND_BASELINE_NIGHTS}</SCaption>} label="Trends" className="divide-y divide-[var(--sl-border)]">
      {rows.map((r) => (
        <div key={r.id} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
          <span className="text-[15px]">{r.label}</span>
          <span className="flex flex-col items-end">
            <span className="text-[15px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {r.recentText}
            </span>
            <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: TONE_COLOR[r.tone] }}>
              <Arrow direction={r.direction} />
              {r.deltaText}
            </span>
          </span>
        </div>
      ))}
    </SCard>
  );
}
