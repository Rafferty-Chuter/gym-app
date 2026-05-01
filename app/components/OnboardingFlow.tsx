"use client";

import { useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import {
  saveOnboardingProfile,
  type OnboardingProfile,
} from "@/lib/onboardingProfile";
import { OnboardingProfileFields, isOnboardingFormSavable } from "./OnboardingProfileFields";

type Props = { onComplete: () => void };

export function OnboardingFlow({ onComplete }: Props) {
  const { unit: storedUnit, setUnit } = useUnit();

  const [profile, setProfile] = useState<OnboardingProfile>({
    units: storedUnit === "lb" ? "lb" : "kg",
  });

  const canSave = isOnboardingFormSavable(profile);

  function handleSave() {
    if (!canSave) return;
    // Keep useUnit() in sync — many app surfaces still read from it.
    setUnit(profile.units);
    saveOnboardingProfile(profile);
    onComplete();
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-lg px-5 sm:px-6 pt-10 pb-32">
        <header className="mb-8">
          <p className="text-app-tertiary text-xs font-medium uppercase tracking-wider">
            Welcome
          </p>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">Set up your coach</h1>
          <p className="text-sm text-app-secondary mt-3 leading-relaxed">
            A 60-second profile so the coach grounds in who you actually are. Everything except
            units and bodyweight is optional, and you can edit any of it later from your profile.
          </p>
        </header>

        <OnboardingProfileFields value={profile} onChange={setProfile} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800/60 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-lg px-5 sm:px-6 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-3.5 rounded-xl bg-teal-500 text-teal-950 font-semibold transition hover:bg-teal-400 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            Save &amp; continue
          </button>
          {!canSave && (
            <p className="text-[11px] text-app-tertiary text-center mt-2">
              Units and bodyweight are required to continue.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
