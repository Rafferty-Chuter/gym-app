"use client";

import type { ReactNode } from "react";
import type { RatingWord } from "@/lib/physique/sleepView";
import type { SleepStage } from "@/lib/physique/types";

/**
 * Shared pieces for the Sleep tab in its own colours (DESIGN.md rev 3,
 * pillar colour). Every colour is a `--sl-*` variable from `.theme-sleep`
 * in app/globals.css, so these only render inside that class.
 */

export const RATE_COLOR: Record<RatingWord, string> = {
  Excellent: "var(--sl-rate-excellent)",
  Good: "var(--sl-rate-good)",
  Fair: "var(--sl-rate-fair)",
  Poor: "var(--sl-rate-poor)",
};

export const STAGE_COLOR: Record<SleepStage, string> = {
  awake: "var(--sl-stage-awake)",
  rem: "var(--sl-stage-rem)",
  core: "var(--sl-stage-core)",
  deep: "var(--sl-stage-deep)",
  asleep: "var(--sl-stage-core)",
};

export const STAGE_LABEL: Record<SleepStage, string> = { awake: "Awake", rem: "REM", core: "Core", deep: "Deep", asleep: "Asleep" };

export function SCaption({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--sl-text-tertiary)" }}>
      {children}
    </p>
  );
}

/** A section on the night background: optional caption row, then a surface. */
export function SCard({ title, aside, children, label, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; label: string; className?: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      {(title || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {typeof title === "string" ? <SCaption>{title}</SCaption> : title}
          {aside}
        </div>
      )}
      <div className={`rounded-[16px] ${className}`} style={{ background: "var(--sl-surface)" }}>
        {children}
      </div>
    </section>
  );
}

/** A label, an optional line under it, and a value on the right. */
export function SRow({ label, sub, value, valueColor }: { label: string; sub?: ReactNode; value: ReactNode; valueColor?: string }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px]" style={{ color: "var(--sl-text)" }}>
          {label}
        </span>
        {sub && (
          <span className="text-[12px]" style={{ color: "var(--sl-text-tertiary)" }}>
            {sub}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-[15px] font-semibold" style={{ color: valueColor ?? "var(--sl-text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/** A 4px bar filled to `fill` (0..1) in `color`. */
export function SBar({ fill, color }: { fill: number; color: string }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--sl-surface-raised)" }} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: color }} />
    </div>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The score as a ring (Bevel's hero): the arc is the score out of 100 in
 * the accent, the number and its word in the middle.
 */
export function ScoreRing({ score, word, size = 168, stroke = 12, label }: { score: number; word: RatingWord; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, score / 100));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--sl-surface-raised)" }} strokeWidth={stroke} />
        {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--sl-accent)" }} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: size * 0.3, color: "var(--sl-text)", fontVariantNumeric: "tabular-nums" }}>
          {score}
        </span>
        <span className="mt-1.5 text-[13px] font-semibold" style={{ color: RATE_COLOR[word] }}>
          {word}
        </span>
      </div>
    </div>
  );
}
