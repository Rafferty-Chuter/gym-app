/**
 * Food database entities (M4). Two sources feed one shape: CoFID, the UK
 * government's composition of foods dataset (generic foods, per 100 g),
 * and Open Food Facts (packaged products, by name or barcode). The logger
 * only ever sees a `FoodItem`.
 */

import type { Extras } from "@/lib/food/extras";

export type FoodSource = "cofid" | "off" | "user";

/** A named amount of a food, in grams of the food as eaten. */
export type Portion = { label: string; grams: number };

/** Per 100 g of the food as eaten. kcal, g; fibre and the extras (sodium in mg) when the source has them (IN6). */
export type Per100 = { kcal: number; proteinG: number; carbsG: number; fatG: number; fibreG?: number } & Extras;

export type FoodItem = {
  /** Stable: `cofid:<code>` or `off:<barcode>`. */
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  per100: Per100;
  /** Named portions beyond 100 g, most useful first. */
  portions: Portion[];
  barcode?: string;
  /** CoFID food group code, for ranking and display. */
  group?: string;
};

/** Macros for an amount of a food; fibre and the extras only when the source has them. */
export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number; fibreG?: number } & Extras;
