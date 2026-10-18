import { describe, expect, it } from "vitest";
import { compactDescription, reconcileEnergy, describeErrorText, errorFromStatus, looksLikeRecipe, MAX_INGREDIENTS, MAX_NAME_CHARS, modeFor, sanitiseParse, shortText } from "@/lib/food/describe";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { FOOD_PARSE_ERRORS, type FoodParseOutputData } from "@/lib/physique/food/parseSchema";

const per100 = { kcal: 100, proteinG: 10, fatG: 5, carbsG: 10 };
const ing = (name: string, grams: number) => ({ name, lookup: name, grams, per100 });
const item = (label: string, grams = 100) => ({ label, serving: "1 portion", lookup: label, grams, kcal: 200, proteinG: 10, fatG: 8, carbsG: 20, confidence: "medium" as const });
const reply = (over: Partial<FoodParseOutputData>): FoodParseOutputData => ({ kind: "meal", items: [], recipe: { name: "", servings: 1, ingredients: [] }, ...over });

describe("reading the text", () => {
  it("knows a pasted recipe from a meal", () => {
    expect(looksLikeRecipe("Chicken curry\nServes 4\n500 g chicken thighs\n1 onion")).toBe(true);
    expect(looksLikeRecipe("Ingredients:\n- 200g pasta")).toBe(true);
    expect(looksLikeRecipe("500 g mince\n1 jar passata\n300 g pasta\n1 onion\n2 cloves garlic\n1 tbsp oil")).toBe(true);
    expect(looksLikeRecipe("2 eggs on toast with butter, a flat white")).toBe(false);
    expect(looksLikeRecipe("150 g chicken\n200 g rice\n100 g broccoli")).toBe(false);
    expect(modeFor("2 eggs on toast")).toBe("auto");
    expect(modeFor("Serves 2. 400 g salmon")).toBe("recipe");
    expect(modeFor("Serves 2. 400 g salmon", "meal")).toBe("meal");
  });

  it("tidies whitespace and keeps a short text as it is", () => {
    expect(compactDescription("  2 eggs\r\n\r\n\r\n\r\ntoast   and  tea  ")).toEqual({ text: "2 eggs\n\ntoast and tea", methodDropped: false });
  });

  it("drops the method of a long recipe page but keeps its servings line", () => {
    const method = "Method\n" + "Stir the sauce slowly and taste it. ".repeat(60) + "\nServes 4 people";
    const text = "Lasagne\n500 g beef mince\n1 jar passata\n12 lasagne sheets\n" + method;
    const out = compactDescription(text, 400);
    expect(out?.methodDropped).toBe(true);
    expect(out?.text).toContain("500 g beef mince");
    expect(out?.text).not.toContain("Stir the sauce");
    expect(out?.text).toContain("Serves 4 people");
  });

  it("says no when even the ingredients are too long", () => {
    expect(compactDescription("x ".repeat(500), 200)).toBeNull();
  });
});

describe("making the reply safe", () => {
  it("cuts names at a word and never fails on long text", () => {
    const long = "Slow cooked Moroccan spiced lamb shoulder with apricots, chickpeas and preserved lemon";
    expect(shortText(long, MAX_NAME_CHARS).length).toBeLessThanOrEqual(MAX_NAME_CHARS);
    expect(shortText(long, MAX_NAME_CHARS)).toMatch(/^Slow cooked Moroccan/);
    expect(shortText(long, MAX_NAME_CHARS).endsWith(" ")).toBe(false);
    const out = sanitiseParse(reply({ kind: "recipe", recipe: { name: long, servings: 4, ingredients: [ing("lamb", 1200)] } }), "recipe");
    expect(out.recipe?.name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });

  it("makes servings a whole number from 1 to 50", () => {
    const at = (servings: number) => sanitiseParse(reply({ kind: "recipe", recipe: { name: "Stew", servings, ingredients: [ing("beef", 500)] } }), "recipe").recipe?.servings;
    expect(at(4.5)).toBe(5);
    expect(at(0)).toBe(1);
    expect(at(-3)).toBe(1);
    expect(at(120)).toBe(50);
    expect(at(Number.NaN)).toBe(1);
  });

  it("clamps numbers, caps the list and drops ingredients with no weight", () => {
    const many = Array.from({ length: 55 }, (_, i) => ing(`ingredient ${i}`, 10));
    const out = sanitiseParse(reply({ kind: "recipe", recipe: { name: "Big", servings: 6, ingredients: [...many, ing("salt", 0), { name: "lard", lookup: "lard", grams: 50, per100: { kcal: 1500, proteinG: -2, fatG: 160, carbsG: 0 } }] } }), "recipe");
    expect(out.recipe?.ingredients.length).toBe(MAX_INGREDIENTS);
    expect(out.recipe?.ingredients.some((g) => g.name === "salt")).toBe(false);
    const lard = sanitiseParse(reply({ kind: "recipe", recipe: { name: "Lard", servings: 1, ingredients: [{ name: "lard", lookup: "lard", grams: 50, per100: { kcal: 1500, proteinG: -2, fatG: 160, carbsG: 0 } }] } }), "recipe").recipe!.ingredients[0];
    expect(lard.per100).toEqual({ kcal: 900, proteinG: 0, fatG: 100, carbsG: 0 });
  });

  it("follows what came back when it is filed under the wrong heading", () => {
    // Recipe mode, but the model listed items: they become ingredients.
    const asItems = sanitiseParse(reply({ kind: "meal", items: [item("mince", 500), item("pasta", 300)] }), "recipe");
    expect(asItems.kind).toBe("recipe");
    expect(asItems.recipe?.ingredients.map((g) => g.name)).toEqual(["mince", "pasta"]);
    expect(asItems.recipe?.ingredients[0].per100.kcal).toBeCloseTo(40);
    // Auto mode: a "recipe" with no ingredients is a meal; items with no kind fit stay items.
    expect(sanitiseParse(reply({ kind: "recipe", items: [item("eggs")] }), "auto").kind).toBe("meal");
    expect(sanitiseParse(reply({ kind: "meal", recipe: { name: "Chilli", servings: 4, ingredients: [ing("beef", 500)] } }), "auto").kind).toBe("recipe");
    // Meal mode: ingredients become items at their weight.
    const asMeal = sanitiseParse(reply({ kind: "recipe", recipe: { name: "Chilli", servings: 4, ingredients: [ing("beef", 500)] } }), "meal");
    expect(asMeal.kind).toBe("meal");
    expect(asMeal.items[0]).toMatchObject({ label: "beef", grams: 500, kcal: 500 });
  });
});

describe("energy check on estimates", () => {
  it("solves a slipped fat from the calories", () => {
    expect(reconcileEnergy({ kcal: 120, proteinG: 19, fatG: 50, carbsG: 0 })).toEqual({ kcal: 120, proteinG: 19, fatG: 4.9, carbsG: 0 });
  });

  it("leaves consistent estimates and alcohol alone", () => {
    const chicken = { kcal: 120, proteinG: 19, fatG: 5, carbsG: 0 };
    expect(reconcileEnergy(chicken)).toBe(chicken);
    const beer = { kcal: 43, proteinG: 0.5, fatG: 0, carbsG: 3.6 };
    expect(reconcileEnergy(beer)).toBe(beer);
  });

  it("moves on to carbs, then scales everything when no single macro explains it", () => {
    expect(reconcileEnergy({ kcal: 100, proteinG: 2, fatG: 0, carbsG: 80 }).carbsG).toBe(23);
    const scaled = reconcileEnergy({ kcal: 50, proteinG: 20, fatG: 0, carbsG: 0 });
    expect(4 * scaled.proteinG).toBeCloseTo(50);
  });

  it("is applied to every estimate in a reply", () => {
    const out = sanitiseParse(reply({ kind: "recipe", recipe: { name: "Curry", servings: 4, ingredients: [{ name: "chicken thighs", lookup: "chicken thigh raw", grams: 1000, per100: { kcal: 120, proteinG: 19, fatG: 100, carbsG: 0 } }] } }), "recipe");
    expect(out.recipe!.ingredients[0].per100.fatG).toBeCloseTo(4.9);
  });
});

describe("failures", () => {
  it("maps statuses and says something plain and specific for each", () => {
    expect(errorFromStatus(503)).toBe("not_configured");
    expect(errorFromStatus(429)).toBe("limit");
    expect(errorFromStatus(413)).toBe("too_long");
    expect(errorFromStatus(504)).toBe("timeout");
    expect(errorFromStatus(500)).toBe("error");
    const texts = FOOD_PARSE_ERRORS.map(describeErrorText);
    expect(new Set(texts).size).toBe(texts.length);
    for (const t of texts) {
      expect(t).not.toMatch(/[!—]/);
      expect(bannedPhrasesIn(t)).toEqual([]);
    }
  });
});
