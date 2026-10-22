"use client";

/**
 * Reminders in the iPhone app (TR11): the phone schedules them itself with
 * local notifications, since the app's web view has no web push. The plan
 * is pure (`lib/physique/localReminders.ts`); this file holds the switch and
 * the time on the device, asks iOS for permission, and replaces the pending
 * reminders with the current plan. No server, nothing leaves the phone.
 *
 * The plugin is loaded by dynamic import so the web bundle never carries
 * it, and destructured from the awaited module each time (a Capacitor
 * plugin object is a thenable proxy; returning it from an async function
 * would await it).
 */

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { isNativeApp } from "@/lib/nativeApp";
import { DEFAULT_REMINDER_HHMM, type GapSummary } from "@/lib/physique/reminder";
import { LOCAL_REMINDER_DAYS, isOurNotification, planLocalReminders, type PlanNews } from "@/lib/physique/localReminders";
import { leadFact, newsFact, newsLine, seenKeys, sentBefore } from "@/lib/physique/spottedNews";
import { readNews, saveNewsSent } from "@/lib/physique/io/spottedNews";
import type { SpottedItem } from "@/lib/physique/spotted";
import type { LocalDate } from "@/lib/dates";

export type NativeReminderError = "denied" | "failed";

export type NativeReminderSettings = {
  enabled: boolean;
  reminderHHMM: string;
  /** Why the last attempt didn't schedule, for the Profile line. */
  lastError?: NativeReminderError | null;
};

/** The switch and time on this phone. Device-only: not in backups, not synced. */
export const nativeRemindersStore = createSingleton<NativeReminderSettings>("physique.v1.nativeReminders");

export function useNativeReminders(): NativeReminderSettings | null {
  return useSingleton(nativeRemindersStore);
}

/** What the plan needs about now: the device's local day and minutes since midnight. */
export type ReminderClock = { today: LocalDate; minutes: number };

export function deviceClock(today: LocalDate, at: Date = new Date()): ReminderClock {
  return { today, minutes: at.getHours() * 60 + at.getMinutes() };
}

/** The device-local moment for a day and HH:MM. */
function localMoment(day: LocalDate, hhmm: string): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

async function save(next: NativeReminderSettings): Promise<void> {
  await nativeRemindersStore.set(next);
}

async function cancelOurs(): Promise<void> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter((n) => isOurNotification(n.id)).map((n) => ({ id: n.id }));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours });
}

/** IN11: Monday's lead and the week's fact from what Spotted found, leaving out what it has already shown. */
function newsFor(spots: readonly SpottedItem[], clock: ReminderClock, reminderHHMM: string): PlanNews {
  const state = readNews();
  const seen = seenKeys(state, clock.today);
  const lead = leadFact(spots, seen);
  const fact = newsFact(spots, seen);
  return { lead: lead?.title ?? null, fact: fact ? { key: fact.key, line: newsLine(fact) } : null, sent: sentBefore(state, clock.today, clock.minutes, reminderHHMM) };
}

/**
 * Replace the pending reminders with the plan for now. Does nothing in a
 * browser or when the switch is off; records "denied" when iOS has
 * notifications turned off for the app. With `spots` (IN11), Monday's
 * report leads with a fact and a new one gets its notification.
 */
export async function rescheduleNativeReminders(summary: GapSummary, clock: ReminderClock, spots?: readonly SpottedItem[]): Promise<void> {
  if (!isNativeApp()) return;
  const settings = await nativeRemindersStore.get();
  if (!settings?.enabled) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      if (settings.lastError !== "denied") await save({ ...settings, lastError: "denied" });
      return;
    }
    await cancelOurs();
    const news = spots ? newsFor(spots, clock, settings.reminderHHMM) : undefined;
    const plan = planLocalReminders(summary, clock.today, clock.minutes, settings.reminderHHMM, LOCAL_REMINDER_DAYS, news);
    if (plan.length) {
      await LocalNotifications.schedule({
        notifications: plan.map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: localMoment(p.day, p.hhmm), allowWhileIdle: true }, extra: { url: p.url } })),
      });
    }
    // The days news went off, and the one now planned: the next waits a week from it.
    if (news) await saveNewsSent([...news.sent, ...plan.filter((p) => p.kind === "news").map((p) => p.day)]);
    if (settings.lastError) await save({ ...settings, lastError: null });
  } catch {
    await save({ ...settings, lastError: "failed" });
  }
}

/** Turn reminders on: ask iOS (the system prompt shows once), then schedule. */
export async function enableNativeReminders(reminderHHMM: string, summary: GapSummary, clock: ReminderClock): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") {
      await save({ enabled: false, reminderHHMM, lastError: "denied" });
      return;
    }
  } catch {
    await save({ enabled: false, reminderHHMM, lastError: "failed" });
    return;
  }
  await save({ enabled: true, reminderHHMM, lastError: null });
  await rescheduleNativeReminders(summary, clock);
}

/** Cancel what this app has scheduled, e.g. when the switch is off or the device's data was cleared. */
export async function cancelNativeReminders(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await cancelOurs();
  } catch {
    // Nothing pending, or the plugin isn't there: nothing to undo.
  }
}

export async function disableNativeReminders(): Promise<void> {
  const settings = await nativeRemindersStore.get();
  await save({ enabled: false, reminderHHMM: settings?.reminderHHMM ?? DEFAULT_REMINDER_HHMM, lastError: null });
  await cancelNativeReminders();
}

export async function setNativeReminderTime(reminderHHMM: string, summary: GapSummary, clock: ReminderClock): Promise<void> {
  const settings = await nativeRemindersStore.get();
  await save({ enabled: settings?.enabled ?? false, reminderHHMM, lastError: settings?.lastError ?? null });
  await rescheduleNativeReminders(summary, clock);
}

/** A tap on a reminder opens what it is about (the weigh-in, the food log, the report). Returns the unsubscribe. */
export async function listenForReminderTaps(): Promise<() => void> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const handle = await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    const url = (action.notification.extra as { url?: unknown } | undefined)?.url;
    if (typeof url === "string" && url.startsWith("/")) window.location.assign(url);
  });
  return () => void handle.remove();
}
