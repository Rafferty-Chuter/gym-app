import { describe, expect, it } from "vitest";
import { KG_PER_LB, cmToFtIn, displayToKg, formatBodyWeight, formatHeight, formatKcal, formatWeight, ftInToCm, kgToDisplay, parseWeightText } from "@/lib/units";

describe("units", () => {
  it("round-trips kg ↔ lb", () => {
    expect(kgToDisplay(100, "lb")).toBeCloseTo(220.462, 2);
    expect(displayToKg(kgToDisplay(82.4, "lb"), "lb")).toBeCloseTo(82.4, 9);
    expect(KG_PER_LB).toBe(0.45359237);
  });

  it("formats", () => {
    expect(formatWeight(82.44, "kg")).toBe("82.4 kg");
    expect(formatWeight(82.44, "lb", 0)).toBe("182 lb");
    expect(formatKcal(2949.6)).toBe("2,950 kcal");
  });

  it("parseWeightText returns null for blank, BW and junk", () => {
    expect(parseWeightText("", "kg")).toBeNull();
    expect(parseWeightText("BW", "kg")).toBeNull();
    expect(parseWeightText("abc", "kg")).toBeNull();
    expect(parseWeightText("0", "kg")).toBeNull();
    expect(parseWeightText("80", "kg")).toBe(80);
    expect(parseWeightText("100", "lb")).toBeCloseTo(45.359, 3);
    expect(parseWeightText("82,5", "kg")).toBe(82.5);
  });
});

describe("body weight and height display (C5)", () => {
  it("shows a weigh-in to 2 dp in kg and 1 dp in lb", () => {
    expect(formatBodyWeight(82.35, "kg")).toBe("82.35 kg");
    expect(formatBodyWeight(82.4, "kg")).toBe("82.40 kg");
    expect(formatBodyWeight(82.35, "lb")).toBe("181.6 lb");
  });

  it("converts heights to feet and inches and back to whole cm, stable on a round trip", () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, inch: 11 });
    expect(ftInToCm(5, 11)).toBe(180);
    expect(formatHeight(180, "ft")).toBe("5 ft 11 in");
    expect(formatHeight(180, "cm")).toBe("180 cm");
    for (let cm = 120; cm <= 230; cm++) {
      const { ft, inch } = cmToFtIn(cm);
      expect(inch).toBeLessThan(12);
      const back = ftInToCm(ft, inch);
      expect(Math.abs(back - cm)).toBeLessThanOrEqual(1.27);
      expect(cmToFtIn(back)).toEqual({ ft, inch });
    }
  });
});
