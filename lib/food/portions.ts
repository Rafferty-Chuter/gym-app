/**
 * Portions and scaling (M4). Macros scale linearly from per 100 g. The
 * default portions for generic foods are the familiar UK household
 * measures (a medium egg, a slice of medium bread, a glass of milk), all
 * CAL: ordinary sizes, not measurements of the user's food. 100 g is
 * always offered too, and any grams can be typed.
 */

import type { FoodItem, Macros, Portion } from "@/lib/food/types";

export function scaleMacros(item: FoodItem, grams: number): Macros {
  const f = Math.max(0, grams) / 100;
  const r = (n: number) => Math.round(n * f * 10) / 10;
  const fibre = item.per100.fibreG;
  return { kcal: Math.round(item.per100.kcal * f), proteinG: r(item.per100.proteinG), carbsG: r(item.per100.carbsG), fatG: r(item.per100.fatG), ...(fibre != null ? { fibreG: r(fibre) } : {}) };
}

/** Regex on the CoFID name (lowercase) → household portions. CAL. */
const GENERIC_PORTIONS: ReadonlyArray<{ re: RegExp; portions: Portion[] }> = [
  { re: /^eggs?, chicken/, portions: [{ label: "1 medium egg", grams: 50 }, { label: "2 eggs", grams: 100 }] },
  { re: /^bread rolls/, portions: [{ label: "1 roll", grams: 60 }] },
  { re: /^bread, /, portions: [{ label: "1 medium slice", grams: 36 }, { label: "2 slices", grams: 72 }] },
  { re: /^bagels/, portions: [{ label: "1 bagel", grams: 85 }] },
  { re: /^bananas,/, portions: [{ label: "1 medium banana", grams: 100 }] },
  { re: /^apples, eating/, portions: [{ label: "1 medium apple", grams: 150 }] },
  { re: /^oranges,/, portions: [{ label: "1 medium orange", grams: 130 }] },
  { re: /^milk, /, portions: [{ label: "1 glass (200 ml)", grams: 200 }, { label: "splash (30 ml)", grams: 30 }] },
  { re: /^yogurt, /, portions: [{ label: "1 small pot", grams: 125 }, { label: "1 large pot", grams: 170 }] },
  { re: /^cheese, /, portions: [{ label: "matchbox piece", grams: 30 }] },
  { re: /^butter, /, portions: [{ label: "thin spread", grams: 7 }, { label: "1 tbsp", grams: 14 }] },
  { re: /^oil, /, portions: [{ label: "1 tsp", grams: 4 }, { label: "1 tbsp", grams: 11 }] },
  { re: /^peanut butter/, portions: [{ label: "1 tbsp", grams: 15 }] },
  { re: /^rice, .*boiled/, portions: [{ label: "1 portion (cooked)", grams: 180 }] },
  { re: /^(pasta|spaghetti|macaroni|penne|noodles), .*boiled/, portions: [{ label: "1 portion (cooked)", grams: 180 }] },
  { re: /^potatoes?, /, portions: [{ label: "1 portion", grams: 175 }] },
  { re: /^chicken, breast/, portions: [{ label: "1 breast", grams: 150 }] },
  { re: /^(oats|porridge oats)/, portions: [{ label: "1 serving (dry)", grams: 40 }] },
  { re: /^porridge, /, portions: [{ label: "1 bowl", grams: 200 }] },
  { re: /^(almonds|cashew|peanuts|walnuts|nuts|mixed nuts)/, portions: [{ label: "small handful", grams: 30 }] },
  { re: /^(beer|cider|lager)/, portions: [{ label: "1 pint", grams: 568 }, { label: "330 ml", grams: 330 }] },
  { re: /^wine/, portions: [{ label: "small glass (125 ml)", grams: 125 }, { label: "large glass (250 ml)", grams: 250 }] },
];

/** Household portions for a generic food; empty when none is well known. */
export function genericPortions(name: string): Portion[] {
  const n = name.toLowerCase();
  for (const g of GENERIC_PORTIONS) if (g.re.test(n)) return g.portions;
  return [];
}

/** Grams from a pack quantity such as "330 ml", "500g", "0,5 kg", "2 x 125g"; null when unreadable. ml counts as g. */
export function gramsFromQuantity(quantity: string | null | undefined): number | null {
  if (!quantity) return null;
  const s = quantity.toLowerCase().replace(",", ".");
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl)\b/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const grams = unit === "kg" || unit === "l" ? n * 1000 : unit === "cl" ? n * 10 : n;
  const multi = /(\d+)\s*x\s*\d/.exec(s);
  const total = multi ? grams * Number(multi[1]) : grams;
  return total > 0 && total <= 5000 ? Math.round(total) : null;
}

/** A whole pack is offered, never assumed: it sorts after 100 g. */
export function isPackPortion(p: Portion): boolean {
  return /^whole pack/i.test(p.label);
}

/** The portion list shown for an item, first is the usual: a serving or household measure, then 100 g, then a whole pack. */
export function portionChoices(item: FoodItem): Portion[] {
  const own = item.portions.length > 0 ? item.portions : item.source === "cofid" ? genericPortions(item.name) : [];
  const seen = new Set<number>();
  const out: Portion[] = [];
  for (const p of [...own.filter((x) => !isPackPortion(x)), { label: "100 g", grams: 100 }, ...own.filter(isPackPortion)]) {
    if (!(p.grams > 0) || seen.has(p.grams)) continue;
    seen.add(p.grams);
    out.push(p);
  }
  return out;
}
