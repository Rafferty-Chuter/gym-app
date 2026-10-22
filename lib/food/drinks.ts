/**
 * Drinks in one tap (IN7): the common UK drinks as base-list rows at their
 * usual measure, so alcohol is logged as easily as it is had and IN9 can
 * read it against sleep, recovery, the next session and the scale. Each
 * is a CoFID row (calories and alcohol from IN6) at a pub measure; a count
 * multiplies it. The words only say what was logged. Pure.
 */

import { scaleMacros } from "@/lib/food/portions";
import { pickExtras, type Extras } from "@/lib/food/extras";
import type { FoodItem } from "@/lib/food/types";

export type DrinkId = "pint" | "can" | "red" | "white" | "single" | "cider";

/** A drink on the row: the base-list row (CoFID code), the measure it is had in, and that measure's weight per ml. */
export type Drink = { id: DrinkId; label: string; code: string; measure: string; ml: number; gPerMl: number };

/** g per ml of 40% spirit. PUB: ethanol–water mixtures at 40% by volume are about 0.95 g/ml at 20 °C. */
export const SPIRIT_G_PER_ML = 0.95;

/**
 * The row, most-had first. CAL: UK measures (a 568 ml pint, a 440 ml can,
 * the 175 ml glass pubs pour as standard, the 25 ml single); beer, cider
 * and wine are taken at 1 g per ml (within 1%). CoFID rows: standard lager
 * (about 4% ABV), red wine, dry white wine, 40% spirits, sweet cider (the
 * closest to the big UK brands).
 */
export const DRINKS: readonly Drink[] = [
  { id: "pint", label: "Pint of lager", code: "17-749", measure: "1 pint", ml: 568, gPerMl: 1 },
  { id: "can", label: "Can of lager", code: "17-749", measure: "1 can (440 ml)", ml: 440, gPerMl: 1 },
  { id: "red", label: "Red wine", code: "17-752", measure: "175 ml glass", ml: 175, gPerMl: 1 },
  { id: "white", label: "White wine", code: "17-755", measure: "175 ml glass", ml: 175, gPerMl: 1 },
  { id: "single", label: "Single spirit", code: "17-247", measure: "single (25 ml)", ml: 25, gPerMl: SPIRIT_G_PER_ML },
  { id: "cider", label: "Pint of cider", code: "17-224", measure: "1 pint", ml: 568, gPerMl: 1 },
];

/** Each drink's base-list row; a drink whose row is missing is left out. */
export function drinkItems(items: readonly FoodItem[]): Map<DrinkId, FoodItem> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<DrinkId, FoodItem>();
  for (const d of DRINKS) {
    const item = byId.get(`cofid:${d.code}`);
    if (item) out.set(d.id, item);
  }
  return out;
}

/** What is logged for `count` of a drink: the row's numbers for the weight, the weight, the row and the measure. */
export type DrinkLog = { label: string; kcal: number; proteinG: number; fatG: number; carbsG: number; fibreG?: number; grams: number; sourceId: string; serving: string; method: "search" } & Extras;

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/** `count` (1 or more) of a drink as a log: "3 × 1 pint · 1,704 ml". */
export function drinkFood(item: FoodItem, d: Drink, count: number): DrinkLog {
  const c = Math.max(1, Math.round(count));
  const grams = d.ml * d.gPerMl * c;
  const m = scaleMacros(item, grams);
  return {
    label: item.name,
    kcal: m.kcal,
    proteinG: m.proteinG,
    fatG: m.fatG,
    carbsG: m.carbsG,
    ...(m.fibreG != null ? { fibreG: m.fibreG } : {}),
    ...pickExtras(m),
    grams: Math.round(grams),
    sourceId: item.id,
    serving: `${c > 1 ? `${c} × ` : ""}${d.measure} · ${n(d.ml * c)} ml`,
    method: "search",
  };
}

/** The line after a tap: what was logged, at what count, or that it was taken off. */
export function drinkToast(d: Drink, food: DrinkLog, count: number): string {
  if (count <= 0) return `Removed ${food.label}`;
  if (count === 1) return `Logged ${food.label} · ${n(food.kcal)} kcal`;
  return `${food.label} · ${count} × ${d.measure} · ${n(food.kcal)} kcal`;
}
