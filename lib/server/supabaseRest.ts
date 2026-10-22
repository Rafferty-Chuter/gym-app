/**
 * Server-only access to the Supabase tables through PostgREST, with the
 * service-role key. No SDK: two fetches. Never logs values (CLAUDE.md
 * rule 10). Returns `null` from `supabaseConfig()` when the environment
 * has no keys, and routes answer 503 then.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type SupabaseConfig = { url: string; key: string };

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** Tokens are at least this long; shorter bearer values are rejected before hashing. OURS. */
export const MIN_TOKEN_LENGTH = 32;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Bearer token from the request; null when missing or too short. */
export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  const token = m?.[1]?.trim() ?? "";
  if (token.length < MIN_TOKEN_LENGTH || token.length > 256) return null;
  return token;
}

/** Constant-time equality for hex digests. */
export function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function headers(cfg: SupabaseConfig, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", ...extra };
}

export type SampleRow = { device_hash: string; metric: string; day: string; value: unknown; source: string | null; received_at?: string };

/** Insert or replace samples on (device, metric, day). */
export async function upsertSamples(cfg: SupabaseConfig, rows: readonly SampleRow[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${cfg.url}/rest/v1/health_samples?on_conflict=device_hash,metric,day`, {
    method: "POST",
    headers: headers(cfg, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`samples upsert failed: ${res.status}`);
}

/** Stored sleep rows for these days, so an upload can be merged with what is there (S11). */
export async function listSleepRows(cfg: SupabaseConfig, deviceHash: string, days: readonly string[]): Promise<Array<{ day: string; value: unknown }>> {
  return listDayRows(cfg, deviceHash, "sleep", days);
}

/** The stored rows of one metric for the given days, so an upload can merge with them (sleep S11, workouts IN8). */
export async function listDayRows(cfg: SupabaseConfig, deviceHash: string, metric: string, days: readonly string[]): Promise<Array<{ day: string; value: unknown }>> {
  if (days.length === 0) return [];
  const params = new URLSearchParams({ device_hash: `eq.${deviceHash}`, metric: `eq.${metric}`, day: `in.(${days.join(",")})`, select: "day,value" });
  const res = await fetch(`${cfg.url}/rest/v1/health_samples?${params.toString()}`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`${metric} rows read failed: ${res.status}`);
  return (await res.json()) as Array<{ day: string; value: unknown }>;
}

/** Create the device row on first contact and bump its counters. */
export async function touchDevice(cfg: SupabaseConfig, deviceHash: string, patch: { samples?: number; payload?: boolean }): Promise<void> {
  const nowIso = new Date().toISOString();
  const res = await fetch(`${cfg.url}/rest/v1/health_devices?on_conflict=device_hash`, {
    method: "POST",
    headers: headers(cfg, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ device_hash: deviceHash, last_seen_at: nowIso, ...(patch.payload ? { last_payload_at: nowIso } : {}) }]),
  });
  if (!res.ok) throw new Error(`device upsert failed: ${res.status}`);
  if (patch.samples && patch.samples > 0) {
    // Counter bump via RPC-free arithmetic: read then write (one device per request, no contention worth a function).
    const cur = await fetch(`${cfg.url}/rest/v1/health_devices?device_hash=eq.${encodeURIComponent(deviceHash)}&select=samples`, { headers: headers(cfg) });
    if (cur.ok) {
      const rows = (await cur.json()) as Array<{ samples: number }>;
      const next = (rows[0]?.samples ?? 0) + patch.samples;
      await fetch(`${cfg.url}/rest/v1/health_devices?device_hash=eq.${encodeURIComponent(deviceHash)}`, { method: "PATCH", headers: headers(cfg, { Prefer: "return=minimal" }), body: JSON.stringify({ samples: next }) });
    }
  }
}

export type DeviceRow = { device_hash: string; created_at: string; last_seen_at: string | null; last_payload_at: string | null; samples: number };

export async function getDevice(cfg: SupabaseConfig, deviceHash: string): Promise<DeviceRow | null> {
  const res = await fetch(`${cfg.url}/rest/v1/health_devices?device_hash=eq.${encodeURIComponent(deviceHash)}&select=*`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`device read failed: ${res.status}`);
  const rows = (await res.json()) as DeviceRow[];
  return rows[0] ?? null;
}

/** Everything stored for a device: its samples, then its device row. Used when the user disconnects. */
export async function deleteHealthDevice(cfg: SupabaseConfig, deviceHash: string): Promise<void> {
  const h = encodeURIComponent(deviceHash);
  const samples = await fetch(`${cfg.url}/rest/v1/health_samples?device_hash=eq.${h}`, { method: "DELETE", headers: headers(cfg, { Prefer: "return=minimal" }) });
  if (!samples.ok) throw new Error(`samples delete failed: ${samples.status}`);
  const device = await fetch(`${cfg.url}/rest/v1/health_devices?device_hash=eq.${h}`, { method: "DELETE", headers: headers(cfg, { Prefer: "return=minimal" }) });
  if (!device.ok) throw new Error(`device delete failed: ${device.status}`);
}

/** Samples received after `since` (ISO), oldest first, capped. */
export async function listSamples(cfg: SupabaseConfig, deviceHash: string, since: string | null, limit = 2000): Promise<SampleRow[]> {
  const params = new URLSearchParams({ device_hash: `eq.${deviceHash}`, select: "metric,day,value,source,received_at", order: "received_at.asc", limit: String(limit) });
  if (since) params.set("received_at", `gt.${since}`);
  const res = await fetch(`${cfg.url}/rest/v1/health_samples?${params.toString()}`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`samples read failed: ${res.status}`);
  return (await res.json()) as SampleRow[];
}

// ── Reminders (Sprint 0, G5) ──

export type PushDeviceRow = {
  device_hash: string;
  subscription: unknown;
  tz: string;
  reminder_hhmm: string;
  summary: unknown;
  summary_at: string | null;
  health_hash: string | null;
  last_run_day: string | null;
  failures: number;
};

/** Create or replace this device's push row. */
export async function upsertPushDevice(cfg: SupabaseConfig, row: Partial<PushDeviceRow> & { device_hash: string }): Promise<void> {
  const res = await fetch(`${cfg.url}/rest/v1/push_devices?on_conflict=device_hash`, {
    method: "POST",
    headers: headers(cfg, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ ...row, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`push device upsert failed: ${res.status}`);
}

/** Patch one device; false when no row matched. */
export async function patchPushDevice(cfg: SupabaseConfig, deviceHash: string, patch: Partial<PushDeviceRow>): Promise<boolean> {
  const res = await fetch(`${cfg.url}/rest/v1/push_devices?device_hash=eq.${encodeURIComponent(deviceHash)}`, {
    method: "PATCH",
    headers: headers(cfg, { Prefer: "return=representation" }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`push device patch failed: ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

export async function deletePushDevice(cfg: SupabaseConfig, deviceHash: string): Promise<void> {
  const res = await fetch(`${cfg.url}/rest/v1/push_devices?device_hash=eq.${encodeURIComponent(deviceHash)}`, { method: "DELETE", headers: headers(cfg, { Prefer: "return=minimal" }) });
  if (!res.ok) throw new Error(`push device delete failed: ${res.status}`);
}

/** Every registered device, oldest first, capped. */
export async function listPushDevices(cfg: SupabaseConfig, limit = 1000): Promise<PushDeviceRow[]> {
  const params = new URLSearchParams({ select: "device_hash,subscription,tz,reminder_hhmm,summary,summary_at,health_hash,last_run_day,failures", order: "created_at.asc", limit: String(limit) });
  const res = await fetch(`${cfg.url}/rest/v1/push_devices?${params.toString()}`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`push devices read failed: ${res.status}`);
  return (await res.json()) as PushDeviceRow[];
}

/** Days with a sleep or weight sample from Apple Health, from `fromDay` on. */
export async function listHealthDays(cfg: SupabaseConfig, healthHash: string, fromDay: string): Promise<Array<{ metric: string; day: string }>> {
  const params = new URLSearchParams({ device_hash: `eq.${healthHash}`, metric: "in.(sleep,weight)", day: `gte.${fromDay}`, select: "metric,day", limit: "100" });
  const res = await fetch(`${cfg.url}/rest/v1/health_samples?${params.toString()}`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`health days read failed: ${res.status}`);
  return (await res.json()) as Array<{ metric: string; day: string }>;
}
