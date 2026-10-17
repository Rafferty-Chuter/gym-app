"use client";

/**
 * Build the assistant's physique payload from the live analysis and the
 * repo snapshots (03-architecture §4.1). Sent only to our own API route.
 */

import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import { dayFlagsStore, foodEntriesRepo, goalStore, programStore, sleepNightsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { buildPhysiqueRecent, type AssistantPhysiquePayload } from "@/lib/physique/payload";
import type { Now } from "@/lib/dates";
import type { PhysiqueAnalysis } from "@/lib/physique/types";
import type { WeightUnit } from "@/lib/units";

/** Only send a payload when there is something to cite (a goal, or any weigh-in, food or sleep). */
export function hasPhysiqueData(): boolean {
  return goalStore.snapshot() != null || weighInsRepo.snapshot().length > 0 || foodEntriesRepo.snapshot().length > 0 || sleepNightsRepo.snapshot().length > 0;
}

export function buildAssistantPhysiquePayload(analysis: PhysiqueAnalysis, now: Now, weightUnit: WeightUnit): AssistantPhysiquePayload {
  const recent = buildPhysiqueRecent(
    {
      weighIns: weighInsRepo.snapshot(),
      foodEntries: foodEntriesRepo.snapshot(),
      dayFlags: dayFlagsStore.snapshot(),
      sleepNights: sleepNightsRepo.snapshot(),
      workouts: getWorkoutHistory(),
      goal: goalStore.snapshot(),
      program: programStore.snapshot(),
      weightUnit,
    },
    now
  );
  return { analysis, now, recent };
}
