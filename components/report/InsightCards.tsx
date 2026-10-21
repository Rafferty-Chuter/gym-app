"use client";

import { StatusDot } from "@/components/physique/ui";
import type { Heading } from "@/lib/physique/weeklyInsight";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * The report's opening (W4): the verdict in one line with its dot, then
 * where the goal is heading, as of today. Either half may be absent.
 */
export function SummaryCard({ verdict, heading }: { verdict: { title: string; detail: string; state: Heading["state"] } | null; heading: Heading | null }) {
  if (!verdict && !heading) return null;
  return (
    <section aria-label="Summary" className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--surface)" }}>
      {verdict && (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <StatusDot color={STATUS_HEX[verdict.state]} />
            <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
              {verdict.title}
            </span>
          </span>
          <p className="pl-4 text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {verdict.detail}
          </p>
        </div>
      )}
      {heading && (
        <div className="flex flex-col gap-1" style={verdict ? { borderTop: "1px solid var(--border)", paddingTop: 12 } : undefined}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Where you&apos;re heading
          </span>
          <span className="text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {heading.title}
          </span>
          {heading.lines.map((l) => (
            <p key={l} className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {l}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** Where the goal is heading, as of today (W3): one title with its dot and up to three lines. */
export function HeadingCard({ heading }: { heading: Heading }) {
  return (
    <section aria-label="Where you're heading" className="flex flex-col gap-2 rounded-[16px] p-4" style={{ background: "var(--surface)" }}>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
        Where you&apos;re heading
      </span>
      <span className="flex items-center gap-2">
        <StatusDot color={STATUS_HEX[heading.state]} />
        <span className="text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {heading.title}
        </span>
      </span>
      <div className="flex flex-col gap-1 pl-4">
        {heading.lines.map((l) => (
          <p key={l} className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {l}
          </p>
        ))}
      </div>
    </section>
  );
}
