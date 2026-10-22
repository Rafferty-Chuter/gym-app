"use client";

import { useMemo } from "react";
import { DRINKS, drinkItems, type Drink, type DrinkId } from "@/lib/food/drinks";
import type { FoodItem } from "@/lib/food/types";

/** This sheet's drinks so far: the entry each went into and how many. */
export type DrinkTally = Partial<Record<DrinkId, { id: string; count: number }>>;

type Props = {
  /** The base list, null while it loads. */
  items: readonly FoodItem[] | null;
  tally: DrinkTally;
  busy: boolean;
  /** Sets the drink's entry to `count` (0 removes it). */
  onCount: (d: Drink, item: FoodItem, count: number) => void;
};

/**
 * The Drinks row (IN7), under the search box: a pint, a can, a glass of
 * red or white, a single, a pint of cider. A tap logs one; the chip then
 * becomes − n + on the same entry, the way a delivery app's add button
 * becomes a stepper. Scrolls sideways at phone width.
 */
export default function DrinksRow({ items, tally, busy, onCount }: Props) {
  const byId = useMemo(() => drinkItems(items ?? []), [items]);
  const drinks = DRINKS.filter((d) => byId.has(d.id));
  if (drinks.length === 0) return null;
  const stepBtn = (d: Drink, item: FoodItem, count: number, dir: 1 | -1) => (
    <button type="button" onClick={() => onCount(d, item, count + dir)} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-full text-[17px] font-semibold transition-opacity active:opacity-60 disabled:opacity-40" aria-label={dir > 0 ? `One more, ${d.label.toLowerCase()}` : `One fewer, ${d.label.toLowerCase()}`}>
      {dir > 0 ? "+" : "−"}
    </button>
  );
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5" style={{ scrollbarWidth: "none" }} role="group" aria-label="Drinks">
      {drinks.map((d) => {
        const item = byId.get(d.id)!;
        const t = tally[d.id];
        if (!t) {
          return (
            <button key={d.id} type="button" onClick={() => onCount(d, item, 1)} disabled={busy} className="h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-[12px] font-medium tracking-[0.01em] transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40" style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }} aria-label={`Log one, ${d.label.toLowerCase()}`}>
              {d.label}
            </button>
          );
        }
        return (
          <div key={d.id} className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full text-[12px] font-medium tracking-[0.01em]" style={{ background: "var(--primary)", color: "var(--text-on-primary)", fontVariantNumeric: "tabular-nums" }}>
            {stepBtn(d, item, t.count, -1)}
            <span aria-live="polite">
              {d.label} · {t.count}
            </span>
            {stepBtn(d, item, t.count, 1)}
          </div>
        );
      })}
    </div>
  );
}
