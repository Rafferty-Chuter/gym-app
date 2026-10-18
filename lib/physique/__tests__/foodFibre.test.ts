// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { logFood, updateFoodEntry } from "@/lib/physique/io/foodData";
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
