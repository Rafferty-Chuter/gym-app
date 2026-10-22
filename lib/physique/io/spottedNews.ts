/**
 * What Spotted has shown on this phone, and the days a news notification
 * was planned for (IN11). Device-only: not backed up, not synced, never
 * sent; the rules are pure in `lib/physique/spottedNews.ts`.
 *
 * Each write reads the stored state and writes it back in the same tick
 * (the store's snapshot and set are synchronous underneath), so Spotted
 * marking what it showed and the reminders recording a sent day never
 * overwrite each other.
 */

import type { LocalDate } from "@/lib/dates";
import { createSingleton } from "@/lib/storage/repo";
import { EMPTY_NEWS, withShown, type NewsState } from "@/lib/physique/spottedNews";

export const spottedNewsStore = createSingleton<NewsState>("physique.v1.spottedNews");

/** The stored state, or empty when there is none (or it can't be read). */
export function readNews(): NewsState {
  if (typeof window === "undefined") return EMPTY_NEWS;
  try {
    const s = spottedNewsStore.snapshot();
    return s && typeof s.shown === "object" && s.shown !== null && Array.isArray(s.sent) ? s : EMPTY_NEWS;
  } catch {
    return EMPTY_NEWS;
  }
}

/** Spotted showed these facts today: they are seen, so no notification tells them. */
export async function markSpottedShown(keys: readonly string[], today: LocalDate): Promise<void> {
  if (typeof window === "undefined" || keys.length === 0) return;
  try {
    const s = readNews();
    if (keys.every((k) => s.shown[k] === today)) return;
    await spottedNewsStore.set(withShown(s, keys, today));
  } catch {
    // Seen-state is a convenience; a failed write only means a fact may be told once more.
  }
}

/** The news days that went off, plus the one just planned (the last eight are plenty for a week's gap). */
export async function saveNewsSent(sent: readonly LocalDate[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const s = readNews();
    await spottedNewsStore.set({ ...s, sent: [...new Set(sent)].sort().slice(-8) });
  } catch {
    // As above.
  }
}
