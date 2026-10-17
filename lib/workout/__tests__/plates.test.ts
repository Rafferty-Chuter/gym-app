import { describe, expect, it } from "vitest";
import { BAR_OPTIONS, PLATE_OPTIONS, formatSide, platesPerSide } from "@/lib/workout/plates";

describe("platesPerSide", () => {
  it("loads greedily from the heaviest plate", () => {
    const r = platesPerSide(100, 20, PLATE_OPTIONS.kg);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(0);
  });

  it("reports what the plates cannot cover", () => {
    const r = platesPerSide(61, 20, PLATE_OPTIONS.kg);
    expect(r.perSide).toEqual([20]);
    expect(r.achieved).toBe(60);
    expect(r.remainder).toBe(1);
  });

  it("handles the bar alone and targets below the bar", () => {
    expect(platesPerSide(20, 20, PLATE_OPTIONS.kg)).toMatchObject({ perSide: [], achieved: 20, belowBar: false });
    expect(platesPerSide(15, 20, PLATE_OPTIONS.kg)).toMatchObject({ perSide: [], achieved: 20, belowBar: true });
    expect(platesPerSide(Number.NaN, 20, PLATE_OPTIONS.kg).perSide).toEqual([]);
  });

  it("works in pounds and with small plates", () => {
    const r = platesPerSide(135, BAR_OPTIONS.lb[0], PLATE_OPTIONS.lb);
    expect(r.perSide).toEqual([45]);
    expect(platesPerSide(22.5, 20, PLATE_OPTIONS.kg).perSide).toEqual([1.25]);
    expect(formatSide([25, 2.5])).toBe("25 · 2.5");
    expect(formatSide([])).toBe("Bar only");
  });
});
