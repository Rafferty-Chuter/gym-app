"use client";

/**
 * The one place the UI gets a `PhysiqueAnalysis`: gathers live repo data,
 * the resolved profile and the workout history, and runs the pure judge.
 * Pages render it and compute nothing themselves (U2b).
 */

import { useMemo } from "react";
import { useRepo, useSingleton } from "@/lib/storage/useStored";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { checkInsRepo, goalHistoryRepo, profileStore } from "@/lib/physique/io/repos";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import { buildPhysiqueAnalysis, type JudgeInputs } from "@/lib/physique/judge";
import type { Now } from "@/lib/dates";
import type { PhysiqueAnalysis, PhysiqueGoal } from "@/lib/physique/types";
import type { WeightUnit } from "@/lib/units";

export function usePhysiqueAnalysis(now: Now | null, weightUnit: WeightUnit): PhysiqueAnalysis | null {
  const data = useBodyData();
  const goalHistory = useRepo(goalHistoryRepo);
  const checkIns = useRepo(checkInsRepo);
  const storedProfile = useSingleton(profileStore);
  const workouts = useWorkouts();
  return useMemo(() => {
    if (!now) return null;
    // The stored profile is a dependency so edits recompute; the resolver merges onboarding in.
    void storedProfile;
    const profile = getPhysiqueProfileSync();
    const onboarding = loadOnboardingProfile();
    const goals: PhysiqueGoal[] = goalHistory.map((g) => {
      const copy: PhysiqueGoal & { date?: string } = { ...g };
      delete copy.date;
      return copy as PhysiqueGoal;
    });
    const inputs: JudgeInputs = {
      goal: data.goal,
      goals,
      program: data.program,
      profile,
      onboarding: {
        yearsTrainingBand: onboarding?.yearsTrainingBand,
        daysPerWeek: onboarding?.daysPerWeek ? Number(onboarding.daysPerWeek) : undefined,
        bodyweightKg: onboarding?.bodyweightKg,
      },
      weighIns: data.weighIns,
      foodEntries: data.foodEntries,
      dayFlags: data.dayFlags,
      sleepNights: data.sleepNights,
      waist: data.waist,
      workouts,
      weightUnit,
      checkIns,
    };
    return buildPhysiqueAnalysis(inputs, now);
  }, [now, data, goalHistory, checkIns, storedProfile, workouts, weightUnit]);
}
