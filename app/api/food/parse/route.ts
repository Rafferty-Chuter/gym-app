/**
 * POST /api/food/parse — "Describe" in the food logger (05-design §9.4).
 * Free text → either food items ("2 eggs on toast", "katsu curry from
 * Wagamama") or, for a recipe, a list of ingredients in grams. The model
 * reads the text; the server resolves each food against the UK base list
 * before anything is summed (lib/food/recipe.ts), so the numbers are
 * CoFID's wherever a food matched and the model's estimate only where
 * nothing did. A dish from a chain that publishes its nutrition is then
 * checked against those figures, and a branded packaged product against
 * its label, with one web search each in parallel (F8, IN12, at most
 * MAX_PUBLISHED_DISHES a request, on the cheaper lookup model); a figure
 * found and passing lib/food/published.ts replaces the estimate. The
 * route validates its body, checks the daily cap and logs cost (CLAUDE.md
 * rule 9). The text is never logged (rule 10); the lookup sends only the
 * dish names.
 *
 * Every failure comes back as `{ error: FoodParseError }` with its own
 * status, so the logger can say what happened instead of "try again".
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { withPaidRoute } from "@/lib/api/guard";
import { FOOD_LOOKUP_MODEL, FOOD_PARSE_MODEL } from "@/lib/ai/models";
import { loadCofid } from "@/lib/food/cofid";
import { MAX_DESCRIBE_CHARS, sanitiseParse } from "@/lib/food/describe";
import { applyPublished, dishesToCheck, publishedLines } from "@/lib/food/published";
import { resolveIngredient, resolveItem, type Recipe } from "@/lib/food/recipe";
import { lookupEach } from "@/lib/server/foodLookup";
import { FoodParseOutput, type FoodParseError, type FoodParseResponse } from "@/lib/physique/food/parseSchema";

export const runtime = "nodejs";
/** A long recipe on a slower day runs past Vercel's 10 s default. */
export const maxDuration = 60;

/** Room for 40 ingredients with their per-100 g estimates and some thinking. Sized so a long recipe never stops half way. OURS. */
const MAX_OUTPUT_TOKENS = 16_000;
/** Under maxDuration, so a slow reply ends as a clear "took too long" rather than the platform cutting the function off. OURS. */
const MODEL_TIMEOUT_MS = 50_000;
/** The published-figures check gets at most this long; a search usually takes 5 to 10 s (F8). OURS. */
const LOOKUP_TIMEOUT_MS = 25_000;
/** The whole request ends by here, under maxDuration; the check is skipped when less than MIN_LOOKUP_MS is left (F8). OURS. */
const LOOKUP_DEADLINE_MS = 55_000;
const MIN_LOOKUP_MS = 8_000;

const Body = z.object({
  client_id: z.string(),
  text: z.string().trim().min(1).max(MAX_DESCRIBE_CHARS),
  /** "recipe" when the text reads as one or the user asked; "meal" to read it as separate foods; "auto" lets the model decide. */
  mode: z.enum(["auto", "recipe", "meal"]).default("auto"),
});

const COMMON = `Name the serving as the food is normally had or sold whole: "a pizza" or "pepperoni pizza" is a whole pizza (say its size, "1 whole 12-inch pizza"), "a burger" one burger, "chips" one regular portion; a slice or part only when the text says so. For each food give "portions": two to four other common sizes of the same food, each a short label and its size as a multiple of your serving ("1 slice" 0.125 and "Half" 0.5 of a whole 12-inch pizza, "Large" 1.4 of regular chips); leave it empty for foods simply counted or weighed (eggs, toast, rice). Set "chain" true only for a dish from a named restaurant, café or takeaway chain that publishes per-dish nutrition (Wagamama, Nando's, McDonald's, Greggs, Pret, Domino's), false otherwise.
A packaged product from a named brand or supermarket range, sold with a nutrition label (SuperNutrio milk, Fage 0% yoghurt, M&S seeded sourdough, Fuel granola, a Grenade bar), is its own item with "packaged" true: its label names the brand and the exact product as sold, variety included ("SuperNutrio high protein whole milk"), and "grams" is the amount of that product alone (millilitres for a milk or drink). Split it out of what it went into: "2 lattes with 220 ml SuperNutrio whole milk each" is one item of 440 ml of that milk and one of "Espresso, 2 shots". "packaged" is false for everything else, unbranded foods and chain dishes included.
For every food and ingredient give a "lookup": one to three plain words naming the generic food for a UK composition database, with its state as weighed ("eggs fried", "bread white toasted", "beef mince raw", "rice white basmati raw", "tomatoes canned", "cheddar"), or an empty string when nothing generic fits (a branded bar, a whole restaurant dish). Give "grams" as the weight of the food as eaten or used (convert jars, tins, cups, spoons, slices and pieces: 1 jar of passata 500 g, 1 tin of tomatoes 400 g, 1 egg 55 g, 1 slice of bread 36 g, 1 tbsp oil 14 g, 1 cup of rice 185 g), or 0 when you cannot tell. Give your own energy, macro and fibre estimate as well (fibre as AOAC dietary fibre in grams, the way UK labels give it; 0 for meat, fish, eggs, dairy and oils), and sodium in mg (salt × 400), total sugars, saturated fat and alcohol in grams (alcohol as grams of ethanol: a pint of 4% beer is about 18 g, a 175 ml glass of 12% wine about 17 g; 0 for anything without alcohol), or null for any you cannot judge; these are used only where the database has no value.
Rules: round kcal to 5 and grams to whole numbers; keep labels and names short and plain, under 60 characters ("Eggs, fried"); never add foods that were not described; ignore cooking instructions, stories and comments except for the amounts they reveal.`;

const SYSTEM_AUTO = `You read a plain description of food into structured data. Decide which of three kinds it is.
"meal": what someone ate ("2 eggs on toast with butter, a flat white"). One item per distinct food; use typical UK portions when the amount is missing and say the assumed serving in "serving" ("1 medium", "2 slices", "150 g"); confidence low when the amount or preparation is unclear.
"restaurant": an order from a named restaurant, chain, takeaway or venue such as a stadium, cinema or café ("chicken katsu curry from Wagamama", "a Big Mac meal", "pepperoni pizza at the stadium"). One item per dish with the place in the label ("Chicken katsu curry, Wagamama"). Give the weight served in "grams", estimated when not published. A chain dish: use its published nutrition when you know it and leave lookup empty (its figures are checked). Anywhere else: the generic lookup when one fits the whole dish, naming what is on or in it ("pizza cheese" for any cheese-topped pizza, "chips", "burger beef", "cod fried in batter"), so the database's figures apply to your weight, otherwise empty. Confidence medium, or low when the dish or its size is unclear.
"recipe": ingredients that make one or more portions ("500 g mince, a jar of passata, 300 g pasta, makes 4", or a pasted recipe with a method). Fill "recipe": a short name, how many servings it makes as a whole number (the lower number of a range; 1 when not said), and one ingredient per line. Leave "items" empty for a recipe, and "recipe.ingredients" empty otherwise.
${COMMON}`;

const SYSTEM_RECIPE = `You read a recipe into structured data. The text is a recipe, however it is written: an ingredient list, a pasted recipe page with a method, or a sentence. Set "kind" to "recipe" and leave "items" empty. Fill "recipe": a short name, how many servings it makes as a whole number (the lower number of a range, so "serves 4 to 6" is 4; 1 when not said), and one ingredient per line with grams of the ingredient as used. Include oils, sauces and toppings; skip water, salt and pepper. An ingredient listed twice (for the sauce and the topping) is one line with the total.
${COMMON}`;

const SYSTEM_MEAL = `You read a description of what someone ate into structured data, one item per distinct food, even when it looks like a list of ingredients. Set "kind" to "meal" and leave "recipe.ingredients" empty. Use typical UK portions when the amount is missing and say the assumed serving in "serving"; confidence low when the amount or preparation is unclear.
${COMMON}`;

const SYSTEM = { auto: SYSTEM_AUTO, recipe: SYSTEM_RECIPE, meal: SYSTEM_MEAL } as const;

function fail(error: FoodParseError, status: number): Response {
  return NextResponse.json({ error }, { status });
}

export const POST = withPaidRoute({ schema: Body, maxBytes: 40_000, subCall: "food_parse" }, async (body, ctx) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return fail("not_configured", 503);
  const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
  const startedAt = Date.now();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: FOOD_PARSE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM[body.mode],
      messages: [{ role: "user", content: body.text }],
      // Reading food is extraction, not reasoning: low effort keeps a long recipe well inside the time limit.
      output_config: { effort: "low", format: zodOutputFormat(FoodParseOutput) },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return fail("timeout", 504);
    if (err instanceof Anthropic.APIError) {
      console.warn(`[food-parse] upstream ${err.status ?? "connection"} error`);
      return fail("busy", 502);
    }
    throw err;
  }
  ctx.logCost({ usage: message.usage, model: FOOD_PARSE_MODEL, startedAt });

  if (message.stop_reason === "refusal") return fail("refused", 422);
  if (message.stop_reason === "max_tokens") return fail("too_long", 422);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.warn("[food-parse] reply was not JSON");
    return fail("unreadable", 502);
  }
  const parsed = FoodParseOutput.safeParse(json);
  if (!parsed.success) {
    console.warn(`[food-parse] reply off schema at ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") || "(root)").join(", ")}`);
    return fail("unreadable", 502);
  }

  const clean = sanitiseParse(parsed.data, body.mode);
  const base = await loadCofid();
  const recipe: Recipe | null = clean.recipe ? { name: clean.recipe.name, servings: clean.recipe.servings, ingredients: clean.recipe.ingredients.map((i) => resolveIngredient(base, i)) } : null;
  let items = clean.items.map((i) => resolveItem(base, i));

  // Chain dishes and packaged products: their published figures or label, when found in time, replace the estimates (F8, IN12).
  const check = dishesToCheck(items);
  const left = LOOKUP_DEADLINE_MS - (Date.now() - startedAt);
  if (check.length > 0 && left >= MIN_LOOKUP_MS) {
    const lookupStartedAt = Date.now();
    const found = await lookupEach(client, publishedLines(items, check), Math.min(LOOKUP_TIMEOUT_MS, left));
    for (const usage of found.usages) ctx.logCost({ usage, model: FOOD_LOOKUP_MODEL, startedAt: lookupStartedAt, subCall: "food_lookup" });
    items = applyPublished(items, check, found.out);
  }

  const response: FoodParseResponse = { kind: clean.kind, items, recipe };
  return NextResponse.json(response);
});
