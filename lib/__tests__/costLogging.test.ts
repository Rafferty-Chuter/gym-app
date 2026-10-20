import { describe, expect, it } from "vitest";
import { ASSISTANT_COST_USD_TO_GBP, capTokens, estimateAssistantCallCostGBP } from "@/lib/assistantCostLogging";
import { ASSISTANT_MODEL, FOOD_LOOKUP_MODEL, FOOD_PARSE_MODEL, MODEL_RATES_USD_PER_M, WEB_SEARCH_USD_PER_REQUEST } from "@/lib/ai/models";

describe("daily cap weighted by price (F8)", () => {
  it("counts the assistant model's input as it always did", () => {
    expect(capTokens({ input_tokens: 1000, cache_creation_input_tokens: 200, cache_read_input_tokens: 5000 }, ASSISTANT_MODEL)).toBe(1200);
  });

  it("counts a cheaper model's long search results at their price, and each search at its fee", () => {
    const lookup = capTokens({ input_tokens: 19_000, server_tool_use: { web_search_requests: 1 } }, FOOD_LOOKUP_MODEL);
    const rate = MODEL_RATES_USD_PER_M[FOOD_LOOKUP_MODEL].input / MODEL_RATES_USD_PER_M[ASSISTANT_MODEL].input;
    const perSearch = (WEB_SEARCH_USD_PER_REQUEST / MODEL_RATES_USD_PER_M[ASSISTANT_MODEL].input) * 1_000_000;
    expect(lookup).toBe(Math.round(19_000 * rate + perSearch));
    // A lookup costs far less of the day than its raw token count.
    expect(lookup).toBeLessThan(19_000 / 4);
    expect(capTokens({ input_tokens: 1500 }, FOOD_PARSE_MODEL)).toBeLessThanOrEqual(1500);
  });

  it("adds the search fee to the logged cost", () => {
    const without = estimateAssistantCallCostGBP({ input_tokens: 10_000, output_tokens: 300 }, FOOD_LOOKUP_MODEL);
    const withTwo = estimateAssistantCallCostGBP({ input_tokens: 10_000, output_tokens: 300, server_tool_use: { web_search_requests: 2 } }, FOOD_LOOKUP_MODEL);
    expect(withTwo - without).toBeCloseTo(2 * WEB_SEARCH_USD_PER_REQUEST * ASSISTANT_COST_USD_TO_GBP, 8);
  });
});
