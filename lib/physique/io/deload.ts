"use client";

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import type { LocalDate } from "@/lib/dates";
import type { DeloadReason, DeloadRecord } from "@/lib/training/deload";

/** The deload in progress or the last one started (T6). In backups. */
export const deloadStore = createSingleton<DeloadRecord>("physique.v1.deload");

export function useDeload(): DeloadRecord | null {
  return useSingleton(deloadStore);
}

export async function startDeload(today: LocalDate, reason: DeloadReason, nowIso: string): Promise<void> {
  await deloadStore.set({ startDate: today, reason, startedAt: nowIso });
}

/** Ending early moves the start back so the window has already closed; the record still marks the block boundary. */
export async function endDeload(today: LocalDate): Promise<void> {
  const cur = await deloadStore.get();
  if (!cur) return;
  const ended = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10) as LocalDate;
  await deloadStore.set({ ...cur, startDate: cur.startDate < ended ? cur.startDate : ended });
}
