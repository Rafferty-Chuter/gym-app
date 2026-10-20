import { describe, expect, it } from "vitest";
import { amountPill, choiceLabel, isPortion, plateItemGrams, plateItemMacros, plateServing, plateTotals, portionChoices, rowSize, sourceLine, toPlate, withAmount, withGrams, withMacros, withPortion } from "@/lib/food/plate";
import type { ResolvedItem } from "@/lib/food/recipe";

const eggs: ResolvedItem = { label: "Eggs, fried", serving: "2 eggs", lookup: "eggs fried", grams: 120, kcal: 240, proteinG: 16, fatG: 18, carbsG: 0, confidence: "high", matched: "Eggs, chicken, whole, fried" };
const curry: ResolvedItem = { label: "Katsu curry, Wagamama", serving: "1 bowl", lookup: "", grams: 0, kcal: 1000, proteinG: 40, fatG: 35, carbsG: 130, confidence: "medium" };

describe("the Describe plate", () => {
  it("starts at what was described", () => {
    const [p] = toPlate([eggs]);
    expect(p.amount).toBe(1);
    expect(plateItemMacros(p)).toEqual({ kcal: 240, proteinG: 16, fatG: 18, carbsG: 0 });
    expect(amountPill(p)).toEqual({ value: "120", unit: "g" });
    expect(plateServing(p)).toBe("2 eggs");
  });

  it("scales by weight when the weight is known", () => {
    const p = withGrams(toPlate([eggs])[0], 180);
    expect(plateItemGrams(p)).toBe(180);
    expect(plateItemMacros(p).kcal).toBe(360);
    expect(plateServing(p)).toBe("180 g");
  });

  it("scales by portions when it is not", () => {
    const p = withAmount(toPlate([curry])[0], 0.5);
    expect(amountPill(p)).toEqual({ value: "0.5", unit: "1 bowl" });
    expect(plateItemMacros(p).kcal).toBe(500);
    expect(plateServing(p)).toBe("0.5 × 1 bowl");
    expect(withGrams(p, 300)).toBe(p);
    expect(withAmount(p, 99).amount).toBe(20);
  });

  it("takes typed-in macros as the user's own, at the current weight", () => {
    const p = withMacros(withGrams(toPlate([eggs])[0], 60), { kcal: 150, proteinG: 8, fatG: 12, carbsG: 1 });
    expect(p.amount).toBe(1);
    expect(p.grams).toBe(60);
    expect(p.matched).toBeUndefined();
    expect(plateItemMacros(p).kcal).toBe(150);
  });

  it("totals the rows as shown and labels the quick choices", () => {
    const plate = [withGrams(toPlate([eggs])[0], 60), ...toPlate([curry])];
    expect(plateTotals(plate)).toEqual({ kcal: 1120, proteinG: 48, fatG: 44, carbsG: 130 });
    expect([0.5, 1, 1.5, 2].map(choiceLabel)).toEqual(["½×", "1×", "1½×", "2×"]);
    expect(sourceLine(eggs)).toEqual({ text: "Eggs, chicken, whole, fried", estimate: false });
    expect(sourceLine({ ...curry, confidence: "low" })).toEqual({ text: "Rough estimate", estimate: true });
  });
});

describe("portions on the plate (F8)", () => {
  const pizza: ResolvedItem = { label: "Pepperoni pizza, Tottenham Hotspur Stadium", serving: "1 whole 12-inch pizza", lookup: "pizza", grams: 560, kcal: 1523, proteinG: 68, fatG: 55, carbsG: 202, confidence: "high", matched: "Pizza, cheese and tomato, retail", portions: [{ label: "1 slice", factor: 0.125 }, { label: "Half", factor: 0.5 }] };

  it("offers what was described among the other sizes, smallest first", () => {
    const [p] = toPlate([pizza]);
    expect(portionChoices(p).map((c) => c.label)).toEqual(["1 slice", "Half", "1 whole 12-inch pizza"]);
    expect(portionChoices(toPlate([eggs])[0])).toEqual([]);
  });

  it("a picked size sets the amount and names the row and the logged serving", () => {
    const [p] = toPlate([pizza]);
    expect(rowSize(p)).toBe("1 whole 12-inch pizza");
    const slice = withPortion(p, portionChoices(p)[0]);
    expect(plateItemGrams(slice)).toBe(70);
    expect(plateItemMacros(slice).kcal).toBe(190);
    expect(rowSize(slice)).toBe("1 slice");
    expect(plateServing(slice)).toBe("1 slice");
    expect(isPortion(slice, portionChoices(p)[0])).toBe(true);
    // Back to the whole: the described serving again; a typed weight drops the name.
    expect(plateServing(withPortion(slice, portionChoices(p)[2]))).toBe("1 whole 12-inch pizza");
    expect(plateServing(withGrams(slice, 100))).toBe("100 g");
    expect(withAmount(slice, 2).portion).toBeUndefined();
  });

  it("names a picked size in the pill when the weight is not known", () => {
    const [bowl] = toPlate([{ ...curry, portions: [{ label: "Small bowl", factor: 0.7 }] }]);
    expect(amountPill(withPortion(bowl, { label: "Small bowl", factor: 0.7 }))).toEqual({ value: "1", unit: "Small bowl" });
    expect(rowSize(bowl)).toBeNull();
  });

  it("says when the numbers are a chain's published figures", () => {
    expect(sourceLine({ ...curry, publishedBy: "wagamama.com" })).toEqual({ text: "Published figures, wagamama.com", estimate: false });
  });
});
