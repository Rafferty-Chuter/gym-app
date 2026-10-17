/**
 * POST /api/food/parse — "Describe" in the food logger (05-design §9.4).
 * Free text → either food items ("2 eggs on toast", "katsu curry from
 * Wagamama") or, for a recipe, a list of ingredients in grams. The model
 * reads the text; the server resolves each food against the UK base list
 * before anything is summed (lib/food/recipe.ts), so the numbers are
 * CoFID's wherever a food matched and the model's estimate only where
 * nothing did. Structured output via zod; the route validates its body,
 * checks the daily cap and logs cost (CLAUDE.md rule 9). The text is
 * never logged (rule 10).
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { withPaidRoute } from "@/lib/api/guard";
import { FOOD_PARSE_MODEL } from "@/lib/ai/models";
import { loadCofid } from "@/lib/food/cofid";
import { resolveIngredient, resolveItem, type Recipe } from "@/lib/food/recipe";
import { FoodParseOutput, type FoodParseResponse } from "@/lib/physique/food/parseSchema";

export const runtime = "nodejs";
/** A long recipe on a slower day runs past Vercel's 10 s default. */
export const maxDuration = 60;

/** A pasted recipe page with its method is a few thousand characters; the model ignores the method. OURS. */
export const MAX_TEXT_CHARS = 6000;

const Body = z.object({
  client_id: z.string(),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
  /** "recipe" when the user chose the Recipe option; "auto" otherwise. */
  mode: z.enum(["auto", "recipe"]).default("auto"),
});

const COMMON = `For every food and ingredient give a "lookup": one to three plain words naming the generic food for a UK composition database, as it would be eaten ("eggs fried", "bread white toasted", "beef mince raw", "passata", "cheddar"), or an empty string when nothing generic fits (a branded bar, a whole restaurant dish). Give "grams" as the weight of the food as eaten (convert jars, tins, cups, spoons, slices and pieces: 1 jar of passata 500 g, 1 tin of tomatoes 400 g, 1 egg 55 g, 1 slice of bread 36 g, 1 tbsp oil 14 g), or 0 when you cannot tell. Give your own energy and macro estimate as well; it is used only where the database has no match.
Rules: round kcal to 5 and grams to whole numbers; keep labels and names short and plain ("Eggs, fried"); never add foods that were not described; ignore cooking instructions except for the amounts they reveal.`;

const SYSTEM_AUTO = `You read a plain description of food into structured data. Decide which of three kinds it is.
"meal": what someone ate ("2 eggs on toast with butter, a flat white"). One item per distinct food; use typical UK portions when the amount is missing and say the assumed serving in "serving" ("1 medium", "2 slices", "150 g"); confidence low when the amount or preparation is unclear.
"restaurant": an order from a named restaurant, chain or takeaway ("chicken katsu curry from Wagamama", "a Big Mac meal"). One item per dish with the place in the label ("Chicken katsu curry, Wagamama"); use the chain's published nutrition when you know it, otherwise a typical portion for that kind of place; confidence medium, or low when the dish or its size is unclear; lookup empty.
"recipe": ingredients that make one or more portions ("500 g mince, a jar of passata, 300 g pasta, makes 4", or a pasted recipe with a method). Fill "recipe": a short name, how many servings it makes (1 when not said), and one ingredient per line. Leave "items" empty for a recipe, and "recipe.ingredients" empty otherwise.
${COMMON}`;

const SYSTEM_RECIPE = `You read a recipe into structured data. The text is a recipe, however it is written: an ingredient list, a pasted recipe page with a method, or a sentence. Set "kind" to "recipe" and leave "items" empty. Fill "recipe": a short name, how many servings it makes (1 when not said), and one ingredient per line with grams of the ingredient as used. Include oils, sauces and toppings; skip water, salt and pepper.
${COMMON}`;

export const POST = withPaidRoute({ schema: Body, maxBytes: 24_000, subCall: "food_parse" }, async (body, ctx) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  const message = await client.messages.parse({
    model: FOOD_PARSE_MODEL,
    max_tokens: 8192,
    system: body.mode === "recipe" ? SYSTEM_RECIPE : SYSTEM_AUTO,
    messages: [{ role: "user", content: body.text }],
    output_config: { format: zodOutputFormat(FoodParseOutput) },
  });
  ctx.logCost({ usage: message.usage, model: FOOD_PARSE_MODEL, startedAt });
  const out = message.parsed_output;
  const kind = body.mode === "recipe" ? "recipe" : (out?.kind ?? "meal");
  const base = await loadCofid();
  let recipe: Recipe | null = null;
  if (kind === "recipe" && out && out.recipe.ingredients.length > 0) {
    recipe = {
      name: out.recipe.name.trim() || "Recipe",
      servings: out.recipe.servings,
      ingredients: out.recipe.ingredients.map((i) => resolveIngredient(base, i)),
    };
  }
  const items = recipe ? [] : (out?.items ?? []).map((i) => resolveItem(base, i));
  const response: FoodParseResponse = { kind, items, recipe };
  return NextResponse.json(response);
});
