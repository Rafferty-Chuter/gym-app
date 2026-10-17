import { describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { CANONICAL_NAMES, cofidToItems, normalise, scoreName, searchFoods, singular, type CofidData } from "@/lib/food/cofid";
import { offToFoodItem } from "@/lib/food/off";
import { genericPortions, gramsFromQuantity, portionChoices, scaleMacros } from "@/lib/food/portions";

const items = cofidToItems((cofidJson as CofidData).foods);

describe("CoFID base list", () => {
  it("ships the whole dataset with complete macros", () => {
    expect(items.length).toBeGreaterThan(2500);
    expect(items.every((i) => i.id.startsWith("cofid:") && i.per100.kcal >= 0 && i.per100.proteinG >= 0)).toBe(true);
    const bread = items.find((i) => i.name === "Bread, wholemeal, average");
    expect(bread?.per100.kcal).toBeGreaterThan(200);
    expect(bread?.per100.fibreG).toBeGreaterThan(0);
  });

  it("names every curated row exactly", () => {
    const names = new Set(items.map((i) => i.name));
    const missing = [...CANONICAL_NAMES].filter((n) => !names.has(n));
    expect(missing).toEqual([]);
    expect(singular("potatoes")).toBe("potato");
    expect(singular("berries")).toBe("berry");
    expect(singular("grass")).toBe("grass");
  });

  it("folds plurals and scores whole words over prefixes", () => {
    expect(normalise("Bananas, flesh only")).toEqual(["banana", "flesh", "only"]);
    expect(normalise("Eggs, chicken, boiled")).toEqual(["egg", "chicken", "boiled"]);
    expect(scoreName("Bananas, flesh only", normalise("banana"))).toBeGreaterThan(scoreName("Banana split, homemade", normalise("banana")) ?? 0);
    expect(scoreName("Rice, white, basmati, boiled", normalise("chicken"))).toBeNull();
  });

  it("puts the food someone usually means first", () => {
    expect(searchFoods(items, "banana")[0].name).toBe("Bananas, flesh only");
    expect(searchFoods(items, "white bread")[0].name).toBe("Bread, white, sliced");
    expect(searchFoods(items, "wholemeal bread")[0].name).toBe("Bread, wholemeal, average");
    expect(searchFoods(items, "chicken breast").slice(0, 3).map((i) => i.name)).toContain("Chicken, breast, grilled without skin, meat only");
    expect(searchFoods(items, "egg")[0].name).toMatch(/^Eggs, chicken, whole, boiled/);
    expect(searchFoods(items, "potato")[0].name).toMatch(/^Potatoes, /);
    expect(searchFoods(items, "chickpeas")[0].name).toMatch(/chick peas/);
    expect(searchFoods(items, "greek yogurt")[0].name).toBe("Yogurt, Greek style, plain");
    expect(searchFoods(items, "zzzz")).toEqual([]);
    expect(searchFoods(items, "")).toEqual([]);
    expect(searchFoods(items, "rice", 5)).toHaveLength(5);
  });
});

describe("portions", () => {
  it("scales per 100 g and offers household portions plus 100 g", () => {
    const egg = items.find((i) => i.name === "Eggs, chicken, whole, boiled")!;
    const choices = portionChoices(egg);
    expect(choices[0]).toEqual({ label: "1 medium egg", grams: 50 });
    expect(choices.map((c) => c.grams)).toEqual([50, 100]); // "100 g" folds into "2 eggs"
    expect(portionChoices(items.find((i) => i.name === "Rice, white, basmati, raw")!).at(-1)).toEqual({ label: "100 g", grams: 100 });
    const one = scaleMacros(egg, 50);
    expect(one.kcal).toBe(Math.round(egg.per100.kcal / 2));
    expect(one.proteinG).toBeCloseTo(egg.per100.proteinG / 2, 1);
    expect(genericPortions("Banana split, homemade")).toEqual([]);
    expect(genericPortions("Bananas, flesh only")[0].grams).toBe(100);
  });

  it("reads pack quantities", () => {
    expect(gramsFromQuantity("330 ml")).toBe(330);
    expect(gramsFromQuantity("500g")).toBe(500);
    expect(gramsFromQuantity("0,5 kg")).toBe(500);
    expect(gramsFromQuantity("2 x 125g")).toBe(250);
    expect(gramsFromQuantity("6")).toBeNull();
    expect(gramsFromQuantity(null)).toBeNull();
  });
});

describe("Open Food Facts mapping", () => {
  const base = { code: "5449000000996", product_name: "Coca-Cola Original", brands: "Coca-Cola, The Coca-Cola Company", quantity: "330 ml", serving_size: "1 portion (330 ml)", serving_quantity: 330, nutriments: { "energy-kcal_100g": 42.4, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } };

  it("maps a product with its serving and pack", () => {
    const item = offToFoodItem(base);
    expect(item).toMatchObject({ id: "off:5449000000996", source: "off", name: "Coca-Cola Original", brand: "Coca-Cola", barcode: "5449000000996", per100: { kcal: 42, proteinG: 0, carbsG: 10.6, fatG: 0 } });
    expect(item?.portions).toEqual([{ label: "1 portion (330 ml)", grams: 330 }]);
    expect(portionChoices(item!)).toEqual([{ label: "1 portion (330 ml)", grams: 330 }, { label: "100 g", grams: 100 }]);
  });

  it("prefers the English name, falls back to kJ, and drops holes", () => {
    const de = offToFoodItem({ ...base, product_name: "Natur mit Kokosnuss", product_name_en: "Natural with Coconut", quantity: "0,5 kg", serving_quantity: undefined, serving_size: undefined, nutriments: { energy_100g: 226, proteins_100g: 3.9, carbohydrates_100g: 2.4, fat_100g: 2.8, fiber_100g: 1.2 } });
    expect(de?.name).toBe("Natural with Coconut");
    expect(de?.per100.kcal).toBe(54);
    expect(de?.per100.fibreG).toBe(1.2);
    expect(de?.portions).toEqual([{ label: "whole pack (0,5 kg)", grams: 500 }]);
    expect(portionChoices(de!).map((c) => c.grams)).toEqual([100, 500]); // a pack is never the default
    expect(offToFoodItem({ ...base, nutriments: { "energy-kcal_100g": 100, proteins_100g: 1 } })).toBeNull();
    expect(offToFoodItem({ ...base, product_name: "" })).toBeNull();
  });
});
