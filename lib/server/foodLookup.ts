/**
 * The web search for a chain's published nutrition (F8). One request to
 * FOOD_LOOKUP_MODEL with the web search tool, one search per dish, and a
 * JSON reply checked against PublishedOutput. Any failure (timeout, an
 * error, a paused or cut-off reply, a reply off schema) returns no
 * figures, so Describe keeps its estimates and never fails because of it.
 * Only the dish names are sent, never anything else the user wrote.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FOOD_LOOKUP_MODEL } from "@/lib/ai/models";
import { PublishedOutput, type PublishedOutputData } from "@/lib/food/published";

/** Room for three dishes' figures and sources. OURS. */
const MAX_OUTPUT_TOKENS = 2_000;

const SYSTEM = `For each numbered dish, find the nutrition the chain or brand publishes for one serving of that dish as described, on its UK menu: the UK website, menu or nutrition PDF first; a nutrition site quoting the chain's UK figures only when the chain's own page cannot be found. Never use another country's menu. Search once per dish.
Give kcal, protein, fat and carbs in grams, and fibre, salt, total sugars and saturated fat in grams or null when not published, for the serving as sold, and in "source" only the full web address (https://...) of the page you read them from.
When you cannot find figures for that dish and size, set found to false, the numbers to 0 and source to "". Never estimate or work a figure out yourself.`;

export type LookupResult = { out: PublishedOutputData | null; usage: Anthropic.Usage | undefined };

/** Published figures for the numbered dishes in `request`, or none within `timeoutMs`. */
export async function lookupPublished(client: Anthropic, request: string, dishes: number, timeoutMs: number): Promise<LookupResult> {
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model: FOOD_LOOKUP_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: request }],
        // One spare: the search tool's own filtering step can spend one.
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: dishes + 1 }],
        output_config: { effort: "low", format: zodOutputFormat(PublishedOutput) },
      },
      { timeout: timeoutMs, maxRetries: 0 },
    );
  } catch (err) {
    if (!(err instanceof Anthropic.APIError)) throw err;
    console.warn(`[food-lookup] upstream ${err.status ?? "connection"} error`);
    return { out: null, usage: undefined };
  }
  if (message.stop_reason !== "end_turn") return { out: null, usage: message.usage };
  // Search results and thinking come first; the JSON is the last text block.
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).at(-1) ?? "";
  try {
    const parsed = PublishedOutput.safeParse(JSON.parse(text));
    return { out: parsed.success ? parsed.data : null, usage: message.usage };
  } catch {
    return { out: null, usage: message.usage };
  }
}
