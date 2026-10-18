// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { logFood, saveRecipe, updateFoodEntry } from "@/lib/physique/io/foodData";
import { foodEntriesRepo, savedFoodsRepo } from "@/lib/physique/io/repos";

const nowIso = "2026-10-18T08:00:00.000Z";

describe("fibre on logged foods (B3)", () => {
  beforeEach(async () => {
    await foodEntriesRepo.clear();
    await savedFoodsRepo.clear();
  });

  it("keeps fibre from the database on the entry and the saved food", async () => {
    await logFood("2026-10-18", { label: "Porridge oats", kcal: 150, proteinG: 4.4, carbsG: 25, fatG: 3.2, fibreG: 3.64, method: "search" }, nowIso);
    expect(foodEntriesRepo.snapshot()[0].fibreG).toBe(3.6);
    expect(savedFoodsRepo.snapshot()[0].fibreG).toBe(3.6);
  });

  it("drops fibre once the energy or carbs are edited, and keeps it for a label or time change", async () => {
    await logFood("2026-10-18", { label: "Oats", kcal: 150, proteinG: 4, carbsG: 25, fatG: 3, fibreG: 3.6 }, nowIso);
    const id = foodEntriesRepo.snapshot()[0].id;
    await updateFoodEntry(id, { label: "Porridge", time: "08:30" });
    expect(foodEntriesRepo.snapshot()[0].fibreG).toBe(3.6);
    await updateFoodEntry(id, { kcal: 300 });
    expect(foodEntriesRepo.snapshot()[0].fibreG).toBeUndefined();
  });
});

describe("fibre on saved recipes (F7)", () => {
  beforeEach(async () => {
    await foodEntriesRepo.clear();
    await savedFoodsRepo.clear();
  });

  it("stores one serving's fibre, and clears it when an edit leaves the recipe unknown", async () => {
    const oats = { name: "oats", grams: 80, per100: { kcal: 375, proteinG: 11, carbsG: 60, fatG: 8, fibreG: 9 }, source: "cofid" as const };
    const sauce = { name: "sauce", grams: 400, per100: { kcal: 150, proteinG: 2, carbsG: 10, fatG: 11 }, source: "estimate" as const };
    const r = await saveRecipe({ name: "Oats", servings: 2, totalGrams: null, ingredients: [oats] }, nowIso);
    expect(savedFoodsRepo.snapshot()[0].fibreG).toBe(3.6);
    await saveRecipe({ savedId: r.id, name: "Oats", servings: 2, totalGrams: null, ingredients: [oats, sauce] }, nowIso);
    expect(savedFoodsRepo.snapshot()[0].fibreG).toBeUndefined();
  });
});
