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
  /**
   * Set when the ingredient is counted, not weighed ("1 bowl" of a takeaway
   * curry): `grams / 100` is then the number of portions and `per100` is one
   * portion's numbers, so every sum below holds unchanged. Never counted in
   * a weight.
   */
  portion?: string;
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

/** How many search hits are considered for an ingredient. OURS: enough to reach "Spinach, mature, raw" past the baby and boiled rows. */
export const MATCH_CANDIDATES = 10;
/** A name that adds more than this many words beyond the lookup is a different dish ("Vegetables, mixed, cooked with onion, spice and tomatoes" for "mixed spice"), not the food. OURS. */
export const MAX_EXTRA_WORDS = 4;
/** Rank cost of a name whose first segment adds words of its own ("Cream substitute" for "double cream", "Rock Salmon" for "salmon"): kept only when nothing plainer fits. OURS. */
export const RANK_HEAD_EXTRA = 50;
/** Rank cost of each preserved form the lookup did not ask for ("Spinach, dried" for "spinach"): the numbers are several times the fresh food's. OURS. */
export const RANK_PRESERVED = 20;

/** Words a recipe writes one way and CoFID another. Curated. OURS. */
export const LOOKUP_SYNONYMS: Readonly<Record<string, string>> = { tinned: "canned", yoghurt: "yogurt", caster: "white", granulated: "white", courgettes: "courgette", aubergines: "aubergine" };
/** Words that describe preparation, not the food, so they never decide a match. Curated. OURS. */
export const LOOKUP_FILLER: ReadonlySet<string> = new Set(["chopped", "sliced", "diced", "grated", "crushed", "finely", "roughly", "fresh", "large", "small", "medium", "organic", "of"]);
/** Forms whose numbers differ a lot from the fresh food. OURS. */
export const PRESERVED_WORDS: ReadonlySet<string> = new Set(["dried", "dehydrated", "powder", "canned", "pickled", "freeze"]);
/** Rank cost of a part of the food rather than the food ("Bacon, fat only" for "bacon"): worse than a longer head. OURS. */
export const RANK_PART = 60;
/** Varieties a UK cook does not mean by default: other animals ("Milk, sheeps, raw" for "milk") and wholegrain forms ("Rice, brown" for "rice"); costed like a preserved form. Curated. OURS. */
export const NON_DEFAULT_WORDS: ReadonlySet<string> = new Set(["sheep", "goat", "duck", "buffalo", "quail", "goose", "wholewheat", "wholemeal", "brown"]);
/** Shapes CoFID files under plain pasta: "penne dried" is looked up as "pasta dried" too, and the better match wins. Curated. OURS. */
export const PASTA_SHAPES: ReadonlySet<string> = new Set(["spaghetti", "penne", "fusilli", "rigatoni", "linguine", "tagliatelle", "farfalle", "macaroni", "conchiglie", "orzo"]);
/** CoFID rows for one part of a food. OURS. */
export const PART_WORDS: ReadonlySet<string> = new Set(["fat", "lean"]);
/** Words naming the variety a UK cook means when none is said (white rice, hen's eggs, CoFID's average rows), so they cost nothing. Curated. OURS. */
export const DEFAULT_WORDS: ReadonlySet<string> = new Set(["average", "whole", "white", "standard", "chicken", "flesh", "only"]);
/** Words that say how a food was cooked or kept; a lookup with none of them is weighed raw when it is a recipe ingredient. OURS. */
export const STATE_WORDS: ReadonlySet<string> = new Set(["raw", "boiled", "fried", "grilled", "roasted", "baked", "cooked", "steamed", "stewed", "poached", "scrambled", "microwaved", "toasted", "mashed", "casseroled", "braised", "dried", "canned", "frozen", "smoked", "pickled"]);

/** The lookup as the base list writes it: synonyms folded, preparation words dropped. */
export function cleanLookup(lookup: string): string {
  const words = lookup
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !LOOKUP_FILLER.has(w))
    .map((w) => LOOKUP_SYNONYMS[w] ?? w);
  return words.join(" ");
}

export type MatchOptions = {
  /** Recipe ingredients are weighed as bought: with no state named, the raw row is tried first. */
  preferRaw?: boolean;
};

/**
 * The base-list row for a lookup, or null. A hit must pass `acceptMatch`,
 * and a lookup word must name the food where CoFID names it: the whole
 * first segment, its first word ("Porridge oats"), or the next two
 * segments after a category ("Cheese, Cheddar", "Pasta, wholewheat,
 * spaghetti") unless they start with "with"; so "tomatoes tinned" never
 * takes "Crumble, vegetable, with tinned tomatoes" and "toast" never
 * takes "Sesame prawn toast". Among the hits that pass, the rank prefers
 * a first segment made only of lookup words ("Cream, fresh, double" over
 * "Cream substitute, double"), then the food over a preserved form, a
 * part or a non-default variety the lookup did not ask for ("Spinach,
 * baby, raw" over "Spinach, dried", back rashers over "Bacon, fat only",
 * white rice over brown), then the fewest words beyond the lookup and
 * the default variety, so "pasta dried" takes "Pasta, white, dried, raw".
 * A pasta shape is also tried as plain pasta (dried, when no state is
 * named) and the better rank wins.
 * Ties keep the search order. With `preferRaw` and no state word, a plain
 * "<lookup> raw" row is tried first and the lookup as given after it.
 */
export function matchIngredient(items: readonly FoodItem[], lookup: string, options: MatchOptions = {}): FoodItem | null {
  const q = cleanLookup(lookup);
  if (!q) return null;
  const words = q.split(" ");
  const stated = normalise(q).some((w) => STATE_WORDS.has(w));
  // A shape with no state named is the dried pasta in the cupboard.
  const asPasta = words.some((w) => PASTA_SHAPES.has(w)) ? [`${words.map((w) => (PASTA_SHAPES.has(w) ? "pasta" : w)).join(" ")}${stated ? "" : " dried"}`] : [];
  const queries = [q, ...asPasta];
  const best = (suffix: string) =>
    queries.reduce<{ item: FoodItem; rank: number } | null>((acc, query) => {
      const m = bestMatch(items, `${query}${suffix}`);
      return m && (!acc || m.rank < acc.rank) ? m : acc;
    }, null);
  if (options.preferRaw && !stated) {
    // Only a plain raw row: "butter raw" must not take "Beans, butter, dried, raw".
    const raw = best(" raw");
    if (raw && raw.rank < RANK_PRESERVED) return raw.item;
  }
  return best("")?.item ?? null;
}

function bestMatch(items: readonly FoodItem[], q: string): { item: FoodItem; rank: number } | null {
  const qList = normalise(q);
  const qWords = new Set(qList);
  const withJoined = (words: string[]) => {
    const out = new Set(words);
    for (let i = 0; i + 1 < words.length; i++) out.add(words[i] + words[i + 1]);
    return out;
  };
  let best: { item: FoodItem; rank: number } | null = null;
  for (const hit of searchFoods(items, q, MATCH_CANDIDATES)) {
    if (!acceptMatch(q, hit.name)) continue;
    const segments = hit.name.split(",");
    const head = normalise(segments[0]);
    // After a category, the food can sit in the next two segments ("Pasta, wholewheat, spaghetti"); "with tinned tomatoes" is an addition, not the food.
    const named = withJoined(normalise(segments.slice(1, 3).filter((seg) => !/^\s*(with|in|and|on)\b/i.test(seg)).join(" ")));
    const words = normalise(hit.name);
    const extra = words.filter((w) => !qWords.has(w) && !DEFAULT_WORDS.has(w)).length;
    if (extra > MAX_EXTRA_WORDS) continue;
    // "Chick peas" is a clean head for "chickpeas".
    const headClean = head.every((w) => qWords.has(w)) || (head.length === 2 && qWords.has(head[0] + head[1]));
    // The food is named where CoFID names it: leading the first segment ("Porridge oats"), or in the second after a category ("Cheese, Cheddar"). "Sesame prawn toast" is not toast.
    if (!headClean && !qWords.has(head[0]) && !qList.some((w) => named.has(w))) continue;
    const preserved = words.filter((w) => (PRESERVED_WORDS.has(w) || NON_DEFAULT_WORDS.has(w)) && !qWords.has(w)).length;
    const part = words.some((w) => PART_WORDS.has(w) && !qWords.has(w));
    const rank = (headClean ? 0 : RANK_HEAD_EXTRA) + preserved * RANK_PRESERVED + (part ? RANK_PART : 0) + extra;
    if (!best || rank < best.rank) best = { item: hit, rank };
  }
  return best;
}

/** Base-list numbers when the lookup matches, otherwise the model's estimate, marked as such. */
export function resolveIngredient(items: readonly FoodItem[], draft: IngredientDraft): RecipeIngredient {
  const hit = matchIngredient(items, draft.lookup || draft.name, { preferRaw: true });
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

/** A described food as the model returns it: its own estimate plus a lookup and grams for the base list. */
export type ItemDraft = { label: string; serving: string; lookup: string; grams: number; kcal: number; proteinG: number; fatG: number; carbsG: number; confidence: "high" | "medium" | "low" };

/** A described food after the base list has been asked: base-list numbers and the matched name when it fit, the estimate otherwise. */
export type ResolvedItem = ItemDraft & { matched?: string };

/**
 * A meal item takes the base list's numbers when its lookup matches and
 * the model gave a weight, so "2 eggs, fried" becomes 120 g of "Eggs,
 * chicken, fried" at CoFID's values with high confidence. Otherwise the
 * model's own estimate stands, with its confidence as given.
 */
export function resolveItem(items: readonly FoodItem[], draft: ItemDraft): ResolvedItem {
  const grams = Math.max(0, Math.round(draft.grams));
  const hit = grams > 0 ? matchIngredient(items, draft.lookup) : null;
  if (!hit) return { ...draft, grams, kcal: Math.round(draft.kcal), proteinG: Math.round(draft.proteinG), fatG: Math.round(draft.fatG), carbsG: Math.round(draft.carbsG) };
  const f = grams / 100;
  return {
    ...draft,
    grams,
    kcal: Math.round(hit.per100.kcal * f),
    proteinG: Math.round(hit.per100.proteinG * f),
    fatG: Math.round(hit.per100.fatG * f),
    carbsG: Math.round(hit.per100.carbsG * f),
    confidence: "high",
    matched: hit.name,
  };
}

/** How many ingredients are estimates rather than base-list rows. */
export function estimateCount(ingredients: readonly RecipeIngredient[]): number {
  return ingredients.filter((i) => i.source === "estimate").length;
}
