/**
 * Logger "Recent" ranking (05-design §9.4): go-tos for the hour being
 * logged, then the latest foods. Pure; the caller passes entries, saved
 * foods, the hour and the timezone.
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { entryHour } from "@/lib/physique/food/timeline";
import type { FoodEntry, SavedFood } from "@/lib/physique/types";

/** Go-tos look back 60 days of entries. OURS. */
export const GO_TO_LOOKBACK_DAYS = 60;
/** An entry counts for an hour when logged within ±1 hour of it. OURS. */
export const GO_TO_HOUR_SLACK = 1;
/** A food needs at least two logs near the hour to be a go-to. OURS. */
export const GO_TO_MIN_COUNT = 2;

export type RecentLists = { goTos: SavedFood[]; latest: SavedFood[] };

/**
 * Go-tos: saved foods logged ≥ GO_TO_MIN_COUNT times within ±GO_TO_HOUR_SLACK
 * of `hour` in the last GO_TO_LOOKBACK_DAYS, most frequent first. Latest:
 * the remaining saved foods by last use.
 */
export function recentLists(
  entries: readonly FoodEntry[],
  saved: readonly SavedFood[],
  hour: number,
  today: LocalDate,
  tz: string,
  limit = 8
): RecentLists {
  const from = addDays(today, -GO_TO_LOOKBACK_DAYS);
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!e.savedFoodId || e.date < from || e.date > today) continue;
    const h = entryHour(e, tz);
    const diff = Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour));
    if (diff > GO_TO_HOUR_SLACK) continue;
    counts.set(e.savedFoodId, (counts.get(e.savedFoodId) ?? 0) + 1);
  }
  const byId = new Map(saved.map((s) => [s.id, s]));
  const goTos = [...counts.entries()]
    .filter(([id, n]) => n >= GO_TO_MIN_COUNT && byId.has(id))
    .sort((a, b) => b[1] - a[1] || ((byId.get(a[0])?.lastUsedAt ?? "") < (byId.get(b[0])?.lastUsedAt ?? "") ? 1 : -1))
    .slice(0, limit)
    .map(([id]) => byId.get(id) as SavedFood);
  const goToIds = new Set(goTos.map((g) => g.id));
  const latest = [...saved]
    .filter((s) => !goToIds.has(s.id))
    .sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0))
    .slice(0, limit);
  return { goTos, latest };
}

/** Case-insensitive substring match on the label, for the Saved tab's filter. */
export function filterSaved(saved: readonly SavedFood[], query: string): SavedFood[] {
  const q = query.trim().toLowerCase();
  const list = q ? saved.filter((s) => s.label.toLowerCase().includes(q)) : [...saved];
  return list.sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)) || b.useCount - a.useCount || (a.lastUsedAt < b.lastUsedAt ? 1 : -1));
}
