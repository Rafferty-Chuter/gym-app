import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  ADHERENCE_TOLERANCE_KCAL,
  adherence,
  dailyIntake,
  dailyIntakeSeries,
  intakeMean,
  loggedShare,
  macroMeans,
  PARTIAL_MIN_COMPLETE_DAYS,
  PARTIAL_RATIO,
  targetInEffect,
  partialDaysLeftOut,
} from "@/lib/physique/intake";
import type { DayFlags, FoodEntry, PhysiqueProgram, ProgramEntry } from "@/lib/physique/types";

const D0 = "2026-09-01";
const day = (i: number) => addDays(D0, i);

function food(date: string, kcal: number, macros: Partial<Pick<FoodEntry, "proteinG" | "carbsG" | "fatG">> = {}, id = `f-${date}-${kcal}`): FoodEntry {
  return {
    id,
    date,
    loggedAt: `${date}T12:00:00Z`,
    source: "manual",
    schemaVersion: 1,
    label: "x",
    kcal,
    proteinG: macros.proteinG ?? Math.round((kcal * 0.3) / 4),
    carbsG: macros.carbsG ?? Math.round((kcal * 0.45) / 4),
    fatG: macros.fatG ?? Math.round((kcal * 0.25) / 9),
    method: "quick",
  };
}

function entry(startDate: string, kcal: number, source: ProgramEntry["source"] = "check_in"): ProgramEntry {
  return { startDate, kcal, proteinG: 170, fatG: 90, carbsG: 200, source, acceptedAt: `${startDate}T00:00:00Z`, tdeeAtAccept: kcal + 500 };
}

function program(...entries: ProgramEntry[]): PhysiqueProgram {
  return { id: "p", goalId: "g", history: entries, schemaVersion: 1 };
}

describe("day status (02 §1.2)", () => {
  it("override beats the sum, fasting is 0 kcal, a user partial is kept but flagged, nothing logged is unlogged", () => {
    const d = day(0);
    expect(dailyIntake(d, [food(d, 1000), food(d, 500)], undefined)).toMatchObject({ kcal: 1500, status: "complete", entries: 2 });
    expect(dailyIntake(d, [food(d, 1000)], { date: d, kcalOverride: 2200 })).toMatchObject({ kcal: 2200, status: "complete" });
    expect(dailyIntake(d, [], { date: d, kcalOverride: 2200 })).toMatchObject({ kcal: 2200, status: "complete", entries: 0 });
    expect(dailyIntake(d, [food(d, 300)], { date: d, status: "fasting" })).toMatchObject({ kcal: 0, status: "fasting" });
    expect(dailyIntake(d, [food(d, 600)], { date: d, status: "partial" })).toMatchObject({ kcal: 600, status: "partial" });
    expect(dailyIntake(d, [], undefined)).toMatchObject({ kcal: 0, status: "unlogged", entries: 0 });
    expect(dailyIntake(d, [], { date: d, status: "partial" })).toMatchObject({ status: "unlogged" });
  });
});

describe("window means (02 §3, §4.2 golden)", () => {
  it("21-day mean: 20 days × 3,000 + 1 day × 1,500 → 2,929", () => {
    const entries = Array.from({ length: 21 }, (_, i) => food(day(i), i === 20 ? 1500 : 3000));
    const series = dailyIntakeSeries(entries, {}, day(0), day(20));
    expect(Math.round(intakeMean(series, day(20), 21)!)).toBe(2929);
  });

  it("intakeMean uses complete and fasting days only; loggedShare counts the same days", () => {
    const entries = [food(day(0), 2000), food(day(1), 2000), food(day(2), 400), food(day(4), 2000)];
    const flags: Record<string, DayFlags> = {
      [day(2)]: { date: day(2), status: "partial" },
      [day(3)]: { date: day(3), status: "fasting" },
    };
    const series = dailyIntakeSeries(entries, flags, day(0), day(6));
    // Days: 0 complete, 1 complete, 2 partial, 3 fasting (0), 4 complete, 5 and 6 unlogged.
    expect(intakeMean(series, day(6), 7)).toBeCloseTo(6000 / 4, 9);
    expect(loggedShare(series, day(6), 7)).toBeCloseTo(4 / 7, 9);
    expect(intakeMean(series, day(6), 2)).toBeNull();
    expect(loggedShare(series, day(6), 2)).toBe(0);
  });
});

describe("suspected partial days are left out (02 §1.2, C11)", () => {
  function seriesWithLastDay(kcal: number, flags: Record<string, DayFlags> = {}) {
    const entries = Array.from({ length: 21 }, (_, i) => food(day(i), 2500));
    entries.push(food(day(21), kcal));
    return dailyIntakeSeries(entries, flags, day(0), day(21));
  }

  it("fires at 0.49 × the median and not at 0.51 ×", () => {
    const low = seriesWithLastDay(Math.round(2500 * 0.49));
    expect(low[21].suggestedPartial).toBe(true);
    expect(low[21].status).toBe("partial");
    expect(partialDaysLeftOut(low)).toEqual([day(21)]);
    const high = seriesWithLastDay(Math.round(2500 * 0.51));
    expect(high[21].suggestedPartial).toBe(false);
    expect(high[21].status).toBe("complete");
    expect(partialDaysLeftOut(high)).toEqual([]);
    expect(PARTIAL_RATIO).toBe(0.5);
  });

  it("a dismissed day and a user-flagged partial day are not suggested", () => {
    const dismissed = seriesWithLastDay(1000, { [day(21)]: { date: day(21), partialDismissed: true } });
    expect(dismissed[21].suggestedPartial).toBe(false);
    const flagged = seriesWithLastDay(1000, { [day(21)]: { date: day(21), status: "partial" } });
    expect(flagged[21].status).toBe("partial");
    expect(flagged[21].suggestedPartial).toBe(false);
  });

  it("needs a norm: no suggestion with fewer than the minimum complete days before it", () => {
    const entries = Array.from({ length: PARTIAL_MIN_COMPLETE_DAYS - 1 }, (_, i) => food(day(i), 2500));
    entries.push(food(day(PARTIAL_MIN_COMPLETE_DAYS - 1), 500));
    const series = dailyIntakeSeries(entries, {}, day(0), day(PARTIAL_MIN_COMPLETE_DAYS - 1));
    expect(series[PARTIAL_MIN_COMPLETE_DAYS - 1].suggestedPartial).toBe(false);
    const more = [...entries.slice(0, -1), food(day(PARTIAL_MIN_COMPLETE_DAYS - 1), 2500), food(day(PARTIAL_MIN_COMPLETE_DAYS), 500)];
    const series2 = dailyIntakeSeries(more, {}, day(0), day(PARTIAL_MIN_COMPLETE_DAYS));
    expect(series2[PARTIAL_MIN_COMPLETE_DAYS].suggestedPartial).toBe(true);
  });

  it("a suspected day drops out of later norms and the lookback is 21 days", () => {
    const entries = Array.from({ length: 10 }, (_, i) => food(day(i), 2500));
    entries.push(food(day(10), 1000)); // suggested
    for (let i = 11; i < 20; i++) entries.push(food(day(i), 2500));
    entries.push(food(day(20), 1000));
    const series = dailyIntakeSeries(entries, {}, day(0), day(20));
    expect(series[10].suggestedPartial).toBe(true);
    expect(series[20].suggestedPartial).toBe(true); // the median is still 2500
  });
});

describe("target in effect and adherence (02 §1.1, §3)", () => {
  it("targetInEffect picks the latest entry with startDate ≤ date", () => {
    const p = program(entry(day(0), 2400, "goal_start"), entry(day(7), 2300), entry(day(14), 2250));
    expect(targetInEffect(p, day(3))!.kcal).toBe(2400);
    expect(targetInEffect(p, day(7))!.kcal).toBe(2300);
    expect(targetInEffect(p, day(20))!.kcal).toBe(2250);
    expect(targetInEffect(p, addDays(day(0), -1))).toBeNull();
    expect(targetInEffect(null, day(3))).toBeNull();
  });

  it("is on target inside ±150 and off target beyond it, over logged days with a program", () => {
    const p = program(entry(day(0), 2400, "goal_start"));
    const on = Array.from({ length: 14 }, (_, i) => food(day(i), 2400 + (i % 2 === 0 ? 50 : -50)));
    const a = adherence(dailyIntakeSeries(on, {}, day(0), day(13)), p, day(13));
    expect(a.n).toBe(14);
    expect(a.daysWithProgram).toBe(14);
    expect(a.deltaKcal).toBeCloseTo(0, 9);
    expect(a.onTarget).toBe(true);
    expect(a.threshold).toBe(ADHERENCE_TOLERANCE_KCAL);

    const under = Array.from({ length: 14 }, (_, i) => food(day(i), 2400 - 320));
    const b = adherence(dailyIntakeSeries(under, {}, day(0), day(13)), p, day(13));
    expect(b.deltaKcal).toBeCloseTo(-320, 9);
    expect(b.onTarget).toBe(false);
  });

  it("the noise term widens the tolerance when daily differences are wild", () => {
    const p = program(entry(day(0), 2400, "goal_start"));
    // Alternating +600 / −280: mean +160 (over 150), but sd ≈ 457 → 1.96 × 457 / √14 ≈ 239.
    const wild = Array.from({ length: 14 }, (_, i) => food(day(i), 2400 + (i % 2 === 0 ? 600 : -280)));
    const series = dailyIntakeSeries(wild, {}, day(0), day(13));
    expect(partialDaysLeftOut(series)).toEqual([]);
    const a = adherence(series, p, day(13));
    expect(a.deltaKcal).toBeCloseTo(160, 9);
    expect(a.threshold!).toBeGreaterThan(235);
    expect(a.onTarget).toBe(true);
  });

  it("leaves a suspected partial day out without waiting, and counts it once marked complete (C11)", () => {
    const entries = Array.from({ length: 21 }, (_, i) => food(day(i), 2500));
    entries.push(food(day(21), 1000)); // suspected partial
    const p = program(entry(day(10), 2500, "goal_start"));
    const a = adherence(dailyIntakeSeries(entries, {}, day(0), day(21)), p, day(21));
    expect(a.daysWithProgram).toBe(12); // days 10..21
    expect(a.n).toBe(11); // day 21 left out
    expect(a.deltaKcal).toBeCloseTo(0, 9);
    expect(a.onTarget).toBe(true);
    // Marked complete in Edit day: it counts, and pulls the mean down.
    const kept = adherence(dailyIntakeSeries(entries, { [day(21)]: { date: day(21), partialDismissed: true } }, day(0), day(21)), p, day(21));
    expect(kept.n).toBe(12);
    expect(kept.deltaKcal).toBeCloseTo(-1500 / 12, 9);
  });
});

describe("macro means per kg (02 §3)", () => {
  it("averages complete days only and divides by bodyweight", () => {
    const entries = Array.from({ length: 7 }, (_, i) => food(day(i), 2400, { proteinG: 170, fatG: 85, carbsG: 250 }));
    const flags: Record<string, DayFlags> = { [day(6)]: { date: day(6), status: "fasting" } };
    const series = dailyIntakeSeries(entries, flags, day(0), day(6));
    const m = macroMeans(series, day(6), 7, 85);
    expect(m.n).toBe(6);
    expect(m.proteinGPerKg).toBeCloseTo(2.0, 9);
    expect(m.fatGPerKg).toBeCloseTo(1.0, 9);
    expect(m.carbsG).toBe(250);
    expect(macroMeans(series, day(6), 7, null).proteinGPerKg).toBeNull();
    expect(macroMeans([], day(6), 7, 85).n).toBe(0);
  });
});
