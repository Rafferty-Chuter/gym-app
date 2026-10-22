import { describe, expect, it } from "vitest";
import { applyPublished, dishesToCheck, MAX_PUBLISHED_DISHES, PUBLISHED_MAX_RATIO, publishedRequest, sourceSite, type PublishedOutputData } from "@/lib/food/published";
import type { ResolvedItem } from "@/lib/food/recipe";

const dish = (label: string, over: Partial<ResolvedItem> = {}): ResolvedItem => ({ label, serving: "1 main", lookup: "", grams: 520, kcal: 880, proteinG: 35, fatG: 30, carbsG: 115, fibreG: 6, confidence: "medium", portions: [], chain: true, ...over });
const found = (index: number, over: Partial<PublishedOutputData["dishes"][number]> = {}) => ({ index, found: true, kcal: 988, proteinG: 43.9, fatG: 41.8, carbsG: 110, fibreG: null, saltG: null, sugarG: null, satFatG: null, source: "https://www.wagamama.com/menu/curry/chicken-katsu-curry", ...over });

describe("which dishes are checked (F8)", () => {
  it("only chain dishes the base list did not match, at most three", () => {
    const items = [dish("Katsu curry, Wagamama"), dish("Chips", { chain: false }), dish("Pizza", { chain: true, matched: "Pizza, cheese and tomato, retail" }), dish("Half chicken, Nando's"), dish("Chips, Nando's"), dish("Sausage roll, Greggs")];
    expect(dishesToCheck(items)).toEqual([0, 3, 4].slice(0, MAX_PUBLISHED_DISHES));
    expect(publishedRequest(items, [0, 3])).toBe("1. Katsu curry, Wagamama (1 main)\n2. Half chicken, Nando's (1 main)");
  });
});

describe("published figures replace the estimate only when they hold up (F8)", () => {
  const items = [dish("Chicken katsu curry, Wagamama"), dish("Chips", { chain: false })];

  it("takes the chain's figures, names the site and keeps the estimate's fibre when none is published", () => {
    const out = applyPublished(items, [0], { dishes: [found(1)] });
    expect(out[0]).toMatchObject({ kcal: 988, proteinG: 44, fatG: 42, carbsG: 110, fibreG: 6, confidence: "high", publishedBy: "wagamama.com", grams: 520 });
    expect(out[0].matched).toBeUndefined();
    expect(out[1]).toEqual(items[1]);
    expect(applyPublished(items, [0], { dishes: [found(1, { fibreG: 7.25 })] })[0].fibreG).toBe(7.3);
  });

  it("keeps the estimate when nothing usable came back", () => {
    for (const bad of [found(1, { found: false }), found(1, { source: "Wagamama UK nutrition info" }), found(1, { source: "" }), found(1, { kcal: 0 }), found(1, { kcal: -5 }), found(1, { kcal: Number.NaN }), found(1, { kcal: 880 * PUBLISHED_MAX_RATIO + 1 }), found(1, { kcal: 880 / PUBLISHED_MAX_RATIO - 1 }), found(9)]) {
      expect(applyPublished(items, [0], { dishes: [bad] })[0]).toEqual(items[0]);
    }
    expect(applyPublished(items, [0], null)).toEqual(items);
  });

  it("uses the first answer for a dish and reconciles macros with the calories", () => {
    const out = applyPublished(items, [0], { dishes: [found(1), found(1, { kcal: 1500 })] });
    expect(out[0].kcal).toBe(988);
    const slipped = applyPublished(items, [0], { dishes: [found(1, { kcal: 900, proteinG: 40, fatG: 90, carbsG: 100 })] })[0];
    expect(4 * slipped.proteinG + 4 * slipped.carbsG + 9 * slipped.fatG).toBeLessThanOrEqual(900 * 1.25 + 10 + 9);
  });

  it("reads the site from a web address only", () => {
    expect(sourceSite("https://www.nandos.co.uk/food/menu/peri-peri-chips")).toBe("nandos.co.uk");
    expect(sourceSite("Nando's website")).toBeNull();
    expect(sourceSite("javascript:alert(1)")).toBeNull();
  });
});
