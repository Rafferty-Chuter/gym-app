import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { weightGap, type WeightGapInputs } from "@/lib/physique/weightGap";
import { weightGapLines, weightGapShort } from "@/lib/physique/weightGapWords";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import type { DailySteps, DayFlags, ExpenditurePoint, FoodEntry } from "@/lib/physique/types";

const THROUGH = "2026-10-18";
const FROM = addDays(THROUGH, -27);
const GOAL_START = "2026-07-06";
const kgFmt = (x: number) => `${x.toFixed(1)} kg`;

type Person = {
  /** Steps a day in the window's first half and its second (a step halfway). */
  stepsFrom?: number;
  stepsTo?: number;
  /** Steps a day when the goal began. */
  stepsAtStart?: number;
  carbsFrom?: number;
  carbsTo?: number;
  /** Days in the window with no food logged. */
  unloggedDays?: number;
  maintAtStart?: number;
  maintNow?: number;
  flags?: Record<string, DayFlags>;
  expected?: number;
  actual?: number;
};

/** A cut from 6 Jul with exact numbers in its last 4 weeks, so each cause can be checked by hand. */
function inputs(p: Person = {}): WeightGapInputs {
  const steps: DailySteps[] = [];
  const foodEntries: FoodEntry[] = [];
  const expenditure: ExpenditurePoint[] = [];
  const total = 1 + (Date.parse(THROUGH) - Date.parse(GOAL_START)) / 86_400_000;
  for (let k = 0; k < total; k++) {
    const date: LocalDate = addDays(GOAL_START, k);
    const inWindow = date >= FROM;
    const t = inWindow ? (Date.parse(date) - Date.parse(FROM)) / (27 * 86_400_000) : 0;
    const s = inWindow ? (t < 0.5 ? (p.stepsFrom ?? 9000) : (p.stepsTo ?? 9000)) : (p.stepsAtStart ?? p.stepsFrom ?? 9000);
    steps.push({ id: `s${k}`, date, loggedAt: `${date}T23:00:00.000Z`, source: "healthkit", schemaVersion: 1, steps: Math.round(s) });
    const carbs = inWindow ? (t < 0.5 ? (p.carbsFrom ?? 220) : (p.carbsTo ?? 220)) : (p.carbsFrom ?? 220);
    const di = inWindow ? Math.round((Date.parse(date) - Date.parse(FROM)) / 86_400_000) : -1;
    const skip = di >= 0 && di % 5 === 2 && Math.floor(di / 5) < (p.unloggedDays ?? 0);
    if (!skip) foodEntries.push({ id: `f${k}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: 2300, proteinG: 170, carbsG: Math.round(carbs), fatG: 70, method: "quick" });
    const m = (p.maintAtStart ?? 2800) + (k / (total - 1)) * ((p.maintNow ?? 2800) - (p.maintAtStart ?? 2800));
    expenditure.push({ date, tdee: Math.round(m), state: "updating", trendKg: null } as ExpenditurePoint);
  }
  // The estimate was running for five weeks before the goal, so it had settled by the start.
  const before: ExpenditurePoint[] = Array.from({ length: 35 }, (_, k) => ({ date: addDays(GOAL_START, k - 35), tdee: p.maintAtStart ?? 2800, state: "updating", trendKg: null }) as ExpenditurePoint);
  return { foodEntries, dayFlags: p.flags ?? {}, steps, expenditure: [...before, ...expenditure], goalStart: GOAL_START, from: FROM, through: THROUGH, today: addDays(THROUGH, 4), bodyKg: 85, expectedKgWk: p.expected ?? -0.45, actualKgWk: p.actual ?? -0.15 };
}

describe("why the weight isn't moving (IN3)", () => {
  it("on plan, with the scale where calories put it, says nothing", () => {
    const r = weightGap(inputs({ expected: -0.45, actual: -0.42 }));
    expect(r.scale).toBeNull();
  });

  it("steps falling by 5,000 a day over the window are named, with their share in kg a week", () => {
    const r = weightGap(inputs({ stepsFrom: 11000, stepsTo: 6000 }));
    const steps = r.scale?.causes.find((c) => c.kind === "steps");
    expect(steps).toBeDefined();
    if (steps?.kind !== "steps") return;
    expect(steps.fromSteps).toBeGreaterThan(10000);
    expect(steps.toSteps).toBeLessThan(7500);
    // 5,000 fewer steps × 0.0004 × 85 kg = 170 kcal a day; half of it shows in the window, about 0.08 kg a week.
    expect(steps.kcalPerDay).toBeGreaterThan(100);
    expect(steps.kgPerWeek).toBeGreaterThan(0.04);
    expect(steps.kgPerWeek).toBeLessThan(0.12);
    expect(r.scale!.unexplainedKgWk).toBeLessThan(r.scale!.gapKgWk);
  });

  it("carbs rising over the window are named as water, sized", () => {
    const r = weightGap(inputs({ carbsFrom: 150, carbsTo: 300 }));
    const water = r.scale?.causes.find((c) => c.kind === "water");
    expect(water).toBeDefined();
    if (water?.kind !== "water") return;
    expect(water.toCarbsG - water.fromCarbsG).toBeGreaterThan(90);
    expect(water.kgPerWeek).toBeGreaterThan(0.05);
  });

  it("days not logged are named when the scale sits above what calories predict", () => {
    const r = weightGap(inputs({ unloggedDays: 4 }));
    expect(r.scale?.causes.find((c) => c.kind === "logging")).toMatchObject({ kind: "logging", unlogged: 4 });
  });

  it("creatine started in the window is named", () => {
    const r = weightGap(inputs({ flags: { [addDays(FROM, 6)]: { date: addDays(FROM, 6), events: [{ type: "creatine_start" }] } } }));
    expect(r.scale?.causes.some((c) => c.kind === "event" && c.type === "creatine_start")).toBe(true);
  });

  it("a scale below what calories predict names causes that way only", () => {
    const r = weightGap(inputs({ expected: -0.3, actual: -0.7, carbsFrom: 300, carbsTo: 150, stepsFrom: 6000, stepsTo: 11000, unloggedDays: 4 }));
    const kinds = r.scale?.causes.map((c) => c.kind) ?? [];
    expect(kinds).toContain("water");
    expect(kinds).toContain("steps");
    expect(kinds).not.toContain("logging");
  });

  it("nothing sized leaves the whole gap unexplained, said as such", () => {
    const r = weightGap(inputs());
    expect(r.scale?.causes).toEqual([]);
    expect(r.scale?.unexplainedKgWk).toBeCloseTo(0.3, 5);
  });

  it("since the goal began: maintenance falling, and how much of it steps account for", () => {
    const r = weightGap(inputs({ maintAtStart: 2950, maintNow: 2780, stepsAtStart: 11200, stepsFrom: 6900, stepsTo: 6900 }));
    expect(r.sinceStart).toMatchObject({ since: GOAL_START, maintFrom: 2950, stepsFrom: 11200, stepsTo: 6900 });
    expect(r.sinceStart!.maintTo).toBeLessThan(2800);
    expect(r.sinceStart!.stepsKcal).toBeGreaterThan(130);
  });

  it("a change while the estimate was still settling is not called a change in maintenance", () => {
    const i = inputs({ maintAtStart: 2330, maintNow: 2780 });
    // The estimate began with the goal: its first week held the formula's guess.
    const exp = i.expenditure!.filter((p) => p.date >= GOAL_START).map((p, k) => (k < 7 ? { ...p, tdee: 2330, state: "holding" as const } : p));
    const r = weightGap({ ...i, expenditure: exp });
    expect(r.sinceStart).not.toBeNull();
    expect(r.sinceStart!.since > GOAL_START).toBe(true);
    expect(r.sinceStart!.since >= addDays(GOAL_START, 7 + 28)).toBe(true);
  });

  it("says nothing on numbers that aren't numbers (no estimate yet)", () => {
    const i = inputs({ maintAtStart: 2950, maintNow: 2780 });
    const r = weightGap({ ...i, expectedKgWk: Number.NaN, expenditure: i.expenditure!.map((p) => ({ ...p, tdee: Number.NaN })) });
    expect(r).toEqual({ scale: null, sinceStart: null });
  });

  it("words: kg a week first, the lever in its own numbers, never fat or advice", () => {
    const r = weightGap(inputs({ stepsFrom: 11000, stepsTo: 6000, carbsFrom: 150, carbsTo: 300, unloggedDays: 4, maintAtStart: 2950, maintNow: 2780, stepsAtStart: 11200 }));
    const lines = weightGapLines(r, kgFmt, "4 weeks");
    expect(lines[0]).toMatch(/^The scale trend is 0\.3 kg a week above what your calories predict\.$/);
    expect(lines.some((l) => /^Steps fell from [\d,]+ to [\d,]+ a day over the 4 weeks: about \d+ kcal a day less burned, about 0\.\d kg a week of it\.$/.test(l))).toBe(true);
    expect(lines.some((l) => /^Carbs rose from \d+ to \d+ g a day over the 4 weeks; the water they hold adds about 0\.\d kg a week to the trend\.$/.test(l))).toBe(true);
    expect(lines.some((l) => /^Maintenance has gone from about 2,950 to 2,7\d0 kcal since 6\u00a0Jul; steps fell from 11,200 to [\d,]+ a day in that time, about \d+ kcal of it\.$/.test(l))).toBe(true);
    for (const l of lines) {
      expect(bannedPhrasesIn(l)).toEqual([]);
      expect(l).not.toMatch(/\bfat\b|should|try to|aim|you need|metabolism/i);
    }
    expect(weightGapShort(r)).toMatch(/^Steps [\d,]+ → [\d,]+ a day since 6\u00a0Jul$/);
  });

  it("the short line falls back to the window's largest sized cause, then to nothing", () => {
    const water = weightGap(inputs({ carbsFrom: 150, carbsTo: 300 }));
    expect(weightGapShort(water)).toMatch(/^Carbs \d+ → \d+ g a day, which holds water$/);
    expect(weightGapShort(weightGap(inputs()))).toBeNull();
  });
});
