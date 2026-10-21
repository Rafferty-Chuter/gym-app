"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useHasLoggedAnything, useOnboarding } from "@/lib/physique/io/onboarding";

/**
 * Sends a device with nothing logged and no goal to the welcome screen,
 * once (B7). Anyone with data, or who has seen it, never sees it again.
 * Renders nothing.
 */
export default function WelcomeRedirect() {
  const hydrated = useIsHydrated();
  const router = useRouter();
  const logged = useHasLoggedAnything();
  const onboarding = useOnboarding();
  const fresh = hydrated && !onboarding?.welcomeSeenAt && !logged;
  useEffect(() => {
    if (fresh) router.replace("/welcome");
  }, [fresh, router]);
  return null;
}
