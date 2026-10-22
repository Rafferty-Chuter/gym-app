"use client";

import { useEffect, useMemo, useRef } from "react";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { buildGapSummary, summaryKey } from "@/lib/physique/reminder";
import { cancelNativeReminders, deviceClock, listenForReminderTaps, rescheduleNativeReminders, useNativeReminders } from "@/lib/physique/io/nativeReminders";

/** Wait this long after a change before planning again, so a burst of logging plans once. OURS. */
const SETTLE_MS = 1000;

/**
 * Keeps the iPhone app's reminders current (TR11): plans them again when
 * the log changes (a weigh-in drops today's), when the switch or time
 * changes, and on coming back to the app (a new day). Opens the right
 * screen when a reminder is tapped. Mounted by NativeShell in the app only;
 * renders nothing.
 */
export default function NativeReminderSync() {
  const now = useNow();
  const data = useBodyData();
  const settings = useNativeReminders();
  const today = now?.today ?? null;
  const summary = useMemo(
    () => (today ? buildGapSummary({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, sleepNights: data.sleepNights }, today) : null),
    [today, data.foodEntries, data.dayFlags, data.weighIns, data.sleepNights],
  );
  const key = summary ? summaryKey(summary) : null;
  const enabled = settings?.enabled === true;
  const hhmm = settings?.reminderHHMM;

  // The latest summary for the visibility handler, without re-subscribing on every change.
  const latest = useRef<{ summary: typeof summary; today: typeof today }>({ summary, today });
  useEffect(() => {
    latest.current = { summary, today };
  }, [summary, today]);

  useEffect(() => {
    let off: (() => void) | null = null;
    let gone = false;
    void listenForReminderTaps()
      .then((remove) => {
        if (gone) remove();
        else off = remove;
      })
      .catch(() => {});
    return () => {
      gone = true;
      off?.();
    };
  }, []);

  // Off, or the device's data was cleared (no settings at all): nothing of ours stays scheduled.
  useEffect(() => {
    if (!enabled) void cancelNativeReminders();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !summary || !today) return;
    const t = window.setTimeout(() => void rescheduleNativeReminders(summary, deviceClock(today)), SETTLE_MS);
    return () => window.clearTimeout(t);
    // `key` stands for the summary's content; a new object with the same days needs no new plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hhmm, key, today]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      const { summary: s, today: d } = latest.current;
      if (document.visibilityState === "visible" && s && d) void rescheduleNativeReminders(s, deviceClock(d));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);

  return null;
}
