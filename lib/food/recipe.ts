/**
 * Recipes and restaurant orders described in text (M4b). The model reads
 * the text into ingredients and grams; the numbers come from CoFID where
 * an ingredient matches the base list, and from the model's per-100 g
 * estimate only when nothing fits. Every sum here is plain arithmetic on
 * those rows, so the logged numbers never come from the model directly.
 */

import { normalise, searchFoods } from "@/lib/food/cofid";
import type { FoodItem, Macros, Per100 } from "@/lib/food/types";

export type IngredientSource = "cofid" | "estimate";

export type RecipeIngredient = {
  /** As written by the user ("a jar of passata"), shortened by the model. */
  name: string;
  /** Grams of the ingredient as used. */
  grams: number;
  per100: Per100;
  source: IngredientSource;
  /** The CoFID name the numbers came from, when `source` is "cofid". */
  matched?: string;
};

export type Recipe = { name: string; servings: number; ingredients: RecipeIngredient[] };

/** An ingredient the model has parsed but the base list has not yet been asked about. */
export type IngredientDraft = { name: string; lookup: string; grams: number; per100: Per100 };

/** Servings a recipe can make. More than this is catering, not a meal. OURS. */
export const MAX_SERVINGS = 50;
/** Portions eaten move in halves; a quarter of a lasagne is a guess anyway. OURS. */
export const EATEN_STEP = 0.5;
export const MIN_EATEN = 0.5;
export const MAX_EATEN = 20;

/**
 * A base-list hit is accepted only when every lookup word is a whole word
 * of the hit's name (or two adjacent words joined, for "chickpeas"), so
 * "beef mince" takes "Beef, mince, raw" and "passata" takes nothing
 * rather than the nearest prefix. A wrong match is worse than an estimate.
 */
export function acceptMatch(lookup: string, name: string): boolean {
  const q = normalise(lookup);
  if (q.length === 0) return false;
  const words = normalise(name);
  const have = new Set(words);
  for (let i = 0; i + 1 < words.length; i++) have.add(words[i] + words[i + 1]);
  return q.every((w) => have.has(w));
}

/** The first of the top three search hits that passes `acceptMatch`, or null. */
export function matchIngredient(items: readonly FoodItem[], lookup: string): FoodItem | null {
  const q = lookup.trim();
  if (!q) return null;
  for (const hit of searchFoods(items, q, 3)) if (acceptMatch(q, hit.name)) return hit;
  return null;
}

/** Base-list numbers when the lookup matches, otherwise the model's estimate, marked as such. */
export function resolveIngredient(items: readonly FoodItem[], draft: IngredientDraft): RecipeIngredient {
  const hit = matchIngredient(items, draft.lookup || draft.name);
  const grams = Math.max(0, Math.round(draft.grams));
  if (hit) return { name: draft.name, grams, per100: hit.per100, source: "cofid", matched: hit.name };
  return { name: draft.name, grams, per100: draft.per100, source: "estimate" };
}

const round = (m: Macros): Macros => ({ kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), carbsG: Math.round(m.carbsG), fatG: Math.round(m.fatG) });

/** Unrounded macros for one ingredient at its grams. */
export function ingredientMacros(ing: RecipeIngredient): Macros {
  const f = ing.grams / 100;
  return { kcal: ing.per100.kcal * f, proteinG: ing.per100.proteinG * f, carbsG: ing.per100.carbsG * f, fatG: ing.per100.fatG * f };
}

/** The whole recipe, rounded once at the end. */
export function recipeTotals(ingredients: readonly RecipeIngredient[]): Macros {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const ing of ingredients) {
    const m = ingredientMacros(ing);
    t.kcal += m.kcal;
    t.proteinG += m.proteinG;
    t.carbsG += m.carbsG;
    t.fatG += m.fatG;
  }
  return round(t);
}

/** Macros for `eaten` servings of a recipe that makes `servings`. */
export function eatenMacros(ingredients: readonly RecipeIngredient[], servings: number, eaten: number): Macros {
  const s = Math.max(1, servings);
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const ing of ingredients) {
    const m = ingredientMacros(ing);
    t.kcal += m.kcal;
    t.proteinG += m.proteinG;
    t.carbsG += m.carbsG;
    t.fatG += m.fatG;
  }
  const f = eaten / s;
  return round({ kcal: t.kcal * f, proteinG: t.proteinG * f, carbsG: t.carbsG * f, fatG: t.fatG * f });
}

/** One serving of the recipe. */
export function perServing(ingredients: readonly RecipeIngredient[], servings: number): Macros {
  return eatenMacros(ingredients, servings, 1);
}

/** "1 serving of 4", "1.5 servings of 4", "the whole recipe" when all of it was eaten. */
export function servingLabel(eaten: number, servings: number): string {
  if (servings <= 1 && eaten === 1) return "1 serving";
  if (eaten === servings) return `the whole recipe (${servings} servings)`;
  const n = Number.isInteger(eaten) ? String(eaten) : eaten.toFixed(1);
  return `${n} ${eaten === 1 ? "serving" : "servings"} of ${servings}`;
}

/** High when every ingredient came from the base list, medium when any is the model's estimate. */
export function recipeConfidence(ingredients: readonly RecipeIngredient[]): "high" | "medium" | "low" {
  if (ingredients.length === 0) return "low";
  return ingredients.every((i) => i.source === "cofid") ? "high" : "medium";
}

/** How many ingredients are estimates rather than base-list rows. */
export function estimateCount(ingredients: readonly RecipeIngredient[]): number {
  return ingredients.filter((i) => i.source === "estimate").length;
}
