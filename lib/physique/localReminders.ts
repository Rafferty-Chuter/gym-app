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
 *
 * IN11: Monday's report leads with the biggest fact not yet seen, and a
 * new link, drinking read or stall gets one notification of its own, a
 * week apart at most (`lib/physique/spottedNews.ts`).
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { isReportDay, parseHHMM, reminderMessage, todayMissing, type GapSummary } from "@/lib/physique/reminder";
import { newsAllowedFrom } from "@/lib/physique/spottedNews";

/**
 * Days ahead the phone holds reminders for. OURS: a week covers the gap
 * between opens for anyone still using the app, and someone who stops
 * opening it hears for a week at most (the server push goes quiet after
 * SUMMARY_MAX_AGE_DAYS). Well under iOS's 64 pending notifications.
 */
export const LOCAL_REMINDER_DAYS = 7;

export type PlannedReminder = {
  /** A day's reminder, or IN11's news. */
  kind: "reminder" | "news";
  /** Stable per day (yyyymmdd; news offset by NEWS_ID_OFFSET), so planning again replaces rather than adds. */
  id: number;
  day: LocalDate;
  hhmm: string;
  title: string;
  body: string;
  /** Where a tap opens. */
  url: string;
  /** News: the fact it tells. */
  factKey?: string;
};

/** What IN11 adds to the plan: Monday's lead, the week's fact, and the days news already went out. */
export type PlanNews = { lead: string | null; fact: { key: string; line: string } | null; sent: readonly LocalDate[] };

/** News ids sit this far above the day's reminder id, so the two never meet. OURS. */
export const NEWS_ID_OFFSET = 10_000_000;

/** The notification id for a day: 2026-10-22 → 20261022 (fits iOS's 32-bit ids). */
export function reminderId(day: LocalDate): number {
  return Number(day.replace(/-/g, ""));
}

/** The news notification's id for a day: 2026-10-22 → 30261022. */
export function newsId(day: LocalDate): number {
  return reminderId(day) + NEWS_ID_OFFSET;
}

/** True for ids this app schedules (a day's reminder or its news); anything else pending is someone else's. */
export function isOurNotification(id: number): boolean {
  return (id >= 20000101 && id <= 29991231) || (id >= 20000101 + NEWS_ID_OFFSET && id <= 29991231 + NEWS_ID_OFFSET);
}

/**
 * The reminders to hold from now: one per day at `reminderHHMM`, today
 * included only while its time is still ahead. Empty for an unusable time.
 * With `news` (IN11), Monday's report leads with its fact, and the week's
 * fact goes out once at the reminder time on the first day allowed: not a
 * Monday (the report carries it), NEWS_GAP_DAYS after the last one sent.
 */
export function planLocalReminders(summary: GapSummary, today: LocalDate, nowMinutes: number, reminderHHMM: string, days: number = LOCAL_REMINDER_DAYS, news?: PlanNews): PlannedReminder[] {
  const at = parseHHMM(reminderHHMM);
  if (at == null) return [];
  const out: PlannedReminder[] = [];
  const allowed = news?.fact ? newsAllowedFrom(news.sent, today) : null;
  let told = false;
  for (let k = 0; k < days; k++) {
    if (k === 0 && nowMinutes >= at) continue;
    const day = addDays(today, k);
    const weekly = isReportDay(day);
    const msg = reminderMessage(todayMissing(summary, day, reminderHHMM), day, { weekly, lead: news?.lead ?? null });
    if (msg) out.push({ kind: "reminder", id: reminderId(day), day, hhmm: reminderHHMM, ...msg });
    if (news?.fact && allowed && !told && !weekly && day >= allowed) {
      out.push({ kind: "news", id: newsId(day), day, hhmm: reminderHHMM, title: "Spotted", body: news.fact.line, url: "/body", factKey: news.fact.key });
      told = true;
    }
  }
  return out;
}
