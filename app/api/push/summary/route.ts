/**
 * POST /api/push/summary — the phone's current gap summary and settings
 * (Sprint 0, G5), sent whenever they change. 404 when the device is not
 * registered any more, so the phone can turn reminders off.
 */

import { NextResponse } from "next/server";
import { bearerToken, hashToken, patchPushDevice, supabaseConfig } from "@/lib/server/supabaseRest";
import { settingsSchema } from "@/lib/server/pushSchemas";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

const MAX_BYTES = 64_000;

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
  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;
  try {
    const found = await patchPushDevice(cfg, hashToken(token), {
      tz: b.tz,
      reminder_hhmm: b.reminderHHMM,
      summary: b.summary,
      summary_at: new Date().toISOString(),
      health_hash: b.healthToken ? hashToken(b.healthToken) : null,
    });
    if (!found) return NextResponse.json({ error: "not_registered" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[push/summary] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
