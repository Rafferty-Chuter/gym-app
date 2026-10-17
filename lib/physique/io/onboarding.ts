"use client";

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";

export type OnboardingState = { welcomeSeenAt?: string };

/** Whether the welcome screen has been seen on this device. Not in backups. */
export const onboardingStore = createSingleton<OnboardingState>("physique.v1.onboarding");

export function useOnboarding(): OnboardingState | null {
  return useSingleton(onboardingStore);
}

export async function markWelcomeSeen(nowIso: string): Promise<void> {
  const cur = await onboardingStore.get();
  await onboardingStore.set({ ...(cur ?? {}), welcomeSeenAt: nowIso });
}
