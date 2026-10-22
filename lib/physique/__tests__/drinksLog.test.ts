// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { cofidToItems, type CofidData } from "@/lib/food/cofid";
import { DRINKS, drinkFood, drinkItems } from "@/lib/food/drinks";
import { logFood, removeFoodEntry, updateFoodEntry } from "@/lib/physique/io/foodData";
import { foodEntriesRepo, savedFoodsRepo } from "@/lib/physique/io/repos";

const nowIso = "2026-10-22T20:00:00.000Z";
const pint = DRINKS.find((d) => d.id === "pint")!;
const lager = drinkItems(cofidToItems((cofidJson as CofidData).foods)).get("pint")!;

describe("a drink's count is one entry (IN7)", () => {
  beforeEach(async () => {
    await foodEntriesRepo.clear();
    await savedFoodsRepo.clear();
  });

  it("logs one, returns its id, raises the same entry's count and removes it at zero", async () => {
    const r = await logFood("2026-10-22", { ...drinkFood(lager, pint, 1), time: "20:00" }, nowIso);
    expect(r.ok && r.id).toBe(foodEntriesRepo.snapshot()[0].id);
    const id = r.id!;
    await updateFoodEntry(id, drinkFood(lager, pint, 3));
    const entries = foodEntriesRepo.snapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id, time: "20:00", kcal: 409, alcoholG: 54.5, grams: 1704, sourceId: "cofid:17-749", serving: "3 × 1 pint · 1,704 ml" });
    // The saved food stays one pint, for one tap in Latest.
    expect(savedFoodsRepo.snapshot()).toHaveLength(1);
    expect(savedFoodsRepo.snapshot()[0]).toMatchObject({ kcal: 136, grams: 568, serving: "1 pint · 568 ml" });
    await removeFoodEntry(id);
    expect(foodEntriesRepo.snapshot()).toEqual([]);
  });
});
