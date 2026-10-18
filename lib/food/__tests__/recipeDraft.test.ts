import { describe, expect, it } from "vitest";
import { draftFromPlate, draftFromRecipe, draftFromSaved, draftIssue, draftMacros, eatenLabel, eatenServings, emptyDraft, ingredientGrams, portionPill, servingGrams, toSavedRecipe, unitLabel, type RecipeDraft } from "@/lib/food/recipeDraft";
import { toPlate, withGrams } from "@/lib/food/plate";
import type { ResolvedItem, RecipeIngredient } from "@/lib/food/recipe";
import type { SavedFood } from "@/lib/physique/types";

const eggs: ResolvedItem = { label: "Eggs, fried", serving: "2 eggs", lookup: "eggs fried", grams: 120, kcal: 240, proteinG: 16, fatG: 18, carbsG: 0, confidence: "high", matched: "Eggs, chicken, whole, fried" };
const curry: ResolvedItem = { label: "Katsu curry", serving: "1 bowl", lookup: "", grams: 0, kcal: 1000, proteinG: 40, fatG: 35, carbsG: 130, confidence: "medium" };
const rice: RecipeIngredient = { name: "Rice", grams: 400, per100: { kcal: 350, proteinG: 7, carbsG: 78, fatG: 1 }, source: "cofid", matched: "Rice, white, raw" };
const chicken: RecipeIngredient = { name: "Chicken", grams: 600, per100: { kcal: 150, proteinG: 25, carbsG: 0, fatG: 5 }, source: "estimate" };
const draft: RecipeDraft = { name: "Chicken and rice", servings: 4, totalGrams: 1800, ingredients: [rice, chicken] };

describe("making a recipe from the Describe plate", () => {
  it("keeps each weighed food's numbers per 100 g at the amount shown", () => {
    const d = draftFromPlate([withGrams(toPlate([eggs])[0], 60)]);
    expect(d.name).toBe("");
    expect(d.servings).toBe(1);
    const [ing] = d.ingredients;
    expect(ing).toMatchObject({ name: "Eggs, fried", grams: 60, source: "cofid", matched: "Eggs, chicken, whole, fried" });
    expect(ing.per100.kcal).toBeCloseTo(200);
    expect(draftMacros(d, "recipe").kcal).toBe(120);
  });

  it("turns a food with no weight into a counted portion that no weight includes", () => {
    const d = draftFromPlate(toPlate([curry, eggs]));
    const bowl = d.ingredients[0];
    expect(bowl.portion).toBe("1 bowl");
    expect(portionPill(bowl)).toEqual({ value: "1", unit: "1 bowl" });
    expect(draftMacros(d, "recipe").kcal).toBe(1240);
    expect(ingredientGrams(d.ingredients)).toBe(120);
  });

  it("starts from a recipe Describe read, or from a saved recipe", () => {
    expect(draftFromRecipe({ name: "Chilli", servings: 4, ingredients: [rice] })).toEqual({ name: "Chilli", servings: 4, totalGrams: null, ingredients: [rice] });
    const saved: SavedFood = { id: "s1", label: "Chicken and rice", kcal: 575, proteinG: 45, carbsG: 78, fatG: 9, recipe: { servings: 4, ingredients: [rice, chicken], totalGrams: 1800 }, lastUsedAt: "2026-10-18T10:00:00Z", useCount: 2, schemaVersion: 1 };
    expect(draftFromSaved(saved)).toEqual({ savedId: "s1", ...draft });
    expect(draftFromSaved({ ...saved, recipe: undefined })).toBeNull();
  });
});

describe("portions", () => {
  it("divides the cooked weight into servings and logs grams as a share of them", () => {
    expect(servingGrams(draft)).toBe(450);
    expect(eatenServings(draft, 675, "grams")).toBe(1.5);
    expect(eatenServings(draft, 2, "servings")).toBe(2);
    expect(eatenServings({ ...draft, totalGrams: null }, 300, "grams")).toBe(0);
  });

  it("gives one serving and the whole recipe from the same rows", () => {
    // 1,400 + 900 kcal across 4 servings.
    expect(draftMacros(draft, "recipe").kcal).toBe(2300);
    expect(draftMacros(draft, "serving").kcal).toBe(575);
  });

  it("names a serving with its weight when the recipe was weighed", () => {
    expect(unitLabel(draft)).toBe("1 serving (450 g)");
    expect(unitLabel({ servings: 4, totalGrams: null })).toBe("1 serving of 4");
    expect(eatenLabel(draft, 1.5, "servings")).toBe("1.5 servings of 4 (675 g)");
    expect(eatenLabel(draft, 300, "grams")).toBe("300 g of 4 servings");
  });

  it("asks for ingredients, then a name, before saving", () => {
    expect(draftIssue(emptyDraft())).toBe("Add an ingredient to save it.");
    expect(draftIssue({ ...draft, name: "  " })).toBe("Name the recipe to save it.");
    expect(draftIssue(draft)).toBeNull();
    expect(toSavedRecipe({ ...draft, servings: 3.6, totalGrams: 1800.4 })).toEqual({ servings: 4, ingredients: [rice, chicken], totalGrams: 1800 });
    expect(toSavedRecipe({ ...draft, totalGrams: null })).not.toHaveProperty("totalGrams");
  });
});
