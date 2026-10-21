/**
 * POST /api/client-error — a crash report from the phone (TR3), written to
 * the Vercel logs as one `[client-error]` line. Free (no model call), so no
 * cost log or daily cap; instead a size cap, a per-address rate limit and
 * a strict body. The message and stack are scrubbed again here, so even a
 * client that skipped `lib/errors/clientError.ts` can't put a weight, a
 * food or a date in the logs (CLAUDE.md rule 10). The address is only a
 * counter key and is never logged.
 */

import { scrubMessage, scrubRoute, scrubStack } from "@/lib/errors/clientError";
import { clientErrorSchema } from "@/lib/server/clientErrorSchema";
import { clientAddress, createRateLimiter } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

/** A full report is under 9 kB (a 300-character message and 25 frames of at most 300); more is not a report. */
const MAX_BYTES = 12_000;

/** Per address: a crash loop on one phone sends at most this many in ten minutes. */
const perAddress = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });
/** Per instance, across addresses: keeps the logs readable if something breaks for everyone at once. */
const overall = createRateLimiter({ limit: 300, windowMs: 10 * 60_000, maxKeys: 1 });

function status(code: number): Response {
  return new Response(null, { status: code });
}

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();
  if (!perAddress.take(clientAddress(request), now) || !overall.take("all", now)) return status(429);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return status(413);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return status(400);
  }
  if (raw.length > MAX_BYTES) return status(413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return status(400);
  }
  const parsed = clientErrorSchema.safeParse(json);
  if (!parsed.success) return status(400);
  const r = parsed.data;
  const entry = {
    source: r.source,
    route: scrubRoute(r.route),
    appVersion: r.appVersion,
    message: scrubMessage(r.message),
    stack: scrubStack(r.stack),
  };
  console.error(`[client-error] ${JSON.stringify(entry)}`);
  return status(204);
}
