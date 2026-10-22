"use client";

/**
 * Apple Health on the iPhone app (B11): read straight from HealthKit on
 * the phone, so Health Auto Export, its subscription, its token and its
 * split nights (S12) are not needed. Each sync re-reads the last two
 * weeks (a year the first time, IN1) and merges through the same
 * `mergeSamples` as the Health Auto Export path, so nights, weigh-ins and
 * steps land as `source: "healthkit"` with the same ids either way.
 *
 * IN8 reads more: active energy, workouts and water through the same
 * plugin; caffeine, sodium, drinks and cycle through the app's own
 * HealthExtras plugin (`ios/App/App/HealthExtrasPlugin.swift`), which the
 * HealthKit plugin lacks; wrist temperature and cycle only when the person
 * opts in (`healthOptIn.ts`). An app build from before IN8 has no
 * HealthExtras, so it reads what the HealthKit plugin can and no more.
 *
 * Only runs inside the app: the native shell injects `window.Capacitor`.
 * The plugins are imported on first use, so the web app never loads them.
 */

import { useEffect } from "react";
import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { addDays, clientNow } from "@/lib/dates";
import { clearRows, nativeSamples, readChunks, toMergeRows, uniqueSamples, type NativeDayTotal, type NativeFlowSample, type NativeRead, type NativeSample, type NativeWorkout } from "@/lib/health/native";
import { mergeSamples } from "@/lib/physique/io/healthLink";
import { healthOptInStore, type HealthOptIn } from "@/lib/physique/io/healthOptIn";
import { isNativeApp } from "@/lib/nativeApp";

export type NativeHealth = {
  connectedAt: string;
  lastSyncAt?: string;
  lastError?: string | null;
  /** What the last sync merged. */
  last?: { nights: number; weighIns: number };
  /** IN1: days back the link has read in full. Absent on a link made before IN1, which read 60. */
  backfillDays?: number;
  /** IN8: the kinds HealthKit has been asked for. Absent on a link made before IN8, which asked for `BASE_TYPES`. */
  asked?: string[];
};

export const nativeHealthStore = createSingleton<NativeHealth>("physique.v1.nativeHealth");

/** Days read on the first sync. OURS (IN1): a year, so imported lifts meet the sleep, weight and HRV behind them from day one (60 before IN1). */
export const FIRST_SYNC_DAYS = 365;
/** Days re-read on every later sync. OURS: late watch syncs and edits in Health land within two weeks. */
export const SYNC_DAYS = 14;
/** Sync at most this often on open or return to the app. OURS: HealthKit reads are local and quick. */
export const SYNC_INTERVAL_MS = 2 * 60 * 1000;
/** Most samples read per kind in one sync. OURS: a watch writes about 30 sleep segments and a dozen HRV readings a night. */
const MAX_SAMPLES = 20_000;

/** Most pages of workouts read in one sync. OURS: 500 a page, so a year of daily workouts fits with room. */
const MAX_WORKOUT_PAGES = 20;

/** The kinds read since B11, by the HealthKit plugin's names. */
const BASE_TYPES = ["sleep", "weight", "bodyFat", "heartRateVariability", "restingHeartRate", "steps"] as const;
/** IN8, through the HealthKit plugin: active energy, water, workouts. */
const MORE_TYPES = ["calories", "dietaryWater", "workouts"] as const;
/** IN8, through HealthExtras only. */
const EXTRAS_TYPES = ["dietaryCaffeine", "dietarySodium", "numberOfAlcoholicBeverages"] as const;
/** IN8, opt-in: wrist temperature (HealthKit plugin) and cycle (HealthExtras). */
const WRIST_TEMP_TYPE = "appleSleepingWristTemperature";
const CYCLE_TYPE = "menstrualFlow";

/** The kinds the HealthKit plugin can ask for and read; the rest only HealthExtras can. */
const PLUGIN_TYPES: ReadonlySet<string> = new Set<string>([...BASE_TYPES, ...MORE_TYPES, WRIST_TEMP_TYPE]);

/**
 * What to ask HealthKit for: the standard kinds, the ones only HealthExtras
 * reads when this app build has it, and the opt-in kinds the person turned
 * on. Cycle needs HealthExtras.
 */
export function wantedTypes(optIn: Pick<HealthOptIn, "wristTemp" | "cycle">, hasExtras: boolean): string[] {
  return [
    ...BASE_TYPES,
    ...MORE_TYPES,
    ...(hasExtras ? EXTRAS_TYPES : []),
    ...(optIn.wristTemp ? [WRIST_TEMP_TYPE] : []),
    ...(optIn.cycle && hasExtras ? [CYCLE_TYPE] : []),
  ];
}

/** Wanted kinds HealthKit has not been asked for yet. A link made before IN8 was asked for the standard kinds. */
export function unaskedTypes(state: Pick<NativeHealth, "asked"> | null, wanted: readonly string[]): string[] {
  const asked = new Set(state?.asked ?? BASE_TYPES);
  return wanted.filter((t) => !asked.has(t));
}

export type SyncResult = { ok: true; nights: number; weighIns: number } | { ok: false; error: "not_app" | "unavailable" | "not_connected" | "read_failed" };

/**
 * Days to read on this sync: a year the first time, and once more for a
 * link made before IN1 (it read 60 days) or whose year read failed; two
 * weeks after that.
 */
export function syncWindowDays(state: Pick<NativeHealth, "lastSyncAt" | "backfillDays">): number {
  if (!state.lastSyncAt) return FIRST_SYNC_DAYS;
  return (state.backfillDays ?? 0) >= FIRST_SYNC_DAYS ? SYNC_DAYS : FIRST_SYNC_DAYS;
}

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

/** IN8: the app's own HealthKit reads (`ios/App/App/HealthExtrasPlugin.swift`). */
type HealthExtrasPlugin = {
  requestAuthorization(options: { read: string[] }): Promise<void>;
  /** Day sums in the phone's calendar: mg for caffeine and sodium, a count for drinks. */
  queryDailySums(options: { dataType: (typeof EXTRAS_TYPES)[number]; startDate: string; endDate: string }): Promise<{ samples: NativeDayTotal[] }>;
  readMenstrualFlow(options: { startDate: string; endDate: string }): Promise<{ samples: NativeFlowSample[] }>;
};

/** Registered once; null when this app build has no HealthExtras (before IN8). Kept out of any promise's result, as above. */
let extrasPlugin: HealthExtrasPlugin | null | undefined;

/** Whether this app build has HealthExtras, from the bridge the native shell injects. False on the web. */
export function hasHealthExtras(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
  try {
    return cap?.isPluginAvailable?.("HealthExtras") === true;
  } catch {
    return false;
  }
}

async function loadExtras(): Promise<void> {
  if (extrasPlugin !== undefined) return;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    extrasPlugin = hasHealthExtras() ? registerPlugin<HealthExtrasPlugin>("HealthExtras") : null;
  } catch {
    extrasPlugin = null;
  }
}

/**
 * Ask HealthKit for read access to `types` (the system sheet lists only
 * those not yet answered). One sheet through HealthExtras when the build has
 * it, since a HealthKit permission is the app's, whichever plugin reads.
 */
async function askFor(types: readonly string[]): Promise<void> {
  await loadExtras();
  const extras = extrasPlugin;
  if (extras) {
    await extras.requestAuthorization({ read: [...types] });
    return;
  }
  const { Health } = await pluginModule();
  const read = types.filter((t) => PLUGIN_TYPES.has(t)) as Array<(typeof BASE_TYPES)[number] | (typeof MORE_TYPES)[number] | typeof WRIST_TEMP_TYPE>;
  await Health.requestAuthorization({ read, write: [] });
}

async function wanted(): Promise<string[]> {
  await loadExtras();
  return wantedTypes((await healthOptInStore.get()) ?? {}, extrasPlugin != null);
}

/** Ask for read access (the system sheet) and run the first sync. */
export async function connectNativeHealth(nowIso: string): Promise<SyncResult> {
  if (!isNativeApp()) return { ok: false, error: "not_app" };
  let asked: string[];
  try {
    const { Health } = await pluginModule();
    if (!(await Health.isAvailable()).available) return { ok: false, error: "unavailable" };
    asked = await wanted();
    await askFor(asked);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const existing = await nativeHealthStore.get();
  await nativeHealthStore.set({ connectedAt: existing?.connectedAt ?? nowIso, lastSyncAt: existing?.lastSyncAt, asked });
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
    let state = await nativeHealthStore.get();
    if (!state) return { ok: false, error: "not_connected" };
    if (!force && state.lastSyncAt && Date.parse(nowIso) - Date.parse(state.lastSyncAt) < SYNC_INTERVAL_MS) return { ok: true, nights: 0, weighIns: 0 };
    // IN8: a read the person asked for (Read now, an opt-in turned on) first asks for kinds not yet asked for; a read on open never brings up the sheet.
    const want = await wanted();
    const missing = unaskedTypes(state, want);
    if (force && missing.length) {
      try {
        await askFor(missing);
        state = { ...state, asked: [...new Set([...(state.asked ?? BASE_TYPES), ...missing])] };
        await nativeHealthStore.set(state);
      } catch {
        // Not asked this time: the kinds read empty, as a refused kind does.
      }
    }
    const optIn = (await healthOptInStore.get()) ?? {};
    const days = syncWindowDays(state);
    const now = clientNow();
    // One extra day back, so the first kept night is read from its start. A long window is read in chunks (IN1).
    const chunks = readChunks(nowIso, days + 1);
    const startDate = chunks[0].startDate;
    const endDate = nowIso;
    try {
      const { Health } = await pluginModule();
      await loadExtras();
      const extras = extrasPlugin;
      const read = async (dataType: (typeof BASE_TYPES)[number] | typeof WRIST_TEMP_TYPE) => {
        const all: NativeSample[] = [];
        for (const c of chunks) all.push(...(await Health.readSamples({ dataType, ...c, limit: MAX_SAMPLES, ascending: true })).samples);
        return uniqueSamples(all);
      };
      const [sleep, weight, bodyFat, hrv, rhr] = await Promise.all([read("sleep"), read("weight"), read("bodyFat"), read("heartRateVariability"), read("restingHeartRate")]);
      const steps = (await Health.queryAggregated({ dataType: "steps", startDate, endDate, bucket: "day", aggregation: "sum" })).samples;
      // IN8: each kind on its own, so one that fails (a kind this iPhone lacks) is left out and the rest still land.
      const quiet = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined);
      const daySum = (dataType: "calories" | "dietaryWater") => quiet(Health.queryAggregated({ dataType, startDate, endDate, bucket: "day", aggregation: "sum" }).then((r) => r.samples));
      const extraSum = (dataType: (typeof EXTRAS_TYPES)[number]) => (extras ? quiet(extras.queryDailySums({ dataType, startDate, endDate }).then((r) => r.samples)) : Promise.resolve(undefined));
      const readWorkouts = async (): Promise<NativeWorkout[]> => {
        const all: NativeWorkout[] = [];
        let anchor: string | undefined;
        for (let page = 0; page < MAX_WORKOUT_PAGES; page++) {
          const r = await Health.queryWorkouts({ startDate, endDate, limit: 500, ascending: true, ...(anchor ? { anchor } : {}) });
          all.push(...r.workouts);
          if (!r.anchor || r.workouts.length === 0) break;
          anchor = r.anchor;
        }
        return all;
      };
      const [activeEnergy, water, caffeine, sodium, alcohol, workouts, wristTemp, menstrual] = await Promise.all([
        daySum("calories"),
        daySum("dietaryWater"),
        extraSum("dietaryCaffeine"),
        extraSum("dietarySodium"),
        extraSum("numberOfAlcoholicBeverages"),
        quiet(readWorkouts()),
        optIn.wristTemp ? quiet(read(WRIST_TEMP_TYPE)) : Promise.resolve(undefined),
        optIn.cycle && extras ? quiet(extras.readMenstrualFlow({ startDate, endDate }).then((r) => r.samples)) : Promise.resolve(undefined),
      ]);
      const raw: NativeRead = { sleep, weight, bodyFat, hrv, rhr, steps, activeEnergy, water, caffeine, sodium, alcohol, workouts, wristTemp, menstrual };
      const fromDay = addDays(now.today, -days);
      const samples = nativeSamples(raw, now.tz, fromDay);
      const merged = await mergeSamples([...toMergeRows(samples, nowIso), ...clearRows(raw, samples, fromDay, now.today, nowIso)]);
      await nativeHealthStore.set({ ...state, lastSyncAt: nowIso, lastError: null, last: merged, backfillDays: Math.max(state.backfillDays ?? 0, days) });
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
