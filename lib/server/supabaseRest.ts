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

/** Samples received after `since` (ISO), oldest first, capped. */
export async function listSamples(cfg: SupabaseConfig, deviceHash: string, since: string | null, limit = 2000): Promise<SampleRow[]> {
  const params = new URLSearchParams({ device_hash: `eq.${deviceHash}`, select: "metric,day,value,source,received_at", order: "received_at.asc", limit: String(limit) });
  if (since) params.set("received_at", `gt.${since}`);
  const res = await fetch(`${cfg.url}/rest/v1/health_samples?${params.toString()}`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`samples read failed: ${res.status}`);
  return (await res.json()) as SampleRow[];
}
