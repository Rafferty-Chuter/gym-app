import { describe, expect, it } from "vitest";
import cofidJson from "@/lib/food/data/cofid.json";
import { cofidToItems, type CofidData } from "@/lib/food/cofid";
import { DRINKS, drinkFood, drinkItems, drinkToast, type Drink } from "@/lib/food/drinks";
import { portionChoices } from "@/lib/food/portions";
import { bannedPhrasesIn } from "@/lib/physique/copy";

const items = cofidToItems((cofidJson as CofidData).foods);
const byId = drinkItems(items);
const drink = (id: Drink["id"]) => DRINKS.find((d) => d.id === id)!;

describe("drinks in one tap (IN7)", () => {
  it("every drink is a base-list row with its alcohol known", () => {
    for (const d of DRINKS) {
      const item = byId.get(d.id);
      expect(item, d.label).toBeDefined();
      expect(item!.per100.alcoholG, d.label).toBeGreaterThan(0);
    }
    expect(DRINKS.map((d) => d.id)).toEqual(["pint", "can", "red", "white", "single", "cider"]);
  });

  it("a pint of lager is CoFID's standard lager at 568 ml", () => {
    const f = drinkFood(byId.get("pint")!, drink("pint"), 1);
    expect(f).toMatchObject({ label: "Lager, standard", kcal: 136, alcoholG: 18.2, grams: 568, sourceId: "cofid:17-749", serving: "1 pint · 568 ml", method: "search" });
  });

  it("a count multiplies everything and names the amount", () => {
    const f = drinkFood(byId.get("pint")!, drink("pint"), 3);
    expect(f).toMatchObject({ kcal: 409, alcoholG: 54.5, grams: 1704, serving: "3 × 1 pint · 1,704 ml" });
  });

  it("a single is 25 ml of 40% spirit, weighed at spirit's density", () => {
    const f = drinkFood(byId.get("single")!, drink("single"), 2);
    expect(f.grams).toBe(48);
    expect(f.serving).toBe("2 × single (25 ml) · 50 ml");
    expect(f.alcoholG).toBe(15.1);
    expect(f.kcal).toBe(105);
  });

  it("a glass of wine is the 175 ml pub measure", () => {
    expect(drinkFood(byId.get("red")!, drink("red"), 1)).toMatchObject({ label: "Wine, red", kcal: 133, alcoholG: 18.7, serving: "175 ml glass · 175 ml" });
  });

  it("search offers the same measures", () => {
    const labels = (name: string) => portionChoices(items.find((i) => i.name === name)!).map((p) => p.label);
    expect(labels("Lager, standard")).toEqual(["1 pint", "half pint", "1 can (440 ml)", "330 ml bottle", "100 g"]);
    expect(labels("Stout, Guinness")[0]).toBe("1 pint");
    expect(labels("Wine, white, dry")).toEqual(["175 ml glass", "small glass (125 ml)", "large glass (250 ml)", "bottle (750 ml)", "100 g"]);
    expect(labels("Spirits, 40% volume")).toEqual(["single (25 ml)", "double (50 ml)", "100 g"]);
  });

  it("says what was logged and nothing more", () => {
    const one = drinkFood(byId.get("pint")!, drink("pint"), 1);
    const two = drinkFood(byId.get("pint")!, drink("pint"), 2);
    expect(drinkToast(drink("pint"), one, 1)).toBe("Logged Lager, standard · 136 kcal");
    expect(drinkToast(drink("pint"), two, 2)).toBe("Lager, standard · 2 × 1 pint · 273 kcal");
    expect(drinkToast(drink("pint"), one, 0)).toBe("Removed Lager, standard");
    const copy = [...DRINKS.map((d) => d.label), drinkToast(drink("pint"), one, 1), drinkToast(drink("pint"), two, 2), drinkToast(drink("pint"), one, 0)].join(" ");
    expect(bannedPhrasesIn(copy)).toEqual([]);
    expect(copy).not.toMatch(/units? left|too many|binge|limit|careful|cut back|healthy|guilt|treat/i);
  });
});
