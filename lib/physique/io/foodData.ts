"use client";

/**
 * Client-side writes and preferences for the Food tab (R2). Reads go
 * through the storage seam's live snapshots; writes return a user-facing
 * error instead of throwing. Keeps `bodyData.ts` unchanged.
 */

import { perServing, servingLabel } from "@/lib/food/recipe";
import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { foodEntriesRepo, newId, savedFoodsRepo } from "@/lib/physique/io/repos";
import { SAVE_FAILED_COPY, type SaveResult } from "@/lib/physique/io/bodyData";
import { DEFAULT_HOUR_END, DEFAULT_HOUR_START, entryClock } from "@/lib/physique/food/timeline";
import type { FoodEntry, FoodMethod, SavedFood } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";

async function attempt(write: () => Promise<void>): Promise<SaveResult> {
  try {
    await write();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.startsWith("Storage write failed") ? SAVE_FAILED_COPY : msg };
  }
}

// ── Preferences ──

export type FoodPrefs = {
  hourStart: number;
  hourEnd: number;
  hideEmptyHours: boolean;
  /** Carousel toggle: show consumed or remaining numbers. */
  view: "consumed" | "remaining";
};

export const DEFAULT_FOOD_PREFS: FoodPrefs = { hourStart: DEFAULT_HOUR_START, hourEnd: DEFAULT_HOUR_END, hideEmptyHours: false, view: "remaining" };

export const foodPrefsStore = createSingleton<FoodPrefs>("physique.v1.foodPrefs");

export function useFoodPrefs(): FoodPrefs {
  const stored = useSingleton(foodPrefsStore);
  return stored ? { ...DEFAULT_FOOD_PREFS, ...stored } : DEFAULT_FOOD_PREFS;
}

export async function setFoodPrefs(patch: Partial<FoodPrefs>): Promise<SaveResult> {
  return attempt(async () => {
    const current = (await foodPrefsStore.get()) ?? DEFAULT_FOOD_PREFS;
    await foodPrefsStore.set({ ...DEFAULT_FOOD_PREFS, ...current, ...patch });
  });
}

// ── Entries ──

export type FoodInput = {
  label: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Local meal time `HH:MM`. */
  time?: string;
  serving?: string;
  method?: FoodMethod;
  confidence?: FoodEntry["confidence"];
  /** Present when the log is servings of a recipe; the saved food keeps one serving and the ingredients. */
  recipe?: SavedFood["recipe"];
};

function clean(food: FoodInput) {
  const r = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return { label: food.label.trim() || "Food", kcal: r(food.kcal), proteinG: r(food.proteinG), carbsG: r(food.carbsG), fatG: r(food.fatG) };
}

/** Remember a logged food for Recent and Saved; a same-label-and-kcal match is reused. */
async function rememberSaved(food: ReturnType<typeof clean>, serving: string | undefined, nowIso: string, savedFoodId?: string, recipe?: SavedFood["recipe"]): Promise<string> {
  const saved = savedFoodsRepo.snapshot();
  const match =
    (savedFoodId ? saved.find((s) => s.id === savedFoodId) : undefined) ??
    saved.find((s) => s.label.toLowerCase() === food.label.toLowerCase() && s.kcal === food.kcal);
  const next: SavedFood = match
    ? { ...match, lastUsedAt: nowIso, useCount: match.useCount + 1, serving: serving ?? match.serving, ...(recipe ? { recipe } : {}) }
    : { id: newId(), ...food, serving, lastUsedAt: nowIso, useCount: 1, schemaVersion: 1, ...(recipe ? { recipe } : {}) };
  await savedFoodsRepo.upsert(next);
  return next.id;
}

/** Log a food to a date at a meal time. Quick adds are remembered as saved foods. */
export async function logFood(date: LocalDate, food: FoodInput, nowIso: string, savedFoodId?: string): Promise<SaveResult> {
  return attempt(async () => {
    const base = clean(food);
    // A recipe is remembered as one serving, whatever was eaten this time.
    const savedBase = food.recipe ? clean({ ...food, ...perServing(food.recipe.ingredients, food.recipe.servings) }) : base;
    const savedServing = food.recipe ? servingLabel(1, food.recipe.servings) : food.serving;
    const id = await rememberSaved(savedBase, savedServing, nowIso, savedFoodId, food.recipe);
    const entry: FoodEntry = {
      id: newId(),
      date,
      loggedAt: nowIso,
      source: "manual",
      schemaVersion: 1,
      ...base,
      method: food.method ?? (savedFoodId ? "saved" : "quick"),
      savedFoodId: id,
    };
    if (food.time) entry.time = food.time;
    if (food.serving) entry.serving = food.serving;
    if (food.confidence) entry.confidence = food.confidence;
    await foodEntriesRepo.upsert(entry);
  });
}

/** Edit an entry in place (label, macros, time, serving). The id and date never change. */
export async function updateFoodEntry(id: string, patch: Partial<FoodInput>): Promise<SaveResult> {
  return attempt(async () => {
    const existing = foodEntriesRepo.snapshot().find((e) => e.id === id);
    if (!existing) throw new Error("That entry is gone.");
    const merged = clean({ ...existing, ...patch, label: patch.label ?? existing.label });
    const next: FoodEntry = { ...existing, ...merged, loggedAt: existing.loggedAt };
    if (patch.time !== undefined) {
      if (patch.time) next.time = patch.time;
      else delete next.time;
    }
    if (patch.serving !== undefined) {
      if (patch.serving) next.serving = patch.serving;
      else delete next.serving;
    }
    await foodEntriesRepo.upsert(next);
  });
}

export async function removeFoodEntry(id: string): Promise<SaveResult> {
  return attempt(() => foodEntriesRepo.remove(id));
}

/** Copy every entry of one day onto another, keeping meal times. New ids, logged now. */
export async function copyDay(from: LocalDate, to: LocalDate, nowIso: string, tz: string): Promise<SaveResult> {
  return attempt(async () => {
    const source = foodEntriesRepo.snapshot().filter((e) => e.date === from);
    if (source.length === 0) throw new Error("Nothing to copy.");
    const copies: FoodEntry[] = source.map((e) => ({ ...e, id: newId(), date: to, loggedAt: nowIso, source: "manual", time: entryClock(e, tz) }));
    await foodEntriesRepo.bulkUpsert(copies);
  });
}

export async function clearDay(date: LocalDate): Promise<SaveResult> {
  return attempt(async () => {
    const ids = foodEntriesRepo.snapshot().filter((e) => e.date === date).map((e) => e.id);
    for (const id of ids) await foodEntriesRepo.remove(id);
  });
}

// ── Saved foods ──

export async function toggleFavourite(id: string): Promise<SaveResult> {
  return attempt(async () => {
    const s = savedFoodsRepo.snapshot().find((x) => x.id === id);
    if (!s) return;
    await savedFoodsRepo.upsert({ ...s, favourite: !s.favourite });
  });
}

export async function removeSavedFood(id: string): Promise<SaveResult> {
  return attempt(() => savedFoodsRepo.remove(id));
}

/** Save a food for later without logging it (the Saved tab's "New"). */
export async function createSavedFood(food: FoodInput, nowIso: string): Promise<SaveResult> {
  return attempt(async () => {
    const base = clean(food);
    await savedFoodsRepo.upsert({ id: newId(), ...base, serving: food.serving, lastUsedAt: nowIso, useCount: 0, schemaVersion: 1 });
  });
}
