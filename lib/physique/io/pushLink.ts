"use client";

/**
 * This phone's reminder link (Sprint 0, G5): a device token, the push
 * subscription registered with the server, the chosen time, and the last
 * summary sent. The server keeps only the token's hash, the subscription
 * and the summary of which days are logged; never the records.
 */

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { healthLinkStore, randomToken } from "@/lib/physique/io/healthLink";
import { DEFAULT_REMINDER_HHMM, summaryKey, type GapSummary } from "@/lib/physique/reminder";

export type PushError = "unsupported" | "needs_home_screen" | "denied" | "subscribe_failed" | "not_configured" | "network" | "server" | "expired";

export type PushLink = {
  token: string;
  createdAt: string;
  enabled: boolean;
  reminderHHMM: string;
  endpoint?: string;
  lastSyncAt?: string;
  lastSummaryKey?: string;
  lastError?: PushError | null;
};

export const pushLinkStore = createSingleton<PushLink>("physique.v1.pushLink");

/** Re-send an unchanged summary this often so the server knows the phone is alive. OURS. */
export const SUMMARY_REFRESH_MS = 6 * 60 * 60 * 1000;

export function usePushLink(): PushLink | null {
  return useSingleton(pushLinkStore);
}

export type PushSupport = { supported: boolean; ios: boolean; standalone: boolean; permission: NotificationPermission | "unsupported" };

/** What this browser can do. iPhones need the home-screen install before push exists at all. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, ios: false, standalone: false, permission: "unsupported" };
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  let standalone = nav.standalone === true;
  try {
    standalone = standalone || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    // matchMedia missing: not standalone.
  }
  const supported = "serviceWorker" in nav && "PushManager" in window && "Notification" in window;
  return { supported, ios, standalone, permission: supported ? Notification.permission : "unsupported" };
}

function vapidPublicKey(): string | null {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return k && k.length > 60 ? k : null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function fresh(nowIso: string): PushLink {
  return { token: randomToken(), createdAt: nowIso, enabled: false, reminderHHMM: DEFAULT_REMINDER_HHMM };
}

type ServerResult = { ok: true } | { ok: false; error: PushError };

async function call(path: string, method: "POST" | "DELETE", token: string, body?: unknown): Promise<ServerResult> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, error: "network" };
  }
  if (res.ok) return { ok: true };
  if (res.status === 503) return { ok: false, error: "not_configured" };
  if (res.status === 404) return { ok: false, error: "expired" };
  return { ok: false, error: "server" };
}

async function healthToken(): Promise<string | null> {
  const h = await healthLinkStore.get();
  return h?.token ?? null;
}

export type EnableResult = { ok: true } | { ok: false; error: PushError };

/** Ask for permission, subscribe this browser, and register it with the server. */
export async function enableReminders(reminderHHMM: string, summary: GapSummary, nowIso: string): Promise<EnableResult> {
  const cur = (await pushLinkStore.get()) ?? fresh(nowIso);
  const fail = async (error: PushError): Promise<EnableResult> => {
    await pushLinkStore.set({ ...cur, enabled: false, reminderHHMM, lastError: error });
    return { ok: false, error };
  };
  const sup = pushSupport();
  if (!sup.supported) return fail(sup.ios && !sup.standalone ? "needs_home_screen" : "unsupported");
  const key = vapidPublicKey();
  if (!key) return fail("not_configured");
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = "denied";
  }
  if (permission !== "granted") return fail("denied");
  let sub: PushSubscription;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const reg = await navigator.serviceWorker.ready;
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  } catch {
    return fail("subscribe_failed");
  }
  const r = await call("/api/push/subscribe", "POST", cur.token, { subscription: sub.toJSON(), tz: deviceTz(), reminderHHMM, summary, healthToken: await healthToken() });
  if (!r.ok) return fail(r.error);
  await pushLinkStore.set({ ...cur, enabled: true, reminderHHMM, endpoint: sub.endpoint, lastSyncAt: nowIso, lastSummaryKey: summaryKey(summary), lastError: null });
  return { ok: true };
}

/** Unsubscribe this browser and drop the server row. The token stays so turning it back on is quick. */
export async function disableReminders(): Promise<void> {
  const cur = await pushLinkStore.get();
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    // The browser side can fail without the server side mattering.
  }
  if (cur?.token) await call("/api/push/subscribe", "DELETE", cur.token);
  if (cur) await pushLinkStore.set({ ...cur, enabled: false, endpoint: undefined, lastError: null });
}

/** Send the summary when it changed, or when the last one is older than SUMMARY_REFRESH_MS. */
export async function syncSummary(summary: GapSummary, nowIso: string, force = false): Promise<void> {
  const cur = await pushLinkStore.get();
  if (!cur?.enabled) return;
  const key = summaryKey(summary);
  const stale = !cur.lastSyncAt || Date.parse(nowIso) - Date.parse(cur.lastSyncAt) > SUMMARY_REFRESH_MS;
  if (!force && key === cur.lastSummaryKey && !stale) return;
  const r = await call("/api/push/summary", "POST", cur.token, { tz: deviceTz(), reminderHHMM: cur.reminderHHMM, summary, healthToken: await healthToken() });
  if (r.ok) await pushLinkStore.set({ ...cur, lastSyncAt: nowIso, lastSummaryKey: key, lastError: null });
  else if (r.error === "expired") await pushLinkStore.set({ ...cur, enabled: false, lastError: "expired" });
  else await pushLinkStore.set({ ...cur, lastError: r.error });
}

/** Change the time; when on, the server learns it with the next summary. */
export async function setReminderTime(reminderHHMM: string, summary: GapSummary, nowIso: string): Promise<void> {
  const cur = (await pushLinkStore.get()) ?? fresh(nowIso);
  await pushLinkStore.set({ ...cur, reminderHHMM });
  if (cur.enabled) await syncSummary(summary, nowIso, true);
}
