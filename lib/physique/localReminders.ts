/**
 * The daily reminder in the iPhone app (TR11). Pure.
 *
 * The app's web view has no web push, so the phone schedules the reminder
 * itself: one a day at the chosen time for the next LOCAL_REMINDER_DAYS,
 * by the same rules as the server push (`lib/physique/reminder.ts`): the
 * weekly report on Mondays, otherwise only what that day is missing, and
 * only for a habit logged in the days before. The app plans again each
 * time it opens and after each change, so a day already logged drops its
 * reminder; a day the app is never opened keeps it, which is the point.
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { isReportDay, parseHHMM, reminderMessage, todayMissing, type GapSummary } from "@/lib/physique/reminder";

/**
 * Days ahead the phone holds reminders for. OURS: a week covers the gap
 * between opens for anyone still using the app, and someone who stops
 * opening it hears for a week at most (the server push goes quiet after
 * SUMMARY_MAX_AGE_DAYS). Well under iOS's 64 pending notifications.
 */
export const LOCAL_REMINDER_DAYS = 7;

export type PlannedReminder = {
  /** Stable per day (yyyymmdd), so planning again replaces rather than adds. */
  id: number;
  day: LocalDate;
  hhmm: string;
  title: string;
  body: string;
  /** Where a tap opens. */
  url: string;
};

/** The notification id for a day: 2026-10-22 → 20261022 (fits iOS's 32-bit ids). */
export function reminderId(day: LocalDate): number {
  return Number(day.replace(/-/g, ""));
}

/**
 * The reminders to hold from now: one per day at `reminderHHMM`, today
 * included only while its time is still ahead. Empty for an unusable time.
 */
export function planLocalReminders(summary: GapSummary, today: LocalDate, nowMinutes: number, reminderHHMM: string, days: number = LOCAL_REMINDER_DAYS): PlannedReminder[] {
  const at = parseHHMM(reminderHHMM);
  if (at == null) return [];
  const out: PlannedReminder[] = [];
  for (let k = 0; k < days; k++) {
    if (k === 0 && nowMinutes >= at) continue;
    const day = addDays(today, k);
    const msg = reminderMessage(todayMissing(summary, day, reminderHHMM), day, { weekly: isReportDay(day) });
    if (msg) out.push({ id: reminderId(day), day, hhmm: reminderHHMM, ...msg });
  }
  return out;
}
