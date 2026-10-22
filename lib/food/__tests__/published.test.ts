import { describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { cofidToItems, type CofidData } from "@/lib/food/cofid";
import { sourceLine } from "@/lib/food/plate";
import { applyPublished, dishesToCheck, MAX_PUBLISHED_DISHES, PUBLISHED_MAX_RATIO, publishedLines, publishedRequest, sourceSite, type PublishedOutputData } from "@/lib/food/published";
import { resolveItem, type ResolvedItem } from "@/lib/food/recipe";

const dish = (label: string, over: Partial<ResolvedItem> = {}): ResolvedItem => ({ label, serving: "1 main", lookup: "", grams: 520, kcal: 880, proteinG: 35, fatG: 30, carbsG: 115, fibreG: 6, confidence: "medium", portions: [], chain: true, ...over });
const found = (index: number, over: Partial<PublishedOutputData["dishes"][number]> = {}) => ({ index, found: true, kcal: 988, proteinG: 43.9, fatG: 41.8, carbsG: 110, fibreG: null, saltG: null, sugarG: null, satFatG: null, source: "https://www.wagamama.com/menu/curry/chicken-katsu-curry", per100: false, ...over });

describe("which dishes are checked (F8)", () => {
  it("only chain dishes the base list did not match, at most MAX_PUBLISHED_DISHES", () => {
    const items = [dish("Katsu curry, Wagamama"), dish("Chips", { chain: false }), dish("Pizza", { chain: true, matched: "Pizza, cheese and tomato, retail" }), dish("Half chicken, Nando's"), dish("Chips, Nando's"), dish("Sausage roll, Greggs"), dish("Wrap, Pret"), dish("Fries, McDonald's")];
    expect(dishesToCheck(items)).toEqual([0, 3, 4, 5, 6, 7].slice(0, MAX_PUBLISHED_DISHES));
    expect(publishedRequest(items, [0, 3])).toBe("1. Katsu curry, Wagamama (1 main)\n2. Half chicken, Nando's (1 main)");
  });
});

// ── Packaged products (IN12) ──

/** SuperNutrio High Protein Whole Milk's UK label, per 100 ml (Waitrose, Tesco, Sainsbury's). */
const LABEL = { kcal: 81, proteinG: 7, fatG: 3.6, carbsG: 4.6, sugarG: 4.4, satFatG: 2.5, saltG: 0.1 };
/** What Describe estimated for two lattes of it on 22 Oct: 230 kcal and 6 g fat for 440 ml. */
const milk = (over: Partial<ResolvedItem> = {}): ResolvedItem => ({ label: "SuperNutrio high protein whole milk", serving: "440 ml", lookup: "milk whole", grams: 440, kcal: 230, proteinG: 31, fatG: 6, carbsG: 22, confidence: "medium", portions: [], chain: false, packaged: true, ...over });
const label = (over: Partial<PublishedOutputData["dishes"][number]> = {}) => ({ index: 1, found: true, ...LABEL, fibreG: null, source: "https://www.waitrose.com/ecom/products/supernutrio-high-protein-fresh-whole-cows-milk/381623-1-2", per100: true, ...over });

describe("a packaged product takes its label, scaled to the amount (IN12)", () => {
  it("is checked as a label line and never takes a generic base-list row", () => {
    const base = cofidToItems((cofidJson as CofidData).foods);
    const resolved = resolveItem(base, milk());
    expect(resolved.matched).toBeUndefined();
    expect(resolveItem(base, milk({ packaged: false })).matched).toMatch(/^Milk, whole/);
    const items = [resolved, dish("Espresso", { chain: false, grams: 60 }), milk({ grams: 0 }), milk({ chain: true, serving: "1 bottle" })];
    expect(dishesToCheck(items)).toEqual([0, 3]);
    expect(publishedLines(items, [0, 3])).toEqual(["SuperNutrio high protein whole milk [label]", "SuperNutrio high protein whole milk (1 bottle)"]);
  });

  it("puts 440 ml at the label's numbers, names the label and the site", () => {
    const [out] = applyPublished([milk()], [0], { dishes: [label()] });
    expect(out).toMatchObject({ kcal: 356, proteinG: 31, fatG: 16, carbsG: 20, sugarG: 19.4, satFatG: 11, sodiumMg: 176, confidence: "high", publishedBy: "waitrose.com", fromLabel: true, grams: 440 });
    expect(sourceLine(out)).toEqual({ text: "Label, waitrose.com", estimate: false });
    expect(sourceLine(applyPublished([dish("Katsu curry, Wagamama")], [0], { dishes: [found(1)] })[0])).toEqual({ text: "Published figures, wagamama.com", estimate: false });
  });

  it("keeps the estimate when the label is per serving, not a food, or for another product", () => {
    for (const bad of [label({ per100: false }), label({ kcal: 950 }), label({ proteinG: 120 }), label({ kcal: 81 * PUBLISHED_MAX_RATIO * 3 })]) {
      expect(applyPublished([milk()], [0], { dishes: [bad] })[0]).toEqual(milk());
    }
    // A chain's dish answered per 100 g is not the serving it was asked for.
    expect(applyPublished([dish("Katsu curry, Wagamama")], [0], { dishes: [found(1, { per100: true })] })[0]).toEqual(dish("Katsu curry, Wagamama"));
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
