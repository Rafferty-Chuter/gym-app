/**
 * Storage for the physique layer. The only module under lib/physique that
 * touches localStorage, via the lib/storage seam. Keys are registered in
 * lib/storage/keys.ts (all included in backups).
 */

import { createRecordStore, createRepo, createSingleton } from "@/lib/storage/repo";
import type {
  CheckInRecord,
  DailySteps,
  DayFlags,
  FoodEntry,
  PhysiqueGoal,
  PhysiqueProfile,
  PhysiqueProgram,
  SavedFood,
  SleepNight,
  WaistEntry,
  WeighIn,
} from "@/lib/physique/types";

export const weighInsRepo = createRepo<WeighIn>("physique.v1.weighIns");
export const foodEntriesRepo = createRepo<FoodEntry>("physique.v1.foodEntries");
export const savedFoodsRepo = createRepo<SavedFood>("physique.v1.savedFoods");
export const sleepNightsRepo = createRepo<SleepNight>("physique.v1.sleepNights");
export const waistRepo = createRepo<WaistEntry>("physique.v1.waist");
export const stepsRepo = createRepo<DailySteps>("physique.v1.steps");
export const dayFlagsStore = createRecordStore<DayFlags>("physique.v1.dayFlags");
export const goalStore = createSingleton<PhysiqueGoal>("physique.v1.goal");
export const goalHistoryRepo = createRepo<PhysiqueGoal & { date: string }>("physique.v1.goalHistory");
export const profileStore = createSingleton<PhysiqueProfile>("physique.v1.profile");
export const programStore = createSingleton<PhysiqueProgram>("physique.v1.program");
export const checkInsRepo = createRepo<CheckInRecord>("physique.v1.checkIns");

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Remove every physique record (dev seed "Clear"). Workouts are untouched. */
export async function clearPhysiqueData(): Promise<void> {
  await Promise.all([
    weighInsRepo.clear(),
    foodEntriesRepo.clear(),
    savedFoodsRepo.clear(),
    sleepNightsRepo.clear(),
    waistRepo.clear(),
    stepsRepo.clear(),
    dayFlagsStore.clear(),
    goalStore.clear(),
    goalHistoryRepo.clear(),
    profileStore.clear(),
    programStore.clear(),
    checkInsRepo.clear(),
  ]);
}
