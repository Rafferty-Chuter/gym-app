/**
 * POST /api/ingest/hae — Health Auto Export pushes Apple Health here
 * (06-execution Sprint 0, S5). Bearer token = the device token the user
 * pasted into the app; only its hash is stored. The body is parsed with
 * `parseHaePayload` and upserted per (device, metric, day), so "Since Last
 * Sync" replays are no-ops. A sleep row is merged with the night already
 * stored for its day (`mergeNight`, S11), so a night split across two
 * uploads adds up and a later partial upload never replaces a fuller
 * night. A day's workouts are merged the same way (IN8): an upload since
 * the last sync carries only the new one. Values are never logged.
 */

import { NextResponse } from "next/server";
import { parseHaePayload, sampleValue, type HealthSample } from "@/lib/health/hae";
import { mergeNight, type StoredNight } from "@/lib/health/sleepMerge";
import { mergeWorkoutDay, workoutsFromValue } from "@/lib/health/extras";
import { bearerToken, hashToken, listDayRows, listSleepRows, supabaseConfig, touchDevice, upsertSamples, type SampleRow } from "@/lib/server/supabaseRest";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

/** Vercel rejects bodies over 4.5 MB; aggregated exports are far smaller. */
const MAX_BYTES = 4_000_000;
/** One request carries at most this many samples. OURS. */
const MAX_SAMPLES = 5000;

/**
 * One stored row. `received_at` is set on every write, not only the first,
 * so a day sent again (a manual re-export after a fix) reaches the phone's
 * next pull, which asks for rows received since its last one.
 */
function toRow(deviceHash: string, s: HealthSample, receivedAt: string): SampleRow {
  return { device_hash: deviceHash, metric: s.kind, day: s.day, value: sampleValue(s), source: s.source, received_at: receivedAt };
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
    // One row per (metric, day): the last in the payload wins, as the upsert would, except sleep,
    // which is merged with the stored night and with any other part of it in this payload.
    const byKey = new Map<string, SampleRow>();
    const receivedAt = new Date().toISOString();
    const sleepDays = [...new Set(samples.filter((s) => s.kind === "sleep").map((s) => s.day))];
    const stored = new Map((await listSleepRows(cfg, deviceHash, sleepDays)).map((r) => [r.day, r.value as StoredNight] as const));
    const workoutDays = [...new Set(samples.filter((s) => s.kind === "workouts").map((s) => s.day))];
    const storedWorkouts = new Map((await listDayRows(cfg, deviceHash, "workouts", workoutDays)).map((r) => [r.day, workoutsFromValue(r.value)] as const));
    for (const s of samples) {
      const row = toRow(deviceHash, s, receivedAt);
      const key = `${row.metric}|${row.day}`;
      if (row.metric === "sleep") {
        const before = (byKey.get(key)?.value as StoredNight | undefined) ?? stored.get(row.day) ?? null;
        row.value = mergeNight(before, row.value as StoredNight);
      } else if (s.kind === "workouts") {
        const before = workoutsFromValue(byKey.get(key)?.value) ?? storedWorkouts.get(row.day) ?? null;
        row.value = { workouts: mergeWorkoutDay(before, s.workouts) };
      }
      byKey.set(key, row);
    }
    await upsertSamples(cfg, [...byKey.values()]);
    return NextResponse.json({ received: byKey.size });
  } catch (e) {
    console.error(`[ingest/hae] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
