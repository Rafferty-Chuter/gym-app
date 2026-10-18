"use client";

import { useState, type ReactNode } from "react";

/**
 * One row of the Describe plate (after MacroFactor's AI Plate): the food,
 * its numbers and where they came from on the left, the amount as a pill
 * on the right. Tapping the row opens its editor underneath.
 */
export default function PlateRow({ title, line, source, pill, open, onToggle, children, ariaLabel, emphasis = false }: { title: string; line: string; source?: { text: string; estimate: boolean }; pill: { value: string; unit: string }; open: boolean; onToggle: () => void; children?: ReactNode; ariaLabel: string; emphasis?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={ariaLabel} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-[var(--surface-raised)]">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`truncate ${emphasis ? "text-[16px] font-semibold" : "text-[15px]"}`} style={{ color: "var(--text)" }}>
            {title}
          </span>
          <span className="truncate text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {line}
          </span>
          {source && (
            <span className="truncate text-[11px]" style={{ color: source.estimate ? "var(--status-watch)" : "var(--text-tertiary)" }}>
              {source.text}
            </span>
          )}
        </span>
        <span className="flex min-w-[64px] max-w-[96px] shrink-0 flex-col items-center rounded-[10px] px-2 py-1.5" style={{ background: "var(--surface-raised)", boxShadow: open ? "inset 0 0 0 1.5px var(--primary)" : "none" }}>
          <span className="text-[15px] font-semibold leading-tight" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {pill.value}
          </span>
          <span className="max-w-full truncate text-[11px] leading-tight" style={{ color: "var(--text-secondary)" }}>
            {pill.unit}
          </span>
        </span>
      </button>
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </li>
  );
}

const roundBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[18px] leading-none transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40";

/** − value + with 36 px targets; the value is plain text or a field. */
export function Stepper({ onLess, onMore, lessDisabled, moreDisabled, label, children }: { onLess: () => void; onMore: () => void; lessDisabled?: boolean; moreDisabled?: boolean; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button type="button" onClick={onLess} disabled={lessDisabled} className={roundBtn} style={{ background: "var(--surface)", color: "var(--text)" }} aria-label={`${label}: less`}>
        −
      </button>
      {children}
      <button type="button" onClick={onMore} disabled={moreDisabled} className={roundBtn} style={{ background: "var(--surface)", color: "var(--text)" }} aria-label={`${label}: more`}>
        +
      </button>
    </div>
  );
}

/** A grams field that lets the number be cleared and retyped; commits each positive value and restores the last one on blur. */
export function GramsField({ grams, onChange, label }: { grams: number; onChange: (g: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? String(grams)}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
          setDraft(v);
          const n = Number(v);
          if (n > 0) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        className="h-9 w-[68px] rounded-[10px] px-2 text-center text-[15px] font-semibold outline-none focus:ring-1"
        style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}
        aria-label={label}
      />
      g
    </label>
  );
}

/** The editor drawer under an open row: a raised panel, controls stacked. */
export function RowDrawer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] p-3" style={{ background: "var(--surface-raised)" }}>
      {children}
    </div>
  );
}

/** Quiet text actions at the foot of a drawer: edit on the left, remove on the right. */
export function DrawerActions({ onEdit, editLabel, onRemove, removeLabel }: { onEdit?: () => void; editLabel?: string; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex items-center justify-between">
      {onEdit ? (
        <button type="button" onClick={onEdit} className="h-9 rounded-full text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          {editLabel}
        </button>
      ) : (
        <span />
      )}
      <button type="button" onClick={onRemove} className="h-9 rounded-full text-[13px] font-semibold" style={{ color: "var(--status-attention)" }}>
        {removeLabel}
      </button>
    </div>
  );
}
