/**
 * Reminders on gaps only (06-execution Sprint 0, G5). Pure.
 *
 * The phone cannot wake itself, so the server sends one push a day at the
 * user's chosen time, and only when the W2 gap rules find something
 * missing. The server never sees the records: the phone uploads a
 * summary (which of the last few days have food, a weigh-in, a night, and
 * the first date of each kind), and `gapsFromSummary` turns it back into
 * synthetic records so `findGaps` applies exactly the same rules.
 *
 * Copy rule: the notification names the day and what is missing, nothing
 * else. No streaks, no encouragement, no second notification.
 */

import { addDays, dateRange, isLocalDate, weekday, type LocalDate } from "@/lib/dates";
import { GAP_LOOKBACK_DAYS, findGaps, gapHref, gapLines, type Gap, type GapInputs } from "@/lib/physique/gaps";
import { dailyIntake, entriesByDate } from "@/lib/physique/intake";
import { weighInsByDate } from "@/lib/physique/weight";
import { nightsByDate } from "@/lib/physique/sleep";
import type { FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

export type LoggedDays = { food: LocalDate[]; weight: LocalDate[]; sleep: LocalDate[] };
export type FirstDays = { food: LocalDate | null; weight: LocalDate | null; sleep: LocalDate | null };
export type GapSummary = { logged: LoggedDays; first: FirstDays };

/** Days of logged dates carried in a summary: the gap window, today, and one spare for clock drift. OURS. */
export const SUMMARY_DAYS = GAP_LOOKBACK_DAYS + 2;
/** A summary older than this means the phone has not opened the app; say nothing rather than guess. OURS. */
export const SUMMARY_MAX_AGE_DAYS = 14;
/** The push goes out within this many minutes after the chosen time; later than that the day is skipped. OURS. */
export const REMINDER_WINDOW_MIN = 120;
/** Morning, after the gap day is over and before the day fills up. OURS. */
export const DEFAULT_REMINDER_HHMM = "09:00";
/** Sentences in one notification; the rest is a count. OURS. */
export const REMINDER_MAX_LINES = 3;

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

/** Synthetic records with the same dates, so the W2 rules run unchanged. */
export function gapsFromSummary(s: GapSummary, today: LocalDate): Gap[] {
  const rec = (date: LocalDate, id: string) => ({ id, date, loggedAt: `${date}T00:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
  const days = (list: readonly LocalDate[], first: LocalDate | null): LocalDate[] => {
    const set = new Set(list.filter(isLocalDate));
    if (first && isLocalDate(first)) set.add(first);
    return [...set];
  };
  const foodEntries: FoodEntry[] = days(s.logged.food, s.first.food).map((d) => ({ ...rec(d, `f-${d}`), label: "logged", kcal: 1, proteinG: 0, carbsG: 0, fatG: 0, method: "quick" }));
  const weighIns: WeighIn[] = days(s.logged.weight, s.first.weight).map((d) => ({ ...rec(d, `w-${d}`), kg: 1 }));
  const sleepNights: SleepNight[] = days(s.logged.sleep, s.first.sleep).map((d) => ({ ...rec(d, `n-${d}`), asleepMin: 1 }));
  return findGaps({ foodEntries, dayFlags: {}, weighIns, sleepNights }, today);
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
 * The notification, or null when nothing is missing (then nothing is sent).
 * On the report day the week report goes out whatever the gaps: its title
 * names the week, its body the gap count and the first sentences, and it
 * opens the report. The gap sentences keep the same rules on both days.
 */
export function reminderMessage(gaps: readonly Gap[], today: LocalDate, opts: { weekly?: boolean } = {}): ReminderMessage | null {
  const lines = gapLines(gaps, today);
  const shown = lines.slice(0, REMINDER_MAX_LINES).map((l) => l.text);
  const more = lines.length - shown.length;
  const sentences = more > 0 ? `${shown.join("\n")}\n${more} more` : shown.join("\n");
  if (opts.weekly) {
    const start = addDays(today, -7);
    const count = lines.length === 0 ? "Nothing missing" : `${lines.length} ${lines.length === 1 ? "gap" : "gaps"}`;
    return { title: `Week report · ${shortRange(start, addDays(today, -1))}`, body: lines.length === 0 ? count : `${count}\n${sentences}`, url: `/report?week=${start}` };
  }
  if (lines.length === 0) return null;
  return { title: "Not logged", body: sentences, url: gapHref(lines[0]) };
}
