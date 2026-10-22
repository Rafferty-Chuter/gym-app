"use client";

/**
 * Client-side hooks and write helpers for the Body page. Reads go through
 * the storage seam's live snapshots; writes return a user-facing error
 * string instead of throwing, so the page can show "Couldn't save".
 */

import { useMemo } from "react";
import { useRecordStore, useRepo, useSingleton } from "@/lib/storage/useStored";
import {
  dayFlagsStore,
  foodEntriesRepo,
  goalStore,
  newId,
  programStore,
  savedFoodsRepo,
  sleepNightsRepo,
  waistRepo,
  stepsRepo,
  vitalsRepo,
  weighInsRepo,
} from "@/lib/physique/io/repos";
import type { DayFlags, FoodEntry, SavedFood, SleepNight, WaistEntry, WeighIn } from "@/lib/physique/types";
import { clientNow, type LocalDate } from "@/lib/dates";
import { localStamp } from "@/lib/health/native";
import { withHealthPeriods } from "@/lib/physique/healthDays";
import { useHealthOptIn } from "@/lib/physique/io/healthOptIn";

export type SaveResult = { ok: true } | { ok: false; error: string };

/** The copy shown when a write fails (U2a). */
export const SAVE_FAILED_COPY = "Couldn't save. Export a backup from Profile, then free up space.";

async function attempt(write: () => Promise<void>): Promise<SaveResult> {
  try {
    await write();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.startsWith("Storage write failed") ? SAVE_FAILED_COPY : msg };
  }
}

export function useBodyData() {
  const weighIns = useRepo(weighInsRepo);
  const foodEntries = useRepo(foodEntriesRepo);
  const savedFoods = useRepo(savedFoodsRepo);
  const sleepNights = useRepo(sleepNightsRepo);
  const waist = useRepo(waistRepo);
  const steps = useRepo(stepsRepo);
  // IN8: Apple Health's day records (active energy, workouts, drinks).
  const vitals = useRepo(vitalsRepo);
  const storedFlags = useRecordStore(dayFlagsStore);
  // IN8: period days from Apple Health read as logged ones, only where the cycle opt-in is on on this device (records synced from another device may carry them). Writes always go through the store, never this object.
  const cycleOn = useHealthOptIn()?.cycle === true;
  const dayFlags = useMemo(() => (cycleOn ? withHealthPeriods(storedFlags, vitals) : storedFlags), [cycleOn, storedFlags, vitals]);
  const goal = useSingleton(goalStore);
  const program = useSingleton(programStore);
  return useMemo(
    () => ({ weighIns, foodEntries, savedFoods, sleepNights, waist, steps, vitals, dayFlags, goal, program }),
    [weighIns, foodEntries, savedFoods, sleepNights, waist, steps, vitals, dayFlags, goal, program]
  );
}

function stamp(date: LocalDate, nowIso: string) {
  return { id: newId(), date, loggedAt: nowIso, source: "manual" as const, schemaVersion: 1 as const };
}

/**
 * One weigh-in per day for manual entries: a second entry on the same day
 * replaces the first. A body-fat reading already on the entry (from a scale
 * export) is kept.
 */
export async function saveWeighIn(date: LocalDate, kg: number, nowIso: string): Promise<SaveResult> {
  return attempt(async () => {
    const existing = weighInsRepo.snapshot().find((w) => w.date === date && w.source === "manual");
    // IN1: typed for today, the clock is about when the scale was read; for an earlier day it is unknown. A correction keeps the first time.
    const at = localStamp(nowIso, clientNow().tz);
    const time = existing?.time ?? (at && at.day === date ? at.clock : undefined);
    const base: WeighIn = existing ? { ...existing, kg, loggedAt: nowIso } : { ...stamp(date, nowIso), kg };
    const record: WeighIn = time ? { ...base, time } : base;
    await weighInsRepo.upsert(record);
  });
}

export async function deleteWeighIn(id: string): Promise<SaveResult> {
  return attempt(() => weighInsRepo.remove(id));
}

export type QuickFood = { label: string; kcal: number; proteinG: number; carbsG: number; fatG: number };

/** Log a quick-add entry and remember it as a saved food for the Recent row. */
export async function saveFoodEntry(date: LocalDate, food: QuickFood, nowIso: string, savedFoodId?: string): Promise<SaveResult> {
  return attempt(async () => {
    const entry: FoodEntry = {
      ...stamp(date, nowIso),
      label: food.label,
      kcal: food.kcal,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      method: savedFoodId ? "saved" : "quick",
      savedFoodId,
    };
    await foodEntriesRepo.upsert(entry);
    const saved = savedFoodsRepo.snapshot();
    const match =
      (savedFoodId ? saved.find((s) => s.id === savedFoodId) : undefined) ??
      saved.find((s) => s.label.toLowerCase() === food.label.toLowerCase() && s.kcal === food.kcal);
    const next: SavedFood = match
      ? { ...match, lastUsedAt: nowIso, useCount: match.useCount + 1 }
      : { id: newId(), label: food.label, kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, lastUsedAt: nowIso, useCount: 1, schemaVersion: 1 };
    await savedFoodsRepo.upsert(next);
  });
}

export async function deleteFoodEntry(id: string): Promise<SaveResult> {
  return attempt(() => foodEntriesRepo.remove(id));
}

export type SleepInput = { bedtime: string; wakeTime: string; asleepMin: number; inBedMin: number; wakeups?: SleepNight["wakeups"] };

/** One manual night per date (the date is the morning you woke up). */
export async function saveSleepNight(date: LocalDate, input: SleepInput, nowIso: string): Promise<SaveResult> {
  return attempt(async () => {
    const existing = sleepNightsRepo.snapshot().find((n) => n.date === date && n.source === "manual");
    const record: SleepNight = existing
      ? { ...existing, ...input, loggedAt: nowIso }
      : { ...stamp(date, nowIso), ...input };
    await sleepNightsRepo.upsert(record);
  });
}

export async function saveWaist(date: LocalDate, cm: number, nowIso: string): Promise<SaveResult> {
  return attempt(async () => {
    const existing = waistRepo.snapshot().find((w) => w.date === date);
    const record: WaistEntry = existing ? { ...existing, cm, loggedAt: nowIso } : { ...stamp(date, nowIso), cm };
    await waistRepo.upsert(record);
  });
}

/** "Edit day" (R4): a kcal total that overrides the sum of entries; null removes it. */
export async function setDayOverride(date: LocalDate, kcal: number | null): Promise<SaveResult> {
  return attempt(async () => {
    const current = (await dayFlagsStore.get(date)) ?? { date };
    const next: DayFlags = { ...current, date };
    if (kcal != null && Number.isFinite(kcal)) next.kcalOverride = Math.round(kcal);
    else delete next.kcalOverride;
    await dayFlagsStore.set(date, next);
  });
}

/**
 * Edit day's status. Marking a day complete also sets `partialDismissed`,
 * so a day the engine would leave out as part-logged counts (C11); marking
 * it partial or fasting clears that.
 */
export async function setDayStatus(date: LocalDate, status: DayFlags["status"] | null): Promise<SaveResult> {
  return attempt(async () => {
    const current = (await dayFlagsStore.get(date)) ?? { date };
    const next: DayFlags = { ...current, date };
    if (status) {
      next.status = status;
      delete next.partialDismissed;
    } else {
      delete next.status;
      next.partialDismissed = true;
    }
    await dayFlagsStore.set(date, next);
  });
}
