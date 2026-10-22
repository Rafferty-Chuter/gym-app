/**
 * A chain's own published nutrition for dishes read by Describe (F8), and
 * a packaged product's label (IN12). The parse marks dishes from chains
 * that publish per-dish figures and branded products sold with a label;
 * one web search per dish or product then looks for them, and a figure
 * found replaces the estimate only when it passes the checks here. A
 * label is read per 100 g (or 100 ml) and scaled here to the amount
 * described, so "440 ml of SuperNutrio whole milk" is the label's
 * numbers times 4.4, never a guess at the product. Pure: the request
 * itself is in lib/server/foodLookup.ts.
 */

import { z } from "zod";
import { reconcileEnergy, MAX_FIBRE_PER_100, MAX_ITEM_FIBRE_G, MAX_ITEM_KCAL, MAX_ITEM_MACRO_G, MAX_ITEM_SODIUM_MG, MAX_KCAL_PER_100 } from "@/lib/food/describe";
import { SODIUM_PER_SALT, fittedExtras } from "@/lib/food/extras";
import type { ResolvedItem } from "@/lib/food/recipe";

/** Dishes and products checked per description: a whole day described at once names four or five branded foods. Bounds the searches, and the cost (a cent each), of one request. OURS. */
export const MAX_PUBLISHED_DISHES = 5;
/**
 * A published figure more than this many times the estimate, either way,
 * is more likely another dish or size (a sauce pot, a sharing platter)
 * than this one, so the estimate stays. OURS.
 */
export const PUBLISHED_MAX_RATIO = 3;

export const PublishedDish = z.object({
  /** The dish's number in the request, from 1. */
  index: z.number(),
  found: z.boolean(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  /** Null when the chain does not publish fibre. */
  fibreG: z.number().nullable(),
  /** Salt, total sugars and saturated fat in g, each null when not published (IN6). UK menus give salt, not sodium. */
  saltG: z.number().nullable(),
  sugarG: z.number().nullable(),
  satFatG: z.number().nullable(),
  /** The page the figures were read from. */
  source: z.string(),
  /** True when the figures are per 100 g or 100 ml, as a label gives them; false when they are for the serving (IN12). */
  per100: z.boolean(),
});

export const PublishedOutput = z.object({ dishes: z.array(PublishedDish) });
export type PublishedOutputData = z.infer<typeof PublishedOutput>;

/** True when the item's label is read per 100 g: a packaged product with a weight, not a chain's dish (IN12). */
export function isLabelLine(item: ResolvedItem): boolean {
  return item.packaged === true && !item.chain && item.grams > 0;
}

/** Indexes of the items worth a search: chain dishes and packaged products, not already matched in the base list, at most MAX_PUBLISHED_DISHES. */
export function dishesToCheck(items: readonly ResolvedItem[]): number[] {
  const out: number[] = [];
  items.forEach((item, i) => {
    if ((item.chain || isLabelLine(item)) && !item.matched && out.length < MAX_PUBLISHED_DISHES) out.push(i);
  });
  return out;
}

/** One request line per item: a dish with the serving the figures should be for, or a product marked for its label. Unnumbered. */
export function publishedLines(items: readonly ResolvedItem[], indexes: readonly number[]): string[] {
  return indexes.map((i) => (isLabelLine(items[i]) ? `${items[i].label} [label]` : `${items[i].label}${items[i].serving ? ` (${items[i].serving})` : ""}`));
}

/** The request text: one numbered line per dish or product. */
export function publishedRequest(items: readonly ResolvedItem[], indexes: readonly number[]): string {
  return publishedLines(items, indexes).map((line, n) => `${n + 1}. ${line}`).join("\n");
}

/** The site a source URL points at, without "www."; null when it is not a web address. */
export function sourceSite(source: string): string | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const finite = (v: number | null | undefined, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/**
 * A label's per-100 figures for the grams described, or null when they are
 * not per 100 or not a food: over MAX_KCAL_PER_100, a macro over 100 g or
 * fibre over MAX_FIBRE_PER_100 in 100 g (IN12). Anything else is passed
 * through unscaled for the checks below.
 */
function scaledToItem(dish: PublishedOutputData["dishes"][number], item: ResolvedItem): PublishedOutputData["dishes"][number] | null {
  const label = isLabelLine(item);
  if (label !== dish.per100) return null;
  if (!label) return dish;
  const per = (v: number | null, max: number) => (v == null ? null : finite(v, max));
  const kcal = per(dish.kcal, MAX_KCAL_PER_100);
  const macros = [dish.proteinG, dish.fatG, dish.carbsG].map((v) => per(v, 100));
  if (kcal == null || macros.some((v) => v == null)) return null;
  const f = item.grams / 100;
  const scale = (v: number | null) => (v == null ? null : v * f);
  return { ...dish, kcal: kcal * f, proteinG: dish.proteinG * f, fatG: dish.fatG * f, carbsG: dish.carbsG * f, fibreG: scale(per(dish.fibreG, MAX_FIBRE_PER_100)), saltG: scale(per(dish.saltG, 100)), sugarG: scale(per(dish.sugarG, 100)), satFatG: scale(per(dish.satFatG, 100)) };
}

/**
 * Items with published figures in place of the estimate where one was
 * found: a dish answered more than once, a figure without a web source,
 * calories outside 0 to MAX_ITEM_KCAL, or calories more than
 * PUBLISHED_MAX_RATIO from the estimate leave the estimate standing. A
 * product's label must come back per 100 g and a dish's per serving,
 * and a label is scaled to the grams described first (IN12).
 * Macros are reconciled with the calories as estimates are, the grams and
 * portions stay (the figures are for the serving described), fibre is
 * the chain's when it publishes one and the estimate's otherwise, and so
 * is each extra (IN6), fitted to the published figures.
 */
export function applyPublished(items: readonly ResolvedItem[], indexes: readonly number[], out: PublishedOutputData | null): ResolvedItem[] {
  if (!out) return [...items];
  const next = [...items];
  const seen = new Set<number>();
  for (const answer of out.dishes) {
    const at = indexes[Math.round(answer.index) - 1];
    if (at === undefined || seen.has(at) || !answer.found) continue;
    seen.add(at);
    const item = next[at];
    const dish = scaledToItem(answer, item);
    if (!dish) continue;
    const site = sourceSite(dish.source);
    const kcal = finite(dish.kcal, MAX_ITEM_KCAL);
    if (!site || kcal == null || kcal === 0) continue;
    if (item.kcal > 0 && (kcal > item.kcal * PUBLISHED_MAX_RATIO || kcal < item.kcal / PUBLISHED_MAX_RATIO)) continue;
    const m = reconcileEnergy({ kcal, proteinG: finite(dish.proteinG, MAX_ITEM_MACRO_G) ?? 0, fatG: finite(dish.fatG, MAX_ITEM_MACRO_G) ?? 0, carbsG: finite(dish.carbsG, MAX_ITEM_MACRO_G) ?? 0 });
    const fibre = finite(dish.fibreG, MAX_ITEM_FIBRE_G);
    const salt = finite(dish.saltG, MAX_ITEM_SODIUM_MG / 1000 / SODIUM_PER_SALT);
    const published = { sodiumMg: salt != null ? salt * SODIUM_PER_SALT * 1000 : null, sugarG: finite(dish.sugarG, MAX_ITEM_MACRO_G), satFatG: finite(dish.satFatG, MAX_ITEM_MACRO_G) };
    const extras = fittedExtras({ sodiumMg: published.sodiumMg ?? item.sodiumMg, sugarG: published.sugarG ?? item.sugarG, satFatG: published.satFatG ?? item.satFatG, alcoholG: item.alcoholG }, m, MAX_ITEM_SODIUM_MG);
    next[at] = {
      ...item,
      kcal: Math.round(m.kcal),
      proteinG: Math.round(m.proteinG),
      fatG: Math.round(m.fatG),
      carbsG: Math.round(m.carbsG),
      ...(fibre != null ? { fibreG: Math.round(fibre * 10) / 10 } : {}),
      sodiumMg: undefined,
      sugarG: undefined,
      satFatG: undefined,
      alcoholG: undefined,
      ...extras,
      confidence: "high",
      matched: undefined,
      sourceId: undefined,
      publishedBy: site,
      ...(isLabelLine(item) ? { fromLabel: true } : {}),
    };
  }
  return next;
}
