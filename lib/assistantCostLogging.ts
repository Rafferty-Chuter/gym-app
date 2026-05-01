// Cost instrumentation for Anthropic SDK calls fired by the assistant surface.
// One log line per call so the per-session £cost can be summed offline.
// Server-side only; never returned to the client.

import { recordTokenUsage } from "@/lib/assistantDailyCap";

// Anthropic Sonnet 4.6 list rates in USD per million tokens.
const ANTHROPIC_SONNET_USD_PER_M = {
  input: 3,
  output: 15,
  cache_read: 0.30,
  cache_write: 3.75,
} as const;

// Conversion is logged with each line so the value can be re-derived if FX moves.
export const ASSISTANT_COST_USD_TO_GBP = 0.79;

export type AnthropicUsageLike = {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
};

/** Identifies which assistant code path produced the call so the log can be sliced. */
export type AssistantCostSubCall =
  | "chat"
  | "extract_memory"
  | "plan_single_session";

export function estimateAssistantCallCostGBP(usage: AnthropicUsageLike): number {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (inputTokens / 1_000_000) * ANTHROPIC_SONNET_USD_PER_M.input +
    (outputTokens / 1_000_000) * ANTHROPIC_SONNET_USD_PER_M.output +
    (cacheReadTokens / 1_000_000) * ANTHROPIC_SONNET_USD_PER_M.cache_read +
    (cacheWriteTokens / 1_000_000) * ANTHROPIC_SONNET_USD_PER_M.cache_write;
  return usd * ASSISTANT_COST_USD_TO_GBP;
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
  // Count uncached input + cache_write toward the cap. cache_read is cheap and
  // capped by upstream behaviour; counting it would penalise users for cache
  // hits we want to encourage.
  recordTokenUsage(clientId, inputTokens + cacheWriteTokens);
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
    cost_gbp: Number(estimateAssistantCallCostGBP(u).toFixed(6)),
    fx_usd_to_gbp: ASSISTANT_COST_USD_TO_GBP,
    latency_ms: Date.now() - startedAt,
  };
  console.log(`[assistant-cost] ${JSON.stringify(payload)}`);
}
