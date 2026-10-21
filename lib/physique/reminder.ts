/**
 * The daily reminder, about today only (06-execution Sprint 0, G5; B2). Pure.
 *
 * The phone cannot wake itself, so the server sends at most one push a day
 * at the user's chosen time, and only when today is missing the one thing
 * that time of day is for: a weigh-in in the morning, food from noon. It
 * never names earlier days. The server never sees the records: the phone
 * uploads a summary (which of the last few days have food, a weigh-in, a
 * night, and the first date of each kind), and `todayMissing` reads it.
 *
 * Copy rule: the notification says what today is missing, nothing else.
 * No streaks, no encouragement, no second notification. Off until the
 * user turns it on in Profile.
 */

import { addDays, dateRange, isLocalDate, weekday, type LocalDate } from "@/lib/dates";
import { GAP_LOOKBACK_DAYS, type GapInputs } from "@/lib/physique/gaps";
import { dailyIntake, entriesByDate } from "@/lib/physique/intake";
import { weighInsByDate } from "@/lib/physique/weight";
import { nightsByDate } from "@/lib/physique/sleep";

export type LoggedDays = { food: LocalDate[]; weight: LocalDate[]; sleep: LocalDate[] };
export type FirstDays = { food: LocalDate | null; weight: LocalDate | null; sleep: LocalDate | null };
export type GapSummary = { logged: LoggedDays; first: FirstDays };

/** Days of logged dates carried in a summary: the gap window, today, and one spare for clock drift. OURS. */
export const SUMMARY_DAYS = GAP_LOOKBACK_DAYS + 2;
/** A summary older than this means the phone has not opened the app; say nothing rather than guess. OURS. */
export const SUMMARY_MAX_AGE_DAYS = 14;
/** The push goes out within this many minutes after the chosen time; later than that the day is skipped. OURS. */
export const REMINDER_WINDOW_MIN = 120;
/** Morning, when a weigh-in is due (the trend assumes one taken on waking). OURS. */
export const DEFAULT_REMINDER_HHMM = "09:00";
/**
 * Before this local time the reminder asks about the weigh-in, from it about
 * food. OURS: weigh-ins belong to the morning, and a day only has food worth
 * asking about once a meal is likely to have been eaten.
 */
export const REMINDER_FOOD_FROM_MIN = 12 * 60;
/**
 * A kind is only asked about when it was logged on one of this many days
 * before today. OURS: the reminder follows a habit the user has; it does not
 * start one they dropped or never had.
 */
export const REMINDER_HABIT_DAYS = GAP_LOOKBACK_DAYS;

function earliest(dates: Iterable<LocalDate>): LocalDate | null {
  let first: LocalDate | null = null;
  for (const d of dates) if (first == null || d < first) first = d;
  return first;
}

/** What the phone uploads: logged days in the recent window and the first record of each kind. */
export function buildGapSummary(inputs: GapInputs, today: LocalDate): GapSummary {
  const days = dateRange(addDays(today, -(SUMMARY_DAYS - 1)), today);
  const byDate = entriesByDate(inputs.foodEntries);
  const flagged = Object.values(inputs.dayFlags)
    .filter((f) => f.status === "fasting" || typeof f.kcalOverride === "number")
    .map((f) => f.date);
  const weights = weighInsByDate(inputs.weighIns);
  const nights = nightsByDate(inputs.sleepNights);
  return {
    logged: {
      food: days.filter((d) => dailyIntake(d, byDate.get(d) ?? [], inputs.dayFlags[d]).status !== "unlogged"),
      weight: days.filter((d) => weights.has(d)),
      sleep: days.filter((d) => nights.has(d)),
    },
    first: { food: earliest([...byDate.keys(), ...flagged]), weight: earliest(weights.keys()), sleep: earliest(nights.keys()) },
  };
}

/** Stable string for change detection on the phone. */
export function summaryKey(s: GapSummary): string {
  return JSON.stringify({ l: { f: s.logged.food, w: s.logged.weight, s: s.logged.sleep }, f: s.first });
}

/** Add days another source knows about (Apple Health rows on the server). */
export function withLoggedDays(s: GapSummary, extra: { weight?: readonly LocalDate[]; sleep?: readonly LocalDate[] }): GapSummary {
  const merge = (a: readonly LocalDate[], b: readonly LocalDate[] | undefined) => [...new Set([...a, ...(b ?? [])])].sort();
  const weight = merge(s.logged.weight, extra.weight);
  const sleep = merge(s.logged.sleep, extra.sleep);
  return {
    logged: { ...s.logged, weight, sleep },
    first: { ...s.first, weight: earliest([...(s.first.weight ? [s.first.weight] : []), ...weight]), sleep: earliest([...(s.first.sleep ? [s.first.sleep] : []), ...sleep]) },
  };
}

export type ReminderKind = "weight" | "food";

/**
 * What today is missing at the chosen time: the weigh-in before
 * REMINDER_FOOD_FROM_MIN, food from it, each only for a habit the summary
 * shows in the REMINDER_HABIT_DAYS before today. Null when nothing is.
 */
export function todayMissing(s: GapSummary, today: LocalDate, reminderHHMM: string): ReminderKind | null {
  const at = parseHHMM(reminderHHMM);
  if (at == null) return null;
  const kind: ReminderKind = at < REMINDER_FOOD_FROM_MIN ? "weight" : "food";
  const logged = kind === "weight" ? s.logged.weight : s.logged.food;
  if (logged.includes(today)) return null;
  const from = addDays(today, -REMINDER_HABIT_DAYS);
  return logged.some((d) => d >= from && d < today) ? kind : null;
}

/** Local day and minutes since midnight in `tz` at `nowIso`; null when either is unusable. */
export function localClock(nowIso: string, tz: string): { day: LocalDate; minutes: number } | null {
  const t = Date.parse(nowIso);
  if (!Number.isFinite(t)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    const hour = Number(get("hour")) % 24;
    const minute = Number(get("minute"));
    if (!isLocalDate(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { day, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

export function parseHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export type DueInput = { tz: string; reminderHHMM: string; lastRunDay: string | null };

/** Once a day, from the chosen time until REMINDER_WINDOW_MIN later. `day` is the device's local day. */
export function dueNow(d: DueInput, nowIso: string): { due: boolean; day: LocalDate | null } {
  const clock = localClock(nowIso, d.tz);
  const at = parseHHMM(d.reminderHHMM);
  if (!clock || at == null) return { due: false, day: null };
  if (d.lastRunDay === clock.day) return { due: false, day: clock.day };
  const diff = clock.minutes - at;
  return { due: diff >= 0 && diff < REMINDER_WINDOW_MIN, day: clock.day };
}

export type ReminderMessage = { title: string; body: string; url: string };

/** Monday: the one day the reminder opens last week's report instead of a gap. OURS. */
export function isReportDay(day: LocalDate): boolean {
  return weekday(day) === 1;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 to 18 Oct", or "28 Sep to 4 Oct" across a month end. */
export function shortRange(start: LocalDate, end: LocalDate): string {
  const d = (k: LocalDate) => Number(k.slice(8, 10));
  const m = (k: LocalDate) => MONTHS[Number(k.slice(5, 7)) - 1] ?? "";
  return m(start) === m(end) ? `${d(start)} to ${d(end)} ${m(end)}` : `${d(start)} ${m(start)} to ${d(end)} ${m(end)}`;
}

/**
 * The notification, or null when nothing is sent. On the report day the
 * weekly report goes out instead, whatever today holds: its title names the
 * week, its body what the report holds, and it opens the report.
 */
export function reminderMessage(missing: ReminderKind | null, today: LocalDate, opts: { weekly?: boolean } = {}): ReminderMessage | null {
  if (opts.weekly) {
    // No numbers leave the phone (the server only knows which days were logged), so the push says what is inside.
    const start = addDays(today, -7);
    return { title: `Weekly report · ${shortRange(start, addDays(today, -1))}`, body: "Your week in numbers, and next week's targets.", url: `/report?week=${start}` };
  }
  if (missing === "weight") return { title: "Today", body: "No weigh-in yet.", url: `/body?date=${today}` };
  if (missing === "food") return { title: "Today", body: "Nothing logged yet.", url: "/food" };
  return null;
}
