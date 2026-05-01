"use client";

import { useState, useEffect } from "react";
import { OnboardingFlow } from "./OnboardingFlow";
import { isOnboardingComplete, loadOnboardingProfile } from "@/lib/onboardingProfile";

type Props = { children: React.ReactNode };

export function OnboardingGate({ children }: Props) {
  const [showOnboarding, setShowOnboarding] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setShowOnboarding(!isOnboardingComplete(loadOnboardingProfile()));
  }, []);

  if (showOnboarding === undefined) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-teal-500/50 border-t-teal-400 animate-spin" />
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingFlow onComplete={() => setShowOnboarding(false)} />;
  }

  return <>{children}</>;
}
