/**
 * Portions and scaling (M4). Macros scale linearly from per 100 g. The
 * default portions for generic foods are the familiar UK household
 * measures (a medium egg, a slice of medium bread, a glass of milk), all
 * CAL: ordinary sizes, not measurements of the user's food; the 80 g
 * vegetable portion is the NHS five-a-day portion (PUB). 100 g is always
 * offered too, and any grams or ounces can be typed (C6).
 */

import type { FoodItem, Macros, Portion } from "@/lib/food/types";
import { scaleExtras } from "@/lib/food/extras";

export function scaleMacros(item: FoodItem, grams: number): Macros {
  const f = Math.max(0, grams) / 100;
  const r = (n: number) => Math.round(n * f * 10) / 10;
  const fibre = item.per100.fibreG;
  return { kcal: Math.round(item.per100.kcal * f), proteinG: r(item.per100.proteinG), carbsG: r(item.per100.carbsG), fatG: r(item.per100.fatG), ...(fibre != null ? { fibreG: r(fibre) } : {}), ...scaleExtras(item.per100, f) };
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
  { re: /^cheese, cottage/, portions: [{ label: "2 tbsp", grams: 40 }, { label: "1 small pot", grams: 150 }] },
  { re: /^cheese, /, portions: [{ label: "matchbox piece", grams: 30 }] },
  { re: /^butter, /, portions: [{ label: "thin spread", grams: 7 }, { label: "1 tbsp", grams: 14 }] },
  { re: /^oil, /, portions: [{ label: "1 tsp", grams: 4 }, { label: "1 tbsp", grams: 11 }] },
  { re: /^peanut butter/, portions: [{ label: "1 tbsp", grams: 15 }] },
  { re: /^rice, .*boiled/, portions: [{ label: "1 portion (cooked)", grams: 180 }] },
  { re: /^rice, .*raw/, portions: [{ label: "1 portion (dry)", grams: 75 }] },
  { re: /^(pasta|spaghetti|macaroni|penne|noodles), .*boiled/, portions: [{ label: "1 portion (cooked)", grams: 180 }] },
  { re: /^(pasta|spaghetti|macaroni|penne|noodles), .*(raw|dried)/, portions: [{ label: "1 portion (dry)", grams: 75 }] },
  { re: /^(quinoa, raw|couscous, plain, raw)/, portions: [{ label: "1 portion (dry)", grams: 60 }] },
  { re: /^breakfast cereal, wheat biscuits/, portions: [{ label: "2 biscuits", grams: 38 }] },
  { re: /^(breakfast cereal, |muesli)(?!.*(made up|cooked))/, portions: [{ label: "1 bowl", grams: 40 }] },
  { re: /^salmon, smoked/, portions: [{ label: "2 slices", grams: 50 }] },
  { re: /^salmon, (farmed|wild)/, portions: [{ label: "1 fillet", grams: 120 }] },
  { re: /^tuna, canned/, portions: [{ label: "1 can (drained)", grams: 110 }] },
  { re: /^cod, flesh only/, portions: [{ label: "1 fillet", grams: 140 }] },
  { re: /^prawns, /, portions: [{ label: "1 portion", grams: 80 }] },
  { re: /^beef, (rump|sirloin) steak/, portions: [{ label: "1 steak", grams: 200 }] },
  { re: /^beef, mince/, portions: [{ label: "1 portion", grams: 125 }] },
  { re: /^pork, loin (chops|steaks)/, portions: [{ label: "1 chop", grams: 150 }] },
  { re: /^chicken, thighs/, portions: [{ label: "1 thigh", grams: 90 }] },
  { re: /^sausages, /, portions: [{ label: "1 sausage", grams: 40 }, { label: "2 sausages", grams: 80 }] },
  { re: /^bacon rashers, /, portions: [{ label: "1 rasher", grams: 25 }, { label: "2 rashers", grams: 50 }] },
  { re: /^ham\b/, portions: [{ label: "1 slice", grams: 23 }] },
  { re: /^baked beans, /, portions: [{ label: "half a can", grams: 200 }, { label: "1 can", grams: 415 }] },
  { re: /^(chickpeas|lentils), .*boiled/, portions: [{ label: "3 tbsp", grams: 80 }] },
  { re: /^avocado, .*flesh only$/, portions: [{ label: "half an avocado", grams: 75 }, { label: "1 avocado", grams: 150 }] },
  { re: /^(blueberries|raspberries, raw|strawberries, raw|grapes, )/, portions: [{ label: "1 handful", grams: 80 }] },
  { re: /^pears, .*raw/, portions: [{ label: "1 medium pear", grams: 160 }] },
  { re: /^kiwi fruit, flesh only, raw$/, portions: [{ label: "1 kiwi", grams: 60 }] },
  { re: /^tomatoes, .*raw/, portions: [{ label: "1 medium tomato", grams: 85 }] },
  { re: /^onions, raw/, portions: [{ label: "1 medium onion", grams: 150 }] },
  { re: /^peppers, capsicum, (green|red|yellow), raw/, portions: [{ label: "1 pepper", grams: 160 }] },
  { re: /^(broccoli, green|carrots, |peas, |sweetcorn|spinach|mushrooms|beans, green)(?!.*dried)/, portions: [{ label: "1 portion (80 g)", grams: 80 }] },
  { re: /^honey/, portions: [{ label: "1 tsp", grams: 7 }, { label: "1 tbsp", grams: 21 }] },
  { re: /^sugar, /, portions: [{ label: "1 tsp", grams: 4 }] },
  { re: /^jam, /, portions: [{ label: "1 tsp", grams: 7 }, { label: "1 tbsp", grams: 15 }] },
  { re: /^chocolate, (milk|plain)/, portions: [{ label: "2 squares", grams: 10 }, { label: "1 bar", grams: 45 }] },
  { re: /^biscuits, digestive/, portions: [{ label: "1 biscuit", grams: 15 }, { label: "2 biscuits", grams: 30 }] },
  { re: /^croissants/, portions: [{ label: "1 croissant", grams: 60 }] },
  { re: /^crumpets/, portions: [{ label: "1 crumpet", grams: 55 }] },
  { re: /^houmous/, portions: [{ label: "1 tbsp", grams: 30 }] },
  { re: /^(mayonnaise|tomato ketchup)/, portions: [{ label: "1 tbsp", grams: 15 }] },
  { re: /^cream, (single|double|whipping)/, portions: [{ label: "1 tbsp", grams: 15 }] },
  { re: /^ice cream, (dairy|non dairy)/, portions: [{ label: "1 scoop", grams: 60 }] },
  { re: /^pizza, /, portions: [{ label: "1 slice", grams: 75 }] },
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
