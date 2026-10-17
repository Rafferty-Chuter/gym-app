/**
 * Guard for every paid API route (one that calls a model):
 *
 *   1. body size cap            → 413
 *   2. JSON parse               → 400
 *   3. zod validation           → 400 (generic message, details logged server-side)
 *   4. client_id required       → 400
 *   5. daily cap (after 1–4)    → 429
 *   6. handler; any throw       → 500 with a generic body
 *
 * Health data never reaches the logs: we log the zod issue paths, not values.
 */

import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { isOverDailyCap } from "@/lib/assistantDailyCap";
import { logAssistantCallCost, type AnthropicUsageLike, type AssistantCostSubCall } from "@/lib/assistantCostLogging";

export type PaidRouteContext = {
  clientId: string;
  /** Logs usage and counts it toward the client's daily cap. */
  logCost(args: { usage: AnthropicUsageLike | undefined; model: string; startedAt: number; streamed?: boolean }): void;
};

export type PaidRouteOptions<TBody> = {
  schema: ZodType<TBody>;
  /** Upper bound on the raw request body, in bytes. */
  maxBytes: number;
  subCall: AssistantCostSubCall;
};

type Handler<TBody> = (body: TBody, ctx: PaidRouteContext) => Promise<Response>;

function generic(status: number, message: string): Response {
  return NextResponse.json({ error: message }, { status });
}

export function withPaidRoute<TBody extends { client_id?: string }>(
  options: PaidRouteOptions<TBody>,
  handler: Handler<TBody>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    let raw: string;
    try {
      raw = await request.text();
    } catch {
      return generic(400, "Invalid request.");
    }
    if (raw.length > options.maxBytes) return generic(413, "Request too large.");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return generic(400, "Invalid request.");
    }

    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      const paths = parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") || "(root)");
      console.warn(`[api-guard] ${options.subCall}: invalid body at ${paths.join(", ")}`);
      return generic(400, "Invalid request.");
    }

    const clientId = parsed.data.client_id;
    if (typeof clientId !== "string" || clientId.length < 8 || clientId.length > 128) {
      return generic(400, "Invalid request.");
    }

    if (isOverDailyCap(clientId)) {
      return generic(429, "Daily limit reached. Try again tomorrow.");
    }

    const ctx: PaidRouteContext = {
      clientId,
      logCost({ usage, model, startedAt, streamed = false }) {
        logAssistantCallCost({ usage, model, streamed, subCall: options.subCall, threadId: undefined, clientId, startedAt });
      },
    };

    try {
      return await handler(parsed.data, ctx);
    } catch (err) {
      console.error(`[api-guard] ${options.subCall} failed:`, err instanceof Error ? err.message : "unknown");
      return generic(500, "Something went wrong.");
    }
  };
}
