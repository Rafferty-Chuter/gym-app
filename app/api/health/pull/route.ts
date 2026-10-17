/**
 * GET /api/health/pull — the app fetches what Health Auto Export sent
 * since its last pull (06-execution Sprint 0, S5). Bearer token as on
 * ingest. Returns the device's status and the new samples, oldest first.
 */

import { NextResponse } from "next/server";
import { bearerToken, getDevice, hashToken, listSamples, supabaseConfig, touchDevice } from "@/lib/server/supabaseRest";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

export async function GET(request: Request): Promise<Response> {
  const cfg = supabaseConfig();
  if (!cfg) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const since = new URL(request.url).searchParams.get("since");
  const sinceIso = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
  const deviceHash = hashToken(token);
  try {
    const device = await getDevice(cfg, deviceHash);
    if (!device) {
      await touchDevice(cfg, deviceHash, {});
      return NextResponse.json({ device: { registered: true, lastPayloadAt: null, samples: 0 }, samples: [] });
    }
    await touchDevice(cfg, deviceHash, {});
    const samples = await listSamples(cfg, deviceHash, sinceIso);
    return NextResponse.json({ device: { registered: true, lastPayloadAt: device.last_payload_at, samples: device.samples }, samples });
  } catch (e) {
    console.error(`[health/pull] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
