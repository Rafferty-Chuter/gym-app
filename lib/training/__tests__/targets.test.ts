import { describe, expect, it } from "vitest";
import { COMPOUND_TARGETS, DEFAULT_TARGETS, ISOLATION_TARGETS, normaliseTargets, parseRepRange, repRangeText, targetLabel, targetsForExercise } from "@/lib/training/targets";

describe("routine targets", () => {
  it("defaults by the movement's role", () => {
    expect(targetsForExercise("Bench Press")).toEqual(COMPOUND_TARGETS);
    expect(targetsForExercise("Lateral Raise")).toEqual(ISOLATION_TARGETS);
    expect(targetsForExercise("Something nobody has heard of")).toEqual(DEFAULT_TARGETS);
  });

  it("clamps, fills and reorders stored values", () => {
    expect(normaliseTargets({}, COMPOUND_TARGETS)).toEqual(COMPOUND_TARGETS);
    expect(normaliseTargets({ repMin: 12, repMax: 8, rir: 9 }, COMPOUND_TARGETS)).toEqual({ repMin: 8, repMax: 12, rir: 5 });
    expect(normaliseTargets({ repMin: "x", repMax: 0.4, rir: -1 }, ISOLATION_TARGETS)).toEqual({ repMin: 10, repMax: 1, rir: 0 }.repMin === 10 ? { repMin: 1, repMax: 10, rir: 0 } : { repMin: 1, repMax: 10, rir: 0 });
  });

  it("labels and parses ranges plainly", () => {
    expect(targetLabel({ repMin: 6, repMax: 10, rir: 2 })).toBe("6 to 10 · RIR 2");
    expect(targetLabel({ repMin: 8, repMax: 8, rir: 1 })).toBe("8 · RIR 1");
    expect(parseRepRange("6-10")).toEqual({ repMin: 6, repMax: 10 });
    expect(parseRepRange("6 to 10")).toEqual({ repMin: 6, repMax: 10 });
    expect(parseRepRange("10–6")).toEqual({ repMin: 6, repMax: 10 });
    expect(parseRepRange("8")).toEqual({ repMin: 8, repMax: 8 });
    expect(parseRepRange("lots")).toBeNull();
    expect(parseRepRange("0-5")).toBeNull();
    expect(repRangeText({ repMin: 6, repMax: 10 })).toBe("6-10");
    expect(repRangeText({ repMin: 8, repMax: 8 })).toBe("8");
  });
});
