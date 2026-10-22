"use client";

import { useState } from "react";
import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { disableReminders, enableReminders, pushSupport, setReminderTime, usePushLink, type PushError, type PushSupport } from "@/lib/physique/io/pushLink";
import { DEFAULT_REMINDER_HHMM, buildGapSummary } from "@/lib/physique/reminder";
import { isNativeApp } from "@/lib/nativeApp";
import { deviceClock, disableNativeReminders, enableNativeReminders, setNativeReminderTime, useNativeReminders, type NativeReminderError } from "@/lib/physique/io/nativeReminders";

function errorCopy(e: PushError | null | undefined): string | null {
  switch (e) {
    case "unsupported":
      return "This browser cannot show notifications.";
    case "needs_home_screen":
      return "On iPhone, add the app to the Home Screen first (Share → Add to Home Screen), then open it from there.";
    case "denied":
      return "Notifications are blocked for this site. Allow them in the browser settings, then try again.";
    case "subscribe_failed":
      return "The browser could not set up push.";
    case "not_configured":
      return "The server has no push keys yet.";
    case "network":
      return "Could not reach the server.";
    case "server":
      return "The server could not save this device.";
    case "expired":
      return "The server dropped this device. Turn reminders on again.";
    default:
      return null;
  }
}

function nativeErrorCopy(e: NativeReminderError | null | undefined): string | null {
  if (e === "denied") return "Notifications are off for Gym AI. Turn them on in Settings → Notifications → Gym AI, then try again.";
  if (e === "failed") return "Couldn't set the reminder on this phone.";
  return null;
}

/**
 * Profile → Reminders (G5, restyled in CL1, today only since B2): one
 * notification a day at a chosen time, only when today is missing its
 * weigh-in (morning) or food (from noon). Off until turned on. A switch, a
 * time, and the exact reason when it cannot. In the iPhone app the phone
 * schedules them itself (TR11); in a browser the server sends a web push.
 */
export default function RemindersSection() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const link = usePushLink();
  const nativeSettings = useNativeReminders();
  const [busy, setBusy] = useState(false);
  const native = hydrated && isNativeApp();
  // A plain read of the browser's capabilities; only after hydration so the server and first client render agree.
  const support: PushSupport | null = hydrated ? pushSupport() : null;

  const enabled = native ? nativeSettings?.enabled === true : link?.enabled === true;
  const time = (native ? nativeSettings?.reminderHHMM : link?.reminderHHMM) ?? DEFAULT_REMINDER_HHMM;
  const summary = () => buildGapSummary({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, sleepNights: data.sleepNights }, now?.today ?? "");
  const nowIso = () => new Date().toISOString();

  async function toggle() {
    if (!now || busy) return;
    setBusy(true);
    if (native) {
      if (enabled) await disableNativeReminders();
      else await enableNativeReminders(time, summary(), deviceClock(now.today));
    } else if (enabled) await disableReminders();
    else await enableReminders(time, summary(), nowIso());
    setBusy(false);
  }

  function changeTime(v: string) {
    if (!/^\d{2}:\d{2}$/.test(v) || !now) return;
    if (native) void setNativeReminderTime(v, summary(), deviceClock(now.today));
    else void setReminderTime(v, summary(), nowIso());
  }

  const err = native ? nativeErrorCopy(nativeSettings?.lastError) : errorCopy(link?.lastError);
  const iosNote = !native && support && support.ios && !support.standalone && !enabled ? errorCopy("needs_home_screen") : null;

  return (
    <section className="flex flex-col gap-2" aria-label="Reminders">
      <Caption>Reminders</Caption>
      <RowGroup>
        <Row
          label="Daily reminder"
          sub={enabled ? "On. Only when today is missing something." : "Off"}
          value={
            <button type="button" role="switch" aria-checked={enabled} aria-label={enabled ? "Turn reminders off" : "Turn reminders on"} onClick={toggle} disabled={!hydrated || busy || !now} className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: enabled ? "var(--primary)" : "var(--border-strong)" }}>
              <span className="absolute top-0.5 h-6 w-6 rounded-full transition-transform" style={{ left: 2, background: enabled ? "var(--text-on-primary)" : "var(--surface)", transform: enabled ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          }
        />
        <Row
          label="Time"
          sub="Monday's opens the week report."
          value={
            <input
              type="time"
              value={time}
              step={900}
              disabled={!hydrated || busy}
              onChange={(e) => changeTime(e.target.value)}
              className="h-9 rounded-[10px] px-2 text-[13px] outline-none"
              style={{ background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
              aria-label="Reminder time"
            />
          }
        />
      </RowGroup>
      <p className="text-[11px]" style={{ color: err || iosNote ? "var(--status-watch)" : "var(--text-tertiary)" }}>
        {err ?? iosNote ?? "Before noon it checks for a weigh-in, from noon for food. Days you already logged stay quiet."}
      </p>
    </section>
  );
}
