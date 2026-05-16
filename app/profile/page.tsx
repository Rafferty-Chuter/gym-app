"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUnit } from "@/lib/unit-preference";
import { downloadAllWorkoutsCsv } from "@/lib/exportWorkoutsCsv";
import {
  loadOnboardingProfile,
  saveOnboardingProfile,
  type OnboardingProfile,
} from "@/lib/onboardingProfile";
import {
  OnboardingProfileFields,
  isOnboardingFormSavable,
} from "@/app/components/OnboardingProfileFields";
import {
  getRestTimerSettings,
  REST_TIMER_SETTINGS_EVENT,
  setRestTimerSettings,
  type RestTimerSettings,
} from "@/lib/restTimerSettings";

export default function ProfilePage() {
  const { unit, setUnit } = useUnit();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile>(() => {
    const existing = loadOnboardingProfile();
    return existing ?? { units: unit === "lb" ? "lb" : "kg" };
  });
  const [onboardingSaved, setOnboardingSaved] = useState(false);
  const onboardingCanSave = isOnboardingFormSavable(onboardingProfile);

  const [restNotify, setRestNotify] = useState<RestTimerSettings>(() => getRestTimerSettings());
  useEffect(() => {
    function sync() {
      setRestNotify(getRestTimerSettings());
    }
    window.addEventListener(REST_TIMER_SETTINGS_EVENT, sync);
    return () => window.removeEventListener(REST_TIMER_SETTINGS_EVENT, sync);
  }, []);
  function toggleRestNotify(key: keyof RestTimerSettings) {
    const next = { ...restNotify, [key]: !restNotify[key] };
    setRestNotify(next);
    setRestTimerSettings(next);
  }

  function handleOnboardingSave() {
    if (!onboardingCanSave) return;
    if (onboardingProfile.units !== unit) setUnit(onboardingProfile.units);
    saveOnboardingProfile(onboardingProfile);
    setOnboardingSaved(true);
    window.setTimeout(() => setOnboardingSaved(false), 1400);
  }

  const tallyFeedbackUrl =
    process.env.NEXT_PUBLIC_TALLY_FEEDBACK_URL || "https://tally.so/r/feedback-placeholder";

  function handleExportCsv() {
    try {
      const { rows, workouts } = downloadAllWorkoutsCsv();
      if (workouts === 0) {
        setExportStatus("No workouts logged yet — nothing to export.");
      } else {
        setExportStatus(`Exported ${workouts} workouts (${rows} rows).`);
      }
    } catch (err) {
      setExportStatus(`Export failed: ${(err as Error).message}`);
    }
    window.setTimeout(() => setExportStatus(null), 4000);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-app-secondary">
          What the coach sees about you. Edit any time — the assistant uses these as standing context.
        </p>

        <section className="mt-6 rounded-2xl border border-teal-900/35 bg-zinc-900/90 p-5">
          <OnboardingProfileFields value={onboardingProfile} onChange={setOnboardingProfile} />
          <button
            type="button"
            onClick={handleOnboardingSave}
            disabled={!onboardingCanSave}
            className="mt-5 w-full py-3 rounded-xl bg-teal-500 text-teal-950 font-semibold transition hover:bg-teal-400 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {onboardingSaved ? "Saved" : "Save profile"}
          </button>
          {!onboardingCanSave && (
            <p className="text-[11px] text-app-tertiary text-center mt-2">
              Units and bodyweight are required to save.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Rest timer alerts</p>
          <p className="text-sm text-zinc-400 mb-4">
            How the app notifies you when a rest timer hits zero.
          </p>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-teal-900/30 bg-zinc-900/60 px-4 py-3">
              <span className="text-sm font-semibold text-white">Vibration</span>
              <input
                type="checkbox"
                checked={restNotify.vibrate}
                onChange={() => toggleRestNotify("vibrate")}
                className="h-4 w-4 accent-teal-400"
                aria-label="Vibrate when rest timer ends"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-teal-900/30 bg-zinc-900/60 px-4 py-3">
              <span className="text-sm font-semibold text-white">Sound</span>
              <input
                type="checkbox"
                checked={restNotify.sound}
                onChange={() => toggleRestNotify("sound")}
                className="h-4 w-4 accent-teal-400"
                aria-label="Play sound when rest timer ends"
              />
            </label>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Data &amp; feedback</p>
          <p className="text-sm text-zinc-400 mb-4">
            Your data stays yours — export it any time. Got a thought on how the app or coach should work better? Send it.
          </p>
          <a
            href={tallyFeedbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-xl border border-teal-500/40 bg-teal-950/40 px-4 py-3 text-sm font-bold text-teal-100 hover:bg-teal-900/50 hover:border-teal-400/50 transition-colors"
          >
            Send feedback
          </a>
          <button
            type="button"
            onClick={handleExportCsv}
            className="mt-3 flex w-full items-center justify-center rounded-xl border border-teal-500/40 bg-teal-950/40 px-4 py-3 text-sm font-bold text-teal-100 hover:bg-teal-900/50 hover:border-teal-400/50 transition-colors"
          >
            Export my data (CSV)
          </button>
          {exportStatus && (
            <p className="mt-2 text-xs text-app-secondary text-center">{exportStatus}</p>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Temporary</p>
          <p className="text-sm text-zinc-400 mb-4">
            Move your saved workouts, templates, profile, and assistant chats to another device.
          </p>
          <Link
            href="/dev/data-transfer"
            className="flex w-full items-center justify-center rounded-xl border border-teal-500/40 bg-teal-950/40 px-4 py-3 text-sm font-bold text-teal-100 hover:bg-teal-900/50 hover:border-teal-400/50 transition-colors"
          >
            Data Tools
          </Link>
          <Link
            href="/profile/import"
            className="mt-3 flex w-full items-center justify-center rounded-xl border border-teal-500/40 bg-teal-950/40 px-4 py-3 text-sm font-bold text-teal-100 hover:bg-teal-900/50 hover:border-teal-400/50 transition-colors"
          >
            Import CSV (Hevy / Strong)
          </Link>
        </section>
      </div>
    </main>
  );
}
