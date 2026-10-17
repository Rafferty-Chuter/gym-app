/**
 * Shape of a "Describe" result, shared by the API route and the logger.
 * The model returns one of three kinds: a meal (items), a restaurant
 * order (items with the place in the label) or a recipe (ingredients
 * with grams and a database lookup word, which the server resolves
 * against CoFID before the client ever does arithmetic).
 */
import { z } from "zod";
import type { Recipe } from "@/lib/food/recipe";

export const FoodItemSchema = z.object({
  label: z.string().min(1).max(60),
  serving: z.string().max(40),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  fatG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(1000),
  confidence: z.enum(["high", "medium", "low"]),
});

export const Per100Schema = z.object({
  kcal: z.number().min(0).max(900),
  proteinG: z.number().min(0).max(100),
  fatG: z.number().min(0).max(100),
  carbsG: z.number().min(0).max(100),
});

export const RecipeIngredientSchema = z.object({
  /** Short, as written: "mince", "passata", "pasta". */
  name: z.string().min(1).max(60),
  /** One to three plain words naming the generic food for the UK base list: "beef mince raw". */
  lookup: z.string().max(60),
  grams: z.number().min(0).max(10000),
  /** The model's own per-100 g estimate, used only when the base list has no match. */
  per100: Per100Schema,
});

export const RecipeSchema = z.object({
  name: z.string().max(60),
  servings: z.number().int().min(1).max(50),
  ingredients: z.array(RecipeIngredientSchema).max(30),
});

export const FoodParseOutput = z.object({
  kind: z.enum(["meal", "restaurant", "recipe"]),
  items: z.array(FoodItemSchema).max(12),
  recipe: RecipeSchema,
});

export type ParsedFoodItem = z.infer<typeof FoodItemSchema>;
export type ParseKind = z.infer<typeof FoodParseOutput>["kind"];

/** What the route returns to the logger: items for a meal or order, a resolved recipe otherwise. */
export type FoodParseResponse = { kind: ParseKind; items: ParsedFoodItem[]; recipe: Recipe | null };
