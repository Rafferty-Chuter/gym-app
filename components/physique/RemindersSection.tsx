"use client";

import { useState } from "react";
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
 * Profile → Reminders (Sprint 0, G5): one notification a day at a chosen
 * time, only when a day is missing. States what it does, the time, and
 * whether it is on. Nothing else.
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
    if (!now) return;
    setBusy(true);
    if (enabled) await disableReminders();
    else await enableReminders(time, summary(), nowIso());
    setBusy(false);
  }

  const err = errorCopy(link?.lastError);
  const iosNote = support && support.ios && !support.standalone && !enabled ? errorCopy("needs_home_screen") : null;
  const status = !hydrated ? " " : enabled ? `On · ${time}` : "Off";

  return (
    <section className="mt-8 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5" aria-labelledby="reminders-heading">
      <p id="reminders-heading" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">
        Reminders
      </p>
      <p className="text-sm text-zinc-400 mb-4">One notification a day, only when a day is missing. It names the day and what is missing, nothing else.</p>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-4 py-3">
          <span className="text-sm font-semibold text-white">Status</span>
          <span className="text-sm text-zinc-300" style={{ fontVariantNumeric: "tabular-nums" }}>
            {status}
          </span>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-4 py-3">
          <span className="text-sm font-semibold text-white">Time</span>
          <input
            type="time"
            value={time}
            step={900}
            disabled={!hydrated || busy}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{2}:\d{2}$/.test(v) && now) void setReminderTime(v, summary(), nowIso());
            }}
            className="rounded-lg bg-zinc-800 px-2 py-1 text-sm text-white"
            aria-label="Reminder time"
          />
        </label>
        <button
          type="button"
          onClick={toggle}
          disabled={!hydrated || busy || !now}
          className="flex w-full items-center justify-center rounded-xl border border-zinc-600/60 bg-zinc-800/60 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-700/60 disabled:opacity-50"
        >
          {busy ? "Working…" : enabled ? "Turn off" : "Turn on"}
        </button>
        {(err || iosNote) && <p className="text-xs text-zinc-400">{err ?? iosNote}</p>}
      </div>
    </section>
  );
}
