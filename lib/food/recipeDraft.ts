/**
 * A recipe being made or edited (F6, after MacroFactor's Create Recipe):
 * a name, how many servings it makes, what the whole recipe weighs once
 * cooked (optional, and what lets a serving be logged in grams) and its
 * ingredients. Made from a Describe plate, from a recipe Describe read,
 * from a saved recipe, or from nothing. Every number is plain arithmetic
 * on the ingredient rows. Pure.
 */

import { MAX_SERVINGS, eatenMacros, perServing, servingLabel, type Recipe, type RecipeIngredient } from "@/lib/food/recipe";
import { formatAmount, type PlateItem } from "@/lib/food/plate";
import type { Macros } from "@/lib/food/types";
import type { SavedFood } from "@/lib/physique/types";

export type RecipeDraft = {
  /** The saved recipe being edited; absent for a new one. */
  savedId?: string;
  name: string;
  servings: number;
  /** Cooked weight of the whole recipe in grams, or null when not weighed. */
  totalGrams: number | null;
  ingredients: RecipeIngredient[];
};

/** How a portion eaten now is counted: servings, or grams of the cooked recipe. */
export type EatenUnit = "servings" | "grams";

/** A large batch pot. OURS. */
export const MAX_TOTAL_GRAMS = 20_000;
/** Grams eaten move in tens, like the plate. OURS. */
export const EATEN_GRAMS_STEP = 10;
/** Grams a new ingredient starts at, then adjusted. OURS: a round number that is rarely far off. */
export const NEW_INGREDIENT_GRAMS = 100;

export function emptyDraft(): RecipeDraft {
  return { name: "", servings: 1, totalGrams: null, ingredients: [] };
}

/**
 * The foods on a Describe plate as ingredients, at the amounts shown. A
 * food with a weight keeps its numbers per 100 g (CoFID's when it
 * matched); one without becomes a counted portion.
 */
export function draftFromPlate(items: readonly PlateItem[]): RecipeDraft {
  return { ...emptyDraft(), ingredients: items.map(plateIngredient) };
}

function plateIngredient(p: PlateItem): RecipeIngredient {
  const base = { name: p.label, source: p.matched ? ("cofid" as const) : ("estimate" as const), ...(p.matched ? { matched: p.matched } : {}) };
  if (p.grams > 0) {
    const f = 100 / p.grams;
    return { ...base, grams: Math.round(p.grams * p.amount), per100: { kcal: p.kcal * f, proteinG: p.proteinG * f, carbsG: p.carbsG * f, fatG: p.fatG * f } };
  }
  return { ...base, grams: Math.round(p.amount * 100), per100: { kcal: p.kcal, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG }, portion: p.serving || "portion" };
}

export function draftFromRecipe(r: Recipe): RecipeDraft {
  return { name: r.name, servings: r.servings, totalGrams: null, ingredients: r.ingredients };
}

/** A saved recipe, ready to edit or log; null for a saved food that is not a recipe. */
export function draftFromSaved(s: SavedFood): RecipeDraft | null {
  if (!s.recipe) return null;
  return { savedId: s.id, name: s.label, servings: s.recipe.servings, totalGrams: s.recipe.totalGrams ?? null, ingredients: s.recipe.ingredients };
}

// ── Numbers ──

/** Raw weight of the weighed ingredients; counted portions are left out. */
export function ingredientGrams(ings: readonly RecipeIngredient[]): number {
  return Math.round(ings.reduce((s, i) => s + (i.portion ? 0 : i.grams), 0));
}

/** One serving of the cooked recipe in grams, or null when it was not weighed. */
export function servingGrams(d: Pick<RecipeDraft, "servings" | "totalGrams">): number | null {
  return d.totalGrams && d.totalGrams > 0 ? d.totalGrams / Math.max(1, d.servings) : null;
}

/** Servings eaten for an amount in either unit; grams need the cooked weight. */
export function eatenServings(d: RecipeDraft, amount: number, unit: EatenUnit): number {
  if (unit === "servings") return amount;
  const g = servingGrams(d);
  return g ? amount / g : 0;
}

/** Macros for one serving, or for the whole recipe. */
export function draftMacros(d: RecipeDraft, per: "serving" | "recipe"): Macros {
  return per === "serving" ? perServing(d.ingredients, d.servings) : eatenMacros(d.ingredients, d.servings, d.servings);
}

/** What one serving is called in Saved: "1 serving (450 g)" when weighed, "1 serving of 4" otherwise. */
export function unitLabel(d: Pick<RecipeDraft, "servings" | "totalGrams">): string {
  const g = servingGrams(d);
  return g ? `1 serving (${Math.round(g).toLocaleString("en-GB")} g)` : servingLabel(1, d.servings);
}

/** The serving text on a logged entry: "1.5 servings of 4 (675 g)", or "300 g of 4 servings". */
export function eatenLabel(d: RecipeDraft, amount: number, unit: EatenUnit): string {
  if (unit === "grams") return `${Math.round(amount).toLocaleString("en-GB")} g of ${d.servings} ${d.servings === 1 ? "serving" : "servings"}`;
  const g = servingGrams(d);
  return `${servingLabel(amount, d.servings)}${g ? ` (${Math.round(g * amount).toLocaleString("en-GB")} g)` : ""}`;
}

/** Why the recipe cannot be saved yet, in one line; null when it can. */
export function draftIssue(d: RecipeDraft): string | null {
  if (d.ingredients.length === 0) return "Add an ingredient to save it.";
  if (!d.name.trim()) return "Name the recipe to save it.";
  return null;
}

/** What is stored on the saved food. */
export function toSavedRecipe(d: RecipeDraft): NonNullable<SavedFood["recipe"]> {
  return { servings: Math.min(MAX_SERVINGS, Math.max(1, Math.round(d.servings))), ingredients: d.ingredients, ...(d.totalGrams && d.totalGrams > 0 ? { totalGrams: Math.round(d.totalGrams) } : {}) };
}

/** "2 portions", "1 bowl": the pill for a counted ingredient. */
export function portionPill(i: RecipeIngredient): { value: string; unit: string } {
  return { value: formatAmount(Math.round(i.grams) / 100), unit: i.portion ?? "portion" };
}
