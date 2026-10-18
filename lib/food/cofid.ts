/**
 * The UK base list (M4): CoFID, McCance and Widdowson's Composition of
 * Foods Integrated Dataset 2021 (Public Health England, Open Government
 * Licence v3.0), built into `data/cofid.json` by `scripts/build-cofid.ts`.
 * About 2,900 generic foods per 100 g as eaten, searched offline.
 *
 * Ranking is plain and explained: every query word must start a word of
 * the food's name, exact words beat prefixes, a name that starts with the
 * query comes first, and a name with fewer qualifiers (commas) beats one
 * with more, so "Bananas" beats "Bananas, dried". CoFID's "average" rows
 * are the representative values, so they get a small lift.
 */

import type { FoodItem } from "@/lib/food/types";

/** [code, name, group, kcal, proteinG, fatG, carbsG, fibreG | null] */
export type CofidRow = [string, string, string, number, number, number, number, number | null];
export type CofidData = { meta: { source: string; licence: string; url: string; columns: string[]; foods: number }; foods: CofidRow[] };

/**
 * CoFID food groups with no dietary fibre: milk and dairy (B), eggs (C),
 * fish (J), meat (M), fats and oils (O). CoFID leaves fibre blank for many
 * of them; a blank on one with almost no carbohydrate is read as 0, so a
 * day of chicken and eggs still has a fibre total. PUB (fibre is plant
 * cell-wall material; McCance and Widdowson's group definitions).
 */
export const NO_FIBRE_GROUPS = new Set(["B", "C", "J", "M", "O"]);
/** A no-fibre group's row only counts as fibre-free at or under this much carbohydrate per 100 g; above it there may be a coating, rusk or filling. OURS. */
export const NO_FIBRE_MAX_CARBS_G = 1;

function fibreFor(group: string, carbsG: number, fibreG: number | null): number | null {
  if (fibreG != null) return fibreG;
  return NO_FIBRE_GROUPS.has(group.charAt(0)) && carbsG <= NO_FIBRE_MAX_CARBS_G ? 0 : null;
}

export function cofidToItems(rows: readonly CofidRow[]): FoodItem[] {
  return rows.map(([code, name, group, kcal, proteinG, fatG, carbsG, fibreG]) => {
    const fibre = fibreFor(group, carbsG, fibreG);
    return {
      id: `cofid:${code}`,
      source: "cofid" as const,
      name,
      group,
      per100: { kcal, proteinG, carbsG, fatG, ...(fibre == null ? {} : { fibreG: fibre }) },
      portions: [],
    };
  });
}

let cache: Promise<FoodItem[]> | null = null;

/** The base list, loaded once per session as its own chunk. */
export function loadCofid(): Promise<FoodItem[]> {
  if (!cache) cache = import("@/lib/food/data/cofid.json").then((m) => cofidToItems((m.default as CofidData).foods));
  return cache;
}

// ── Search ──

/** Score weights. OURS. */
export const SCORE_EXACT_WORD = 3;
export const SCORE_PREFIX_WORD = 2;
export const SCORE_LEADS = 2;
export const PENALTY_PER_COMMA = 0.6;
/** Earlier words in a CoFID name define the food ("Bread, white, sliced"), so a match near the front counts more. OURS. */
export const SCORE_POSITION = 0.5;
/** The query names the food itself: it equals the first comma segments of the name ("Eggs" for "egg", "Chicken, breast" for "chicken breast"), so dishes that merely contain the word ("Egg fu yung") sit below it. OURS. */
export const SCORE_HEAD_MATCH = 2.5;
/** Segments of a CoFID name the head match may span. OURS. */
export const HEAD_SEGMENTS = 3;
/** The rows people log most, by exact CoFID name, lifted so the plain version of a food comes before its variants. Curated. OURS. */
export const SCORE_CANONICAL = 1.5;
export const CANONICAL_NAMES: ReadonlySet<string> = new Set([
  "Eggs, chicken, whole, boiled",
  "Eggs, chicken, whole, poached",
  "Eggs, chicken, scrambled, with semi-skimmed milk",
  "Chicken, breast, grilled without skin, meat only",
  "Chicken, meat, average, roasted",
  "Turkey, breast, fillet, grilled, meat only",
  "Turkey, mince, stewed",
  "Beef, mince, stewed",
  "Beef, mince, raw, extra lean",
  "Beef, rump steak, grilled, lean only",
  "Pork, loin steaks, grilled, lean",
  "Bacon rashers, back, grilled",
  "Sausages, pork, chilled, grilled",
  "Salmon, farmed, flesh only, grilled",
  "Cod, flesh only, baked",
  "Tuna, canned in brine, drained",
  "Prawns, king, purchased cooked",
  "Rice, white, basmati, boiled in unsalted water",
  "Rice, brown, basmati, boiled in unsalted water",
  "Pasta, white, spaghetti, dried, boiled in unsalted water",
  "Pasta, white,  twists, fusilli, dried, boiled in unsalted water",
  "Noodles, egg, medium, dried, boiled in unsalted water",
  "Potatoes, old, baked, flesh and skin",
  "Potatoes, new and salad, boiled in unsalted water, flesh and skin",
  "Sweet potato, baked",
  "Quinoa, raw",
  "Porridge oats, unfortified",
  "Breakfast cereal, wheat biscuits, Weetabix type, fortified",
  "Bread, white, sliced",
  "Bread, wholemeal, average",
  "Bread, brown, average",
  "Tortilla, wheat, soft",
  "Milk, semi-skimmed, pasteurised, average",
  "Milk, whole, pasteurised, average",
  "Milk, skimmed, pasteurised, average",
  "Yogurt, Greek style, plain",
  "Yogurt, low fat, plain",
  "Yogurt, whole milk, plain",
  "Cheese, Cheddar, English",
  "Cheese, cottage, plain",
  "Butter, salted",
  "Oil, olive",
  "Oil, rapeseed",
  "Peanut butter, smooth",
  "Almonds, whole kernels",
  "Nuts, mixed",
  "Avocado, Hass, flesh only",
  "Bananas, flesh only",
  "Apples, eating, raw, flesh and skin",
  "Oranges, flesh only",
  "Blueberries",
  "Strawberries, raw",
  "Broccoli, green, boiled in unsalted water",
  "Spinach, baby, raw",
  "Tomatoes, standard, raw",
  "Cucumber, raw, flesh and skin",
  "Carrots, old, boiled in unsalted water",
  "Onions, raw",
  "Sweetcorn kernels, canned in water, drained",
  "Baked beans, canned in tomato sauce",
  "Beans, chick peas, canned, re-heated, drained",
  "Lentils, red, split, dried, boiled in unsalted water",
  "Houmous",
  "Potato crisps, fried in sunflower oil",
  "Chocolate, milk",
  "Honey",
]);
/** Words that mark the version someone usually means: CoFID's "average" rows and plainly cooked foods. OURS. */
export const LIFT_WORDS: Readonly<Record<string, number>> = { average: 1, grilled: 0.5, boiled: 0.4, baked: 0.3, roasted: 0.3, whole: 0.3 };
/** Words that mark a variant few people log by that name. OURS. */
export const PENALTY_WORDS: Readonly<Record<string, number>> = { weighed: 1, dried: 0.5, canned: 0.3, raw: 0.2, homemade: 0.2 };

/** Lowercase words, plurals folded ("bananas" → "banana", "eggs" → "egg"). */
export function normalise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(singular);
}

/** "potatoes" → "potato", "berries" → "berry", "eggs" → "egg"; short words and "ss" endings stay. */
export function singular(w: string): string {
  if (w.length <= 3 || !w.endsWith("s") || w.endsWith("ss")) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("oes") && w.length > 4) return w.slice(0, -2);
  return w.slice(0, -1);
}

/** True when the query words are exactly the first one to HEAD_SEGMENTS comma segments of the name, in any order. */
export function headMatch(name: string, queryWords: readonly string[]): boolean {
  const want = [...queryWords].sort().join(" ");
  const segments = name.split(",").slice(0, HEAD_SEGMENTS);
  let acc: string[] = [];
  for (const seg of segments) {
    acc = [...acc, ...normalise(seg)];
    if (acc.length > queryWords.length) return false;
    if ([...acc].sort().join(" ") === want) return true;
  }
  return false;
}

/** Score for one item, or null when a query word matches nothing. */
export function scoreName(name: string, queryWords: readonly string[]): number | null {
  const words = normalise(name);
  if (words.length === 0 || queryWords.length === 0) return null;
  let score = (headMatch(name, queryWords) ? SCORE_HEAD_MATCH : 0) + (CANONICAL_NAMES.has(name) ? SCORE_CANONICAL : 0);
  // CoFID writes "chick peas" and "sweet potato"; people type "chickpeas" and "sweetpotato".
  const joined = words.map((w, i) => (i + 1 < words.length ? w + words[i + 1] : ""));
  for (const q of queryWords) {
    let best = 0;
    let at = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === q || joined[i] === q) {
        best = SCORE_EXACT_WORD;
        at = i;
        break;
      }
      if (best === 0 && (w.startsWith(q) || joined[i].startsWith(q))) {
        best = SCORE_PREFIX_WORD;
        at = i;
      }
    }
    if (best === 0) return null;
    score += best + SCORE_POSITION / (1 + at);
  }
  if (words[0].startsWith(queryWords[0])) score += SCORE_LEADS;
  for (const w of words) {
    if (queryWords.includes(w)) continue; // a word the user typed is never a penalty or a lift
    score += LIFT_WORDS[w] ?? 0;
    score -= PENALTY_WORDS[w] ?? 0;
  }
  score -= PENALTY_PER_COMMA * (name.split(",").length - 1);
  return score;
}

/** Best matches first; stable on score by shorter name, then alphabetical. */
export function searchFoods(items: readonly FoodItem[], query: string, limit = 12): FoodItem[] {
  const q = normalise(query);
  if (q.length === 0) return [];
  const scored: Array<{ item: FoodItem; score: number }> = [];
  for (const item of items) {
    const s = scoreName(item.name, q);
    if (s != null) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name));
  // CoFID repeats a few names under different codes; one row per name.
  const seen = new Set<string>();
  const out: FoodItem[] = [];
  for (const s of scored) {
    if (seen.has(s.item.name)) continue;
    seen.add(s.item.name);
    out.push(s.item);
    if (out.length >= limit) break;
  }
  return out;
}
