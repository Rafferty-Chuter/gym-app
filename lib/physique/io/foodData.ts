"use client";

/**
 * Client-side writes and preferences for the Food tab (R2). Reads go
 * through the storage seam's live snapshots; writes return a user-facing
 * error instead of throwing. Keeps `bodyData.ts` unchanged.
 */

import { perServing } from "@/lib/food/recipe";
import { EXTRA_KEYS, pickExtras, type Extras } from "@/lib/food/extras";
import { draftMacros, toSavedRecipe, unitLabel, type RecipeDraft } from "@/lib/food/recipeDraft";
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
  /** Carousel toggle: show consumed or remaining numbers. */
  view: "consumed" | "remaining";
};

export const DEFAULT_FOOD_PREFS: FoodPrefs = { hourStart: DEFAULT_HOUR_START, hourEnd: DEFAULT_HOUR_END, view: "remaining" };

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

export type FoodInput = Extras & {
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
  /** Fibre in g when the source has it (B3). */
  fibreG?: number;
  /** IN6: grams eaten when the amount was a weight, and the database food it came from. */
  grams?: number;
  sourceId?: string;
  /** Present when the log is servings of a recipe; the saved food keeps one serving and the ingredients. */
  recipe?: SavedFood["recipe"];
  /** C6: the log is several servings of a saved food, so the saved food keeps its own serving name. */
  keepSavedServing?: boolean;
};

function clean(food: FoodInput) {
  const r = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  const fibre = food.fibreG != null && Number.isFinite(food.fibreG) ? Math.max(0, Math.round(food.fibreG * 10) / 10) : null;
  const grams = typeof food.grams === "number" && Number.isFinite(food.grams) && food.grams > 0 ? Math.round(food.grams) : null;
  const sourceId = typeof food.sourceId === "string" && /^(cofid|off):\S+$/.test(food.sourceId) ? food.sourceId : null;
  return {
    label: food.label.trim() || "Food",
    kcal: r(food.kcal),
    proteinG: r(food.proteinG),
    carbsG: r(food.carbsG),
    fatG: r(food.fatG),
    ...(fibre != null ? { fibreG: fibre } : {}),
    ...pickExtras(food),
    ...(grams != null ? { grams } : {}),
    ...(sourceId ? { sourceId } : {}),
  };
}

/**
 * IN6: what a saved food lacks and this log has (extras, grams, its
 * database food), as fibre is filled in (B3); only from a log of the same
 * amount, so two servings never fill in one serving's numbers.
 */
function fillIn(match: SavedFood, food: ReturnType<typeof clean>): Partial<SavedFood> {
  const out: Partial<SavedFood> = {};
  if (food.kcal !== match.kcal) return out;
  for (const k of EXTRA_KEYS) if (match[k] == null && food[k] != null) out[k] = food[k];
  if (match.grams == null && food.grams != null) out.grams = food.grams;
  if (match.sourceId == null && food.sourceId) out.sourceId = food.sourceId;
  return out;
}

/** A saved food logged as one of its servings, with everything it carries (B3, IN6). */
export function savedFoodInput(s: SavedFood): FoodInput {
  return { label: s.label, kcal: s.kcal, proteinG: s.proteinG, fatG: s.fatG, carbsG: s.carbsG, fibreG: s.fibreG, ...pickExtras(s), grams: s.grams, sourceId: s.sourceId, serving: s.serving, method: "saved" };
}

/** Remember a logged food for Recent and Saved; a same-label-and-kcal match is reused. */
async function rememberSaved(food: ReturnType<typeof clean>, serving: string | undefined, nowIso: string, savedFoodId?: string, recipe?: SavedFood["recipe"]): Promise<string> {
  const saved = savedFoodsRepo.snapshot();
  const match =
    (savedFoodId ? saved.find((s) => s.id === savedFoodId) : undefined) ??
    saved.find((s) => s.label.toLowerCase() === food.label.toLowerCase() && s.kcal === food.kcal);
  const next: SavedFood = match
    ? { ...match, lastUsedAt: nowIso, useCount: match.useCount + 1, serving: serving ?? match.serving, ...(recipe ? { recipe, fibreG: food.fibreG, ...pickExtras(food) } : match.fibreG == null && food.fibreG != null ? { fibreG: food.fibreG } : {}), ...(recipe ? {} : fillIn(match, food)) }
    : { id: newId(), ...food, serving, lastUsedAt: nowIso, useCount: 1, schemaVersion: 1, ...(recipe ? { recipe } : {}) };
  await savedFoodsRepo.upsert(next);
  return next.id;
}

/** Log a food to a date at a meal time. Quick adds are remembered as saved foods. */
export async function logFood(date: LocalDate, food: FoodInput, nowIso: string, savedFoodId?: string): Promise<SaveResult & { id?: string }> {
  const entryId = newId();
  const r = await attempt(async () => {
    const base = clean(food);
    // A recipe is remembered as one serving, whatever was eaten this time.
    const savedBase = food.recipe ? clean({ ...food, ...perServing(food.recipe.ingredients, food.recipe.servings) }) : base;
    const savedServing = food.recipe ? unitLabel({ servings: food.recipe.servings, totalGrams: food.recipe.totalGrams ?? null }) : food.keepSavedServing && savedFoodId ? undefined : food.serving;
    const id = await rememberSaved(savedBase, savedServing, nowIso, savedFoodId, food.recipe);
    const entry: FoodEntry = {
      id: entryId,
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
  // IN7: the entry's id, so a second tap on a drink can raise its count.
  return r.ok ? { ...r, id: entryId } : r;
}

/**
 * Save a recipe from the Create Recipe view (F6) as a saved food whose
 * macros are one serving. Editing keeps the saved food's id, star and
 * use count. Returns the id so a log can point at it.
 */
export async function saveRecipe(draft: RecipeDraft, nowIso: string): Promise<SaveResult & { id?: string }> {
  const id = draft.savedId ?? newId();
  const r = await attempt(async () => {
    const existing = draft.savedId ? savedFoodsRepo.snapshot().find((s) => s.id === draft.savedId) : undefined;
    const one = clean({ label: draft.name, ...draftMacros(draft, "serving") });
    const next: SavedFood = {
      ...(existing ?? { lastUsedAt: nowIso, useCount: 0, schemaVersion: 1 as const }),
      id,
      ...one,
      serving: unitLabel(draft),
      recipe: toSavedRecipe(draft),
    };
    // An edit can leave too little of the recipe with a fibre value: the old number must not stay (F7). The same for the extras (IN6).
    if (one.fibreG == null) delete next.fibreG;
    for (const k of EXTRA_KEYS) if (one[k] == null) delete next[k];
    await savedFoodsRepo.upsert(next);
  });
  return r.ok ? { ...r, id } : r;
}

/** Edit an entry in place (label, macros, time, serving). The id and date never change. */
export async function updateFoodEntry(id: string, patch: Partial<FoodInput>): Promise<SaveResult> {
  return attempt(async () => {
    const existing = foodEntriesRepo.snapshot().find((e) => e.id === id);
    if (!existing) throw new Error("That entry is gone.");
    const merged = clean({ ...existing, ...patch, label: patch.label ?? existing.label });
    const next: FoodEntry = { ...existing, ...merged, loggedAt: existing.loggedAt };
    // Fibre was known for the numbers first logged; once energy or carbs are edited it is unknown (B3).
    const edited = (["kcal", "carbsG"] as const).some((k) => patch[k] !== undefined && merged[k] !== existing[k]);
    if (edited && patch.fibreG === undefined) delete next.fibreG;
    // IN6: the extras, the weight and the database food were known for the numbers first logged; any edited macro makes them unknown.
    const anyEdited = (["kcal", "proteinG", "carbsG", "fatG"] as const).some((k) => patch[k] !== undefined && merged[k] !== existing[k]);
    if (anyEdited) {
      for (const k of EXTRA_KEYS) if (patch[k] === undefined) delete next[k];
      if (patch.grams === undefined) delete next.grams;
      if (patch.sourceId === undefined) delete next.sourceId;
    }
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
