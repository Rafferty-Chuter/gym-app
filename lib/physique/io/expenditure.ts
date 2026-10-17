"use client";

/**
 * Live expenditure series for the Food tab and the energy page: the same
 * inputs the judge uses, run through the pure `computeExpenditure`. Pages
 * read `series`, `intake` and `maturity`; nothing is recomputed in the UI.
 */

import { useMemo } from "react";
import { useRepo, useSingleton } from "@/lib/storage/useStored";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { goalHistoryRepo, profileStore } from "@/lib/physique/io/repos";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import { computeExpenditure, type ExpenditureResult } from "@/lib/physique/expenditure";
import type { Now } from "@/lib/dates";
import type { PhysiqueGoal } from "@/lib/physique/types";

export function useExpenditure(now: Now | null): ExpenditureResult | null {
  const data = useBodyData();
  const goalHistory = useRepo(goalHistoryRepo);
  const storedProfile = useSingleton(profileStore);
  const workouts = useWorkouts();
  return useMemo(() => {
    if (!now) return null;
    void storedProfile;
    const profile = getPhysiqueProfileSync();
    const onboarding = loadOnboardingProfile();
    const goals: PhysiqueGoal[] = goalHistory.map((g) => {
      const copy: PhysiqueGoal & { date?: string } = { ...g };
      delete copy.date;
      return copy as PhysiqueGoal;
    });
    return computeExpenditure(
      {
        profile,
        weighIns: data.weighIns,
        foodEntries: data.foodEntries,
        dayFlags: data.dayFlags,
        goals,
        workouts,
        onboarding: {
          daysPerWeek: onboarding?.daysPerWeek ? Number(onboarding.daysPerWeek) : undefined,
          bodyweightKg: onboarding?.bodyweightKg,
        },
      },
      now
    );
  }, [now, data, goalHistory, storedProfile, workouts]);
}
