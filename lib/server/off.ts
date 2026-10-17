/**
 * Server-side calls to Open Food Facts (M4). Why a proxy: OFF asks for a
 * User-Agent naming the app, which a browser cannot set, and one cached
 * copy per query keeps us inside their rate limits. Nothing about the user
 * goes upstream but the query text or the barcode.
 */

import { OFF_FIELDS, offToFoodItem, type OffProduct } from "@/lib/food/off";
import type { FoodItem } from "@/lib/food/types";

export const OFF_USER_AGENT = "GymApp/0.1 (https://gym-app-eta-nine.vercel.app)";
/** Results per search; the base list covers generic foods, so a short list of products is enough. OURS. */
export const OFF_PAGE_SIZE = 12;
/** Upstream cache: products change rarely; a day keeps the proxy quiet. OURS. */
export const OFF_REVALIDATE_S = 24 * 60 * 60;
const SEARCH_URL = "https://search.openfoodfacts.org/search";
const PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";

export type OffResult<T> = { ok: true; value: T } | { ok: false; status: number };

/** UK-sold products matching `q`, in OFF's relevance order, mapped. */
export async function searchOff(q: string): Promise<OffResult<FoodItem[]>> {
  const params = new URLSearchParams({ q: `${q} countries_tags:"en:united-kingdom"`, langs: "en", page_size: String(OFF_PAGE_SIZE), fields: OFF_FIELDS });
  let res: Response;
  try {
    res = await fetch(`${SEARCH_URL}?${params.toString()}`, { headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" }, next: { revalidate: OFF_REVALIDATE_S } });
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const json = (await res.json()) as { hits?: OffProduct[] };
  const items: FoodItem[] = [];
  const seen = new Set<string>();
  for (const h of json.hits ?? []) {
    const item = offToFoodItem(h);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return { ok: true, value: items };
}

/** One product by barcode; `value` null when OFF has no usable entry. */
export async function lookupBarcode(code: string): Promise<OffResult<FoodItem | null>> {
  let res: Response;
  try {
    res = await fetch(`${PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" }, next: { revalidate: OFF_REVALIDATE_S } });
  } catch {
    return { ok: false, status: 0 };
  }
  if (res.status === 404) return { ok: true, value: null };
  if (!res.ok) return { ok: false, status: res.status };
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (!json.product || json.status === 0) return { ok: true, value: null };
  return { ok: true, value: offToFoodItem({ ...json.product, code: json.product.code ?? code }) };
}
