"use client";

/**
 * The device's link to Apple Health through Health Auto Export (Sprint 0,
 * S5). The token is made here, kept in localStorage and pasted into the
 * app's REST automation once; the server only ever sees its hash. On
 * open, `pullHealth` fetches what arrived since the last pull and merges
 * it into the sleep and weigh-in repos as `source: "healthkit"`, which
 * the engine already ranks above manual entries.
 */

import { useEffect } from "react";
import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { sleepNightsRepo, stepsRepo, vitalsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { healthOptInStore } from "@/lib/physique/io/healthOptIn";
import { repairTwelveHourNight } from "@/lib/health/repair";
import type { DailySteps, DailyVitals, SleepNight, SleepSegment, SleepStage, WeighIn } from "@/lib/physique/types";
import { MAX_SEGMENTS } from "@/lib/health/hae";
import { menstrualFlow, workoutsFromValue } from "@/lib/health/extras";

export type HealthLink = {
  token: string;
  createdAt: string;
  lastPullAt?: string;
  /** Cursor: `received_at` of the newest sample merged so far. */
  cursor?: string;
  /** From the server on the last pull. */
  lastPayloadAt?: string | null;
  serverSamples?: number;
  lastError?: string | null;
  /** When the S10 repair of nights read before 12-hour times were understood ran (`lib/health/repair.ts`). */
  repairedS10At?: string;
};

export const healthLinkStore = createSingleton<HealthLink>("physique.v1.healthLink");

/** Pull at most this often on open or return to the app. OURS: one small request; uploads arrive whenever the phone sends them. */
export const PULL_INTERVAL_MS = 2 * 60 * 1000;

export function useHealthLink(): HealthLink | null {
  return useSingleton(healthLinkStore);
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Create the link (and its token) if there is none; returns the current link. */
export async function ensureHealthLink(nowIso: string): Promise<HealthLink> {
  const existing = await healthLinkStore.get();
  if (existing?.token) return existing;
  const link: HealthLink = { token: randomToken(), createdAt: nowIso };
  await healthLinkStore.set(link);
  return link;
}

/**
 * Disconnect: delete everything the server holds for this token, then
 * forget the token. If the server can't be reached the link is kept, so
 * the user can try again rather than leave data behind unknowingly. A
 * server without database keys holds nothing, so that counts as done.
 */
export async function disconnectHealthLink(): Promise<{ ok: true } | { ok: false }> {
  const link = await healthLinkStore.get();
  if (link?.token) {
    try {
      const res = await fetch("/api/health/pull", { method: "DELETE", headers: { Authorization: `Bearer ${link.token}` } });
      if (!res.ok && res.status !== 503 && res.status !== 401) return { ok: false };
    } catch {
      return { ok: false };
    }
  }
  await healthLinkStore.clear();
  return { ok: true };
}

/**
 * IN8: read again from the start of what the server holds on the next
 * pull, so readings of a kind just opted in to (dropped while it was off)
 * are merged. Merging is idempotent, so the rest lands as it was.
 */
export async function repullFromStart(): Promise<void> {
  const link = await healthLinkStore.get();
  if (!link?.cursor) return;
  const next = { ...link };
  delete next.cursor;
  await healthLinkStore.set(next);
}

/** The URL Health Auto Export posts to, for the settings screen. */
export function ingestUrl(): string {
  if (typeof window === "undefined") return "/api/ingest/hae";
  return `${window.location.origin}/api/ingest/hae`;
}

type PullSample = { metric: string; day: string; value: Record<string, unknown>; source: string | null; received_at: string };
type PullResponse = { device: { registered: boolean; lastPayloadAt: string | null; samples: number }; samples: PullSample[] };

export type PullResult = { ok: true; merged: number; nights: number; weighIns: number } | { ok: false; error: "not_configured" | "unauthorized" | "network" | "storage" };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const STAGES = new Set<SleepStage>(["awake", "rem", "core", "deep", "asleep"]);

/** Stage segments from the server, kept only when every one is well formed (S8). */
function cleanSegments(v: unknown): SleepSegment[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_SEGMENTS) return null;
  const out: SleepSegment[] = [];
  for (const x of v) {
    const r = x as { s?: unknown; o?: unknown; d?: unknown } | null;
    const o = num(r?.o);
    const d = num(r?.d);
    if (!r || typeof r.s !== "string" || !STAGES.has(r.s as SleepStage) || o == null || d == null || o < 0 || d <= 0 || o + d > 24 * 60) return null;
    out.push({ s: r.s as SleepStage, o: Math.round(o), d: Math.round(d) });
  }
  return out;
}
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** HH:MM of an export's local timestamp ("2026-10-15T07:02:00"). Midnight is a day total from an aggregated export, not a reading. */
function readingClock(at: string | null): string | null {
  const m = at ? /T(\d{2}:\d{2})/.exec(at) : null;
  return m && m[1] !== "00:00" ? m[1] : null;
}

/** IN8: the day's record field each day-total metric is stored in, in its canonical unit. */
const DAY_FIELD = {
  activeEnergy: "activeKcal",
  water: "waterMl",
  caffeine: "caffeineMg",
  sodium: "sodiumMg",
  alcohol: "alcoholDrinks",
  wristTemp: "wristTempC",
} as const satisfies Record<string, keyof DailyVitals>;

const isDayMetric = (m: string): m is keyof typeof DAY_FIELD => Object.prototype.hasOwnProperty.call(DAY_FIELD, m);

/**
 * Merge pulled samples into the repos. Sleep rows become one `healthkit`
 * night per wake date (id `hk-<date>`); HRV and resting HR are kept as that
 * day's vitals (id `hk-v-<date>`, IN1) and attach to the night, also when
 * the night arrives in a later pull; weight and body fat become one
 * `healthkit` weigh-in per day; steps become one day's count (B3).
 *
 * IN8: the day's totals, its workouts and (only when opted in) wrist
 * temperature and cycle go on the same day record. A row of `{clear: true}`
 * (or an empty workout list) from the iPhone's read removes the value from
 * a day already held, as nothing was found for it in Health.
 */
export async function mergeSamples(samples: readonly PullSample[]): Promise<{ nights: number; weighIns: number }> {
  const optIn = healthOptInStore.snapshot() ?? {};
  const nights = new Map<string, SleepNight>();
  const weights = new Map<string, WeighIn>();
  const steps = new Map<string, DailySteps>();
  const vitals = new Map<string, DailyVitals>();
  const existingNights = sleepNightsRepo.snapshot();
  const existingWeights = weighInsRepo.snapshot();
  const existingVitals = vitalsRepo.snapshot();
  const storedVitals = new Map(existingVitals.map((v) => [v.id, v] as const));
  const nightFor = (day: string, receivedAt: string): SleepNight =>
    nights.get(day) ?? existingNights.find((n) => n.id === `hk-${day}`) ?? { id: `hk-${day}`, date: day, loggedAt: receivedAt, source: "healthkit", schemaVersion: 1, asleepMin: 0 };
  const vitalsFor = (day: string, receivedAt: string): DailyVitals =>
    vitals.get(day) ?? storedVitals.get(`hk-v-${day}`) ?? { id: `hk-v-${day}`, date: day, loggedAt: receivedAt, source: "healthkit", schemaVersion: 1 };
  const weightFor = (day: string, at: string): WeighIn =>
    weights.get(day) ?? existingWeights.find((w) => w.id === `hk-w-${day}`) ?? { id: `hk-w-${day}`, date: day, loggedAt: at, source: "healthkit", schemaVersion: 1, kg: 0 };
  /** A day already held, without `fields`; nothing when it isn't held or has none of them. */
  const clearDay = (day: string, fields: ReadonlyArray<keyof DailyVitals>) => {
    const cur = vitals.get(day) ?? storedVitals.get(`hk-v-${day}`);
    if (!cur || !fields.some((f) => cur[f] !== undefined)) return;
    const copy: DailyVitals = { ...cur };
    for (const f of fields) delete copy[f];
    vitals.set(day, copy);
  };

  for (const s of samples) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.day)) continue;
    const v = s.value ?? {};
    if (s.metric === "sleep") {
      const asleepMin = num(v.asleepMin);
      if (asleepMin == null || asleepMin <= 0) continue;
      const n = { ...nightFor(s.day, s.received_at), asleepMin };
      // A sleep row is the whole night as the server has it now: a value it no longer carries is removed, so a re-sent night replaces a misread one (S10).
      // Watch-only nights carry no "in bed" (0): leave it unset so the sleep period stands in.
      const inBed = num(v.inBedMin);
      if (inBed != null && inBed > 0) n.inBedMin = inBed;
      else delete n.inBedMin;
      const bedtime = str(v.bedtime);
      if (bedtime) n.bedtime = bedtime;
      else delete n.bedtime;
      const wake = str(v.wakeTime);
      if (wake) n.wakeTime = wake;
      else delete n.wakeTime;
      const st = v.stages && typeof v.stages === "object" ? (v.stages as Record<string, unknown>) : null;
      if (st) {
        const stages: NonNullable<SleepNight["stages"]> = {};
        for (const k of ["coreMin", "deepMin", "remMin", "awakeMin"] as const) {
          const m = num(st[k]);
          if (m != null && m >= 0) stages[k] = Math.round(m);
        }
        if (Object.keys(stages).length > 0) n.stages = stages;
      }
      const segs = cleanSegments(v.segments);
      if (segs) n.segments = segs;
      else delete n.segments;
      nights.set(s.day, n);
    } else if (s.metric === "hrv") {
      const ms = num(v.value);
      if (ms == null) continue;
      vitals.set(s.day, { ...vitalsFor(s.day, s.received_at), hrvMs: ms, hrvMethod: "sdnn" });
      nights.set(s.day, { ...nightFor(s.day, s.received_at), hrvMs: ms, hrvMethod: "sdnn" });
    } else if (s.metric === "rhr") {
      const bpm = num(v.value);
      if (bpm == null) continue;
      vitals.set(s.day, { ...vitalsFor(s.day, s.received_at), restingHr: bpm });
      nights.set(s.day, { ...nightFor(s.day, s.received_at), restingHr: bpm });
    } else if (s.metric === "weight") {
      const kg = num(v.value);
      if (kg == null || kg <= 0) continue;
      // IN1: the reading's local clock goes in `time`; `loggedAt` is when it arrived (it was the local time with a false "Z").
      const time = readingClock(str(v.at));
      weights.set(s.day, { ...weightFor(s.day, s.received_at), kg, ...(time ? { time } : {}) });
    } else if (s.metric === "steps") {
      const count = num(v.value);
      if (count == null || count < 0) continue;
      steps.set(s.day, { id: `hk-s-${s.day}`, date: s.day, loggedAt: s.received_at, source: "healthkit", schemaVersion: 1, steps: Math.round(count) });
    } else if (s.metric === "bodyFat") {
      const pct = num(v.value);
      if (pct == null) continue;
      weights.set(s.day, { ...weightFor(s.day, s.received_at), bodyFatPct: pct });
    } else if (isDayMetric(s.metric)) {
      if (s.metric === "wristTemp" && !optIn.wristTemp) continue;
      const field = DAY_FIELD[s.metric];
      if (v.clear === true) {
        clearDay(s.day, [field]);
        continue;
      }
      const x = num(v.value);
      if (x == null || x <= 0) continue;
      vitals.set(s.day, { ...vitalsFor(s.day, s.received_at), [field]: x });
    } else if (s.metric === "workouts") {
      const list = workoutsFromValue(v);
      if (list == null) continue;
      if (list.length === 0) clearDay(s.day, ["workouts"]);
      else vitals.set(s.day, { ...vitalsFor(s.day, s.received_at), workouts: list });
    } else if (s.metric === "cycle") {
      if (!optIn.cycle) continue;
      const flow = menstrualFlow(v.flow);
      if (v.clear === true || !flow) {
        if (v.clear === true) clearDay(s.day, ["menstrualFlow", "cycleStart"]);
        continue;
      }
      const day: DailyVitals = { ...vitalsFor(s.day, s.received_at), menstrualFlow: flow, cycleStart: v.cycleStart === true };
      if (!day.cycleStart) delete day.cycleStart;
      vitals.set(s.day, day);
    }
  }
  // A night that arrives after its day's HRV or RHR picks them up from the vitals (IN1).
  for (const [day, n] of nights) {
    const v = vitals.get(day) ?? storedVitals.get(`hk-v-${day}`);
    if (!v) continue;
    nights.set(day, {
      ...n,
      ...(n.hrvMs == null && v.hrvMs != null ? { hrvMs: v.hrvMs, hrvMethod: v.hrvMethod ?? "sdnn" } : {}),
      ...(n.restingHr == null && v.restingHr != null ? { restingHr: v.restingHr } : {}),
    });
  }
  // A night that only has HRV or RHR is not a night: keep it only if it carries sleep. The vitals keep the readings.
  const nightRows = [...nights.values()].filter((n) => n.asleepMin > 0);
  const weightRows = [...weights.values()].filter((w) => w.kg > 0);
  if (nightRows.length) await sleepNightsRepo.bulkUpsert(nightRows);
  if (weightRows.length) await weighInsRepo.bulkUpsert(weightRows);
  if (steps.size) await stepsRepo.bulkUpsert([...steps.values()]);
  if (vitals.size) await vitalsRepo.bulkUpsert([...vitals.values()]);
  return { nights: nightRows.length, weighIns: weightRows.length };
}

let inflight: Promise<PullResult> | null = null;

/** Fetch and merge new samples. `force` ignores the pull interval. */
export async function pullHealth(nowIso: string, force = false): Promise<PullResult> {
  if (inflight) return inflight;
  inflight = (async (): Promise<PullResult> => {
    let link = await healthLinkStore.get();
    if (!link?.token) return { ok: false, error: "unauthorized" };
    if (!link.repairedS10At) {
      const fixed = sleepNightsRepo.snapshot().map(repairTwelveHourNight).filter((n): n is SleepNight => n != null);
      if (fixed.length) await sleepNightsRepo.bulkUpsert(fixed);
      link = { ...link, repairedS10At: nowIso };
      await healthLinkStore.set(link);
    }
    if (!force && link.lastPullAt && Date.now() - Date.parse(link.lastPullAt) < PULL_INTERVAL_MS) return { ok: true, merged: 0, nights: 0, weighIns: 0 };
    let res: Response;
    try {
      const q = link.cursor ? `?since=${encodeURIComponent(link.cursor)}` : "";
      res = await fetch(`/api/health/pull${q}`, { headers: { Authorization: `Bearer ${link.token}` } });
    } catch {
      await healthLinkStore.set({ ...link, lastPullAt: nowIso, lastError: "network" });
      return { ok: false, error: "network" };
    }
    if (res.status === 503) {
      await healthLinkStore.set({ ...link, lastPullAt: nowIso, lastError: "not_configured" });
      return { ok: false, error: "not_configured" };
    }
    if (!res.ok) {
      await healthLinkStore.set({ ...link, lastPullAt: nowIso, lastError: res.status === 401 ? "unauthorized" : "storage" });
      return { ok: false, error: res.status === 401 ? "unauthorized" : "storage" };
    }
    const body = (await res.json()) as PullResponse;
    try {
      const merged = await mergeSamples(body.samples ?? []);
      const newest = body.samples?.length ? body.samples[body.samples.length - 1].received_at : link.cursor;
      await healthLinkStore.set({ ...link, lastPullAt: nowIso, cursor: newest, lastPayloadAt: body.device?.lastPayloadAt ?? null, serverSamples: body.device?.samples ?? 0, lastError: null });
      return { ok: true, merged: body.samples?.length ?? 0, ...merged };
    } catch {
      await healthLinkStore.set({ ...link, lastPullAt: nowIso, lastError: "storage" });
      return { ok: false, error: "storage" };
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Pull on open and again whenever the app comes back to the screen. A home
 * screen app resumed from the background does not remount its pages, so
 * pulling only on mount missed uploads that landed while it sat open.
 */
export function useHealthAutoPull(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const run = () => void pullHealth(new Date().toISOString());
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
    };
  }, [enabled]);
}

/** "today at 07:42", "yesterday at 23:10", "Sat 17 Oct at 09:05" for the last upload, in the viewer's zone. */
export function receivedLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = key(d) === key(now) ? "today" : key(d) === key(yesterday) ? "yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  return `${day} at ${time}`;
}
