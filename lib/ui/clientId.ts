/**
 * Stable per-browser identifier shipped with every paid API request as
 * `client_id`, for daily soft-cap accounting. Same key as the assistant
 * page uses, so one browser has one cap.
 */
export function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "assistantClientId";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return "fallback";
  }
}
