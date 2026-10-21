/**
 * Sends a crash report from the phone to `POST /api/client-error` (TR3),
 * which writes it to the Vercel logs. Best effort: a report that can't be
 * sent (offline, blocked) is dropped, and reporting never throws.
 *
 * Sentry was the other option in the ticket, for when FT6 supplies a DSN.
 * None was given, so this built-in route is the sink; a Sentry client would
 * replace `send` below and run `buildClientErrorPayload`'s scrubbing in its
 * `beforeSend`.
 */

import { APP_VERSION } from "@/lib/appVersion";
import { buildClientErrorPayload, isNoiseError, type ClientErrorPayload, type ClientErrorSource } from "@/lib/errors/clientError";

export const CLIENT_ERROR_ENDPOINT = "/api/client-error";

/** Reports one page load may send. A render loop throws the same error hundreds of times; a handful tells us enough. */
export const MAX_REPORTS_PER_PAGE = 5;

const sent = new Set<string>();

function send(payload: ClientErrorPayload): void {
  void fetch(CLIENT_ERROR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Offline or blocked: nothing to do, and nothing to tell the person.
  });
}

/**
 * Reports anything thrown, once per page and message. Returns the payload
 * it sent, or null when it sent nothing (noise, a repeat, over the cap).
 */
export function reportClientError(thrown: unknown, source: ClientErrorSource): ClientErrorPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const payload = buildClientErrorPayload(thrown, { source, route: window.location.pathname, appVersion: APP_VERSION });
    if (isNoiseError(payload)) return null;
    // The error screen and the window listener can both see one error; the source isn't part of the key.
    const key = `${payload.route}\n${payload.message}`;
    if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE) return null;
    sent.add(key);
    send(payload);
    return payload;
  } catch {
    return null;
  }
}

/** Tests only: forget what this page load has sent. */
export function resetClientErrorReportsForTest(): void {
  sent.clear();
}
