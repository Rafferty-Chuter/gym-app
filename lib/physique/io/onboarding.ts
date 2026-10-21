"use client";

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useWorkouts } from "@/lib/physique/io/workouts";

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

/**
 * Whether this device holds anything the person has logged or set: a
 * goal, a weigh-in, food, a night's sleep or a workout. Without any, Home
 * sends a first open to the welcome screen (B7), and signing in from it
 * says the account has nothing logged yet.
 */
export function useHasLoggedAnything(): boolean {
  const data = useBodyData();
  const workouts = useWorkouts();
  return !!data.goal || data.weighIns.length > 0 || data.foodEntries.length > 0 || data.sleepNights.length > 0 || workouts.length > 0;
}
