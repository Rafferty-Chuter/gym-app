"use client";

import type { ReactNode } from "react";

/** Small shared pieces for the physique screens, styled from DESIGN.md. */

export function PrimaryButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-[48px] w-full rounded-[12px] text-[17px] font-semibold transition-colors active:bg-[#a3a3a8] disabled:opacity-40"
      style={{ background: "#f2f2f0", color: "#0a0a0b" }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, small }: { children: ReactNode; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${small ? "h-[36px] px-3 text-[13px]" : "h-[44px] px-4 text-[15px]"} rounded-[12px] font-semibold transition-colors active:bg-[#26262a] disabled:opacity-40`}
      style={{ background: "#1d1d20", color: "#f2f2f0" }}
    >
      {children}
    </button>
  );
}

/** A 56px row: label left, value right, optional trailing control. */
export function Row({ label, value, sub, onClick, trailing, ariaLabel }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; trailing?: ReactNode; ariaLabel?: string }) {
  const inner = (
    <>
      <div className="flex min-w-0 flex-col">
        <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
          {label}
        </span>
        {sub && (
          <span className="mt-0.5 text-[11px] font-medium tracking-[0.02em]" style={{ color: "#6f6f76" }}>
            {sub}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        {trailing}
      </div>
    </>
  );
  const cls = "flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left";
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} className={`${cls} transition-colors active:bg-[#1d1d20]`} aria-label={ariaLabel}>
      {inner}
    </button>
  );
}

/** Rows in a group are separated by 1px lines, not gaps. */
export function RowGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
      {children}
    </div>
  );
}

export function PlusGlyph() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </span>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
      {children}
    </p>
  );
}

/** Thin horizontal bar; over target uses a brighter tint, never red. */
export function MacroBar({ value, target, color = "#a3a3a8" }: { value: number; target: number | null; color?: string }) {
  const pct = target && target > 0 ? Math.min(1, value / target) : 0;
  const over = target != null && target > 0 && value > target;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${target ? pct * 100 : 0}%`, background: over ? "#f2f2f0" : color, transition: "width 150ms" }} />
    </div>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-[13px]" style={{ color: "#f26d7d" }}>
      {text}
    </p>
  );
}
