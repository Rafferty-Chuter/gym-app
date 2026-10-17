/**
 * Server-only push helpers (Sprint 0, G5): VAPID keys from the
 * environment, the cron secret check, and one send through `web-push`.
 * Never logs the subscription or the payload (CLAUDE.md rule 10).
 */

import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** `Authorization: Bearer <CRON_SECRET>` from the scheduler; false when the secret is unset. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  const given = Buffer.from(m?.[1]?.trim() ?? "", "utf8");
  const want = Buffer.from(secret, "utf8");
  return given.length === want.length && timingSafeEqual(given, want);
}

export type PushSubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string } };

export type SendResult = { ok: true } | { ok: false; status: number | null; gone: boolean };

/** Push services keep an undelivered reminder for this long. OURS. */
export const PUSH_TTL_SECONDS = 3 * 60 * 60;

export async function sendPush(vapid: VapidConfig, subscription: PushSubscriptionJson, payload: unknown): Promise<SendResult> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { vapidDetails: vapid, TTL: PUSH_TTL_SECONDS, urgency: "normal" });
    return { ok: true };
  } catch (e) {
    const status = typeof (e as { statusCode?: unknown })?.statusCode === "number" ? ((e as { statusCode: number }).statusCode as number) : null;
    return { ok: false, status, gone: status === 404 || status === 410 };
  }
}
