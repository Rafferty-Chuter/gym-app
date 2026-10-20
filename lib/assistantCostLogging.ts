// Cost instrumentation for Anthropic SDK calls fired by the assistant surface.
// One log line per call so the per-session £cost can be summed offline.
// Server-side only; never returned to the client.

import { recordTokenUsage } from "@/lib/assistantDailyCap";
import { ASSISTANT_MODEL, MODEL_RATES_USD_PER_M, WEB_SEARCH_USD_PER_REQUEST } from "@/lib/ai/models";

// Conversion is logged with each line so the value can be re-derived if FX moves.
export const ASSISTANT_COST_USD_TO_GBP = 0.79;

export type AnthropicUsageLike = {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

/** Identifies which assistant code path produced the call so the log can be sliced. */
export type AssistantCostSubCall =
  | "chat"
  | "extract_memory"
  | "plan_single_session"
  | "food_parse"
  | "food_lookup";

export function estimateAssistantCallCostGBP(usage: AnthropicUsageLike, model: string = ASSISTANT_MODEL): number {
  const rates = MODEL_RATES_USD_PER_M[model] ?? MODEL_RATES_USD_PER_M[ASSISTANT_MODEL];
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (inputTokens / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output +
    (cacheReadTokens / 1_000_000) * rates.cache_read +
    (cacheWriteTokens / 1_000_000) * rates.cache_write +
    (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD_PER_REQUEST;
  return usd * ASSISTANT_COST_USD_TO_GBP;
}

/**
 * Input tokens as they count towards the daily cap: weighted by the
 * model's input price against the assistant model's, so the search
 * results a cheap model reads do not use up the day, and each web search
 * counts as the input tokens its fee buys on the assistant model (F8).
 * Cache reads stay out, as before.
 */
export function capTokens(usage: AnthropicUsageLike, model: string): number {
  const base = MODEL_RATES_USD_PER_M[ASSISTANT_MODEL];
  const rates = MODEL_RATES_USD_PER_M[model] ?? base;
  const tokens = ((usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)) * (rates.input / base.input);
  const searches = (usage.server_tool_use?.web_search_requests ?? 0) * ((WEB_SEARCH_USD_PER_REQUEST / base.input) * 1_000_000);
  return Math.round(tokens + searches);
}

export function logAssistantCallCost(args: {
  usage: AnthropicUsageLike | undefined;
  model: string;
  streamed: boolean;
  subCall: AssistantCostSubCall;
  threadId: string | undefined;
  /** Stable client id (localStorage UUID) — used for daily soft-cap accounting. */
  clientId: string | undefined;
  startedAt: number;
}): void {
  const { usage, model, streamed, subCall, threadId, clientId, startedAt } = args;
  const u = usage ?? {};
  const inputTokens = u.input_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
  // Count uncached input + cache_write toward the cap, weighted by price
  // (capTokens). cache_read is cheap and capped by upstream behaviour;
  // counting it would penalise users for cache hits we want to encourage.
  recordTokenUsage(clientId, capTokens(u, model));
  const payload = {
    timestamp: new Date().toISOString(),
    sub_call: subCall,
    model,
    streamed,
    user_id: null,
    session_id: threadId ?? null,
    client_id: clientId ?? null,
    input_tokens: inputTokens,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    web_searches: u.server_tool_use?.web_search_requests ?? 0,
    cost_gbp: Number(estimateAssistantCallCostGBP(u, model).toFixed(6)),
    fx_usd_to_gbp: ASSISTANT_COST_USD_TO_GBP,
    latency_ms: Date.now() - startedAt,
  };
  console.log(`[assistant-cost] ${JSON.stringify(payload)}`);
}
