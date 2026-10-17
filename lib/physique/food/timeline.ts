/**
 * Food timeline helpers (05-design §9.4): one day's entries bucketed by
 * local hour, hour totals, and the hour-range setting. Pure: the caller
 * passes the entries, the date and the timezone.
 */

import type { FoodEntry } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";

export type MacroSums = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type HourBucket = { hour: number; entries: FoodEntry[]; totals: MacroSums };

export type DayTimeline = { hours: HourBucket[]; totals: MacroSums; entries: number };

/** Timeline hour range shown by default (MacroFactor's default is 6 to 23). OURS. */
export const DEFAULT_HOUR_START = 6;
export const DEFAULT_HOUR_END = 23;

export type HourRange = { start: number; end: number };

export const ZERO: MacroSums = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function sumMacros(entries: readonly Pick<FoodEntry, "kcal" | "proteinG" | "carbsG" | "fatG">[]): MacroSums {
  const out = { ...ZERO };
  for (const e of entries) {
    out.kcal += Number.isFinite(e.kcal) ? e.kcal : 0;
    out.proteinG += Number.isFinite(e.proteinG) ? e.proteinG : 0;
    out.carbsG += Number.isFinite(e.carbsG) ? e.carbsG : 0;
    out.fatG += Number.isFinite(e.fatG) ? e.fatG : 0;
  }
  return out;
}

/** Energy implied by the macros alone (Atwater 4/9/4), for the "Macro sum is N kcal" line. PUB. */
export function macroKcal(m: Pick<MacroSums, "proteinG" | "carbsG" | "fatG">): number {
  return Math.round(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9);
}

/** `HH:MM` for an ISO instant in `tz`; null when the instant is malformed. */
export function localClock(iso: string, tz: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const h = get("hour") === "24" ? "00" : get("hour");
    return `${h}:${get("minute")}`;
  } catch {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

/** The meal time of an entry: its `time` when set, else the local clock of `loggedAt`. */
export function entryClock(entry: FoodEntry, tz: string): string {
  if (entry.time && /^\d{2}:\d{2}$/.test(entry.time)) return entry.time;
  return localClock(entry.loggedAt, tz) ?? "12:00";
}

export function entryHour(entry: FoodEntry, tz: string): number {
  return Number(entryClock(entry, tz).slice(0, 2));
}

/**
 * One day's entries by hour over [range.start, range.end]. Entries outside
 * the range are clamped to the first or last hour so nothing is hidden.
 * Within an hour, entries keep their clock order then logging order.
 */
export function dayTimeline(entries: readonly FoodEntry[], date: LocalDate, tz: string, range: HourRange = { start: DEFAULT_HOUR_START, end: DEFAULT_HOUR_END }): DayTimeline {
  const start = Math.max(0, Math.min(23, Math.floor(range.start)));
  const end = Math.max(start, Math.min(23, Math.floor(range.end)));
  const hours: HourBucket[] = [];
  for (let h = start; h <= end; h++) hours.push({ hour: h, entries: [], totals: { ...ZERO } });
  const day = entries
    .filter((e) => e.date === date)
    .map((e) => ({ e, clock: entryClock(e, tz) }))
    .sort((a, b) => (a.clock < b.clock ? -1 : a.clock > b.clock ? 1 : a.e.loggedAt < b.e.loggedAt ? -1 : 1));
  for (const { e, clock } of day) {
    const h = Math.min(end, Math.max(start, Number(clock.slice(0, 2))));
    hours[h - start].entries.push(e);
  }
  for (const b of hours) b.totals = sumMacros(b.entries);
  return { hours, totals: sumMacros(day.map((d) => d.e)), entries: day.length };
}

/** "06:00" style label for an hour row. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** The nearest whole hour to a clock, used to preselect the logger's time chip. */
export function hourFromClock(clock: string): number {
  const h = Number(clock.slice(0, 2));
  const m = Number(clock.slice(3, 5));
  return Number.isFinite(h) ? Math.min(23, h + (m >= 30 ? 1 : 0)) : 12;
}

/** "640 kcal · 45P 12F 60C" (grams rounded). */
export function macroLine(m: MacroSums, withKcal = true): string {
  const macros = `${Math.round(m.proteinG)}P ${Math.round(m.fatG)}F ${Math.round(m.carbsG)}C`;
  return withKcal ? `${Math.round(m.kcal).toLocaleString("en-GB")} kcal · ${macros}` : macros;
}
