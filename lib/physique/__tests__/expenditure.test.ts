import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { KG_PER_LB } from "@/lib/units";
import { makeScenario } from "@/lib/physique/fixtures";
import { dailyIntakeSeries } from "@/lib/physique/intake";
import {
  ACTIVITY_FACTOR,
  bmrBodyComposition,
  bmrHeightWeight,
  computeExpenditure,
  exerciseAddOn,
  expenditureMaturity,
  expenditureSeries,
  goalChangesAfterSeed,
  GOAL_PRED_DECAY_DAYS,
  GOAL_PRED_FACTOR,
  GOAL_PRED_RAMP_DAYS,
  initialTdee,
  predictiveRamp,
  RESUME_DAYS,
  sessionsPerWeekBefore,
  snapshotSeed,
  WARMUP_UPDATING_DAYS,
} from "@/lib/physique/expenditure";
import type { ExpenditureSeed, FoodEntry, PhysiqueGoal, PhysiqueProfile, WeighIn } from "@/lib/physique/types";

const D0 = "2026-01-01";
const day = (i: number) => addDays(D0, i);

const PROFILE: PhysiqueProfile = {
  generalActivity: "moderate",
  checkInWeekday: 1,
  proteinLevel: "moderate",
  dietType: "balanced",
  sleepGoalH: 8,
  sex: "M",
  age: 30,
  heightCm: 180,
  expenditureStartDate: D0,
  schemaVersion: 1,
};

function w(date: string, kg: number): WeighIn {
  return { id: `w-${date}`, date, loggedAt: `${date}T07:00:00Z`, source: "manual", schemaVersion: 1, kg };
}

function f(date: string, kcal: number): FoodEntry {
  return { id: `f-${date}`, date, loggedAt: `${date}T19:00:00Z`, source: "manual", schemaVersion: 1, label: "x", kcal, proteinG: 150, carbsG: 300, fatG: 90, method: "quick" };
}

function seed(over: Partial<ExpenditureSeed> = {}): ExpenditureSeed {
  return { date: D0, sex: "M", age: 30, heightCm: 180, weightKg: 90, generalActivity: "moderate", sessionsPerWeek: 5, goalRatePctPerWeek: 0, schemaVersion: 1, ...over };
}

describe("golden tests (02 §4.2)", () => {
  it("BMR, male, 90 kg, 180 cm, age 30 → 1,837", () => {
    expect(bmrHeightWeight(90, 180, 30, "M")).toBeCloseTo(1837, 0);
  });

  it("FFM equation, FFM 75 / FM 15, age 30 → 1,993 (1,992.5)", () => {
    expect(Math.abs(bmrBodyComposition(75, 15, 30) - 1992.5)).toBeLessThanOrEqual(1);
  });

  it("TDEE₀ moderate + 4–6 sessions/wk (AF 1.6) → 2,940; cutting −0.5 %/wk → 2,737", () => {
    expect(initialTdee(seed())).toBe(2940);
    expect(initialTdee(seed({ goalRatePctPerWeek: -0.5 }))).toBe(2737);
  });

  it("manual initial TDEE overrides everything; measured body fat uses the FFM equation", () => {
    expect(initialTdee(seed({ manualInitialTdee: 3100 }))).toBe(3100);
    const ffm = initialTdee(seed({ bodyFatPctMeasured: 100 / 6 })); // 90 kg at 16.67% → FFM 75 / FM 15
    expect(Math.abs(ffm - Math.round(1992.5 * 1.6))).toBeLessThanOrEqual(1);
  });

  it("activity factor = general activity + exercise add-on; the age penalty steepens after 60", () => {
    expect(ACTIVITY_FACTOR).toEqual({ low: 1.2, moderate: 1.4, high: 1.6 });
    expect([0, 1, 3, 4, 6, 7, 10].map(exerciseAddOn)).toEqual([0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3]);
    const at60 = bmrHeightWeight(90, 180, 60, "M");
    expect(bmrHeightWeight(90, 180, 61, "M")).toBeCloseTo(at60 - 4.9, 6);
    expect(bmrHeightWeight(90, 180, 59, "M")).toBeCloseTo(at60 + 1.96, 6);
    expect(bmrHeightWeight(90, 180, 30, "F")).toBeCloseTo(bmrHeightWeight(90, 180, 30, "M") - 213.8, 6);
    expect(bmrHeightWeight(90, 180, 30, "prefer_not_to_say")).toBeCloseTo(bmrHeightWeight(90, 180, 30, "M") - 106.9, 6);
  });
});

describe("impulse response (research A §G.6; 02 §4.2)", () => {
  const DAYS = 200;
  const today = day(DAYS - 1);
  const baseKg = 200 * KG_PER_LB;
  const TDEE = 3016;

  /** Steady state (intake = TDEE, constant weight) plus +4/+3/+2 lb on three consecutive days starting L weeks back. */
  function tdeeToday(weeksBack: number | null): number {
    const weighIns: WeighIn[] = [];
    const food: FoodEntry[] = [];
    const first = weeksBack === null ? -1 : DAYS - 1 - 7 * weeksBack;
    for (let d = 0; d < DAYS; d++) {
      let kg = baseKg;
      if (weeksBack !== null) {
        if (d === first) kg += 4 * KG_PER_LB;
        if (d === first + 1) kg += 3 * KG_PER_LB;
        if (d === first + 2) kg += 2 * KG_PER_LB;
      }
      weighIns.push(w(day(d), kg));
      food.push(f(day(d), TDEE));
    }
    const s = seed({ manualInitialTdee: TDEE, weightKg: baseKg });
    const series = expenditureSeries({ seed: s, weighIns, intake: dailyIntakeSeries(food, {}, D0, today), today });
    expect(series[series.length - 1].updatingDays).toBeGreaterThan(WARMUP_UPDATING_DAYS);
    return series[series.length - 1].tdee;
  }

  it("matches −59, −56, −22, +35, +38, +29 within 15 kcal at each point", () => {
    const expected = [-59, -56, -22, 35, 38, 29];
    const baseline = tdeeToday(null);
    expect(baseline).toBe(TDEE);
    const measured = expected.map((_, i) => tdeeToday(i + 1) - baseline);
    for (let i = 0; i < expected.length; i++) expect(Math.abs(measured[i] - expected[i]), `L=${i + 1}: ${measured[i]} vs ${expected[i]}`).toBeLessThanOrEqual(15);
    // The reproduction is exact with alpha 0.10 / k 0.10 / 20-day rate / 21-day intake.
    expect(measured).toEqual(expected);
  });
});

describe("stability (02 §4.3): intake SD 350, 50 seeds × 120 days", () => {
  function meanAbsDailyChange(phi: number): number {
    let total = 0;
    let n = 0;
    for (let s = 1; s <= 50; s++) {
      const sc = makeScenario({ seed: s, days: 120, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800, sdKcal: 350 }, noiseSdKg: 0.5, phi, goal: null });
      const r = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: [] }, { today: sc.today, tz: "UTC" })!;
      for (let i = 1; i < r.series.length; i++) {
        if (r.series[i].updatingDays <= 30) continue;
        total += Math.abs(r.series[i].tdee - r.series[i - 1].tdee);
        n++;
      }
    }
    return total / n;
  }

  it("mean absolute daily change after 30 updating days ≤ 8 kcal at φ = 0", () => {
    const v = meanAbsDailyChange(0);
    expect(v, `measured ${v.toFixed(2)} kcal/day`).toBeLessThanOrEqual(8);
  });

  it("≤ 10 kcal at φ = 0.5", () => {
    const v = meanAbsDailyChange(0.5);
    expect(v, `measured ${v.toFixed(2)} kcal/day`).toBeLessThanOrEqual(10);
  });
});

describe("holding and resuming (02 §4.1, §4.3)", () => {
  function build(loggedDays: (d: number) => boolean, days: number) {
    const weighIns: WeighIn[] = [];
    const food: FoodEntry[] = [];
    for (let d = 0; d < days; d++) {
      weighIns.push(w(day(d), 85));
      if (loggedDays(d)) food.push(f(day(d), 2600));
    }
    const today = day(days - 1);
    const intake = dailyIntakeSeries(food, {}, D0, today);
    const series = expenditureSeries({ seed: seed({ weightKg: 85 }), weighIns, intake, today });
    return { series, intake, weighIns };
  }

  it("3 of 7 days logged → holding; it resumes on the 3rd consecutive complete day", () => {
    // Days 0–29 logged daily; days 30–36 only 30, 32, 34; then 37, 38, 39 logged.
    const logged = (d: number) => d < 30 || d === 30 || d === 32 || d === 34 || d >= 37;
    const { series, intake, weighIns } = build(logged, 40);
    const at = (d: number) => series[d];
    expect(at(35).state).toBe("updating"); // 4 of the last 7 still logged
    expect(at(36)).toMatchObject({ state: "holding", holdReason: "paused" });
    expect(at(36).tdee).toBe(at(35).tdee); // holds the last good value
    expect(at(37).state).toBe("holding");
    expect(at(38).state).toBe("holding");
    expect(at(39).state).toBe("updating");
    expect(at(39).updatingDays).toBe(at(35).updatingDays + 1);

    const m38 = expenditureMaturity(series.slice(0, 39), { intake, weighIns });
    expect(m38.state).toBe("holding");
    expect(m38.resume).toEqual({ foodDaysNeeded: 1, weighInNeeded: false });
    expect(m38.kcal).toBe(at(38).tdee);
    expect(RESUME_DAYS).toBe(3);
  });

  it("no weigh-in in 7 days → holding; one weigh-in resumes it", () => {
    const weighIns: WeighIn[] = [];
    const food: FoodEntry[] = [];
    for (let d = 0; d < 45; d++) {
      food.push(f(day(d), 2600));
      if (d < 30 || d === 40) weighIns.push(w(day(d), 85));
    }
    const intake = dailyIntakeSeries(food, {}, D0, day(44));
    const series = expenditureSeries({ seed: seed({ weightKg: 85 }), weighIns, intake, today: day(44) });
    expect(series[35].state).toBe("updating"); // day 29's weigh-in is still inside the last 7 days
    expect(series[36]).toMatchObject({ state: "holding", holdReason: "paused" });
    expect(series[39].state).toBe("holding");
    expect(series[40].state).toBe("updating"); // one weigh-in after 3 complete days resumes it
    expect(series[44].trendKg).toBeNull(); // the trend ends at the last weigh-in
    expect(series[44].state).toBe("updating");
    const m = expenditureMaturity(series.slice(0, 40), { intake, weighIns });
    expect(m.state).toBe("holding");
    expect(m.resume).toEqual({ foodDaysNeeded: 0, weighInNeeded: true });
  });

  it("the first week holds the seed (warm-up, not a pause) and maturity counts updating days", () => {
    const { series, intake, weighIns } = build(() => true, 40);
    for (let d = 0; d < 7; d++) expect(series[d]).toMatchObject({ state: "holding", holdReason: "warmup", updatingDays: 0 });
    expect(series[7].state).toBe("updating");
    expect(series[7].updatingDays).toBe(1);
    const m = (upTo: number) => expenditureMaturity(series.slice(0, upTo + 1), { intake, weighIns });
    expect(m(3).state).toBe("calibrating");
    expect(m(26)).toMatchObject({ state: "calibrating", updatingDays: 20, plusMinus: null });
    expect(m(27)).toMatchObject({ state: "settling", updatingDays: 21, plusMinus: 400 });
    expect(m(34)).toMatchObject({ state: "stable", updatingDays: 28, plusMinus: 300 });
    expect(expenditureMaturity([]).state).toBe("calibrating");
  });
});

describe("the seed is fixed (02 §0.2, §4.2)", () => {
  it("editing the profile after expenditureStartDate doesn't change past expenditure values", () => {
    const sc = makeScenario({ seed: 11, days: 45, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2500 }, goal: { ratePctPerWeek: -0.6 } });
    const inputs = { weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: [sc.goal!] };
    const now = { today: sc.today, tz: "UTC" };
    const before = computeExpenditure({ ...inputs, profile: sc.profile }, now)!;
    expect(sc.profile.expenditureSeed).toBeDefined();
    const edited: PhysiqueProfile = { ...sc.profile, generalActivity: "high", age: 45, sex: "F", heightCm: 170 };
    const after = computeExpenditure({ ...inputs, profile: edited }, now)!;
    expect(after.seed).toEqual(before.seed);
    expect(after.series.map((p) => p.tdee)).toEqual(before.series.map((p) => p.tdee));
    // Without the stored snapshot the same edit would rewrite history.
    const { expenditureSeed: _dropped, ...noSeed } = edited;
    void _dropped;
    const resnapshotted = computeExpenditure({ ...inputs, profile: noSeed }, now)!;
    expect(resnapshotted.series[0].tdee).not.toBe(before.series[0].tdee);
  });

  it("snapshotSeed reads the weigh-in nearest the start, the goal active that day and sessions over the 28 days before", () => {
    const workouts = Array.from({ length: 12 }, (_, i) => ({ completedAt: `${addDays(D0, -28 + i * 2)}T18:00:00Z`, exercises: [] }));
    expect(sessionsPerWeekBefore(workouts, D0, "UTC")).toBe(3);
    expect(sessionsPerWeekBefore([], D0, "UTC")).toBeNull();
    const goal: PhysiqueGoal = {
      id: "g",
      createdAt: `${D0}T07:00:00Z`,
      type: "lose",
      startDate: D0,
      startTrendKg: 88,
      targetKg: 80,
      ratePctPerWeek: -0.6,
      trainingStatusAtCreation: "intermediate",
      schemaVersion: 1,
    };
    const s = snapshotSeed({ profile: PROFILE, goals: [goal], weighIns: [w(day(2), 88.4)], workouts, startDate: D0 })!;
    expect(s).toMatchObject({ date: D0, weightKg: 88.4, sessionsPerWeek: 3, goalRatePctPerWeek: -0.6, sex: "M", age: 30, heightCm: 180 });
    const later = snapshotSeed({ profile: PROFILE, goals: [{ ...goal, startDate: day(5) }], weighIns: [], startDate: D0, onboarding: { bodyweightKg: 86, daysPerWeek: 4 } })!;
    expect(later).toMatchObject({ weightKg: 86, sessionsPerWeek: 4, goalRatePctPerWeek: 0 });
    expect(snapshotSeed({ profile: { ...PROFILE, heightCm: undefined }, startDate: D0, onboarding: { bodyweightKg: 86 } })).toBeNull();
    expect(snapshotSeed({ profile: { ...PROFILE, heightCm: undefined, manualInitialTdee: 2700 }, startDate: D0 })).not.toBeNull();
  });
});

describe("predictive goal adjustment (02 §4.1)", () => {
  it("ramps 0 → amount over 14 days and decays to 0 over the next 28", () => {
    expect(predictiveRamp(0)).toBe(0);
    expect(predictiveRamp(7)).toBeCloseTo(0.5, 9);
    expect(predictiveRamp(GOAL_PRED_RAMP_DAYS)).toBe(1);
    expect(predictiveRamp(GOAL_PRED_RAMP_DAYS + GOAL_PRED_DECAY_DAYS / 2)).toBeCloseTo(0.5, 9);
    expect(predictiveRamp(GOAL_PRED_RAMP_DAYS + GOAL_PRED_DECAY_DAYS)).toBe(0);
  });

  it("a confirmed cut starting after the seed date adds a separate ramped offset of base × 4 × Δrate", () => {
    const sc = makeScenario({ seed: 7, days: 70, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800 }, goal: { ratePctPerWeek: -0.6 }, waterStepKg: 0 });
    const r = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: [sc.goal!] }, { today: sc.today, tz: "UTC" })!;
    expect(r.seed.goalRatePctPerWeek).toBe(0); // the goal is not in the seed
    expect(goalChangesAfterSeed([sc.goal!], r.seed.date)).toEqual([{ date: sc.goal!.startDate, deltaRatePctPerWeek: -0.6 }]);
    const start = 21;
    for (let d = 0; d <= start; d++) expect(r.series[d].offset).toBe(0);
    const peak = r.series[start + GOAL_PRED_RAMP_DAYS];
    expect(peak.offset).toBeCloseTo((r.series[start].base * GOAL_PRED_FACTOR * -0.6) / 100, 6);
    expect(r.series[start + 7].offset).toBeCloseTo(peak.offset / 2, 6);
    expect(r.series[start + GOAL_PRED_RAMP_DAYS + GOAL_PRED_DECAY_DAYS].offset).toBe(0);
    expect(peak.tdee).toBe(Math.round(peak.base + peak.offset));

    const unconfirmed = computeExpenditure(
      { profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: [{ ...sc.goal!, phaseStartConfirmedAt: undefined }] },
      { today: sc.today, tz: "UTC" }
    )!;
    expect(unconfirmed.series.every((p) => p.offset === 0)).toBe(true);
  });

  it("a rate change after the seed adds its own offset; changes before the seed are in the seed instead", () => {
    const goal: PhysiqueGoal = {
      id: "g",
      createdAt: `${D0}T07:00:00Z`,
      type: "lose",
      startDate: D0,
      startTrendKg: 85,
      targetKg: 78,
      ratePctPerWeek: -0.6,
      trainingStatusAtCreation: "intermediate",
      phaseStartConfirmedAt: `${D0}T07:00:00Z`,
      rateHistory: [{ date: day(20), fromPctPerWeek: -1.0, toPctPerWeek: -0.6, reason: "recommendation" }],
      schemaVersion: 1,
    };
    expect(goalChangesAfterSeed([goal], D0)).toEqual([{ date: day(20), deltaRatePctPerWeek: 0.4 }]);
    expect(goalChangesAfterSeed([goal], day(25))).toEqual([]);
    const s = snapshotSeed({ profile: PROFILE, goals: [goal], startDate: D0, onboarding: { bodyweightKg: 85 } })!;
    expect(s.goalRatePctPerWeek).toBe(-1.0); // the rate in effect on the seed date
  });
});

describe("convergence (research A §G.6 #3)", () => {
  it("an initial estimate 500 kcal too high comes within 100 kcal in about 10 updating days", () => {
    const sc = makeScenario({ seed: 3, days: 40, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800, sdKcal: 0 }, noiseSdKg: 0, goal: null, profile: { manualInitialTdee: 3300 } });
    const r = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: [] }, { today: sc.today, tz: "UTC" })!;
    const within100 = r.series.find((p) => p.state === "updating" && Math.abs(p.tdee - 2800) <= 100)!;
    expect(within100.updatingDays).toBeLessThanOrEqual(12);
    expect(Math.abs(r.series[r.series.length - 1].tdee - 2800)).toBeLessThan(25);
  });
});
