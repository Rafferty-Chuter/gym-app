"use client";

import { useState } from "react";
import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { disableReminders, enableReminders, pushSupport, setReminderTime, usePushLink, type PushError, type PushSupport } from "@/lib/physique/io/pushLink";
import { DEFAULT_REMINDER_HHMM, buildGapSummary } from "@/lib/physique/reminder";

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

/**
 * Profile → Reminders (G5, restyled in CL1): one notification a day at a
 * chosen time, only when a day is missing. A switch, a time, and the
 * exact reason when it cannot.
 */
export default function RemindersSection() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const link = usePushLink();
  const [busy, setBusy] = useState(false);
  // A plain read of the browser's capabilities; only after hydration so the server and first client render agree.
  const support: PushSupport | null = hydrated ? pushSupport() : null;

  const enabled = link?.enabled === true;
  const time = link?.reminderHHMM ?? DEFAULT_REMINDER_HHMM;
  const summary = () => buildGapSummary({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, sleepNights: data.sleepNights }, now?.today ?? "");
  const nowIso = () => new Date().toISOString();

  async function toggle() {
    if (!now || busy) return;
    setBusy(true);
    if (enabled) await disableReminders();
    else await enableReminders(time, summary(), nowIso());
    setBusy(false);
  }

  const err = errorCopy(link?.lastError);
  const iosNote = support && support.ios && !support.standalone && !enabled ? errorCopy("needs_home_screen") : null;

  return (
    <section className="flex flex-col gap-2" aria-label="Reminders">
      <Caption>Reminders</Caption>
      <RowGroup>
        <Row
          label="Daily reminder"
          sub={enabled ? "On. Only when a day is missing." : "Off"}
          value={
            <button type="button" role="switch" aria-checked={enabled} aria-label={enabled ? "Turn reminders off" : "Turn reminders on"} onClick={toggle} disabled={!hydrated || busy || !now} className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50" style={{ background: enabled ? "#00e5b0" : "#2a2a2e" }}>
              <span className="absolute top-0.5 h-6 w-6 rounded-full transition-transform" style={{ left: 2, background: enabled ? "#0a0a0b" : "#f2f2f0", transform: enabled ? "translateX(20px)" : "translateX(0)" }} />
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
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{2}:\d{2}$/.test(v) && now) void setReminderTime(v, summary(), nowIso());
              }}
              className="h-9 rounded-[10px] px-2 text-[13px] outline-none"
              style={{ background: "#1d1d20", color: "#f2f2f0", border: "1px solid #2a2a2e" }}
              aria-label="Reminder time"
            />
          }
        />
      </RowGroup>
      <p className="text-[11px]" style={{ color: err || iosNote ? "#f5b544" : "#6f6f76" }}>
        {err ?? iosNote ?? "It names the day and what is missing, nothing else."}
      </p>
    </section>
  );
}
