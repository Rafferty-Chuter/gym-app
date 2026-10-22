import { describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { cofidToItems, type CofidData } from "@/lib/food/cofid";
import { fittedExtras, hasExtras, nutrientRows, per100Extras, pickExtras, scaleExtras, sumExtras } from "@/lib/food/extras";
import { offToFoodItem } from "@/lib/food/off";
import { scaleMacros } from "@/lib/food/portions";
import { scaleServings } from "@/lib/food/servings";
import { plateItemMacros, toPlate, withMacros } from "@/lib/food/plate";
import { eatenMacros, matchIngredient, resolveIngredient, resolveItem, type ItemDraft } from "@/lib/food/recipe";
import { draftFromPlate } from "@/lib/food/recipeDraft";
import { sanitiseParse } from "@/lib/food/describe";
import { applyPublished } from "@/lib/food/published";
import type { FoodParseOutputData } from "@/lib/physique/food/parseSchema";

const items = cofidToItems((cofidJson as CofidData).foods);
const byName = (name: string) => items.find((i) => i.name === name)!;

describe("the extras themselves (IN6)", () => {
  it("keeps only finite, non-negative numbers, sodium to the mg and the rest to 0.1 g", () => {
    expect(pickExtras({ sodiumMg: 480.6, sugarG: 12.34, satFatG: -1, alcoholG: Number.NaN })).toEqual({ sodiumMg: 481, sugarG: 12.3 });
    expect(pickExtras(null)).toEqual({});
    expect(hasExtras({})).toBe(false);
    expect(hasExtras({ alcoholG: 0 })).toBe(true);
  });

  it("drops a per-100 g figure no food can have", () => {
    expect(per100Extras({ sodiumMg: 50_000, sugarG: 105, satFatG: 101, alcoholG: 33.4 })).toEqual({ sugarG: 105, alcoholG: 33.4 });
  });

  it("scales, and sums only what every part has", () => {
    expect(scaleExtras({ sodiumMg: 400, sugarG: 5 }, 1.5)).toEqual({ sodiumMg: 600, sugarG: 7.5 });
    expect(sumExtras([{ sodiumMg: 100, sugarG: 2 }, { sodiumMg: 50 }])).toEqual({ sodiumMg: 150 });
    expect(sumExtras([])).toEqual({});
  });

  it("fits an estimate to its own numbers", () => {
    expect(fittedExtras({ sugarG: 40, satFatG: 12, alcoholG: 50, sodiumMg: 20_000 }, { kcal: 140, carbsG: 30, fatG: 10 }, 10_000)).toEqual({ sugarG: 30, satFatG: 10, alcoholG: 20, sodiumMg: 10_000 });
  });

  it("reads as a label does: saturates, sugars, fibre, salt, and alcohol only when there is some", () => {
    expect(nutrientRows({ sodiumMg: 480, sugarG: 12.34, satFatG: 3.06, fibreG: 0, alcoholG: 0 }).map((r) => `${r.label} ${r.value}`)).toEqual(["Saturated fat 3.1 g", "Sugars 12 g", "Fibre 0 g", "Salt 1.2 g"]);
    expect(nutrientRows({ alcoholG: 17.4 }).map((r) => r.value)).toEqual(["17 g"]);
    expect(nutrientRows({})).toEqual([]);
    expect(nutrientRows(undefined)).toEqual([]);
  });
});

describe("CoFID carries sodium, sugars, saturated fat and alcohol (IN6)", () => {
  it("reads them from the rebuilt base list", () => {
    expect(byName("Bacon rashers, back, grilled").per100).toMatchObject({ sodiumMg: 1390, satFatG: 8.1, sugarG: 0, alcoholG: 0 });
    expect(byName("Beer, bitter, average (<4% ABV)").per100.alcoholG).toBe(2.9);
    const known = (k: "sodiumMg" | "sugarG" | "satFatG" | "alcoholG") => items.filter((i) => i.per100[k] != null).length;
    expect(known("sodiumMg")).toBeGreaterThan(2600);
    expect(known("sugarG")).toBeGreaterThan(2600);
    expect(known("satFatG")).toBeGreaterThan(2400);
  });

  it("scales with the amount eaten and with servings", () => {
    const bacon = byName("Bacon rashers, back, grilled");
    expect(scaleMacros(bacon, 50)).toMatchObject({ sodiumMg: 695, satFatG: 4.1 });
    expect(scaleServings({ kcal: 100, proteinG: 1, carbsG: 1, fatG: 1, sodiumMg: 300, sugarG: 4 }, 2)).toMatchObject({ sodiumMg: 600, sugarG: 8 });
  });
});

describe("Open Food Facts maps the extras (IN6)", () => {
  const base = { code: "5000000000001", product_name: "Crisps", nutriments: { "energy-kcal_100g": 520, proteins_100g: 6, carbohydrates_100g: 50, fat_100g: 32 } };

  it("takes sodium, or salt as UK labels give it, sugars and saturated fat", () => {
    expect(offToFoodItem({ ...base, nutriments: { ...base.nutriments, salt_100g: 1.3, sugars_100g: 0.6, "saturated-fat_100g": 2.5 } })?.per100).toMatchObject({ sodiumMg: 520, sugarG: 0.6, satFatG: 2.5 });
    expect(offToFoodItem({ ...base, nutriments: { ...base.nutriments, sodium_100g: 0.4, salt_100g: 9 } })?.per100.sodiumMg).toBe(400);
    expect(offToFoodItem(base)?.per100).not.toHaveProperty("sodiumMg");
  });

  it("turns alcohol by volume into grams", () => {
    const lager = offToFoodItem({ ...base, product_name: "Lager", nutriments: { "energy-kcal_100g": 42, proteins_100g: 0.4, carbohydrates_100g: 3, fat_100g: 0, alcohol_100g: 4 } });
    expect(lager?.per100.alcoholG).toBe(3.2);
  });
});

describe("Describe and recipes carry the extras (IN6)", () => {
  const draft = (over: Partial<ItemDraft> = {}): ItemDraft => ({ label: "Eggs, fried", serving: "2 eggs", lookup: "eggs fried", grams: 120, kcal: 240, proteinG: 16, fatG: 18, carbsG: 0, confidence: "medium", ...over });

  it("a matched food takes the base list's extras for its weight, the estimate's where the row has none, and its id", () => {
    const hit = matchIngredient(items, "eggs fried")!;
    const r = resolveItem(items, draft({ sodiumMg: 999, alcoholG: 0 }));
    expect(r.matched).toBe(hit.name);
    expect(r.sourceId).toBe(hit.id);
    expect(r.sodiumMg).toBe(Math.round((hit.per100.sodiumMg as number) * 1.2));
    if (hit.per100.alcoholG == null) expect(r.alcoholG).toBe(0);
    const unmatched = resolveItem(items, draft({ lookup: "", sodiumMg: 300.4, sugarG: 1.26 }));
    expect(unmatched).toMatchObject({ sodiumMg: 300, sugarG: 1.3 });
    expect(unmatched.sourceId).toBeUndefined();
  });

  it("the plate scales them with the amount and drops them once a macro is typed over", () => {
    const [p] = toPlate([{ ...draft(), sodiumMg: 400, satFatG: 5 }]);
    expect(plateItemMacros({ ...p, amount: 1.5 })).toMatchObject({ sodiumMg: 600, satFatG: 7.5 });
    const same = withMacros(p, { kcal: 240, proteinG: 16, fatG: 18, carbsG: 0, label: "Two eggs" });
    expect(same.sodiumMg).toBe(400);
    const edited = withMacros({ ...p, sourceId: "cofid:12-345" }, { kcal: 240, proteinG: 16, fatG: 20, carbsG: 0 });
    expect(edited.sodiumMg).toBeUndefined();
    expect(edited.satFatG).toBeUndefined();
    expect(edited.sourceId).toBeUndefined();
  });

  it("a plate made into a recipe keeps them per 100 g", () => {
    const [p] = toPlate([{ ...draft(), sodiumMg: 360 }]);
    expect(draftFromPlate([p]).ingredients[0].per100.sodiumMg).toBe(300);
  });

  it("a recipe knows an extra only when every ingredient has it", () => {
    const a = { name: "a", grams: 200, per100: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2, sodiumMg: 100, sugarG: 3 }, source: "cofid" as const };
    const b = { name: "b", grams: 100, per100: { kcal: 50, proteinG: 1, carbsG: 5, fatG: 1, sodiumMg: 300 }, source: "estimate" as const };
    const m = eatenMacros([a, b], 2, 1);
    expect(m.sodiumMg).toBe(250);
    expect(m.sugarG).toBeUndefined();
    expect("sugarG" in m).toBe(true); // present as a key, so it replaces an earlier value when spread
  });

  it("a matched ingredient takes the estimate's extra where the row has none", () => {
    const ing = resolveIngredient(items, { name: "bacon", lookup: "bacon rashers back grilled", grams: 50, per100: { kcal: 287, proteinG: 23, fatG: 22, carbsG: 0, alcoholG: 0, sodiumMg: 5 } });
    expect(ing.source).toBe("cofid");
    expect(ing.per100.sodiumMg).not.toBe(5);
  });
});

describe("the model's extras are cleaned (IN6)", () => {
  const NONE = { sodiumMg: null, sugarG: null, satFatG: null, alcoholG: null };
  const reply = (over: Partial<FoodParseOutputData>): FoodParseOutputData => ({ kind: "meal", items: [], recipe: { name: "", servings: 1, ingredients: [] }, ...over });
  const item = { label: "Pint of bitter", serving: "1 pint", lookup: "beer bitter", grams: 568, kcal: 180, proteinG: 2, fatG: 0, carbsG: 13, fibreG: 0, confidence: "medium" as const, portions: [], chain: false, packaged: false };

  it("keeps what fits, leaves out nulls and brings a slipped figure within the food's own numbers", () => {
    const [beer] = sanitiseParse(reply({ items: [{ ...item, ...NONE, alcoholG: 18.4, sugarG: 40, sodiumMg: 57 }] }), "meal").items;
    expect(beer).toMatchObject({ alcoholG: 18.4, sugarG: 13, sodiumMg: 57 });
    expect(beer).not.toHaveProperty("satFatG");
    const [tooStrong] = sanitiseParse(reply({ items: [{ ...item, ...NONE, alcoholG: 100 }] }), "meal").items;
    expect(tooStrong.alcoholG).toBe(25.7);
  });

  it("per 100 g in a recipe, within what a food can hold", () => {
    const out = sanitiseParse(reply({ kind: "recipe", recipe: { name: "Soup", servings: 2, ingredients: [{ name: "stock", lookup: "stock", grams: 500, per100: { kcal: 10, proteinG: 1, fatG: 0.2, carbsG: 1, fibreG: 0, ...NONE, sodiumMg: 90_000, satFatG: 0.1 } }] } }), "recipe");
    expect(out.recipe!.ingredients[0].per100).toMatchObject({ sodiumMg: 40_000, satFatG: 0.1 });
  });
});

describe("a chain's published salt, sugars and saturated fat (IN6)", () => {
  const dish: ItemDraft = { label: "Katsu curry, Wagamama", serving: "1 main", lookup: "", grams: 520, kcal: 880, proteinG: 35, fatG: 30, carbsG: 115, sodiumMg: 1500, sugarG: 20, satFatG: 8, alcoholG: 0, confidence: "medium", chain: true };
  const found = { index: 1, found: true, kcal: 988, proteinG: 43.9, fatG: 41.8, carbsG: 110, fibreG: null, saltG: 4.2, sugarG: null, satFatG: 9.5, source: "https://www.wagamama.com/menu/curry", per100: false };

  it("replace the estimate's where published; the estimate's stand otherwise", () => {
    const [out] = applyPublished([dish], [0], { dishes: [found] });
    expect(out).toMatchObject({ sodiumMg: 1680, sugarG: 20, satFatG: 9.5, alcoholG: 0, publishedBy: "wagamama.com" });
  });
});
