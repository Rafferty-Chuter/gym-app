/**
 * A chain's own published nutrition for dishes read by Describe (F8). The
 * parse marks dishes from chains and brands that publish per-dish
 * figures; one web search per dish then looks for them, and a figure
 * found replaces the estimate only when it passes the checks here. Pure:
 * the request itself is in lib/server/foodLookup.ts.
 */

import { z } from "zod";
import { reconcileEnergy, MAX_ITEM_FIBRE_G, MAX_ITEM_KCAL, MAX_ITEM_MACRO_G } from "@/lib/food/describe";
import type { ResolvedItem } from "@/lib/food/recipe";

/** Dishes checked per description: a meal out is rarely more than a main, a side and a drink. Bounds the searches, and the cost, of one request. OURS. */
export const MAX_PUBLISHED_DISHES = 3;
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
  /** The page the figures were read from. */
  source: z.string(),
});

export const PublishedOutput = z.object({ dishes: z.array(PublishedDish) });
export type PublishedOutputData = z.infer<typeof PublishedOutput>;

/** Indexes of the items worth a search: chain dishes, not already matched in the base list, at most MAX_PUBLISHED_DISHES. */
export function dishesToCheck(items: readonly ResolvedItem[]): number[] {
  const out: number[] = [];
  items.forEach((item, i) => {
    if (item.chain && !item.matched && out.length < MAX_PUBLISHED_DISHES) out.push(i);
  });
  return out;
}

/** The request text: one numbered line per dish, with the serving the figures should be for. */
export function publishedRequest(items: readonly ResolvedItem[], indexes: readonly number[]): string {
  return indexes.map((i, n) => `${n + 1}. ${items[i].label}${items[i].serving ? ` (${items[i].serving})` : ""}`).join("\n");
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
 * Items with published figures in place of the estimate where one was
 * found: a dish answered more than once, a figure without a web source,
 * calories outside 0 to MAX_ITEM_KCAL, or calories more than
 * PUBLISHED_MAX_RATIO from the estimate leave the estimate standing.
 * Macros are reconciled with the calories as estimates are, the grams and
 * portions stay (the figures are for the serving described), fibre is
 * the chain's when it publishes one and the estimate's otherwise.
 */
export function applyPublished(items: readonly ResolvedItem[], indexes: readonly number[], out: PublishedOutputData | null): ResolvedItem[] {
  if (!out) return [...items];
  const next = [...items];
  const seen = new Set<number>();
  for (const dish of out.dishes) {
    const at = indexes[Math.round(dish.index) - 1];
    if (at === undefined || seen.has(at) || !dish.found) continue;
    seen.add(at);
    const item = next[at];
    const site = sourceSite(dish.source);
    const kcal = finite(dish.kcal, MAX_ITEM_KCAL);
    if (!site || kcal == null || kcal === 0) continue;
    if (item.kcal > 0 && (kcal > item.kcal * PUBLISHED_MAX_RATIO || kcal < item.kcal / PUBLISHED_MAX_RATIO)) continue;
    const m = reconcileEnergy({ kcal, proteinG: finite(dish.proteinG, MAX_ITEM_MACRO_G) ?? 0, fatG: finite(dish.fatG, MAX_ITEM_MACRO_G) ?? 0, carbsG: finite(dish.carbsG, MAX_ITEM_MACRO_G) ?? 0 });
    const fibre = finite(dish.fibreG, MAX_ITEM_FIBRE_G);
    next[at] = {
      ...item,
      kcal: Math.round(m.kcal),
      proteinG: Math.round(m.proteinG),
      fatG: Math.round(m.fatG),
      carbsG: Math.round(m.carbsG),
      ...(fibre != null ? { fibreG: Math.round(fibre * 10) / 10 } : {}),
      confidence: "high",
      matched: undefined,
      publishedBy: site,
    };
  }
  return next;
}
