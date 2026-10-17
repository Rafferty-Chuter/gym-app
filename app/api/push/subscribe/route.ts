/**
 * POST /api/push/subscribe — register this phone for reminders (Sprint 0,
 * G5): its push subscription, time zone, chosen time and gap summary.
 * DELETE — drop it. Bearer token = the device token from
 * `lib/physique/io/pushLink.ts`; only its hash is stored.
 */

import { NextResponse } from "next/server";
import { bearerToken, deletePushDevice, hashToken, supabaseConfig, upsertPushDevice } from "@/lib/server/supabaseRest";
import { vapidConfig } from "@/lib/server/push";
import { subscribeSchema } from "@/lib/server/pushSchemas";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

const MAX_BYTES = 64_000;

export async function POST(request: Request): Promise<Response> {
  const cfg = supabaseConfig();
  if (!cfg || !vapidConfig()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
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
  const parsed = subscribeSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;
  try {
    await upsertPushDevice(cfg, {
      device_hash: hashToken(token),
      subscription: { endpoint: b.subscription.endpoint, keys: b.subscription.keys },
      tz: b.tz,
      reminder_hhmm: b.reminderHHMM,
      summary: b.summary,
      summary_at: new Date().toISOString(),
      health_hash: b.healthToken ? hashToken(b.healthToken) : null,
      failures: 0,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[push/subscribe] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const cfg = supabaseConfig();
  if (!cfg) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await deletePushDevice(cfg, hashToken(token));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[push/subscribe] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
