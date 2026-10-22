/**
 * The Describe "plate" (after MacroFactor's AI Plate): the foods read from
 * a description, each at an amount the user can change before logging.
 * The numbers for amount 1 are what the server resolved (CoFID where a
 * food matched, the model's estimate otherwise); every other amount is
 * plain scaling of those, so nothing here asks the model again. Pure.
 */

import type { Macros } from "@/lib/food/types";
import { knownFibre } from "@/lib/food/fibre";
import { EXTRA_KEYS, scaleExtras, type Extras } from "@/lib/food/extras";
import type { PortionOption, ResolvedItem } from "@/lib/food/recipe";

/** A described food and how much of it is being logged: `amount` times what was described; `portion` names the size when it was picked from the food's portions (F8). */
export type PlateItem = ResolvedItem & { amount: number; portion?: string };

/** Portions as quick choices, in multiples of what was described. OURS. */
export const AMOUNT_CHOICES: readonly number[] = [0.5, 1, 1.5, 2];
/** Portion stepper bounds and step for foods without a weight. OURS. */
export const MIN_AMOUNT = 0.25;
export const MAX_AMOUNT = 20;
export const AMOUNT_STEP = 0.5;
/** Gram stepper step: fine enough for a portion, coarse enough to tap. OURS. */
export const GRAMS_STEP = 10;
export const MAX_PLATE_GRAMS = 5000;

export function toPlate(items: readonly ResolvedItem[]): PlateItem[] {
  return items.map((i) => ({ ...i, amount: 1 }));
}

/** Macros at the item's amount, rounded once; fibre (to 0.1 g) and the extras (IN6) only when the item has them. */
export function plateItemMacros(p: PlateItem): Macros {
  return { kcal: Math.round(p.kcal * p.amount), proteinG: Math.round(p.proteinG * p.amount), fatG: Math.round(p.fatG * p.amount), carbsG: Math.round(p.carbsG * p.amount), ...(p.fibreG != null ? { fibreG: Math.round(p.fibreG * p.amount * 10) / 10 } : {}), ...scaleExtras(p, p.amount) };
}

/** Grams at the item's amount, or null when the weight was never known. */
export function plateItemGrams(p: PlateItem): number | null {
  return p.grams > 0 ? Math.round(p.grams * p.amount) : null;
}

/** The amount for a weight in grams; foods without a weight keep theirs. */
export function withGrams(p: PlateItem, grams: number): PlateItem {
  if (p.grams <= 0) return p;
  const g = Math.min(MAX_PLATE_GRAMS, Math.max(1, Math.round(grams)));
  return { ...p, amount: g / p.grams, portion: undefined };
}

export function withAmount(p: PlateItem, amount: number): PlateItem {
  return { ...p, amount: Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, amount)), portion: undefined };
}

/**
 * The sizes to pick from for a food that comes in sizes (F8): what was
 * described, then the model's other portions, smallest first. Empty when
 * the food has none, so the plain multiples are offered instead.
 */
export function portionChoices(p: PlateItem): PortionOption[] {
  if (!p.portions || p.portions.length === 0) return [];
  return [{ label: p.serving || "As described", factor: 1 }, ...p.portions].sort((a, b) => a.factor - b.factor);
}

/** The food at a picked size, named by it. */
export function withPortion(p: PlateItem, choice: PortionOption): PlateItem {
  return { ...p, amount: choice.factor, portion: choice.factor === 1 ? undefined : choice.label };
}

/** The size named on a row's line while its pill shows grams: the picked portion, otherwise what was described or a multiple of it (F8). */
export function rowSize(p: PlateItem): string | null {
  if (plateItemGrams(p) == null) return null;
  if (p.portion) return p.portion;
  if (!p.serving) return null;
  return p.amount === 1 ? p.serving : `${formatAmount(p.amount)} × ${p.serving}`;
}

/** True when `choice` is the size the food is at now. */
export function isPortion(p: PlateItem, choice: PortionOption): boolean {
  return Math.abs(p.amount - choice.factor) < 0.001;
}

/**
 * Typed-in macros for the item as it now stands: they become the numbers
 * for amount 1 at the current weight, and the base-list match is dropped
 * because the numbers are the user's now. Fibre is kept at the current
 * amount while energy and carbs are unchanged, and dropped (unknown) once
 * either is edited, as on a logged entry; the extras (IN6) likewise, but
 * dropped once any of the four numbers is edited.
 */
export function withMacros(p: PlateItem, m: Macros & { label?: string; serving?: string }): PlateItem {
  const grams = plateItemGrams(p) ?? 0;
  const now = plateItemMacros(p);
  const fibreG = now.fibreG != null && m.kcal === now.kcal && m.carbsG === now.carbsG ? now.fibreG : undefined;
  const same = m.kcal === now.kcal && m.proteinG === now.proteinG && m.fatG === now.fatG && m.carbsG === now.carbsG;
  const extras: Extras = Object.fromEntries(EXTRA_KEYS.map((k) => [k, same ? now[k] : undefined]));
  return { ...p, label: m.label ?? p.label, serving: m.serving ?? p.serving, kcal: m.kcal, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG, fibreG, ...extras, grams, amount: 1, matched: undefined, sourceId: undefined, confidence: "high" };
}

/** The pill on the right of a row: grams when known ("120" over "g"), otherwise portions of what was described ("1.5" over "2 slices"), or "1" over a picked size. */
export function amountPill(p: PlateItem): { value: string; unit: string } {
  const g = plateItemGrams(p);
  if (g != null) return { value: g.toLocaleString("en-GB"), unit: "g" };
  if (p.portion) return { value: "1", unit: p.portion };
  return { value: formatAmount(p.amount), unit: p.serving || (p.amount === 1 ? "portion" : "portions") };
}

/** "1", "1.5", "0.25". */
export function formatAmount(a: number): string {
  return Number.isInteger(a) ? String(a) : String(Math.round(a * 100) / 100);
}

/** "½ ×" style labels for AMOUNT_CHOICES. */
export function choiceLabel(a: number): string {
  const whole = Math.floor(a);
  const half = a - whole === 0.5;
  return `${whole > 0 ? whole : ""}${half ? "½" : ""}${!half && whole === 0 ? "0" : ""}×`;
}

/** The serving text logged with the entry: as described at amount 1, otherwise the weight or the portions. */
export function plateServing(p: PlateItem): string | undefined {
  if (p.portion) return p.portion;
  if (p.amount === 1) return p.serving || (p.grams > 0 ? `${p.grams} g` : undefined);
  const g = plateItemGrams(p);
  if (g != null) return `${g} g`;
  return `${formatAmount(p.amount)} × ${p.serving || "portion"}`;
}

/** The plate's total, summed from each row as shown; fibre by the known-fibre rule (lib/food/fibre.ts). */
export function plateTotals(items: readonly PlateItem[]): Macros {
  const t: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  const rows = items.map(plateItemMacros);
  for (const m of rows) {
    t.kcal += m.kcal;
    t.proteinG += m.proteinG;
    t.fatG += m.fatG;
    t.carbsG += m.carbsG;
  }
  return { ...t, fibreG: knownFibre(rows) };
}

/** Where a row's numbers came from, for the line under it: a product's label or a chain's published figures, a base-list row, or an estimate. */
export function sourceLine(p: Pick<ResolvedItem, "matched" | "confidence" | "publishedBy" | "fromLabel">): { text: string; estimate: boolean } {
  if (p.publishedBy) return { text: `${p.fromLabel ? "Label" : "Published figures"}, ${p.publishedBy}`, estimate: false };
  if (p.matched) return { text: p.matched, estimate: false };
  return { text: p.confidence === "low" ? "Rough estimate" : "Estimate", estimate: true };
}
