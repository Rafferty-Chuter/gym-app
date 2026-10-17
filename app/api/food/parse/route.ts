/**
 * POST /api/food/parse — "Describe" in the food logger (05-design §9.4).
 * Free text → either food items with an energy and macro estimate each
 * ("2 eggs on toast", "katsu curry from Wagamama") or, for a recipe, a
 * list of ingredients in grams that the server resolves against the UK
 * base list before anything is summed (lib/food/recipe.ts). Structured
 * output via zod; the route validates its body, checks the daily cap and
 * logs cost (CLAUDE.md rule 9). The text is never logged (rule 10).
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { withPaidRoute } from "@/lib/api/guard";
import { FOOD_PARSE_MODEL } from "@/lib/ai/models";
import { loadCofid } from "@/lib/food/cofid";
import { resolveIngredient, type Recipe } from "@/lib/food/recipe";
import { FoodParseOutput, type FoodParseResponse } from "@/lib/physique/food/parseSchema";

export const runtime = "nodejs";

/** A pasted recipe runs longer than a meal; this still fits one screen of text. OURS. */
export const MAX_TEXT_CHARS = 2000;

const Body = z.object({
  client_id: z.string(),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
});

const SYSTEM = `You read a plain description of food into structured data. Decide which of three kinds it is.
"meal": what someone ate ("2 eggs on toast with butter, a flat white"). One item per distinct food with an energy and macro estimate; use typical UK portions when the amount is missing and say the assumed serving in "serving" ("1 medium", "2 slices", "150 g"); confidence low when the amount or preparation is unclear.
"restaurant": an order from a named restaurant, chain or takeaway ("chicken katsu curry from Wagamama", "a Big Mac meal"). One item per dish with the place in the label ("Chicken katsu curry, Wagamama"); use the chain's published nutrition when you know it, otherwise a typical portion for that kind of place; confidence medium, or low when the dish or its size is unclear.
"recipe": ingredients that make one or more portions ("500 g mince, a jar of passata, 300 g pasta, makes 4"). Fill "recipe": a short name, how many servings it makes (1 when not said), and one ingredient per line with grams of the ingredient as used (convert jars, tins, cups, spoons and pieces to grams; 1 jar of passata is 500 g, 1 tin of tomatoes 400 g, 1 egg 55 g), a "lookup" of one to three plain words naming the generic food for a UK composition database ("beef mince raw", "passata", "pasta dried", "cheddar"), and your own per-100 g estimate as the fallback. Leave "items" empty for a recipe, and "recipe.ingredients" empty otherwise.
Rules: round kcal to 5 and grams to whole numbers; keep labels and names short and plain ("Eggs, fried"); never add foods that were not described.`;

export const POST = withPaidRoute({ schema: Body, maxBytes: 8_000, subCall: "food_parse" }, async (body, ctx) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  const message = await client.messages.parse({
    model: FOOD_PARSE_MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: "user", content: body.text }],
    output_config: { format: zodOutputFormat(FoodParseOutput) },
  });
  ctx.logCost({ usage: message.usage, model: FOOD_PARSE_MODEL, startedAt });
  const out = message.parsed_output;
  const kind = out?.kind ?? "meal";
  let recipe: Recipe | null = null;
  if (kind === "recipe" && out && out.recipe.ingredients.length > 0) {
    const base = await loadCofid();
    recipe = {
      name: out.recipe.name.trim() || "Recipe",
      servings: out.recipe.servings,
      ingredients: out.recipe.ingredients.map((i) => resolveIngredient(base, i)),
    };
  }
  const items = recipe
    ? []
    : (out?.items ?? []).map((i) => ({
        ...i,
        kcal: Math.round(i.kcal),
        proteinG: Math.round(i.proteinG),
        fatG: Math.round(i.fatG),
        carbsG: Math.round(i.carbsG),
      }));
  const response: FoodParseResponse = { kind, items, recipe };
  return NextResponse.json(response);
});
