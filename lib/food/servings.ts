/**
 * Serving sizes (C6): an amount of a serving size, as MacroFactor's food
 * page asks it. A serving size is one of the food's own portions ("1
 * medium egg", "1 serving (30 g)"), grams or ounces. Pure; storage stays
 * in grams.
 */

import type { Macros, Portion } from "@/lib/food/types";
import { scaleExtras } from "@/lib/food/extras";

/** One ounce in grams (exact, avoirdupois). */
export const G_PER_OZ = 28.349523125;

/** Amount steps on the − / + buttons. OURS: half a portion, 10 g, half an ounce. */
export const SERVING_STEP = { portion: 0.5, g: 10, oz: 0.5 } as const;

export type ServingUnit = { kind: "portion"; portion: Portion } | { kind: "g" } | { kind: "oz" };

/** Grams for an amount of a serving size. */
export function gramsFor(amount: number, unit: ServingUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return unit.kind === "portion" ? unit.portion.grams * amount : unit.kind === "oz" ? amount * G_PER_OZ : amount;
}

/** "1.5" / "2" / "0.25": amounts without trailing zeros. */
export function formatAmount(amount: number): string {
  return String(Math.round(amount * 100) / 100);
}

/**
 * What the serving is called on the logged entry, before the grams are
 * added: "1 medium egg", "1.5 × 1 medium egg", "3 oz"; null for plain
 * grams, where the grams say it all.
 */
export function servingName(amount: number, unit: ServingUnit): string | null {
  if (unit.kind === "g") return null;
  if (unit.kind === "oz") return `${formatAmount(amount)} oz`;
  return amount === 1 ? unit.portion.label : `${formatAmount(amount)} × ${unit.portion.label}`;
}

/**
 * The amount to show after switching serving size. Grams and ounces keep
 * the same weight of food; a portion starts at one of it.
 */
export function amountAfterSwitch(grams: number, to: ServingUnit): number {
  if (to.kind === "portion") return 1;
  if (!(grams > 0)) return to.kind === "g" ? 100 : 1;
  return to.kind === "g" ? Math.round(grams) : Math.round((grams / G_PER_OZ) * 10) / 10;
}

/** The next amount up or down by the unit's step, never below one step. */
export function stepAmount(amount: number, unit: ServingUnit, dir: 1 | -1): number {
  const step = SERVING_STEP[unit.kind];
  const base = Number.isFinite(amount) && amount > 0 ? amount : step;
  // Snap to the step grid first, so 37 g goes to 40 g and 30 g, not 47 g and 27 g.
  const snapped = dir > 0 ? Math.floor(base / step + 1e-9) * step + step : Math.ceil(base / step - 1e-9) * step - step;
  return Math.max(step, Math.round(snapped * 100) / 100);
}

/** A saved food's macros for a number of its servings, with fibre when it has it. */
export function scaleServings(food: Macros, servings: number): Macros {
  const s = Number.isFinite(servings) && servings > 0 ? servings : 0;
  const r1 = (v: number) => Math.round(v * s * 10) / 10;
  return { kcal: Math.round(food.kcal * s), proteinG: r1(food.proteinG), carbsG: r1(food.carbsG), fatG: r1(food.fatG), ...(food.fibreG != null ? { fibreG: r1(food.fibreG) } : {}), ...scaleExtras(food, s) };
}
