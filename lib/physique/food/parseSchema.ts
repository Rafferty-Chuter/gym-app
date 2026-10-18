/**
 * Shape of a "Describe" result, shared by the API route and the logger.
 * The model returns one of three kinds: a meal (items), a restaurant
 * order (items with the place in the label) or a recipe (ingredients
 * with grams and a database lookup word, which the server resolves
 * against CoFID before the client ever does arithmetic).
 *
 * The schema carries no length or range limits on purpose: structured
 * outputs only hint at them, so a limit here turned one long recipe name
 * or a "serves 4 to 6" into a failed request. Limits are applied after
 * the reply arrives, by `sanitiseParse` in lib/food/describe.ts.
 */
import { z } from "zod";
import type { Recipe, ResolvedItem } from "@/lib/food/recipe";

export const FoodItemSchema = z.object({
  label: z.string(),
  serving: z.string(),
  /** One to three plain words naming the generic food for the UK base list ("eggs fried"); empty when nothing generic fits. */
  lookup: z.string(),
  /** Grams of the food as eaten, 0 when unknown. */
  grams: z.number(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  /** Dietary fibre (AOAC, as UK labels give it) in grams for the item as eaten (F7). */
  fibreG: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const Per100Schema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fibreG: z.number(),
});

export const RecipeIngredientSchema = z.object({
  /** Short, as written: "mince", "passata", "pasta". */
  name: z.string(),
  /** One to three plain words naming the generic food for the UK base list: "beef mince raw". */
  lookup: z.string(),
  grams: z.number(),
  /** The model's own per-100 g estimate, used only when the base list has no match. */
  per100: Per100Schema,
});

export const RecipeSchema = z.object({
  name: z.string(),
  servings: z.number(),
  ingredients: z.array(RecipeIngredientSchema),
});

export const FoodParseOutput = z.object({
  kind: z.enum(["meal", "restaurant", "recipe"]),
  items: z.array(FoodItemSchema),
  recipe: RecipeSchema,
});

export type FoodParseOutputData = z.infer<typeof FoodParseOutput>;

/** One row in the logger's Describe list: the model's item, plus the base-list name when it matched. */
export type ParsedFoodItem = ResolvedItem;
export type ParseKind = FoodParseOutputData["kind"];

/** "recipe" when the text reads as one (or the user asked for it), so the model never has to guess; "meal" to read it as separate foods; "auto" otherwise. */
export type ParseMode = "auto" | "recipe" | "meal";

/** What the route returns to the logger: items for a meal or order, a resolved recipe otherwise. */
export type FoodParseResponse = { kind: ParseKind; items: ParsedFoodItem[]; recipe: Recipe | null };

/** Why a Describe request returned nothing to log. The logger turns each into one plain sentence. */
export type FoodParseError = "not_configured" | "limit" | "too_long" | "refused" | "unreadable" | "busy" | "timeout" | "offline" | "empty" | "error";

export const FOOD_PARSE_ERRORS: readonly FoodParseError[] = ["not_configured", "limit", "too_long", "refused", "unreadable", "busy", "timeout", "offline", "empty", "error"];
