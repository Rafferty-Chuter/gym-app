import { describe, expect, it } from "vitest";
import { DEFAULT_CUT_SHARE, DEFAULT_GAIN_SHARE, defaultTargetKg, forcedMaintenance, setupSteps, targetFits } from "@/lib/physique/setupFlow";
import { MAINTAIN_GOAL_THRESHOLD_KG } from "@/lib/physique/targets";
import { KG_PER_LB } from "@/lib/units";

describe("First-run setup (O1)", () => {
  it("asks one thing a screen, ending with safety and the targets; maintain skips target and pace", () => {
    expect(setupSteps(null)).toEqual(["sex", "age", "height", "weight", "years", "goal", "target", "pace", "safety", "summary"]);
    expect(setupSteps("lose")).toEqual(setupSteps(null));
    expect(setupSteps("maintain")).toEqual(["sex", "age", "height", "weight", "years", "goal", "safety", "summary"]);
  });

  it("starts the target a few percent from today's weight, on the pad's half steps", () => {
    expect(defaultTargetKg("lose", 85)).toBe(Math.round(85 * DEFAULT_CUT_SHARE * 2) / 2);
    expect(defaultTargetKg("gain", 80)).toBe(84);
    const lbPerKg = 1 / KG_PER_LB;
    const lb = defaultTargetKg("lose", 85, lbPerKg) * lbPerKg;
    expect(Math.abs(lb * 2 - Math.round(lb * 2))).toBeLessThan(1e-9);
    expect(DEFAULT_GAIN_SHARE).toBeGreaterThan(1);
  });

  it("only takes a target on the chosen side of today's weight", () => {
    expect(targetFits("lose", 80, 85)).toBe(true);
    expect(targetFits("lose", 85 - MAINTAIN_GOAL_THRESHOLD_KG / 2, 85)).toBe(false);
    expect(targetFits("lose", 88, 85)).toBe(false);
    expect(targetFits("gain", 88, 85)).toBe(true);
  });

  it("offers no deficit under 18 or after a yes to the safety question", () => {
    expect(forcedMaintenance("lose", { age: 17, safetyYes: false })).toBe(true);
    expect(forcedMaintenance("gain", { age: 17, safetyYes: false })).toBe(false);
    expect(forcedMaintenance("gain", { age: 30, safetyYes: true })).toBe(true);
    expect(forcedMaintenance("lose", { age: 30, safetyYes: false })).toBe(false);
  });
});
