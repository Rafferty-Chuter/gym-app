"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { useOnboarding } from "@/lib/physique/io/onboarding";

/**
 * Sends a device with nothing logged and no goal to the welcome screen,
 * once (B7). Anyone with data, or who has seen it, never sees it again.
 * Renders nothing.
 */
export default function WelcomeRedirect() {
  const hydrated = useIsHydrated();
  const router = useRouter();
  const data = useBodyData();
  const workouts = useWorkouts();
  const onboarding = useOnboarding();
  const fresh = hydrated && !onboarding?.welcomeSeenAt && !data.goal && data.weighIns.length === 0 && data.foodEntries.length === 0 && data.sleepNights.length === 0 && workouts.length === 0;
  useEffect(() => {
    if (fresh) router.replace("/welcome");
  }, [fresh, router]);
  return null;
}
