/**
 * "Describe" in the food logger, the parts that are not the model: how
 * long a description may be, when a text reads as a recipe, how a pasted
 * recipe page is trimmed to what matters, how the model's reply is made
 * safe before anything is looked up, and what each failure says. Pure.
 */

import { MAX_SERVINGS, type IngredientDraft, type ItemDraft } from "@/lib/food/recipe";
import type { FoodParseError, FoodParseOutputData, ParseKind, ParseMode } from "@/lib/physique/food/parseSchema";

// ── Limits ──

/** A pasted recipe page with its method and a few comments. Above this the method is dropped before sending. OURS. */
export const MAX_DESCRIBE_CHARS = 12_000;
/** Names and labels are cut here, at a word. OURS: fits one line of the logger at 390 px twice over. */
export const MAX_NAME_CHARS = 60;
export const MAX_SERVING_CHARS = 40;
export const MAX_LOOKUP_CHARS = 60;
/** More foods than this in one meal description is a list of meals. OURS. */
export const MAX_ITEMS = 20;
/** The longest recipes run to about 30 ingredients. OURS. */
export const MAX_INGREDIENTS = 40;
/** One food as eaten; anything heavier is a misread. OURS. */
export const MAX_ITEM_GRAMS = 5000;
export const MAX_ITEM_KCAL = 5000;
export const MAX_ITEM_MACRO_G = 1000;
/** One ingredient in a batch recipe. OURS. */
export const MAX_INGREDIENT_GRAMS = 10_000;
/** Pure fat is about 900 kcal per 100 g; no food is denser. PUB. */
export const MAX_KCAL_PER_100 = 900;

// ── Reading the text ──

/** Words that only a recipe has. OURS. */
const RECIPE_CUES = /\b(serves|servings|ingredients|method|instructions|directions|preheat|prep time|cook time|makes \d+|portions)\b/i;
/** A line that starts with an amount: "500 g mince", "2 tbsp oil", "1 tin tomatoes". */
const AMOUNT_LINE = /^\s*[-•*]?\s*[\d½¼¾⅓⅔][\d./½¼¾⅓⅔\s]*(g|kg|ml|l|tbsp|tsp|cups?|oz|lb|tins?|cans?|jars?|cloves?|x)?\b/i;
/** Six weighed lines is a recipe; a weighed meal is rarely more than four foods. OURS. */
export const RECIPE_AMOUNT_LINES = 6;

/** True when the text reads as a recipe: a recipe word, or a list of six or more weighed lines. The model is then told so, instead of guessing. */
export function looksLikeRecipe(text: string): boolean {
  if (RECIPE_CUES.test(text)) return true;
  return text.split("\n").filter((l) => AMOUNT_LINE.test(l)).length >= RECIPE_AMOUNT_LINES;
}

/** A heading that starts the method on a recipe page. */
const METHOD_HEADING = /\n\s*(method|instructions|directions|steps|preparation|how to make it)\b[^\n]*\n/i;
const SERVES_LINE = /^[^\n]*\b(serves|makes|portions)\b[^\n]*\d[^\n]*$/im;

/**
 * Whitespace tidied; when that is still over `max`, the method is dropped
 * (the model ignores it anyway) and a "Serves 4" line found in it is kept.
 * Null when even the ingredients are over `max`.
 */
export function compactDescription(text: string, max = MAX_DESCRIBE_CHARS): { text: string; methodDropped: boolean } | null {
  const t = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length <= max) return { text: t, methodDropped: false };
  const m = METHOD_HEADING.exec(t);
  if (!m) return null;
  let head = t.slice(0, m.index).trim();
  const serves = SERVES_LINE.exec(t.slice(m.index));
  if (serves && !SERVES_LINE.test(head)) head = `${head}\n${serves[0].trim()}`;
  return head.length <= max ? { text: head, methodDropped: true } : null;
}

/** The mode sent to the route: the user's choice when they made one, "recipe" when the text reads as one, "auto" otherwise. */
export function modeFor(text: string, chosen?: ParseMode): ParseMode {
  if (chosen) return chosen;
  return looksLikeRecipe(text) ? "recipe" : "auto";
}

// ── Making the reply safe ──

/** Atwater factors, kcal per gram. PUB. */
const KCAL_PER_G = { proteinG: 4, carbsG: 4, fatG: 9 } as const;
/** Macro energy may run this far over the stated calories before an estimate is treated as slipped: rounding and fibre. OURS. */
export const MACRO_ENERGY_SLACK = 1.25;
export const MACRO_ENERGY_SLACK_KCAL = 10;

type MacroSet = { kcal: number; proteinG: number; fatG: number; carbsG: number };

/**
 * An estimate whose macros carry more energy than its calories has a
 * slipped number ("chicken thighs, 120 kcal, 50 g fat" per 100 g). The
 * calories are kept, as the number estimates are best calibrated on, and
 * the fat, then the carbs, then the protein is solved from them: the
 * first that comes out at zero or more replaces the slipped one. When
 * none does, all three are scaled down to the calories. Energy under the
 * macros is left alone: alcohol carries calories no macro does.
 */
export function reconcileEnergy<T extends MacroSet>(m: T): T {
  const energy = KCAL_PER_G.proteinG * m.proteinG + KCAL_PER_G.carbsG * m.carbsG + KCAL_PER_G.fatG * m.fatG;
  if (energy <= m.kcal * MACRO_ENERGY_SLACK + MACRO_ENERGY_SLACK_KCAL) return m;
  for (const key of ["fatG", "carbsG", "proteinG"] as const) {
    const others = energy - KCAL_PER_G[key] * m[key];
    const solved = (m.kcal - others) / KCAL_PER_G[key];
    if (solved >= 0) return { ...m, [key]: Math.round(solved * 10) / 10 };
  }
  const f = energy > 0 ? m.kcal / energy : 0;
  return { ...m, proteinG: m.proteinG * f, fatG: m.fatG * f, carbsG: m.carbsG * f };
}

/** Trimmed, one line, cut at a word under `max`. */
export function shortText(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:(-]+$/, "");
}

const clamp = (v: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);

export type SanitisedParse = {
  kind: ParseKind;
  items: ItemDraft[];
  recipe: { name: string; servings: number; ingredients: IngredientDraft[] } | null;
};

/**
 * The model's reply within the limits above: names cut at a word,
 * numbers clamped, slipped macros reconciled with the calories, servings a whole number from 1 to MAX_SERVINGS, lists
 * capped, ingredients with no weight dropped (salt "to taste"). The kind
 * follows what came back: a "recipe" with only items is a meal, and in
 * recipe mode items become ingredients, so a reply is never thrown away
 * for being filed under the wrong heading. "meal" mode does the reverse.
 */
export function sanitiseParse(out: FoodParseOutputData, mode: ParseMode): SanitisedParse {
  const items: ItemDraft[] = out.items
    .map((i) => reconcileEnergy({
      label: shortText(i.label, MAX_NAME_CHARS),
      serving: shortText(i.serving, MAX_SERVING_CHARS),
      lookup: shortText(i.lookup, MAX_LOOKUP_CHARS),
      grams: Math.round(clamp(i.grams, MAX_ITEM_GRAMS)),
      kcal: clamp(i.kcal, MAX_ITEM_KCAL),
      proteinG: clamp(i.proteinG, MAX_ITEM_MACRO_G),
      fatG: clamp(i.fatG, MAX_ITEM_MACRO_G),
      carbsG: clamp(i.carbsG, MAX_ITEM_MACRO_G),
      confidence: i.confidence,
    }))
    .filter((i) => i.label.length > 0)
    .slice(0, MAX_ITEMS);
  let ingredients: IngredientDraft[] = out.recipe.ingredients
    .map((g) => ({
      name: shortText(g.name, MAX_NAME_CHARS),
      lookup: shortText(g.lookup, MAX_LOOKUP_CHARS),
      grams: Math.round(clamp(g.grams, MAX_INGREDIENT_GRAMS)),
      per100: reconcileEnergy({ kcal: clamp(g.per100.kcal, MAX_KCAL_PER_100), proteinG: clamp(g.per100.proteinG, 100), fatG: clamp(g.per100.fatG, 100), carbsG: clamp(g.per100.carbsG, 100) }),
    }))
    .filter((g) => g.name.length > 0 && g.grams > 0)
    .slice(0, MAX_INGREDIENTS);
  const servings = Number.isFinite(out.recipe.servings) ? Math.min(MAX_SERVINGS, Math.max(1, Math.round(out.recipe.servings))) : 1;
  const name = shortText(out.recipe.name, MAX_NAME_CHARS) || "Recipe";

  if (mode === "recipe") {
    if (ingredients.length === 0) ingredients = items.filter((i) => i.grams > 0).map(itemToIngredient);
    return { kind: "recipe", items: [], recipe: ingredients.length ? { name, servings, ingredients } : null };
  }
  if (mode === "meal") {
    const asItems = items.length ? items : ingredients.map(ingredientToItem);
    return { kind: "meal", items: asItems.slice(0, MAX_ITEMS), recipe: null };
  }
  if (out.kind === "recipe" && ingredients.length > 0) return { kind: "recipe", items: [], recipe: { name, servings, ingredients } };
  if (items.length === 0 && ingredients.length > 0) return { kind: "recipe", items: [], recipe: { name, servings, ingredients } };
  return { kind: out.kind === "recipe" ? "meal" : out.kind, items, recipe: null };
}

function itemToIngredient(i: ItemDraft): IngredientDraft {
  const f = 100 / i.grams;
  return { name: i.label, lookup: i.lookup, grams: i.grams, per100: { kcal: Math.min(MAX_KCAL_PER_100, i.kcal * f), proteinG: Math.min(100, i.proteinG * f), fatG: Math.min(100, i.fatG * f), carbsG: Math.min(100, i.carbsG * f) } };
}

function ingredientToItem(g: IngredientDraft): ItemDraft {
  const f = g.grams / 100;
  return { label: g.name, serving: `${g.grams} g`, lookup: g.lookup, grams: g.grams, kcal: g.per100.kcal * f, proteinG: g.per100.proteinG * f, fatG: g.per100.fatG * f, carbsG: g.per100.carbsG * f, confidence: "medium" };
}

// ── Failures ──

/** The route's error code from an HTTP status, for replies without a readable body. */
export function errorFromStatus(status: number): FoodParseError {
  if (status === 503) return "not_configured";
  if (status === 429) return "limit";
  if (status === 413) return "too_long";
  if (status === 504) return "timeout";
  if (status === 502) return "busy";
  return "error";
}

/** One plain sentence per failure, saying what to do next. */
export function describeErrorText(code: FoodParseError): string {
  switch (code) {
    case "not_configured":
      return "Describe needs the AI key on the server. Quick add works without it.";
    case "limit":
      return "Daily limit reached for AI estimates. Search and quick add still work.";
    case "too_long":
      return "That is too long to read in one go. Paste the ingredient list and the servings line on their own.";
    case "refused":
      return "That couldn't be read as food. Name the foods and roughly how much.";
    case "unreadable":
      return "The reply came back incomplete. Try again; it usually works the second time.";
    case "busy":
      return "The estimate service is busy. Try again in a moment.";
    case "timeout":
      return "That took too long. Try again, or paste just the ingredient list.";
    case "offline":
      return "No connection. Search your saved foods or quick add instead.";
    case "empty":
      return "Nothing to log in that. Name the foods and roughly how much.";
    case "error":
      return "Couldn't read that. Try again, or quick add it.";
  }
}
