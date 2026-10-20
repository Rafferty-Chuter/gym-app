"use client";

/**
 * Apple Health on the iPhone app (B11): read straight from HealthKit on
 * the phone, so Health Auto Export, its subscription, its token and its
 * split nights (S12) are not needed. Each sync re-reads the last two
 * weeks (sixty days the first time) and merges through the same
 * `mergeSamples` as the Health Auto Export path, so nights, weigh-ins and
 * steps land as `source: "healthkit"` with the same ids either way.
 *
 * Only runs inside the app: the native shell injects `window.Capacitor`.
 * The plugin is imported on first use, so the web app never loads it.
 */

import { useEffect } from "react";
import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { addDays, clientNow } from "@/lib/dates";
import { nativeSamples, toMergeRows, type NativeRead } from "@/lib/health/native";
import { mergeSamples } from "@/lib/physique/io/healthLink";
import { isNativeApp } from "@/lib/nativeApp";

export type NativeHealth = {
  connectedAt: string;
  lastSyncAt?: string;
  lastError?: string | null;
  /** What the last sync merged. */
  last?: { nights: number; weighIns: number };
};

export const nativeHealthStore = createSingleton<NativeHealth>("physique.v1.nativeHealth");

/** Days read on the first sync. OURS: the same 60-day backfill the Health Auto Export steps ask for. */
export const FIRST_SYNC_DAYS = 60;
/** Days re-read on every later sync. OURS: late watch syncs and edits in Health land within two weeks. */
export const SYNC_DAYS = 14;
/** Sync at most this often on open or return to the app. OURS: HealthKit reads are local and quick. */
export const SYNC_INTERVAL_MS = 2 * 60 * 1000;
/** Most samples read per kind in one sync. OURS: a watch writes about 30 sleep segments and a dozen HRV readings a night. */
const MAX_SAMPLES = 20_000;

const READ_TYPES = ["sleep", "weight", "bodyFat", "heartRateVariability", "restingHeartRate", "steps"] as const;

export type SyncResult = { ok: true; nights: number; weighIns: number } | { ok: false; error: "not_app" | "unavailable" | "not_connected" | "read_failed" };

export function useNativeHealth(): NativeHealth | null {
  return useSingleton(nativeHealthStore);
}

/**
 * The plugin's module. Never return the plugin object itself from an async
 * function: it is a proxy that answers every property, so a promise
 * resolving to it calls its `then` as a native method and never settles.
 */
function pluginModule() {
  return import("@capgo/capacitor-health");
}

/** Ask for read access (the system sheet) and run the first sync. */
export async function connectNativeHealth(nowIso: string): Promise<SyncResult> {
  if (!isNativeApp()) return { ok: false, error: "not_app" };
  try {
    const { Health } = await pluginModule();
    if (!(await Health.isAvailable()).available) return { ok: false, error: "unavailable" };
    await Health.requestAuthorization({ read: [...READ_TYPES], write: [] });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const existing = await nativeHealthStore.get();
  await nativeHealthStore.set({ connectedAt: existing?.connectedAt ?? nowIso, lastSyncAt: existing?.lastSyncAt });
  return syncNativeHealth(nowIso, true);
}

export async function disconnectNativeHealth(): Promise<void> {
  await nativeHealthStore.clear();
}

let inflight: Promise<SyncResult> | null = null;

/**
 * Read the window from HealthKit and merge it. HealthKit never says which
 * kinds were refused (privacy), so a refused kind simply reads empty.
 */
export async function syncNativeHealth(nowIso: string, force = false): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = (async (): Promise<SyncResult> => {
    if (!isNativeApp()) return { ok: false, error: "not_app" };
    const state = await nativeHealthStore.get();
    if (!state) return { ok: false, error: "not_connected" };
    if (!force && state.lastSyncAt && Date.parse(nowIso) - Date.parse(state.lastSyncAt) < SYNC_INTERVAL_MS) return { ok: true, nights: 0, weighIns: 0 };
    const days = state.lastSyncAt ? SYNC_DAYS : FIRST_SYNC_DAYS;
    const now = clientNow();
    // One extra day back, so the first kept night is read from its start.
    const startDate = new Date(Date.parse(nowIso) - (days + 1) * 86_400_000).toISOString();
    const endDate = nowIso;
    try {
      const { Health } = await pluginModule();
      const read = async (dataType: (typeof READ_TYPES)[number]) => (await Health.readSamples({ dataType, startDate, endDate, limit: MAX_SAMPLES, ascending: true })).samples;
      const [sleep, weight, bodyFat, hrv, rhr] = await Promise.all([read("sleep"), read("weight"), read("bodyFat"), read("heartRateVariability"), read("restingHeartRate")]);
      const steps = (await Health.queryAggregated({ dataType: "steps", startDate, endDate, bucket: "day", aggregation: "sum" })).samples;
      const raw: NativeRead = { sleep, weight, bodyFat, hrv, rhr, steps };
      const merged = await mergeSamples(toMergeRows(nativeSamples(raw, now.tz, addDays(now.today, -days)), nowIso));
      await nativeHealthStore.set({ ...state, lastSyncAt: nowIso, lastError: null, last: merged });
      return { ok: true, ...merged };
    } catch {
      await nativeHealthStore.set({ ...state, lastSyncAt: nowIso, lastError: "read_failed" });
      return { ok: false, error: "read_failed" };
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Sync on open and whenever the app comes back to the screen, as `useHealthAutoPull` does for Health Auto Export. */
export function useNativeHealthSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !isNativeApp()) return;
    const run = () => void syncNativeHealth(new Date().toISOString());
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
}
