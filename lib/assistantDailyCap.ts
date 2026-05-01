// Per-client daily token cap with graceful fallback.
//
// Pragmatic v1: in-memory counter, single-instance. Survives within one
// Next.js process; resets on cold start. For tester-scale (5 users) this is
// good enough. For a multi-instance prod deploy, swap the in-memory map for
// a shared store (Vercel KV / Redis) — the API of this module is designed
// to make that swap mechanical.
//
// Counter keys on `client_id` shipped from the browser (localStorage UUID),
// not user_id (no auth surface yet). Track input_tokens only — output is a
// downstream effect of input being permitted, so capping input alone is
// sufficient to bound cost in the runaway-tab / pathological-user case
// the brief calls out. The cap is a backstop, not a billing tier.

export const DAILY_INPUT_TOKEN_CAP = 100_000;

type CounterEntry = {
  /** UTC date string (YYYY-MM-DD) the counter is currently tracking. */
  utcDate: string;
  inputTokens: number;
};

const counters = new Map<string, CounterEntry>();

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reset the counter for clientId if the UTC day has rolled over since last write. */
function rollIfNewDay(clientId: string): CounterEntry {
  const today = utcDateKey();
  const existing = counters.get(clientId);
  if (!existing || existing.utcDate !== today) {
    const fresh: CounterEntry = { utcDate: today, inputTokens: 0 };
    counters.set(clientId, fresh);
    return fresh;
  }
  return existing;
}

/** Check whether this client has exceeded the daily input-token cap. */
export function isOverDailyCap(clientId: string | undefined): boolean {
  if (!clientId) return false; // no client id = anonymous, can't cap
  const entry = rollIfNewDay(clientId);
  return entry.inputTokens >= DAILY_INPUT_TOKEN_CAP;
}

/** Increment the daily counter for this client. Called from the cost logger. */
export function recordTokenUsage(
  clientId: string | undefined,
  inputTokens: number
): void {
  if (!clientId) return;
  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return;
  const entry = rollIfNewDay(clientId);
  entry.inputTokens += inputTokens;
}

/** Snapshot of a client's daily counter. For diagnostic logging. */
export function getDailyUsage(clientId: string | undefined): {
  utcDate: string;
  inputTokens: number;
  cap: number;
  remaining: number;
} | null {
  if (!clientId) return null;
  const entry = rollIfNewDay(clientId);
  return {
    utcDate: entry.utcDate,
    inputTokens: entry.inputTokens,
    cap: DAILY_INPUT_TOKEN_CAP,
    remaining: Math.max(0, DAILY_INPUT_TOKEN_CAP - entry.inputTokens),
  };
}
