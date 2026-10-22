/**
 * Say it first (IN11, 08-insights.md): what Spotted found that the person
 * hasn't seen yet, for Monday's report notification and one notification
 * a week at most. A fact is seen once Spotted has shown it on Progress or
 * the report; it is news again only after NEWS_FORGET_DAYS of not being
 * shown, so a lift that stalls again months later is told again. Pure: the
 * state lives on the device (`lib/physique/io/spottedNews.ts`) and nothing
 * leaves the phone.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { parseHHMM } from "@/lib/physique/reminder";
import type { SpottedItem, SpottedKind } from "@/lib/physique/spotted";

// ── Thresholds ──

/** Days between two news notifications at least. OURS (08 IN11): one a week at most; more is noise people turn off. */
export const NEWS_GAP_DAYS = 7;
/** Days a shown fact stays seen without being shown again. OURS: six weeks; a fact still there is shown each time Progress opens, so only one that went away is forgotten. */
export const NEWS_FORGET_DAYS = 42;
/** The kinds a notification is for (08 IN11): a new link or a stalled lift. Scale jumps are daily water and E1's findings are already a weekly read. */
export const NEWS_KINDS: ReadonlySet<SpottedKind> = new Set(["link", "stuck"]);

/**
 * Facts about drinking stay in the app: a notification's text shows on the
 * lock screen, where anyone near the phone can read it. OURS (IN11); they
 * still lead Progress and the report.
 */
export function lockScreenSafe(s: SpottedItem): boolean {
  return s.kind !== "alcohol" && s.key !== "link:alcohol";
}

// ── State ──

/** Each fact's key and the last day it was shown; the days a news notification was planned for. */
export type NewsState = { shown: Record<string, LocalDate>; sent: LocalDate[] };

export const EMPTY_NEWS: NewsState = { shown: {}, sent: [] };

/** The state after Spotted showed `keys` on `today`; keys forgotten long ago are dropped. */
export function withShown(s: NewsState, keys: readonly string[], today: LocalDate): NewsState {
  const shown: Record<string, LocalDate> = {};
  for (const [k, d] of Object.entries(s.shown)) if (dayDiff(d, today) < NEWS_FORGET_DAYS) shown[k] = d;
  for (const k of keys) shown[k] = today;
  return { ...s, shown };
}

/** Keys shown within NEWS_FORGET_DAYS of `today`. */
export function seenKeys(s: NewsState, today: LocalDate): Set<string> {
  return new Set(Object.entries(s.shown).filter(([, d]) => dayDiff(d, today) < NEWS_FORGET_DAYS).map(([k]) => k));
}

/**
 * Planned news days that have gone off: before today, or today once the
 * reminder time has passed. Later ones were only planned, and are planned
 * again each time.
 */
export function sentBefore(s: NewsState, today: LocalDate, nowMinutes: number, reminderHHMM: string): LocalDate[] {
  const at = parseHHMM(reminderHHMM) ?? 0;
  return s.sent.filter((d) => d < today || (d === today && nowMinutes >= at));
}

// ── Picking ──

/** Monday's notification leads with the biggest fact not yet seen, else the biggest; drinking left out (`lockScreenSafe`); null with none. */
export function leadFact(spots: readonly SpottedItem[], seen: ReadonlySet<string>): SpottedItem | null {
  const safe = spots.filter(lockScreenSafe);
  return safe.find((s) => !seen.has(s.key)) ?? safe[0] ?? null;
}

/** The week's one notification: the biggest unseen link or stall, drinking left out; null with none. */
export function newsFact(spots: readonly SpottedItem[], seen: ReadonlySet<string>): SpottedItem | null {
  return spots.find((s) => NEWS_KINDS.has(s.kind) && lockScreenSafe(s) && !seen.has(s.key)) ?? null;
}

/** The finding and its first number: "Squat flat for 7 sessions · Est. 1RM 140 kg since 1 Sep". */
export function newsLine(s: SpottedItem): string {
  const first = s.detail.split(" · ")[0]?.trim();
  return first ? `${s.title} · ${first}` : s.title;
}

/** The first day from `from` a news notification may go on: NEWS_GAP_DAYS after the last one sent. */
export function newsAllowedFrom(sent: readonly LocalDate[], from: LocalDate): LocalDate {
  const last = [...sent].sort().at(-1);
  if (!last) return from;
  const next = addDays(last, NEWS_GAP_DAYS);
  return next > from ? next : from;
}
