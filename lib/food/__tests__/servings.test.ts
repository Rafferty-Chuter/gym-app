import { describe, expect, it } from "vitest";
import { G_PER_OZ, amountAfterSwitch, gramsFor, scaleServings, servingName, stepAmount, type ServingUnit } from "@/lib/food/servings";
import { genericPortions } from "@/lib/food/portions";

const egg: ServingUnit = { kind: "portion", portion: { label: "1 medium egg", grams: 50 } };
const g: ServingUnit = { kind: "g" };
const oz: ServingUnit = { kind: "oz" };

describe("serving sizes (C6)", () => {
  it("turns an amount of a serving size into grams", () => {
    expect(gramsFor(1.5, egg)).toBe(75);
    expect(gramsFor(120, g)).toBe(120);
    expect(gramsFor(2, oz)).toBeCloseTo(56.7, 1);
    expect(gramsFor(0, egg)).toBe(0);
    expect(gramsFor(Number.NaN, g)).toBe(0);
  });

  it("names the serving for the entry, leaving plain grams to the grams", () => {
    expect(servingName(1, egg)).toBe("1 medium egg");
    expect(servingName(1.5, egg)).toBe("1.5 × 1 medium egg");
    expect(servingName(3, oz)).toBe("3 oz");
    expect(servingName(150, g)).toBeNull();
  });

  it("keeps the same food when switching to grams or ounces, and starts a portion at one", () => {
    expect(amountAfterSwitch(75, g)).toBe(75);
    expect(amountAfterSwitch(G_PER_OZ * 3, oz)).toBe(3);
    expect(amountAfterSwitch(75, egg)).toBe(1);
    expect(amountAfterSwitch(0, g)).toBe(100);
  });

  it("steps on the unit's grid and never below one step", () => {
    expect(stepAmount(1, egg, 1)).toBe(1.5);
    expect(stepAmount(0.5, egg, -1)).toBe(0.5);
    expect(stepAmount(37, g, 1)).toBe(40);
    expect(stepAmount(37, g, -1)).toBe(30);
    expect(stepAmount(2.3, oz, 1)).toBe(2.5);
  });

  it("scales a saved food by servings, fibre included when it has it", () => {
    expect(scaleServings({ kcal: 210, proteinG: 20, carbsG: 22, fatG: 5, fibreG: 3 }, 1.5)).toEqual({ kcal: 315, proteinG: 30, carbsG: 33, fatG: 7.5, fibreG: 4.5 });
    expect(scaleServings({ kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 }, 2)).not.toHaveProperty("fibreG");
  });

  it("offers household servings for more everyday foods", () => {
    expect(genericPortions("Salmon, farmed, flesh only, grilled")[0]).toEqual({ label: "1 fillet", grams: 120 });
    expect(genericPortions("Rice, white, basmati, raw")[0].label).toBe("1 portion (dry)");
    expect(genericPortions("Bacon rashers, back, grilled")[0].label).toBe("1 rasher");
    expect(genericPortions("Breakfast cereal, cornflakes, fortified")[0].label).toBe("1 bowl");
    expect(genericPortions("Breakfast cereal, oat, instant, plain, fortified, cooked, made up with semi-skimmed milk")).toEqual([]);
    expect(genericPortions("Spinach, dried")).toEqual([]);
    expect(genericPortions("Cheese, Cheddar, English")[0].label).toBe("matchbox piece");
  });
});
