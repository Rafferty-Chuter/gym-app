/**
 * The only place model ids live. Change a model here, nowhere else.
 *
 * ASSISTANT_MODEL stays on Sonnet 4.6 until ticket F5 migrates it with the
 * `claude-api` skill's migrate flow (prefill removal, thinking params,
 * fallbacks). New endpoints default to Opus 5.5.
 */

export const ASSISTANT_MODEL = "claude-sonnet-4-6";
export const EXTRACT_MEMORY_MODEL = ASSISTANT_MODEL;
export const PLANNER_MODEL = ASSISTANT_MODEL;
export const EVAL_SCORER_MODEL = ASSISTANT_MODEL;

/** Food description → items, orders and recipes (A1, M4b). Sonnet 5.5 at the founder's request (2026-10-17): fast enough for a pasted recipe, intelligent enough to read one. */
export const FOOD_PARSE_MODEL = "claude-sonnet-5-5";

/** USD per million tokens, used only for cost logging. */
export const MODEL_RATES_USD_PER_M: Record<
  string,
  { input: number; output: number; cache_read: number; cache_write: number }
> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
};
