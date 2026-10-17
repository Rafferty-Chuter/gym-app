"use client";

import { useEffect } from "react";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { syncSummary, usePushLink } from "@/lib/physique/io/pushLink";
import { buildGapSummary, summaryKey } from "@/lib/physique/reminder";

/** Wait this long after the last change before telling the server. OURS. */
export const SYNC_DEBOUNCE_MS = 1500;

/**
 * Keeps the server's gap summary current while reminders are on (Sprint 0,
 * G5). Mounted once in the layout; renders nothing. Sends only when the
 * summary changed, so filling a gap on any tab cancels tomorrow's reminder.
 */
export default function ReminderSync() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const link = usePushLink();
  const data = useBodyData();
  const enabled = link?.enabled === true;
  const today = now?.today ?? null;
  const key = hydrated && enabled && today ? summaryKey(buildGapSummary({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, sleepNights: data.sleepNights }, today)) : null;

  useEffect(() => {
    if (!key || !today) return;
    const id = window.setTimeout(() => {
      void syncSummary(buildGapSummary({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, sleepNights: data.sleepNights }, today), new Date().toISOString());
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // `key` captures the data; the data object itself only matters when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, today]);

  return null;
}
