/**
 * Safe JSON access to localStorage with change notifications.
 *
 * - SSR-safe: every call is a no-op (or null) without `window`.
 * - Writes return `{ok:false}` instead of swallowing quota errors, so a
 *   weigh-in can't look saved when it isn't.
 * - Same-tab changes dispatch `gym:storage` with the key; cross-tab changes
 *   arrive through the native `storage` event. `subscribeKey` bridges both.
 */

export const STORAGE_CHANGED_EVENT = "gym:storage";

export type KvResult = { ok: true } | { ok: false; error: string };

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function kvGetRaw(key: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function kvGet<T>(key: string): T | null {
  const raw = kvGetRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function notify(key: string) {
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_CHANGED_EVENT, { detail: { key } }));
  } catch {
    /* ignore */
  }
}

export function kvSetRaw(key: string, value: string): KvResult {
  if (!hasWindow()) return { ok: false, error: "no-window" };
  try {
    window.localStorage.setItem(key, value);
    notify(key);
    return { ok: true };
  } catch (e) {
    const name = e instanceof Error ? e.name : "StorageError";
    return { ok: false, error: name };
  }
}

export function kvSet<T>(key: string, value: T): KvResult {
  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    return { ok: false, error: "SerializeError" };
  }
  return kvSetRaw(key, serialised);
}

export function kvRemove(key: string): KvResult {
  if (!hasWindow()) return { ok: false, error: "no-window" };
  try {
    window.localStorage.removeItem(key);
    notify(key);
    return { ok: true };
  } catch (e) {
    const name = e instanceof Error ? e.name : "StorageError";
    return { ok: false, error: name };
  }
}

/** Subscribe to changes of one key from this tab or another. Returns unsubscribe. */
export function subscribeKey(key: string, cb: () => void): () => void {
  if (!hasWindow()) return () => {};
  function onLocal(e: Event) {
    const detail = (e as CustomEvent<{ key?: string }>).detail;
    if (!detail || detail.key === key) cb();
  }
  function onNative(e: StorageEvent) {
    if (e.key === null || e.key === key) cb();
  }
  window.addEventListener(STORAGE_CHANGED_EVENT, onLocal);
  window.addEventListener("storage", onNative);
  return () => {
    window.removeEventListener(STORAGE_CHANGED_EVENT, onLocal);
    window.removeEventListener("storage", onNative);
  };
}
