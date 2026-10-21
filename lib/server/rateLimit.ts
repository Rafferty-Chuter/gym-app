/**
 * A fixed-window request counter kept in the function's memory. Each warm
 * instance counts on its own and a cold start resets it, which is enough
 * to stop one stuck phone or a script from flooding a free route's logs;
 * it is not a quota. `now` is passed in so tests control the clock.
 */

export type RateLimiter = {
  /** Counts one request for `key`; false once the key is over its limit for this window. */
  take(key: string, now: number): boolean;
};

export function createRateLimiter({ limit, windowMs, maxKeys = 5_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now) {
      let w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        if (!w && windows.size >= maxKeys) {
          for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
          // Still full of live keys: refuse rather than grow without bound.
          if (windows.size >= maxKeys) return false;
        }
        w = { start: now, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}

/** The caller's address as Vercel's edge reports it, used only as a counter key and never logged. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}
