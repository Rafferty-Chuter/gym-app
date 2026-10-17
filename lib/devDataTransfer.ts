/**
 * Snapshot of known app localStorage keys for export/import (Profile → Data tools).
 * Keep in sync with keys used across the app.
 */
import { backupKeys } from "@/lib/storage/keys";
import { kvRemove, kvSetRaw } from "@/lib/storage/kv";

/** Derived from the storage registry (lib/storage/keys.ts): every local key flagged includeInBackup. */
export const APP_LOCAL_STORAGE_KEYS: readonly string[] = backupKeys();

export type AppLocalStorageKey = string;

export type DevDataExportV1 = {
  v: 1;
  exportedAt: string;
  /** Raw string values as stored in localStorage; null means key was absent. */
  keys: Record<string, string | null>;
};

const ALLOWED = new Set<string>(APP_LOCAL_STORAGE_KEYS);

export function isDevDataTransferExport(value: unknown): value is DevDataExportV1 {
  if (value == null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return o.v === 1 && typeof o.exportedAt === "string" && o.keys != null && typeof o.keys === "object";
}

/** Trigger a browser download of the snapshot as a .json file. */
export function downloadAppLocalStorageSnapshot(): void {
  const json = exportAppLocalStorageSnapshot();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gym-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build JSON string for copy/paste export. */
export function exportAppLocalStorageSnapshot(): string {
  const keys: Record<string, string | null> = {};
  for (const k of APP_LOCAL_STORAGE_KEYS) {
    keys[k] = localStorage.getItem(k);
  }
  const payload: DevDataExportV1 = {
    v: 1,
    exportedAt: new Date().toISOString(),
    keys,
  };
  return JSON.stringify(payload, null, 2);
}

export type ImportResult = { ok: true; restored: string[] } | { ok: false; error: string };

/**
 * Restore keys from exported JSON. Only keys in APP_LOCAL_STORAGE_KEYS are written.
 * Dispatches `workoutHistoryChanged` so workout context reloads.
 */
export function importAppLocalStorageSnapshot(jsonText: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  let keysObj: Record<string, unknown>;
  if (isDevDataTransferExport(parsed)) {
    keysObj = parsed.keys as Record<string, unknown>;
  } else if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    keysObj = parsed as Record<string, unknown>;
  } else {
    return { ok: false, error: "Expected an object with a keys map or v1 export shape." };
  }

  const restored: string[] = [];
  for (const key of APP_LOCAL_STORAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(keysObj, key)) continue;
    const v = keysObj[key];
    if (v === null || v === undefined) {
      kvRemove(key);
      restored.push(`${key} (removed)`);
    } else if (typeof v === "string") {
      const result = kvSetRaw(key, v);
      if (!result.ok) return { ok: false, error: `Could not write "${key}": ${result.error}.` };
      restored.push(key);
    } else {
      return { ok: false, error: `Key "${key}" must be a string or null, got ${typeof v}.` };
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("workoutHistoryChanged"));
  }

  return { ok: true, restored };
}

/** Keys present in pasted JSON but not in our allowlist (ignored on import). */
export function listUnknownKeysInImport(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    let raw: Record<string, unknown>;
    if (isDevDataTransferExport(parsed)) {
      raw = parsed.keys as Record<string, unknown>;
    } else if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    } else {
      return [];
    }
    return Object.keys(raw).filter((k) => !ALLOWED.has(k));
  } catch {
    return [];
  }
}
