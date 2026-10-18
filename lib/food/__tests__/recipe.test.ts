import { describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { cofidToItems, type CofidData } from "@/lib/food/cofid";
import { acceptMatch, cleanLookup, eatenMacros, estimateCount, matchIngredient, perServing, recipeConfidence, recipeTotals, resolveIngredient, servingLabel, type RecipeIngredient } from "@/lib/food/recipe";

const items = cofidToItems((cofidJson as CofidData).foods);

const est = { kcal: 100, proteinG: 10, carbsG: 10, fatG: 1 };

describe("ingredient matching", () => {
  it("accepts a hit only when every lookup word is in the name", () => {
    expect(acceptMatch("beef mince", "Beef, mince, raw")).toBe(true);
    expect(acceptMatch("passata", "Pasta, white, dried, raw")).toBe(false);
    expect(acceptMatch("chickpeas", "Chick peas, canned, re-heated, drained")).toBe(true);
    expect(acceptMatch("", "Bananas")).toBe(false);
  });

  it("finds generic UK foods and declines near misses", () => {
    expect(matchIngredient(items, "beef mince raw")?.name).toBe("Beef, mince, raw");
    expect(matchIngredient(items, "banana")?.name).toMatch(/^Bananas/);
    // The dried row, not the boiled spaghetti that also carries the word "dried".
    expect(matchIngredient(items, "pasta dried")?.name).toMatch(/dried, raw$/);
    expect(matchIngredient(items, "pasta dried")?.name).not.toMatch(/boiled/);
    // The food itself leads the name: fried eggs, not egg fried rice.
    expect(matchIngredient(items, "eggs fried")?.name).toMatch(/^Eggs?,/);
    expect(matchIngredient(items, "cheddar")?.name).toMatch(/Cheddar/);
    // A long composite dish that happens to contain the words is not the food.
    const spice = matchIngredient(items, "mixed spice");
    expect(spice === null || spice.name.split(",").length <= 5).toBe(true);
    expect(spice?.name ?? "").not.toMatch(/Vegetables, mixed, cooked/);
    expect(matchIngredient(items, "zzzz unknown sauce")).toBeNull();
  });

  it("names the food where CoFID names it, so a dish that contains the words is not the food", () => {
    expect(matchIngredient(items, "tomatoes tinned")?.name).toBe("Tomatoes, canned, whole contents");
    expect(matchIngredient(items, "toast")?.name ?? "").not.toMatch(/prawn/i);
    expect(matchIngredient(items, "salmon")?.name).toMatch(/^Salmon,/);
  });

  it("prefers the plain food over substitutes, preserved forms, parts and other animals", () => {
    expect(matchIngredient(items, "cream double")?.name).toMatch(/^Cream, fresh, double/);
    expect(matchIngredient(items, "double cream")?.name).toMatch(/^Cream, fresh, double/);
    expect(matchIngredient(items, "spinach")?.name).not.toMatch(/dried/);
    expect(matchIngredient(items, "mushrooms", { preferRaw: true })?.name).toBe("Mushrooms, white, raw");
    expect(matchIngredient(items, "bacon")?.name ?? "").not.toMatch(/fat only/);
    expect(matchIngredient(items, "milk", { preferRaw: true })?.name).not.toMatch(/sheep/i);
    expect(matchIngredient(items, "greek yoghurt")?.name).toMatch(/^Yogurt, Greek/);
    expect(matchIngredient(items, "sugar caster")?.name).toBe("Sugar, white");
    expect(matchIngredient(items, "rice basmati")?.name).toMatch(/^Rice, white, basmati/);
    // A pasta shape CoFID only lists in wholewheat takes plain white pasta.
    expect(matchIngredient(items, "spaghetti dried raw")?.name).toBe("Pasta, white, dried, raw");
    expect(matchIngredient(items, "penne", { preferRaw: true })?.name).toBe("Pasta, white, dried, raw");
  });

  it("weighs recipe ingredients raw when no state is named, and never takes a raw row of another food", () => {
    expect(matchIngredient(items, "potatoes", { preferRaw: true })?.name).toMatch(/raw/);
    expect(matchIngredient(items, "eggs", { preferRaw: true })?.name).toBe("Eggs, chicken, whole, raw");
    expect(matchIngredient(items, "onion", { preferRaw: true })?.name).toBe("Onions, raw");
    expect(matchIngredient(items, "butter", { preferRaw: true })?.name).toMatch(/^Butter/);
    // A named state wins over the raw default.
    expect(matchIngredient(items, "potatoes boiled", { preferRaw: true })?.name).toMatch(/boiled/);
  });

  it("folds UK recipe words onto CoFID's and drops preparation words", () => {
    expect(cleanLookup("Tinned chopped tomatoes")).toBe("canned tomatoes");
    expect(cleanLookup("Greek yoghurt, fresh")).toBe("greek yogurt");
  });

  it("uses the base list when matched and the estimate when not", () => {
    const hit = resolveIngredient(items, { name: "mince", lookup: "beef mince raw", grams: 500.4, per100: est });
    expect(hit.source).toBe("cofid");
    expect(hit.matched).toMatch(/^Beef, mince/);
    expect(hit.grams).toBe(500);
    expect(hit.per100.kcal).not.toBe(100);
    const miss = resolveIngredient(items, { name: "secret sauce", lookup: "zzzz unknown sauce", grams: 50, per100: est });
    expect(miss.source).toBe("estimate");
    expect(miss.per100).toEqual(est);
    expect(miss.matched).toBeUndefined();
  });
});

describe("recipe maths", () => {
  const ings: RecipeIngredient[] = [
    { name: "rice", grams: 200, per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }, source: "cofid", matched: "Rice, white, boiled" },
    { name: "chicken", grams: 300, per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 }, source: "cofid", matched: "Chicken, breast, grilled" },
    { name: "sauce", grams: 100, per100: { kcal: 80, proteinG: 1, carbsG: 10, fatG: 4 }, source: "estimate" },
  ];

  it("sums per 100 g values by grams and rounds once", () => {
    // 260 + 495 + 80 = 835 kcal; 5.4 + 93 + 1 = 99.4 g protein
    expect(recipeTotals(ings)).toEqual({ kcal: 835, proteinG: 99, carbsG: 66, fatG: 15 });
  });

  it("divides into servings and scales what was eaten", () => {
    expect(perServing(ings, 4)).toEqual({ kcal: 209, proteinG: 25, carbsG: 17, fatG: 4 });
    expect(eatenMacros(ings, 4, 1.5)).toEqual({ kcal: 313, proteinG: 37, carbsG: 25, fatG: 6 });
    expect(eatenMacros(ings, 0, 1)).toEqual(recipeTotals(ings));
  });

  it("labels the portion and the confidence plainly", () => {
    expect(servingLabel(1, 4)).toBe("1 serving of 4");
    expect(servingLabel(1.5, 4)).toBe("1.5 servings of 4");
    expect(servingLabel(4, 4)).toBe("the whole recipe (4 servings)");
    expect(servingLabel(1, 1)).toBe("1 serving");
    expect(recipeConfidence(ings)).toBe("medium");
    expect(recipeConfidence(ings.slice(0, 2))).toBe("high");
    expect(recipeConfidence([])).toBe("low");
    expect(estimateCount(ings)).toBe(1);
  });
});

describe("described meal items", () => {
  it("takes the base list's numbers when the lookup matches and grams are known", async () => {
    const { resolveItem } = await import("@/lib/food/recipe");
    const r = resolveItem(items, { label: "Eggs, fried", serving: "2 medium", lookup: "eggs fried", grams: 120, kcal: 999, proteinG: 1, fatG: 1, carbsG: 1, confidence: "medium" });
    expect(r.matched).toMatch(/^Eggs, chicken, whole, fried/);
    expect(r.confidence).toBe("high");
    expect(r.kcal).toBeGreaterThan(150);
    expect(r.kcal).toBeLessThan(300);
  });

  it("keeps the estimate when nothing matches or the weight is unknown", async () => {
    const { resolveItem } = await import("@/lib/food/recipe");
    const miss = resolveItem(items, { label: "Chicken katsu curry, Wagamama", serving: "1 dish", lookup: "", grams: 0, kcal: 1085, proteinG: 40, fatG: 40, carbsG: 140, confidence: "medium" });
    expect(miss.matched).toBeUndefined();
    expect(miss.kcal).toBe(1085);
    expect(miss.confidence).toBe("medium");
    const noWeight = resolveItem(items, { label: "Eggs", serving: "some", lookup: "eggs fried", grams: 0, kcal: 200, proteinG: 14, fatG: 15, carbsG: 0, confidence: "low" });
    expect(noWeight.matched).toBeUndefined();
    expect(noWeight.kcal).toBe(200);
  });
});
