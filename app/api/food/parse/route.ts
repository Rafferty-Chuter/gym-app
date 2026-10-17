/**
 * POST /api/food/parse — "Describe" in the food logger (05-design §9.4).
 * Free text ("2 eggs on toast with butter, a flat white") → items with
 * kcal and macros, as editable rows on the client. Structured output via
 * zod; the route validates its body, checks the daily cap and logs cost
 * (CLAUDE.md rule 9). The description is never logged (rule 10).
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { withPaidRoute } from "@/lib/api/guard";
import { FOOD_PARSE_MODEL } from "@/lib/ai/models";
import { FoodParseOutput } from "@/lib/physique/food/parseSchema";

export const runtime = "nodejs";

const Body = z.object({
  client_id: z.string(),
  text: z.string().trim().min(1).max(600),
});


const SYSTEM = `You turn a plain description of what someone ate into separate food items with an energy and macro estimate each.
Rules: one item per distinct food; use typical UK portions when the amount is missing and say the assumed serving in "serving" ("1 medium", "2 slices", "150 g"); round kcal to 5 and grams to whole numbers; set confidence low when the amount or preparation is unclear; keep labels short and plain ("Eggs, fried"); never add items that were not described.`;

export const POST = withPaidRoute({ schema: Body, maxBytes: 4_000, subCall: "food_parse" }, async (body, ctx) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  const message = await client.messages.parse({
    model: FOOD_PARSE_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: body.text }],
    output_config: { format: zodOutputFormat(FoodParseOutput) },
  });
  ctx.logCost({ usage: message.usage, model: FOOD_PARSE_MODEL, startedAt });
  const items = (message.parsed_output?.items ?? []).map((i) => ({
    ...i,
    kcal: Math.round(i.kcal),
    proteinG: Math.round(i.proteinG),
    fatG: Math.round(i.fatG),
    carbsG: Math.round(i.carbsG),
  }));
  return NextResponse.json({ items });
});
