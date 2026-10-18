"use client";

import { Caption, StatusDot } from "@/components/physique/ui";
import type { Fix, Heading } from "@/lib/physique/weeklyInsight";
import { STATUS_HEX } from "@/lib/ui/status";

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

/**
 * What to fix (W3): up to three, most important first, each with what the
 * numbers say and one action. Rows with a link open the place to do it;
 * plain anchors, since targets read ?date= on mount.
 */
export function FixesCard({ fixes, more, goingWell }: { fixes: Fix[]; more: number; goingWell: string[] }) {
  const well = goingWell.length ? `Going well: ${goingWell.join(", ")}.` : null;
  return (
    <section aria-label="What to fix" className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--surface)" }}>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
        What to fix
      </span>
      {fixes.length === 0 ? (
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Nothing to fix this week.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-[var(--border)]">
          {fixes.map((f, i) => {
            const inner = (
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" style={{ background: "var(--surface-raised)", color: STATUS_HEX[f.state] }}>
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                    {f.title}
                  </span>
                  <span className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {f.why}
                  </span>
                  <span className="text-[13px] font-semibold leading-snug" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {f.action}
                  </span>
                </div>
                {f.href && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-1 h-4 w-4 shrink-0" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                )}
              </div>
            );
            return (
              <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                {f.href ? (
                  <a href={f.href} className="block transition-colors active:opacity-70" aria-label={`${f.title}. ${f.why} ${f.action} Open`}>
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>
      )}
      {(more > 0 || well) && (
        <div className="flex flex-col gap-1">
          {more > 0 && <Caption>{more === 1 ? "One smaller thing waits until these are done." : `${more} smaller things wait until these are done.`}</Caption>}
          {well && (
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              {well}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
