/**
 * POST /api/ingest/hae — Health Auto Export pushes Apple Health here
 * (06-execution Sprint 0, S5). Bearer token = the device token the user
 * pasted into the app; only its hash is stored. The body is parsed with
 * `parseHaePayload` and upserted per (device, metric, day), so "Since Last
 * Sync" replays are no-ops. Values are never logged.
 */

import { NextResponse } from "next/server";
import { parseHaePayload, type HealthSample } from "@/lib/health/hae";
import { bearerToken, hashToken, supabaseConfig, touchDevice, upsertSamples, type SampleRow } from "@/lib/server/supabaseRest";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

/** Vercel rejects bodies over 4.5 MB; aggregated exports are far smaller. */
const MAX_BYTES = 4_000_000;
/** One request carries at most this many samples. OURS. */
const MAX_SAMPLES = 5000;

function toRow(deviceHash: string, s: HealthSample): SampleRow {
  if (s.kind === "sleep") {
    return { device_hash: deviceHash, metric: "sleep", day: s.day, value: { asleepMin: s.asleepMin, inBedMin: s.inBedMin, bedtime: s.bedtime, wakeTime: s.wakeTime, stages: s.stages }, source: s.source };
  }
  return { device_hash: deviceHash, metric: s.kind, day: s.day, value: { value: s.value, at: s.at }, source: s.source };
}

export async function POST(request: Request): Promise<Response> {
  const cfg = supabaseConfig();
  if (!cfg) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const samples = parseHaePayload(json).slice(0, MAX_SAMPLES);
  const deviceHash = hashToken(token);
  try {
    await touchDevice(cfg, deviceHash, { samples: samples.length, payload: true });
    // One row per (metric, day): the last in the payload wins, as the upsert would.
    const byKey = new Map<string, SampleRow>();
    for (const s of samples) {
      const row = toRow(deviceHash, s);
      byKey.set(`${row.metric}|${row.day}`, row);
    }
    await upsertSamples(cfg, [...byKey.values()]);
    return NextResponse.json({ received: byKey.size });
  } catch (e) {
    console.error(`[ingest/hae] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
