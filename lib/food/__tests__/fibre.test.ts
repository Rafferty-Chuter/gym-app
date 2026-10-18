import { describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { cofidToItems, type CofidData } from "@/lib/food/cofid";
import { FIBRE_KNOWN_SHARE, knownFibre } from "@/lib/food/fibre";
import { eatenMacros, perServing, recipeTotals, resolveIngredient, resolveItem, type RecipeIngredient } from "@/lib/food/recipe";
import { plateItemMacros, plateTotals, toPlate, withMacros } from "@/lib/food/plate";
import { draftFromPlate } from "@/lib/food/recipeDraft";

const items = cofidToItems((cofidJson as CofidData).foods);
const ing = (name: string, grams: number, per100: RecipeIngredient["per100"]): RecipeIngredient => ({ name, grams, per100, source: "cofid" });

describe("fibre totals (F7)", () => {
  it("sums fibre only when parts with a value carry most of the energy", () => {
    expect(knownFibre([{ kcal: 300, fibreG: 4 }, { kcal: 200, fibreG: 2.25 }])).toBe(6.3);
    // 80% of the energy known: read.
    expect(knownFibre([{ kcal: 400, fibreG: 5 }, { kcal: 100 }])).toBe(5);
    expect(FIBRE_KNOWN_SHARE).toBe(0.8);
    // Under it: unknown, never a low number.
    expect(knownFibre([{ kcal: 300, fibreG: 5 }, { kcal: 200 }])).toBeUndefined();
    expect(knownFibre([])).toBeUndefined();
    // No energy at all: read only when every part has a value.
    expect(knownFibre([{ kcal: 0, fibreG: 0 }])).toBe(0);
    expect(knownFibre([{ kcal: 0 }])).toBeUndefined();
  });

  it("carries fibre through a recipe, scaled to the servings eaten", () => {
    const oats = ing("oats", 80, { kcal: 375, proteinG: 11, carbsG: 60, fatG: 8, fibreG: 9 });
    const milk = ing("milk", 300, { kcal: 46, proteinG: 3.5, carbsG: 4.7, fatG: 1.7, fibreG: 0 });
    expect(recipeTotals([oats, milk]).fibreG).toBe(7.2);
    expect(perServing([oats, milk], 2).fibreG).toBe(3.6);
    expect(eatenMacros([oats, milk], 2, 1.5).fibreG).toBe(5.4);
    // A big ingredient without a value leaves the recipe's fibre unknown, as a key that replaces an older value when spread.
    const sauce = ing("sauce", 300, { kcal: 150, proteinG: 2, carbsG: 10, fatG: 11 });
    const m = perServing([oats, milk, sauce], 2);
    expect("fibreG" in m && m.fibreG === undefined).toBe(true);
    expect({ fibreG: 9, ...m }.fibreG).toBeUndefined();
  });

  it("takes fibre from the base list, and the model's estimate only where the row has none", () => {
    const lentils = resolveIngredient(items, { name: "lentils", lookup: "lentils red dried", grams: 200, per100: { kcal: 300, proteinG: 24, fatG: 1, carbsG: 50, fibreG: 99 } });
    expect(lentils.source).toBe("cofid");
    expect(lentils.per100.fibreG).not.toBe(99);
    expect(lentils.per100.fibreG).toBeGreaterThan(0);
    const buckwheat = resolveIngredient(cofidToItems([["11-006", "Buckwheat, groats", "AA", 364, 8.1, 1.5, 84.9, null]]), { name: "buckwheat", lookup: "buckwheat groats", grams: 100, per100: { kcal: 360, proteinG: 8, fatG: 2, carbsG: 85, fibreG: 4.5 } });
    expect(buckwheat).toMatchObject({ source: "cofid", per100: { kcal: 364, fibreG: 4.5 } });
    const estimate = resolveIngredient(items, { name: "mystery paste", lookup: "", grams: 50, per100: { kcal: 200, proteinG: 2, fatG: 10, carbsG: 20, fibreG: 3 } });
    expect(estimate).toMatchObject({ source: "estimate", per100: { fibreG: 3 } });
  });

  it("scales a meal item's fibre to the matched weight, and keeps the estimate when nothing matches", () => {
    const banana = resolveItem(items, { label: "Banana", serving: "2 medium", lookup: "banana", grams: 200, kcal: 180, proteinG: 2, fatG: 0, carbsG: 40, fibreG: 9, confidence: "medium" });
    expect(banana.matched).toMatch(/^Bananas/);
    const row = items.find((i) => i.name === banana.matched)!;
    expect(banana.fibreG).toBe(Math.round((row.per100.fibreG as number) * 2 * 10) / 10);
    const katsu = resolveItem(items, { label: "Katsu curry, Wagamama", serving: "1 bowl", lookup: "", grams: 0, kcal: 1000, proteinG: 40, fatG: 30, carbsG: 140, fibreG: 6, confidence: "medium" });
    expect(katsu.fibreG).toBe(6);
  });

  it("keeps fibre on the Describe plate and into Make recipe, and drops it once the numbers are typed over", () => {
    const [p] = toPlate([{ label: "Beans", serving: "200 g", lookup: "", grams: 200, kcal: 160, proteinG: 10, fatG: 1, carbsG: 26, fibreG: 10, confidence: "medium" }]);
    expect(plateItemMacros({ ...p, amount: 1.5 }).fibreG).toBe(15);
    expect(plateTotals([p, { ...p, label: "Rice", fibreG: undefined, kcal: 40 }]).fibreG).toBe(10);
    expect(plateTotals([p, { ...p, label: "Rice", fibreG: undefined, kcal: 400 }]).fibreG).toBeUndefined();
    expect(draftFromPlate([{ ...p, amount: 2 }]).ingredients[0].per100.fibreG).toBe(5);
    expect(withMacros(p, { kcal: 160, proteinG: 12, fatG: 1, carbsG: 26, label: "Black beans" }).fibreG).toBe(10);
    expect(withMacros(p, { kcal: 220, proteinG: 10, fatG: 1, carbsG: 26 }).fibreG).toBeUndefined();
  });
});
