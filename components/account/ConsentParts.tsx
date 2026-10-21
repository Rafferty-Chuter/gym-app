"use client";

import type { ReactNode } from "react";

/**
 * Pieces shared by the consent screens (TR1): a panel of short facts, one
 * per row, and the tick, which starts empty and is the only way to agree.
 * After Oura's "Sharing your health data" list and MacroFactor's separate,
 * unticked consents (Mobbin).
 */

export type ConsentFact = { label: string; text: ReactNode };

export function ConsentFacts({ facts }: { facts: readonly ConsentFact[] }) {
  return (
    <dl className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
      {facts.map((f) => (
        <div key={f.label} className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="text-[12px] font-medium" style={{ color: "var(--text-tertiary)" }}>
            {f.label}
          </dt>
          <dd className="text-[15px] leading-snug" style={{ color: "var(--text)" }}>
            {f.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ConsentTick({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-start gap-3 rounded-[16px] px-4 py-3.5 text-left transition-colors"
      style={{ background: "var(--surface)", border: `1px solid ${checked ? "var(--border-strong)" : "var(--border)"}` }}
    >
      <span
        className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] transition-colors"
        style={{ background: checked ? "var(--primary)" : "transparent", border: checked ? "none" : "1.5px solid var(--border-strong)", color: "var(--text-on-primary)" }}
        aria-hidden
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      <span className="text-[15px] leading-snug" style={{ color: "var(--text)" }}>
        {children}
      </span>
    </button>
  );
}

/** "21 Oct" or "21 Oct 2025" when not this year. */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}
