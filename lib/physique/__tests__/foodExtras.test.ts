// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { logFood, saveRecipe, updateFoodEntry } from "@/lib/physique/io/foodData";
import { foodEntriesRepo, savedFoodsRepo } from "@/lib/physique/io/repos";
import { dailyLogRecords } from "@/lib/import/dailyLog";
import { macroFactorDays } from "@/lib/import/macroFactor";

const nowIso = "2026-10-22T08:00:00.000Z";
const bacon = { label: "Bacon, back, grilled", kcal: 144, proteinG: 12, carbsG: 0, fatG: 11, sodiumMg: 695.2, satFatG: 4.05, sugarG: 0, grams: 50.4, sourceId: "cofid:19-500", method: "search" as const };

describe("the extras on logged foods (IN6)", () => {
  beforeEach(async () => {
    await foodEntriesRepo.clear();
    await savedFoodsRepo.clear();
  });

  it("keeps sodium, sugars, saturated fat, the weight and the database food on the entry and the saved food", async () => {
    await logFood("2026-10-22", bacon, nowIso);
    const [entry] = foodEntriesRepo.snapshot();
    expect(entry).toMatchObject({ sodiumMg: 695, satFatG: 4.1, sugarG: 0, grams: 50, sourceId: "cofid:19-500" });
    expect(entry).not.toHaveProperty("alcoholG");
    expect(savedFoodsRepo.snapshot()[0]).toMatchObject({ sodiumMg: 695, grams: 50, sourceId: "cofid:19-500" });
  });

  it("refuses a source id that is not one of ours", async () => {
    await logFood("2026-10-22", { ...bacon, sourceId: "https://example.com" }, nowIso);
    expect(foodEntriesRepo.snapshot()[0]).not.toHaveProperty("sourceId");
  });

  it("fills them in on a saved food that lacked them, without touching what it had", async () => {
    await logFood("2026-10-22", { label: "Bacon, back, grilled", kcal: 144, proteinG: 12, carbsG: 0, fatG: 11, sodiumMg: 700 }, nowIso);
    await logFood("2026-10-22", bacon, nowIso);
    expect(savedFoodsRepo.snapshot()).toHaveLength(1);
    expect(savedFoodsRepo.snapshot()[0]).toMatchObject({ sodiumMg: 700, satFatG: 4.1, grams: 50, sourceId: "cofid:19-500", useCount: 2 });
  });

  it("never fills in a saved food from a log of a different amount", async () => {
    await logFood("2026-10-22", { label: "Bacon", kcal: 144, proteinG: 12, carbsG: 0, fatG: 11 }, nowIso);
    const id = savedFoodsRepo.snapshot()[0].id;
    await logFood("2026-10-22", { ...bacon, label: "Bacon", kcal: 288, sodiumMg: 1390, grams: 100, keepSavedServing: true }, nowIso, id);
    const saved = savedFoodsRepo.snapshot()[0];
    expect(saved.sodiumMg).toBeUndefined();
    expect(saved.grams).toBeUndefined();
  });

  it("drops them once a macro is edited, and keeps them for a name or time change", async () => {
    await logFood("2026-10-22", bacon, nowIso);
    const id = foodEntriesRepo.snapshot()[0].id;
    await updateFoodEntry(id, { label: "Bacon", time: "08:30" });
    expect(foodEntriesRepo.snapshot()[0]).toMatchObject({ sodiumMg: 695, grams: 50 });
    await updateFoodEntry(id, { proteinG: 14 });
    const edited = foodEntriesRepo.snapshot()[0];
    expect(edited.sodiumMg).toBeUndefined();
    expect(edited.satFatG).toBeUndefined();
    expect(edited.grams).toBeUndefined();
    expect(edited.sourceId).toBeUndefined();
  });

  it("a saved recipe loses an extra when an edit leaves one ingredient without it", async () => {
    const a = { name: "a", grams: 200, per100: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2, sodiumMg: 100 }, source: "cofid" as const };
    const b = { name: "b", grams: 100, per100: { kcal: 50, proteinG: 1, carbsG: 5, fatG: 1 }, source: "estimate" as const };
    const r = await saveRecipe({ name: "Stew", servings: 2, totalGrams: null, ingredients: [a] }, nowIso);
    expect(savedFoodsRepo.snapshot()[0].sodiumMg).toBe(100);
    await saveRecipe({ savedId: r.id, name: "Stew", servings: 2, totalGrams: null, ingredients: [a, b] }, nowIso);
    expect(savedFoodsRepo.snapshot()[0].sodiumMg).toBeUndefined();
  });
});

describe("MacroFactor's micronutrient sheet (IN6)", () => {
  const macros = [["Date", "Calories (kcal)", "Protein (g)", "Fat (g)", "Carbs (g)"], ["2026-10-20", 2400, 180, 80, 250], ["2026-10-21", 0, 0, 0, 0]];
  const micros = [["Date", "Fiber (g)", "Sodium (mg)", "Sugar Alcohols (g)", "Sugars (g)", "Sugars Added (g)", "Saturated Fat (g)", "Alcohol (g)"], ["2026-10-20", 30, 2900, 3, 85, 40, 26, 14], ["2026-10-21", 0, 0, 0, 0, 0, 0, 0]];

  it("reads sodium, total sugars, saturated fat and alcohol onto days with food, and on to the imported day total", () => {
    const p = macroFactorDays({ macros, micros }, { today: "2026-10-22" });
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ fibreG: 30, sodiumMg: 2900, sugarG: 85, satFatG: 26, alcoholG: 14 });
    const recs = dailyLogRecords(p.rows, { weighIns: [], foodEntries: [], sleepNights: [], steps: [] }, nowIso);
    expect(recs.foodEntries[0]).toMatchObject({ sodiumMg: 2900, sugarG: 85, satFatG: 26, alcoholG: 14 });
  });

  it("converts a sodium column in grams and leaves out a value past a day's limit", () => {
    const grams = [["Date", "Sodium (g)", "Alcohol (g)"], ["2026-10-20", 2.9, 900]];
    const p = macroFactorDays({ macros, micros: grams }, { today: "2026-10-22" });
    expect(p.rows[0].sodiumMg).toBe(2900);
    expect(p.rows[0].alcoholG).toBeUndefined();
    expect(p.issues).toEqual(["1 value was out of range and left out."]);
  });
});
