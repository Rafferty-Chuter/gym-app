"use client";

import SetupFlow from "@/components/setup/SetupFlow";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";

/** First-run setup (O1): basics, today's weight, the goal and its starting targets. Browser storage only, so client only. */
export default function SetupPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;
  return <SetupFlow now={now} />;
}
