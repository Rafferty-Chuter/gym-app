"use client";

import { useEffect, useMemo, useRef } from "react";
import { useNow } from "@/lib/ui/useToday";
import { useUnit } from "@/lib/unit-preference";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { spottedNewsStore } from "@/lib/physique/io/spottedNews";
import { useSingleton } from "@/lib/storage/useStored";
import { spottedFor } from "@/lib/physique/spottedFor";
import { buildGapSummary, summaryKey } from "@/lib/physique/reminder";
import { cancelNativeReminders, deviceClock, listenForReminderTaps, rescheduleNativeReminders, useNativeReminders } from "@/lib/physique/io/nativeReminders";

/** Wait this long after a change before planning again, so a burst of logging plans once. OURS. */
const SETTLE_MS = 1000;

/**
 * Keeps the iPhone app's reminders current (TR11): plans them again when
 * the log changes (a weigh-in drops today's), when the switch or time
 * changes, and on coming back to the app (a new day). Opens the right
 * screen when a reminder is tapped. Mounted by NativeShell in the app only;
 * renders nothing. IN11: it reads what Spotted would show today, so
 * Monday's report leads with a fact and a new one gets told once.
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

  // IN11: the records Spotted reads; it runs only when a plan is made (after the settle, or on return), never during render, since the engines read up to a year.
  const workouts = useWorkouts();
  const expenditure = useExpenditure(now);
  const { unit } = useUnit();
  // A fact seen on Progress or the report since the last plan drops out of the planned news; only the set of keys matters (the sent days change with each plan).
  const news = useSingleton(spottedNewsStore);
  const seenKey = news ? Object.keys(news.shown).sort().join("|") : "";

  // The latest records for the timers and the visibility handler, without re-subscribing on every change.
  const latest = useRef({ summary, now, data, workouts, expenditure, unit });
  useEffect(() => {
    latest.current = { summary, now, data, workouts, expenditure, unit };
  }, [summary, now, data, workouts, expenditure, unit]);

  /** Plan again from the latest records: what Spotted would show today, then the reminders. */
  function planNow() {
    const { summary: s, now: n, data: d, workouts: w, expenditure: e, unit: u } = latest.current;
    if (!s || !n) return;
    const p = getPhysiqueProfileSync();
    const spots = spottedFor({ ...d, workouts: w, expenditure: e?.series ?? null, profile: { sex: p.sex, age: p.age, heightCm: p.heightCm } }, n, u === "lb" ? "lb" : "kg");
    void rescheduleNativeReminders(s, deviceClock(n.today), spots);
  }

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
    const t = window.setTimeout(planNow, SETTLE_MS);
    return () => window.clearTimeout(t);
    // `key` stands for the summary's content and `seenKey` for what Spotted showed; the records themselves are read from `latest` when the plan is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hhmm, key, today, seenKey, data, workouts, expenditure, unit]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") planNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);

  return null;
}
