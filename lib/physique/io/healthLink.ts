"use client";

/**
 * The device's link to Apple Health through Health Auto Export (Sprint 0,
 * S5). The token is made here, kept in localStorage and pasted into the
 * app's REST automation once; the server only ever sees its hash. On
 * open, `pullHealth` fetches what arrived since the last pull and merges
 * it into the sleep and weigh-in repos as `source: "healthkit"`, which
 * the engine already ranks above manual entries.
 */

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { sleepNightsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import type { SleepNight, WeighIn } from "@/lib/physique/types";

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
};

export const healthLinkStore = createSingleton<HealthLink>("physique.v1.healthLink");

/** Pull at most this often on open. OURS. */
export const PULL_INTERVAL_MS = 10 * 60 * 1000;

export function useHealthLink(): HealthLink | null {
  return useSingleton(healthLinkStore);
}

function randomToken(): string {
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

export async function disconnectHealthLink(): Promise<void> {
  await healthLinkStore.clear();
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
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Merge pulled samples into the repos. Sleep rows become one `healthkit`
 * night per wake date (id `hk-<date>`); HRV and resting HR attach to that
 * night; weight and body fat become one `healthkit` weigh-in per day.
 */
export async function mergeSamples(samples: readonly PullSample[]): Promise<{ nights: number; weighIns: number }> {
  const nights = new Map<string, SleepNight>();
  const weights = new Map<string, WeighIn>();
  const existingNights = sleepNightsRepo.snapshot();
  const existingWeights = weighInsRepo.snapshot();
  const nightFor = (day: string, receivedAt: string): SleepNight =>
    nights.get(day) ?? existingNights.find((n) => n.id === `hk-${day}`) ?? { id: `hk-${day}`, date: day, loggedAt: receivedAt, source: "healthkit", schemaVersion: 1, asleepMin: 0 };
  const weightFor = (day: string, at: string): WeighIn =>
    weights.get(day) ?? existingWeights.find((w) => w.id === `hk-w-${day}`) ?? { id: `hk-w-${day}`, date: day, loggedAt: at, source: "healthkit", schemaVersion: 1, kg: 0 };

  for (const s of samples) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.day)) continue;
    const v = s.value ?? {};
    if (s.metric === "sleep") {
      const asleepMin = num(v.asleepMin);
      if (asleepMin == null || asleepMin <= 0) continue;
      const n = { ...nightFor(s.day, s.received_at), asleepMin };
      const inBed = num(v.inBedMin);
      if (inBed != null) n.inBedMin = inBed;
      const bedtime = str(v.bedtime);
      if (bedtime) n.bedtime = bedtime;
      const wake = str(v.wakeTime);
      if (wake) n.wakeTime = wake;
      nights.set(s.day, n);
    } else if (s.metric === "hrv") {
      const ms = num(v.value);
      if (ms == null) continue;
      nights.set(s.day, { ...nightFor(s.day, s.received_at), hrvMs: ms, hrvMethod: "sdnn" });
    } else if (s.metric === "rhr") {
      const bpm = num(v.value);
      if (bpm == null) continue;
      nights.set(s.day, { ...nightFor(s.day, s.received_at), restingHr: bpm });
    } else if (s.metric === "weight") {
      const kg = num(v.value);
      if (kg == null || kg <= 0) continue;
      const at = str(v.at);
      weights.set(s.day, { ...weightFor(s.day, at ? `${at}Z` : s.received_at), kg });
    } else if (s.metric === "bodyFat") {
      const pct = num(v.value);
      if (pct == null) continue;
      weights.set(s.day, { ...weightFor(s.day, s.received_at), bodyFatPct: pct });
    }
  }
  // A night that only has HRV or RHR is not a night: keep it only if it carries sleep.
  const nightRows = [...nights.values()].filter((n) => n.asleepMin > 0);
  const weightRows = [...weights.values()].filter((w) => w.kg > 0);
  if (nightRows.length) await sleepNightsRepo.bulkUpsert(nightRows);
  if (weightRows.length) await weighInsRepo.bulkUpsert(weightRows);
  return { nights: nightRows.length, weighIns: weightRows.length };
}

let inflight: Promise<PullResult> | null = null;

/** Fetch and merge new samples. `force` ignores the pull interval. */
export async function pullHealth(nowIso: string, force = false): Promise<PullResult> {
  if (inflight) return inflight;
  inflight = (async (): Promise<PullResult> => {
    const link = await healthLinkStore.get();
    if (!link?.token) return { ok: false, error: "unauthorized" };
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
