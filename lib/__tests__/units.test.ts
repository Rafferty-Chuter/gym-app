import { describe, expect, it } from "vitest";
import { KG_PER_LB, displayToKg, formatKcal, formatWeight, kgToDisplay, parseWeightText } from "@/lib/units";

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
