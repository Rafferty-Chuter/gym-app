/**
 * Gaps stated plainly (06-execution Sprint 0, W2): which of the last
 * GAP_LOOKBACK_DAYS days have no food logged, no weigh-in or no night, as
 * sentences a tab can show with a one-tap fix. Pure.
 *
 * Rules, all OURS:
 * - Today is never a gap. The day is not over, and the Today strip already
 *   offers the three actions for it.
 * - A kind has gaps only from its first record onward, so someone who has
 *   never weighed in sees no weigh-in gaps; the tab's own empty state covers
 *   that. A fasting day and a day with an edited total count as logged.
 * - When every day in the window is a gap for one kind, one line says so
 *   instead of seven.
 * - Sentences state what is missing and nothing else: no streaks, no nudges.
 */

import { addDays, dateRange, dayDiff, weekday, type LocalDate } from "@/lib/dates";
import { dailyIntake, entriesByDate } from "@/lib/physique/intake";
import { weighInsByDate } from "@/lib/physique/weight";
import { nightsByDate } from "@/lib/physique/sleep";
import type { DayFlags, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

/** Days before today that count as fixable. Older gaps are history. OURS. */
export const GAP_LOOKBACK_DAYS = 7;

export type GapKind = "food" | "weight" | "sleep";
export type Gap = { kind: GapKind; date: LocalDate };

/**
 * One row for a tab. `count` is 1 for a single day, or the whole window
 * when the kind has nothing logged in it; `date` is then the newest gap.
 */
export type GapLine = { kind: GapKind; date: LocalDate; text: string; count: number };

export type GapInputs = {
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  weighIns: readonly WeighIn[];
  sleepNights: readonly SleepNight[];
};

const KIND_ORDER: Record<GapKind, number> = { food: 0, weight: 1, sleep: 2 };
const ALL_KINDS: readonly GapKind[] = ["food", "weight", "sleep"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function earliest(dates: Iterable<LocalDate>): LocalDate | null {
  let first: LocalDate | null = null;
  for (const d of dates) if (first == null || d < first) first = d;
  return first;
}

/** The window: the GAP_LOOKBACK_DAYS days before today, ascending. */
export function gapWindow(today: LocalDate): LocalDate[] {
  return dateRange(addDays(today, -GAP_LOOKBACK_DAYS), addDays(today, -1));
}

/** Gaps in the window, newest first, food before weight before sleep on the same day. */
export function findGaps(inputs: GapInputs, today: LocalDate, kinds: readonly GapKind[] = ALL_KINDS): Gap[] {
  const days = gapWindow(today);
  const out: Gap[] = [];

  if (kinds.includes("food")) {
    const byDate = entriesByDate(inputs.foodEntries);
    const flagged = Object.values(inputs.dayFlags)
      .filter((f) => f.status === "fasting" || typeof f.kcalOverride === "number")
      .map((f) => f.date);
    const first = earliest([...byDate.keys(), ...flagged]);
    if (first != null) {
      for (const d of days) {
        if (d < first) continue;
        if (dailyIntake(d, byDate.get(d) ?? [], inputs.dayFlags[d]).status === "unlogged") out.push({ kind: "food", date: d });
      }
    }
  }

  if (kinds.includes("weight")) {
    const byDate = weighInsByDate(inputs.weighIns);
    const first = earliest(byDate.keys());
    if (first != null) for (const d of days) if (d >= first && !byDate.has(d)) out.push({ kind: "weight", date: d });
  }

  if (kinds.includes("sleep")) {
    const byDate = nightsByDate(inputs.sleepNights);
    const first = earliest(byDate.keys());
    if (first != null) for (const d of days) if (d >= first && !byDate.has(d)) out.push({ kind: "sleep", date: d });
  }

  return out.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
}

/**
 * "Yesterday", a weekday name inside the week, or "Last Friday" for the day
 * a week ago, which would otherwise read as today.
 */
export function gapDayWord(date: LocalDate, today: LocalDate): string {
  const ago = dayDiff(date, today);
  if (ago === 1) return "Yesterday";
  const name = DAY_NAMES[weekday(date)];
  return ago >= 7 ? `Last ${name}` : name;
}

const NOUN: Record<GapKind, string> = { food: "food logged", weight: "weigh-in", sleep: "sleep logged" };
const NONE: Record<GapKind, string> = { food: "No food logged", weight: "No weigh-ins", sleep: "No sleep logged" };

export function gapSentence(gap: Gap, today: LocalDate): string {
  return `${gapDayWord(gap.date, today)} has no ${NOUN[gap.kind]}`;
}

/** Sentences for the rows: one per gap, or one per kind when the whole window is empty for it. */
export function gapLines(gaps: readonly Gap[], today: LocalDate): GapLine[] {
  const window = GAP_LOOKBACK_DAYS;
  const single: GapLine[] = [];
  const whole: GapLine[] = [];
  for (const kind of ALL_KINDS) {
    const ofKind = gaps.filter((g) => g.kind === kind);
    if (ofKind.length === 0) continue;
    if (ofKind.length >= window) {
      whole.push({ kind, date: ofKind[0].date, text: `${NONE[kind]} in the last ${window} days`, count: ofKind.length });
    } else {
      for (const g of ofKind) single.push({ kind, date: g.date, text: gapSentence(g, today), count: 1 });
    }
  }
  single.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
  return [...single, ...whole];
}

/** Where a gap is fixed from Home. */
export function gapHref(line: GapLine): string {
  const path = line.kind === "food" ? "/food" : line.kind === "weight" ? "/body" : "/sleep";
  return `${path}?date=${line.date}`;
}
