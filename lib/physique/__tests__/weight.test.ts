import { describe, expect, it } from "vitest";
import { makeScenario } from "@/lib/physique/fixtures";
import {
  dailyTrendRows,
  dailyWeightSeries,
  displayRate,
  isConfidentlyAbove,
  marginFor,
  phaseMaskActive,
  pickWindow,
  rateOverWindow,
  sanityCheck,
  segmentStart,
  trendSeries,
  firstRateRead,
} from "@/lib/physique/weight";
import type { WeighIn } from "@/lib/physique/types";
import { addDays } from "@/lib/dates";

function w(date: string, kg: number): WeighIn {
  return { id: `w-${date}`, date, loggedAt: `${date}T07:00:00Z`, source: "manual", schemaVersion: 1, kg };
}

describe("daily series and trend", () => {
  it("interpolates gaps and never extends past the last weigh-in", () => {
    const series = dailyWeightSeries([w("2026-10-01", 80), w("2026-10-04", 83)]);
    expect(series.map((d) => d.kg)).toEqual([80, 81, 82, 83]);
    expect(series.map((d) => d.real)).toEqual([true, false, false, true]);
    const t = trendSeries([w("2026-10-01", 80), w("2026-10-04", 83)]);
    expect(t[t.length - 1].date).toBe("2026-10-04");
    expect(t[0].trendKg).toBe(80);
    expect(t[1].trendKg).toBeCloseTo(80.1, 9);
  });

  it("gives every day a trend, missed days included, holding after the last weigh-in (C11)", () => {
    const rows = dailyTrendRows([w("2026-10-01", 80), w("2026-10-04", 83)], "2026-09-30", "2026-10-06");
    expect(rows.map((r) => r.date)).toEqual(["2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01", "2026-09-30"]);
    expect(rows.map((r) => r.scaleKg)).toEqual([null, null, 83, null, null, 80, null]);
    const t = trendSeries([w("2026-10-01", 80), w("2026-10-04", 83)]);
    expect(rows[3].trendKg).toBeCloseTo(t[2].trendKg, 9); // a missed day between weigh-ins
    expect(rows[0].trendKg).toBeCloseTo(t[3].trendKg, 9); // held after the last
    expect(rows[6].trendKg).toBeNull(); // before the first
    expect(dailyTrendRows([], "2026-10-01", "2026-10-02").every((r) => r.trendKg === null)).toBe(true);
  });

  it("uses the earliest weigh-in on a date", () => {
    const a: WeighIn = { ...w("2026-10-01", 80), loggedAt: "2026-10-01T09:00:00Z", id: "late" };
    const b: WeighIn = { ...w("2026-10-01", 79), loggedAt: "2026-10-01T06:00:00Z", id: "early" };
    expect(dailyWeightSeries([a, b])[0].kg).toBe(79);
  });
});

describe("rate accuracy over seeds (85 kg, −0.6 %/wk, daily weigh-ins)", () => {
  function hitRate(windowDays: number, tol: number): number {
    let hits = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const sc = makeScenario({ seed, days: 42, bodyweightKg: 85, goal: { ratePctPerWeek: -0.6 }, waterStepKg: 0 });
      const r = rateOverWindow(sc.weighIns, sc.today, windowDays);
      if (r && Math.abs(r.ratePctPerWeek - -0.6) <= tol) hits++;
    }
    return hits / N;
  }
  it("28-day window within ±0.4 in ≥95% of seeds", () => {
    expect(hitRate(28, 0.4)).toBeGreaterThanOrEqual(0.95);
  });
  it("21-day window within ±0.5 in ≥95% of seeds", () => {
    expect(hitRate(21, 0.5)).toBeGreaterThanOrEqual(0.95);
  });
});

describe("gates and windows", () => {
  it("rate is null below 5 weigh-ins and the display needs 14 days", () => {
    const few = [w("2026-10-01", 80), w("2026-10-02", 80), w("2026-10-03", 80), w("2026-10-04", 80)];
    expect(rateOverWindow(few, "2026-10-04", 14)).toBeNull();
    expect(displayRate(few, "2026-10-04", null)).toBeNull();
    expect(firstRateRead({ goal: null, dayFlags: {}, today: "2026-10-04", weighIns: few })).toEqual({ from: "2026-10-01", fromReason: null, on: "2026-10-14", weighInsNeeded: 2 });
    const sc = makeScenario({ seed: 3, days: 10, bodyweightKg: 85, goal: null });
    expect(displayRate(sc.weighIns, sc.today, null)).toBeNull();
  });

  it("the phase-start mask excludes the first 7 days from windows", () => {
    const sc = makeScenario({ seed: 4, days: 20, bodyweightKg: 85, goal: { ratePctPerWeek: -0.6 } });
    const seg = segmentStart({ goal: sc.goal, dayFlags: sc.dayFlags, today: sc.today });
    expect(seg).toBe(addDays(sc.startDate, 7));
    // 20 days of data but only 13 inside the segment: no 14-day window fits.
    const pick = pickWindow(sc.weighIns, sc.today, [14], { segmentStart: seg, minWeighIns: 5 });
    expect(pick).toBeNull();
    expect(phaseMaskActive(sc.goal, addDays(sc.startDate, 6))).toBe(true);
    expect(phaseMaskActive(sc.goal, addDays(sc.startDate, 7))).toBe(false);
  });

  it("a rate change ≥0.2 restarts the segment; a water event excludes days and widens the margin", () => {
    const sc = makeScenario({ seed: 5, days: 40, bodyweightKg: 85, goal: { ratePctPerWeek: -0.6 } });
    const goal = { ...sc.goal!, rateHistory: [{ date: addDays(sc.startDate, 20), fromPctPerWeek: -1.0, toPctPerWeek: -0.6, reason: "user" as const }] };
    expect(segmentStart({ goal, dayFlags: {}, today: sc.today })).toBe(addDays(sc.startDate, 27));
    const flags = { [addDays(sc.startDate, 30)]: { date: addDays(sc.startDate, 30), events: [{ type: "travel" as const }] } };
    expect(segmentStart({ goal: sc.goal, dayFlags: flags, today: sc.today })).toBe(addDays(sc.startDate, 37));
    const plain = rateOverWindow(sc.weighIns, sc.today, 21)!;
    const widened = rateOverWindow(sc.weighIns, sc.today, 21, flags)!;
    expect(widened.margin).toBeCloseTo(plain.margin * 1.5, 9);
  });

  it("margin falls back to the published minimum when the SE is tiny", () => {
    expect(marginFor(28, 0.01, 85, false)).toBeCloseTo(0.25, 9);
    expect(marginFor(21, 0.5, 85, false)).toBeCloseTo(1.645 * 0.5, 9);
    expect(marginFor(28, 0.01, 170, false)).toBeCloseTo(0.125, 9);
  });

  it("confidently-above uses the margin", () => {
    const sc = makeScenario({ seed: 6, days: 35, bodyweightKg: 85, goal: { ratePctPerWeek: -1.5 }, waterStepKg: 0 });
    const r = rateOverWindow(sc.weighIns, sc.today, 28)!;
    expect(isConfidentlyAbove(r, 1.0)).toBe(false); // losing: rate is negative
    expect(r.ratePctPerWeek).toBeLessThan(-1.0);
    expect(-r.ratePctPerWeek - 1.0 > r.margin).toBe(true);
  });
});

describe("sanity check", () => {
  it("flags entries more than 3% from the trend", () => {
    expect(sanityCheck(85, 82).ok).toBe(false);
    expect(sanityCheck(83, 82).ok).toBe(true);
    expect(sanityCheck(83, null).ok).toBe(true);
  });
});

describe("the first rate read, one answer everywhere (IN12)", () => {
  // The founder's weigh-ins and cut: goal set 17 Oct, today 22 Oct. Home said "14 more weigh-ins", Progress "about 5 days".
  const mine = [w("2026-10-14", 79.4), w("2026-10-16", 78.5), w("2026-10-17", 78.5), w("2026-10-18", 78.9), w("2026-10-21", 77.8), w("2026-10-22", 77.3)];
  const cut = { id: "g", createdAt: "2026-10-17T12:00:00Z", type: "lose" as const, startDate: "2026-10-17", startTrendKg: 79.3, targetKg: 75, ratePctPerWeek: -0.5, trainingStatusAtCreation: "intermediate" as const, schemaVersion: 1 as const };

  it("leaves out the goal's first week and reads two weeks after it", () => {
    expect(firstRateRead({ goal: cut, dayFlags: {}, today: "2026-10-22", weighIns: mine })).toEqual({ from: "2026-10-24", fromReason: "goal_start", on: "2026-11-06", weighInsNeeded: 6 });
    // Halfway through the window with three weigh-ins in it: three more, same day.
    const later = [...mine, w("2026-10-24", 77.1), w("2026-10-26", 77), w("2026-10-29", 76.8)];
    expect(firstRateRead({ goal: cut, dayFlags: {}, today: "2026-10-30", weighIns: later })).toEqual({ from: "2026-10-24", fromReason: "goal_start", on: "2026-11-06", weighInsNeeded: 3 });
  });

  it("slides when weigh-ins are short at the end, and names a water event", () => {
    const sparse = [w("2026-10-01", 80), w("2026-10-20", 79.5)];
    expect(firstRateRead({ goal: null, dayFlags: {}, today: "2026-10-22", weighIns: sparse })).toEqual({ from: "2026-10-01", fromReason: null, on: "2026-10-27", weighInsNeeded: 5 });
    const ill = { "2026-10-25": { date: "2026-10-25", events: [{ type: "illness" as const }] } };
    expect(firstRateRead({ goal: cut, dayFlags: ill, today: "2026-10-26", weighIns: mine }).fromReason).toBe("water_event");
  });
});
