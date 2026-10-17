/**
 * Open Food Facts → FoodItem (M4). Pure. OFF products carry nutriments per
 * 100 g under keys like `energy-kcal_100g`; energy falls back to kJ.
 * A product without energy and all three macros is dropped rather than
 * logged with holes. Names prefer the English field.
 */

import { gramsFromQuantity } from "@/lib/food/portions";
import type { FoodItem, Portion } from "@/lib/food/types";

export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  /** A string in the product API, an array in search hits. */
  brands?: string | string[];
  quantity?: string;
  product_quantity?: number | string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutriments?: Record<string, unknown>;
};

/** Fields we ask OFF for, so responses stay small. */
export const OFF_FIELDS = "code,product_name,product_name_en,brands,quantity,product_quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments";

const KJ_PER_KCAL = 4.184;

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanName(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function offToFoodItem(p: OffProduct): FoodItem | null {
  const code = cleanName(p.code);
  const name = cleanName(p.product_name_en) || cleanName(p.product_name);
  if (!code || !name) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj != null) kcal = kj / KJ_PER_KCAL;
  }
  const proteinG = num(n["proteins_100g"]);
  const carbsG = num(n["carbohydrates_100g"]);
  const fatG = num(n["fat_100g"]);
  if (kcal == null || proteinG == null || carbsG == null || fatG == null) return null;
  if (kcal < 0 || kcal > 950 || proteinG < 0 || carbsG < 0 || fatG < 0) return null;
  const fibreG = num(n["fiber_100g"]);
  const r1 = (x: number) => Math.round(x * 10) / 10;

  const portions: Portion[] = [];
  const servingQ = num(p.serving_quantity);
  const unit = (p.serving_quantity_unit ?? "g").toLowerCase();
  if (servingQ != null && servingQ > 0 && servingQ <= 2000 && (unit === "g" || unit === "ml")) {
    const label = cleanName(p.serving_size) || `1 serving (${Math.round(servingQ)} g)`;
    portions.push({ label, grams: Math.round(servingQ) });
  }
  const pack = num(p.product_quantity) ?? gramsFromQuantity(p.quantity);
  if (pack != null && pack > 0 && pack <= 1500 && !portions.some((x) => x.grams === Math.round(pack))) {
    portions.push({ label: `whole pack (${cleanName(p.quantity) || `${Math.round(pack)} g`})`, grams: Math.round(pack) });
  }

  const brandsRaw = Array.isArray(p.brands) ? p.brands.join(",") : (p.brands ?? "");
  const brand = cleanName(brandsRaw.split(",")[0]);
  return {
    id: `off:${code}`,
    source: "off",
    name,
    ...(brand ? { brand } : {}),
    barcode: code,
    per100: { kcal: Math.round(kcal), proteinG: r1(proteinG), carbsG: r1(carbsG), fatG: r1(fatG), ...(fibreG != null && fibreG >= 0 ? { fibreG: r1(fibreG) } : {}) },
    portions,
  };
}
