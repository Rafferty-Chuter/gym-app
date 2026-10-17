import { describe, expect, it } from "vitest";
import {
  CALORIE_FLOOR,
  etaWeeks,
  fatFloorG,
  floors,
  GAIN_BANDS,
  goalDeltaKcal,
  goalTypeFor,
  isNearGoal,
  macros,
  proteinReferenceKg,
  proteinTargetG,
  rateBands,
  rateToKcalPerDay,
  trainingStatus,
  validateRate,
  weeklyTarget,
} from "@/lib/physique/targets";
import type { Sex } from "@/lib/physique/types";

const MACRO_BASE = { trendKg: 85, heightCm: 180, sex: "M" as Sex, proteinLevel: "moderate" as const, dietType: "balanced" as const };

describe("golden tests (02 §4.2)", () => {
  it("cut target at 90 kg trend, TDEE 2,737, −0.5 %/wk → 2,241", () => {
    const t = weeklyTarget({ tdee: 2737, trendKg: 90, goal: { type: "lose", ratePctPerWeek: -0.5, targetKg: 80 }, prevTargetKcal: null, unsmoothed: true, sex: "M" });
    expect(t.kcal).toBe(2241);
    expect(t.capped).toBe(false);
    expect(t.floorBound).toBe(false);
  });

  it("maintain: target 75, trend 76.0, TDEE 2,500 → 2,374; inside the band the target is expenditure", () => {
    const goal = { type: "maintain" as const, ratePctPerWeek: 0, targetKg: 75 };
    expect(weeklyTarget({ tdee: 2500, trendKg: 76, goal, prevTargetKcal: null, unsmoothed: true, sex: "M" }).kcal).toBe(2374);
    expect(weeklyTarget({ tdee: 2500, trendKg: 75.5, goal, prevTargetKcal: null, unsmoothed: true, sex: "M" }).kcal).toBe(2500);
    expect(goalDeltaKcal(goal, 74)).toBeCloseTo(rateToKcalPerDay(0.15, 74), 9);
  });

  it("fat floor: 180 cm → 45 g, 150 cm → 30 g, 145 cm → 30 g", () => {
    expect([180, 150, 145].map(fatFloorG)).toEqual([45, 30, 30]);
    expect(floors("F", 160)).toEqual({ kcal: 1200, fatG: 35 });
    expect(floors("M", 160).kcal).toBe(1500);
    expect(floors(undefined, 160).kcal).toBe(CALORIE_FLOOR.prefer_not_to_say);
  });

  it("protein: lifter cutting at High, FFM 70 kg → 210 g", () => {
    // 100 kg at a measured 30% body fat → FFM 70; BMI 30.9 caps BWref at 81 kg, so the 1.8 g/kg floor (146 g) doesn't bind.
    expect(proteinTargetG({ ...MACRO_BASE, trendKg: 100, bodyFatPctMeasured: 30, phase: "lose", proteinLevel: "high" })).toBe(210);
    expect(proteinReferenceKg(100, 180)).toBeCloseTo(25 * 1.8 * 1.8, 9);
    expect(proteinReferenceKg(85, 180)).toBe(85);
  });
});

describe("protein rules (02 §5.4)", () => {
  it("uses the category midpoint, the floor when it binds, and g/kg BWref with no category", () => {
    // Lean male 85 kg → FFM 76.5. Maintain/gain Low: 1.75 × 76.5 = 133.9 vs floor 1.6 × 85 = 136 → floor → 135.
    expect(proteinTargetG({ ...MACRO_BASE, phase: "gain", proteinLevel: "low", bodyFatCategory: "lean" })).toBe(135);
    // Cut Moderate: 2.5 × 76.5 = 191.25 → 190.
    expect(proteinTargetG({ ...MACRO_BASE, phase: "lose", bodyFatCategory: "lean" })).toBe(190);
    // No category: 2.0 g/kg on a cut (170), 1.8 otherwise (153 → 155).
    expect(proteinTargetG({ ...MACRO_BASE, phase: "lose" })).toBe(170);
    expect(proteinTargetG({ ...MACRO_BASE, phase: "maintain" })).toBe(155);
    // Female midpoints are higher: average F 29% at 70 kg → FFM 49.7 → cut moderate 124 vs floor 126 → 125.
    expect(proteinTargetG({ ...MACRO_BASE, trendKg: 70, sex: "F", phase: "lose", bodyFatCategory: "average" })).toBe(125);
  });
});

describe("macros (02 §5.4)", () => {
  it("balanced splits non-protein kcal 50/50; low-carb caps carbs at min(30%, 200 g)", () => {
    const b = macros({ ...MACRO_BASE, kcal: 2400, phase: "lose" });
    expect(b).toEqual({ kcal: 2400, proteinG: 170, fatG: 96, carbsG: 215 });
    expect(Math.abs(4 * b.proteinG + 9 * b.fatG + 4 * b.carbsG - 2400)).toBeLessThanOrEqual(10);
    const lc = macros({ ...MACRO_BASE, kcal: 2400, phase: "lose", dietType: "lowCarb" });
    expect(lc.carbsG).toBe(180);
    expect(lc.fatG).toBe(111);
    const big = macros({ ...MACRO_BASE, kcal: 3600, phase: "gain", dietType: "lowCarb" });
    expect(big.carbsG).toBe(200);
  });

  it("the fat floor binds before carbs; at very low kcal the order is fat floor, protein, carbs", () => {
    const tight = macros({ ...MACRO_BASE, kcal: 1300, phase: "lose" });
    expect(tight.fatG).toBe(45);
    expect(tight.proteinG).toBe(170);
    expect(tight.carbsG).toBe(Math.round((1300 - 680 - 405) / 4));
    const starved = macros({ ...MACRO_BASE, kcal: 1000, phase: "lose" });
    expect(starved.fatG).toBe(45);
    expect(starved.proteinG).toBe(145);
    expect(starved.carbsG).toBe(4);
    expect(4 * starved.proteinG + 9 * starved.fatG + 4 * starved.carbsG).toBeLessThanOrEqual(1004);
  });
});

describe("rate bands (02 §5.2)", () => {
  it("cut bands are the same for every status, topping out at −0.7 near goal or when advanced", () => {
    const i = rateBands("intermediate");
    expect(i.cut).toMatchObject({ default: -0.6, green: { min: -0.25, max: -0.75 }, upperLimit: -1.0, refusedBelow: -1.25, kgPerWeekCap: 1.0 });
    expect(rateBands("advanced").cut.green.max).toBe(-0.7);
    expect(rateBands("intermediate", { nearGoal: true }).cut.green.max).toBe(-0.7);
    expect(i.maintain).toEqual({ bandKg: 0.68, nudgePct: 0.15 });
  });

  it("gain bands by status sit at the band centre with the published kg caps", () => {
    expect(rateBands("novice").gain).toMatchObject({ default: 0.35, green: { min: 0.25, max: 0.5 }, ceiling: 0.5, kgPerWeekCap: 0.8 });
    expect(rateBands("intermediate").gain).toMatchObject({ default: 0.25, green: { min: 0.15, max: 0.35 }, ceiling: 0.35, kgPerWeekCap: 0.64 });
    expect(rateBands("advanced").gain).toMatchObject({ default: 0.15, green: { min: 0.1, max: 0.25 }, ceiling: 0.25, kgPerWeekCap: 0.48 });
    expect(GAIN_BANDS.intermediate.default).toBe(0.25);
  });
});

describe("validateRate (02 §5.2)", () => {
  const cut = (rate: number, trendKg = 85, tdee0 = 3000, status: "novice" | "intermediate" | "advanced" = "intermediate") =>
    validateRate({ type: "lose", ratePctPerWeek: rate, status, trendKg, tdee0 });
  const gain = (rate: number, trendKg = 85, status: "novice" | "intermediate" | "advanced" = "intermediate") =>
    validateRate({ type: "gain", ratePctPerWeek: rate, status, trendKg, tdee0: 2800 });

  it("82 → 90 kg, intermediate: the default +0.25 is green and the ETA is about 37 weeks", () => {
    expect(gain(0.25, 82)).toMatchObject({ ok: true, band: "green" });
    expect(etaWeeks(82, 90, 0.25)).toBeCloseTo(37.3, 1);
    expect(etaWeeks(90, 82, -0.6)).toBeCloseTo(Math.log(82 / 90) / Math.log(0.994), 6);
    expect(etaWeeks(82, 90, -0.6)).toBeNull();
    expect(etaWeeks(82, 90, 0)).toBeNull();
  });

  it("green inside the band, confirm outside it", () => {
    expect(cut(-0.6)).toMatchObject({ ok: true, band: "green", outside: null });
    expect(cut(-0.9)).toMatchObject({ ok: true, band: "confirm", outside: "faster" }); // 843 kcal, 28% of 3,000
    expect(cut(-0.15)).toMatchObject({ ok: true, band: "confirm", outside: "slower" });
    expect(cut(-0.72, 85, 2800, "advanced")).toMatchObject({ ok: true, band: "confirm" });
    expect(cut(-1.1, 60, 2500)).toMatchObject({ ok: true, band: "confirm" }); // 0.66 kg/wk, 727 kcal, 29%
    expect(gain(0.5)).toMatchObject({ ok: true, band: "confirm", outside: "faster" });
    expect(gain(0.5, 85, "novice")).toMatchObject({ ok: true, band: "green" });
    expect(gain(0.12)).toMatchObject({ ok: true, band: "confirm", outside: "slower" });
    expect(validateRate({ type: "maintain", ratePctPerWeek: 0, status: "intermediate", trendKg: 85, tdee0: 2800 })).toMatchObject({ ok: true, band: "green" });
  });

  it("refuses more than 1.0 kg/wk, a day-0 deficit over 30% of TDEE₀ or over 1,000 kcal, and cuts beyond −1.25", () => {
    expect(cut(-0.9, 120)).toMatchObject({ ok: false, reason: "cut_kg_per_week" }); // 1.08 kg/wk
    expect(cut(-1.1, 85)).toMatchObject({ ok: false, reason: "deficit_kcal" }); // 1,030 kcal/day
    expect(cut(-0.9, 70, 2000)).toMatchObject({ ok: false, reason: "deficit_share" }); // 694 kcal > 600
    expect(cut(-1.3, 60, 2500)).toMatchObject({ ok: false, reason: "cut_rate_too_fast" });
    expect(cut(0.5)).toMatchObject({ ok: false, reason: "wrong_sign" });
    const r = cut(-1.1, 85);
    expect(r.dayZeroDeltaKcal).toBeCloseTo(-1030.5, 0);
    expect(r.kgPerWeek).toBeCloseTo(-0.935, 9);
  });

  it("refuses gains over 1.0 %/wk or over the status kg cap", () => {
    expect(gain(1.1)).toMatchObject({ ok: false, reason: "gain_rate_too_fast" });
    expect(gain(0.8)).toMatchObject({ ok: false, reason: "gain_kg_per_week" }); // 0.68 > 0.64
    expect(gain(0.8, 85, "novice")).toMatchObject({ ok: true, band: "confirm" }); // 0.68 ≤ 0.8
    expect(gain(-0.2)).toMatchObject({ ok: false, reason: "wrong_sign" });
  });
});

describe("training status (02 §5.2)", () => {
  it("maps the onboarding years band, defaults to intermediate, and a lift-derived status wins", () => {
    expect(trainingStatus("new")).toBe("novice");
    expect(trainingStatus("1-2")).toBe("novice");
    expect(trainingStatus("3-5")).toBe("intermediate");
    expect(trainingStatus("5+")).toBe("advanced");
    expect(trainingStatus(undefined)).toBe("intermediate");
    expect(trainingStatus("new", "advanced")).toBe("advanced");
    expect(trainingStatus("5+", null)).toBe("advanced");
  });
});

describe("weekly target smoothing and floors (02 §5.3)", () => {
  const goal = { type: "lose" as const, ratePctPerWeek: -0.6, targetKg: 78 };

  it("caps a check-in step at max(100, 5% of tdee) unless unsmoothed", () => {
    const smoothed = weeklyTarget({ tdee: 2800, trendKg: 85, goal, prevTargetKcal: 2600, unsmoothed: false, sex: "M" });
    expect(smoothed.raw).toBeCloseTo(2800 + rateToKcalPerDay(-0.6, 85), 9); // 2,237.8
    expect(smoothed.cap).toBe(140);
    expect(smoothed.capped).toBe(true);
    expect(smoothed.kcal).toBe(2460);
    const small = weeklyTarget({ tdee: 1800, trendKg: 60, goal, prevTargetKcal: 1700, unsmoothed: false, sex: "F" });
    expect(small.cap).toBe(100);
    const raw = weeklyTarget({ tdee: 2800, trendKg: 85, goal, prevTargetKcal: 2600, unsmoothed: true, sex: "M" });
    expect(raw.kcal).toBe(2238);
    expect(raw.capped).toBe(false);
    const tiny = weeklyTarget({ tdee: 2800, trendKg: 85, goal, prevTargetKcal: 2250, unsmoothed: false, sex: "M" });
    expect(tiny.capped).toBe(false);
    expect(tiny.kcal).toBe(2238); // any size of change is applied
  });

  it("the calorie floor binds and is reported (SAFE-1)", () => {
    const t = weeklyTarget({ tdee: 1800, trendKg: 60, goal: { ...goal, ratePctPerWeek: -1.0 }, prevTargetKcal: null, unsmoothed: true, sex: "F" });
    expect(t.raw).toBeLessThan(1200);
    expect(t.kcal).toBe(1200);
    expect(t.floorBound).toBe(true);
    const m = weeklyTarget({ tdee: 2000, trendKg: 70, goal: { ...goal, ratePctPerWeek: -0.9 }, prevTargetKcal: null, unsmoothed: true, sex: "M" });
    expect(m.kcal).toBe(1500);
    expect(m.floorBound).toBe(true);
  });
});

describe("goal helpers (02 §5.1)", () => {
  it("derives the goal type with the ±0.68 kg maintain band, and near goal", () => {
    expect(goalTypeFor(85.5, 85)).toBe("maintain");
    expect(goalTypeFor(80, 85)).toBe("lose");
    expect(goalTypeFor(90, 85)).toBe("gain");
    expect(isNearGoal({ targetKg: 80, ratePctPerWeek: -0.6 }, 81.5)).toBe(true); // 2% of 81.5 = 1.63
    expect(isNearGoal({ targetKg: 80, ratePctPerWeek: -0.6 }, 83)).toBe(false); // 4 × 0.498 = 1.99 < 3
    expect(isNearGoal({ targetKg: 80, ratePctPerWeek: -1.0 }, 83)).toBe(true); // 4 × 0.83 = 3.32
  });
});
