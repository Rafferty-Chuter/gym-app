"use client";

import { useState } from "react";
import {
  TRAINING_FOCUS_OPTIONS,
  type TrainingFocus,
} from "@/lib/trainingFocus";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  type ExperienceLevel,
} from "@/lib/experienceLevel";
import type { WeightUnit } from "@/lib/unit-preference";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";

const ONBOARDING_COMPLETE_KEY = "onboardingComplete";

export function setOnboardingComplete(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
  } catch {
    return true;
  }
}

type Props = { onComplete: () => void };

const STEPS = [
  { title: "What’s your main focus?", key: "focus" as const },
  { title: "Experience level?", key: "experience" as const },
  { title: "Preferred units?", key: "units" as const },
];

export function OnboardingFlow({ onComplete }: Props) {
  const { setUnit } = useUnit();
  const { setFocus } = useTrainingFocus();
  const { setExperienceLevel } = useExperienceLevel();

  const [step, setStep] = useState(0);
  const [focus, setFocusLocal] = useState<TrainingFocus>("General Fitness");
  const [experience, setExperienceLocal] = useState<ExperienceLevel>("Intermediate");
  const [unit, setUnitLocal] = useState<WeightUnit>("kg");

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      setFocus(focus);
      setUnit(unit);
      setExperienceLevel(experience);
      setOnboardingComplete();
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm mx-auto">
        <div className="mb-8">
          <p className="text-app-tertiary text-xs font-medium uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold mt-2 text-white">{current.title}</h1>
        </div>

        {current.key === "focus" && (
          <ul className="space-y-2">
            {TRAINING_FOCUS_OPTIONS.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => setFocusLocal(opt)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition ${
                    focus === opt
                      ? "border-teal-500/50 bg-teal-950/40 text-teal-100"
                      : "border-zinc-700/80 bg-zinc-900/80 text-app-secondary hover:border-teal-900/50 hover:text-white"
                  }`}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        )}

        {current.key === "experience" && (
          <ul className="space-y-2">
            {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => setExperienceLocal(opt)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition ${
                    experience === opt
                      ? "border-teal-500/50 bg-teal-950/40 text-teal-100"
                      : "border-zinc-700/80 bg-zinc-900/80 text-app-secondary hover:border-teal-900/50 hover:text-white"
                  }`}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        )}

        {current.key === "units" && (
          <div className="flex gap-3">
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnitLocal(u)}
                className={`flex-1 py-4 rounded-xl border text-base font-semibold transition ${
                  unit === u
                    ? "border-teal-500/50 bg-teal-950/40 text-teal-100"
                    : "border-zinc-700/80 bg-zinc-900/80 text-app-secondary hover:border-teal-900/50 hover:text-white"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleNext}
          className="w-full mt-8 py-3.5 rounded-xl bg-teal-500 text-teal-950 font-semibold transition hover:bg-teal-400 active:scale-[0.98]"
        >
          {isLast ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}
