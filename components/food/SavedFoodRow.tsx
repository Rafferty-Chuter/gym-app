"use client";

import type { ReactNode } from "react";
import type { SavedFood } from "@/lib/physique/types";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/** The round white plus used for one-tap logging in the logger. */
export function PlusButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-[var(--primary-pressed)] disabled:opacity-40" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}

/** One saved food: tap the text to adjust before logging, with a trailing control. */
export default function SavedFoodRow({ food, onPrefill, trailing }: { food: SavedFood; onPrefill: (s: SavedFood) => void; trailing: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <button type="button" onClick={() => onPrefill(food)} className="flex min-w-0 flex-1 flex-col rounded-[12px] px-3 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${food.label}, ${n(food.kcal)} kcal${food.recipe ? " a serving. Open the recipe" : ". Adjust before logging"}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
            {food.label}
          </span>
          {food.recipe && (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ background: "var(--green-dim)", color: "var(--green-strong)" }}>
              Recipe
            </span>
          )}
        </span>
        <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {n(food.kcal)} kcal · {Math.round(food.proteinG)}P {Math.round(food.fatG)}F {Math.round(food.carbsG)}C{food.serving ? ` · ${food.serving}` : ""}
        </span>
      </button>
      {trailing}
    </li>
  );
}
