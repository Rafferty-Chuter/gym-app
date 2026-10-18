"use client";

import { StatusDot } from "@/components/physique/ui";
import type { Link, LinkFigure } from "@/lib/physique/linkedReasons";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * Plan, what the intake predicts and what the trend did, as three bars on
 * one scale, so the gap and its cause read at a glance. Bars grow from a
 * centre line when the signs differ (a cut that went up).
 */
function FigureBars({ figures, caption }: { figures: LinkFigure[]; caption: string | null }) {
  const vals = figures.map((f) => f.kgPerWeek);
  const max = Math.max(0.1, ...vals.map(Math.abs));
  const mixed = vals.some((v) => v > 0) && vals.some((v) => v < 0);
  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label={`Plan, expected and actual. ${caption ?? ""}`}>
      {caption && (
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {caption}
        </span>
      )}
      {figures.map((f, i) => {
        const v = vals[i];
        const w = (Math.abs(v) / max) * (mixed ? 50 : 100);
        const left = mixed ? (v < 0 ? 50 - w : 50) : 0;
        return (
          <div key={f.label} role="listitem" className="grid grid-cols-[7.25rem_1fr_3.75rem] items-center gap-2 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "var(--text-secondary)" }}>{f.label}</span>
            <div className="relative h-2 rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
              {mixed && <div className="absolute inset-y-[-2px] left-1/2 w-px" style={{ background: "var(--border-strong)" }} />}
              <div className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `${Math.max(w, v === 0 ? 0 : 2)}%`, background: i === figures.length - 1 ? "var(--text)" : "var(--text-tertiary)" }} />
            </div>
            <span className="text-right font-semibold" style={{ color: "var(--text)" }}>
              {f.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What's behind the week (W5): each outcome with its likely causes and
 * the numbers that tie them, weight first. The engine links; this only lays
 * it out.
 */
export default function LinkedReasonsCard({ links }: { links: Link[] }) {
  if (!links.length) return null;
  return (
    <section aria-label="What's behind it" className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--surface)" }}>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
        What&apos;s behind it
      </span>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {links.map((l) => (
          <li key={l.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <span className="flex items-start gap-2">
              <span className="flex h-[20px] shrink-0 items-center">
                <StatusDot color={STATUS_HEX[l.state]} />
              </span>
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {l.title}
                </span>
                {l.detail && (
                  <span className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {l.detail}
                  </span>
                )}
              </span>
            </span>
            <div className="flex flex-col gap-1.5 pl-4">
              {l.causes.map((c) => (
                <p key={c} className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {c}
                </p>
              ))}
              {l.figures.length > 0 && (
                <div className="pt-1">
                  <FigureBars figures={l.figures} caption={l.figuresCaption} />
                </div>
              )}
              {l.note && (
                <p className="text-[13px] font-medium leading-snug" style={{ color: "var(--text)" }}>
                  {l.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
