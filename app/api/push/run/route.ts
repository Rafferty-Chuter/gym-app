/**
 * GET /api/push/run — the hourly scheduler for reminders (Sprint 0, G5).
 * Called by Supabase pg_cron (supabase/migrations/0002_push.sql) with the
 * CRON_SECRET. For each device whose local time has just passed its
 * chosen time today, rebuild the gaps from its summary (plus any Apple
 * Health days the server holds) and send one push only if something is
 * missing. Quiet days send nothing.
 *
 * This route is the one place the server's clock decides anything: it is
 * the scheduler, and each device's "today" is read in its own time zone.
 * Nothing here logs a value.
 */

import { NextResponse } from "next/server";
import { addDays, dayDiff } from "@/lib/dates";
import { GAP_LOOKBACK_DAYS } from "@/lib/physique/gaps";
import { SUMMARY_MAX_AGE_DAYS, dueNow, gapsFromSummary, reminderMessage, withLoggedDays } from "@/lib/physique/reminder";
import { deletePushDevice, listHealthDays, listPushDevices, patchPushDevice, supabaseConfig, type PushDeviceRow } from "@/lib/server/supabaseRest";
import { cronAuthorized, sendPush, vapidConfig, type PushSubscriptionJson } from "@/lib/server/push";
import { asSummary } from "@/lib/server/pushSchemas";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";
export const dynamic = "force-dynamic";

/** Devices whose push service keeps failing are dropped after this many days. OURS. */
export const MAX_FAILURES = 5;

function subscriptionOf(v: unknown): PushSubscriptionJson | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== "string" || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export type RunReport = { checked: number; due: number; sent: number; quiet: number; removed: number; skipped: number };

async function runDevice(cfg: NonNullable<ReturnType<typeof supabaseConfig>>, vapid: NonNullable<ReturnType<typeof vapidConfig>>, d: PushDeviceRow, nowIso: string, report: RunReport): Promise<void> {
  const { due, day } = dueNow({ tz: d.tz, reminderHHMM: d.reminder_hhmm, lastRunDay: d.last_run_day }, nowIso);
  if (!due || !day) return;
  report.due++;
  const summary = asSummary(d.summary);
  const sub = subscriptionOf(d.subscription);
  const stale = !d.summary_at || dayDiff(d.summary_at.slice(0, 10), day) > SUMMARY_MAX_AGE_DAYS;
  if (!summary || !sub || stale) {
    report.skipped++;
    await patchPushDevice(cfg, d.device_hash, { last_run_day: day });
    return;
  }
  let merged = summary;
  if (d.health_hash) {
    const rows = await listHealthDays(cfg, d.health_hash, addDays(day, -(GAP_LOOKBACK_DAYS + 1)));
    merged = withLoggedDays(summary, { sleep: rows.filter((r) => r.metric === "sleep").map((r) => r.day), weight: rows.filter((r) => r.metric === "weight").map((r) => r.day) });
  }
  const message = reminderMessage(gapsFromSummary(merged, day), day);
  if (!message) {
    report.quiet++;
    await patchPushDevice(cfg, d.device_hash, { last_run_day: day });
    return;
  }
  const r = await sendPush(vapid, sub, { ...message, tag: "gaps" });
  if (r.ok) {
    report.sent++;
    await patchPushDevice(cfg, d.device_hash, { last_run_day: day, failures: 0 });
    return;
  }
  const failures = (d.failures ?? 0) + 1;
  if (r.gone || failures >= MAX_FAILURES) {
    report.removed++;
    await deletePushDevice(cfg, d.device_hash);
  } else {
    report.skipped++;
    await patchPushDevice(cfg, d.device_hash, { last_run_day: day, failures });
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = supabaseConfig();
  const vapid = vapidConfig();
  if (!cfg || !vapid) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const nowIso = new Date().toISOString();
  const report: RunReport = { checked: 0, due: 0, sent: 0, quiet: 0, removed: 0, skipped: 0 };
  try {
    const devices = await listPushDevices(cfg);
    report.checked = devices.length;
    for (const d of devices) {
      try {
        await runDevice(cfg, vapid, d, nowIso, report);
      } catch (e) {
        report.skipped++;
        console.error(`[push/run] device failed: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    return NextResponse.json(report);
  } catch (e) {
    console.error(`[push/run] ${e instanceof Error ? e.message : "failed"}`);
    return NextResponse.json({ error: "storage_failed", ...report }, { status: 502 });
  }
}
