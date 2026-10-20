"use client";

/**
 * A copy of the app's data on the iPhone app's own disk (B11). The page's
 * localStorage lives in the web view's store, which iOS can clear; months
 * of weigh-ins and food are what the engine runs on, so the app keeps a
 * second copy in its Library folder (included in the phone's iCloud
 * backup). The copy is written when the app goes to the background and
 * restored on open when the page's storage comes back empty while the copy
 * is not. Every registered local key is copied, including ones the backup
 * file leaves out (the onboarding state, the Health link), because this is
 * the same phone, not a move to another.
 */

import { STORAGE_KEYS } from "@/lib/storage/keys";
import { isNativeApp } from "@/lib/nativeApp";

const PATH = "gymai/data.json";

type Mirror = { v: 1; savedAt: string; keys: Record<string, string> };

const LOCAL_KEYS: readonly string[] = STORAGE_KEYS.filter((k) => k.scope === "local").map((k) => k.key);
/**
 * Keys that say the page holds the user's data. Settings and ids are left
 * out: the app writes some of them on first render, so after a wipe they
 * can be back before the restore runs.
 */
const DATA_KEYS: readonly string[] = ["physique.v1.weighIns", "physique.v1.foodEntries", "physique.v1.sleepNights", "physique.v1.goal", "physique.v1.profile", "workoutHistory"];

/** An empty list or object counts as nothing: stores may write one on first read. */
function hasData(keys: Record<string, unknown>): boolean {
  return DATA_KEYS.some((k) => {
    const v = keys[k];
    return typeof v === "string" && !["", "[]", "{}", "null"].includes(v.trim());
  });
}

async function fs() {
  return import("@capacitor/filesystem");
}

/** The registered keys that hold something now. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of LOCAL_KEYS) {
      const v = window.localStorage.getItem(k);
      if (v != null) out[k] = v;
    }
  } catch {
    /* storage unavailable: nothing to copy */
  }
  return out;
}

/** Write the copy. A page without the user's data never overwrites a copy that has it. */
export async function writeNativeMirror(nowIso: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const keys = snapshot();
  if (!hasData(keys)) return false;
  const mirror: Mirror = { v: 1, savedAt: nowIso, keys };
  try {
    const { Filesystem, Directory, Encoding } = await fs();
    await Filesystem.writeFile({ path: PATH, data: JSON.stringify(mirror), directory: Directory.Library, encoding: Encoding.UTF8, recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Put the copy back when the page has lost the user's data. True when it restored (the caller reloads). */
export async function restoreNativeMirrorIfEmpty(): Promise<boolean> {
  if (!isNativeApp() || hasData(snapshot())) return false;
  try {
    const { Filesystem, Directory, Encoding } = await fs();
    const file = await Filesystem.readFile({ path: PATH, directory: Directory.Library, encoding: Encoding.UTF8 });
    const parsed = JSON.parse(typeof file.data === "string" ? file.data : "") as Partial<Mirror>;
    if (parsed?.v !== 1 || !parsed.keys || typeof parsed.keys !== "object" || !hasData(parsed.keys)) return false;
    let restored = 0;
    for (const k of LOCAL_KEYS) {
      const v = (parsed.keys as Record<string, unknown>)[k];
      if (typeof v === "string") {
        window.localStorage.setItem(k, v);
        restored++;
      }
    }
    return restored > 0;
  } catch {
    // No copy yet (first open), or unreadable: start fresh.
    return false;
  }
}

/** Remove the copy, for a future "delete all my data" action, so it isn't restored afterwards. */
export async function clearNativeMirror(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Filesystem, Directory } = await fs();
    await Filesystem.deleteFile({ path: PATH, directory: Directory.Library });
  } catch {
    /* nothing to remove */
  }
}
