import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { dayTimeline, entryClock, hourFromClock, localClock, macroKcal, macroLine } from "@/lib/physique/food/timeline";
import { targetMet, weekDates, weekStart, weekTotals } from "@/lib/physique/food/week";
import { CHANGE_WINDOWS_DAYS, energyBalance, expenditureChanges, expenditureSummary, signedKcal } from "@/lib/physique/food/energy";
import { filterSaved, GO_TO_MIN_COUNT, recentLists } from "@/lib/physique/food/goTos";
import type { DailyIntake, ExpenditurePoint, FoodEntry, PhysiqueProgram, SavedFood } from "@/lib/physique/types";

const TZ = "Europe/London";
const D = "2026-10-17";

function food(over: Partial<FoodEntry> & { id: string }): FoodEntry {
  return { date: D, loggedAt: `${D}T11:30:00.000Z`, source: "manual", schemaVersion: 1, label: "x", kcal: 100, proteinG: 10, carbsG: 10, fatG: 2, method: "quick", ...over };
}

function saved(id: string, over: Partial<SavedFood> = {}): SavedFood {
  return { id, label: id, kcal: 100, proteinG: 10, carbsG: 10, fatG: 2, lastUsedAt: `${D}T10:00:00Z`, useCount: 1, schemaVersion: 1, ...over };
}

describe("timeline", () => {
  it("buckets entries by local hour, preferring the explicit meal time", () => {
    const entries = [
      food({ id: "a", loggedAt: `${D}T06:10:00.000Z` }), // 07:10 BST
      food({ id: "b", time: "13:00" }),
      food({ id: "c", time: "02:00" }), // before the range: clamped to the first hour
      food({ id: "d", date: addDays(D, -1), time: "13:00" }), // another day
    ];
    const t = dayTimeline(entries, D, TZ, { start: 6, end: 23 });
    expect(t.hours).toHaveLength(18);
    expect(t.hours[0].entries.map((e) => e.id)).toEqual(["c"]);
    expect(t.hours[1].entries.map((e) => e.id)).toEqual(["a"]);
    expect(t.hours[7].entries.map((e) => e.id)).toEqual(["b"]);
    expect(t.entries).toBe(3);
    expect(t.totals.kcal).toBe(300);
    expect(t.hours[7].totals.proteinG).toBe(10);
  });

  it("formats clocks and the macro line", () => {
    expect(localClock(`${D}T23:30:00.000Z`, TZ)).toBe("00:30");
    expect(entryClock(food({ id: "a", time: "09:05" }), TZ)).toBe("09:05");
    expect(hourFromClock("09:40")).toBe(10);
    expect(hourFromClock("23:45")).toBe(23);
    expect(macroKcal({ proteinG: 30, carbsG: 50, fatG: 10 })).toBe(410);
    expect(macroLine({ kcal: 640, proteinG: 45.4, fatG: 12, carbsG: 60 })).toBe("640 kcal · 45P 12F 60C");
  });
});

describe("week", () => {
  it("starts weeks on Monday and marks future days", () => {
    expect(weekStart("2026-10-17")).toBe("2026-10-12"); // Saturday → Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday → same Monday
    expect(weekDates("2026-10-14")[6]).toBe("2026-10-18");
    const program: PhysiqueProgram = { id: "p", goalId: "g", schemaVersion: 1, history: [{ startDate: "2026-10-01", kcal: 2000, proteinG: 150, fatG: 60, carbsG: 215, source: "goal_start", acceptedAt: "x", tdeeAtAccept: 2500 }] };
    const week = weekTotals(weekDates(D), [food({ id: "a", date: "2026-10-13", kcal: 2050 })], { "2026-10-14": { date: "2026-10-14", status: "fasting" } }, program, D);
    expect(week[1]).toMatchObject({ date: "2026-10-13", kcal: 2050, logged: true, status: "complete" });
    expect(week[2]).toMatchObject({ logged: true, status: "fasting", kcal: 0 });
    expect(week[6]).toMatchObject({ future: true, logged: false });
    expect(week[1].target?.kcal).toBe(2000);
    expect(targetMet(2050, 2000)).toBe(true);
    expect(targetMet(2200, 2000)).toBe(false);
    expect(targetMet(10, null)).toBe(false);
  });
});

function intake(date: string, kcal: number, status: DailyIntake["status"] = "complete"): DailyIntake {
  return { date, kcal, proteinG: 0, carbsG: 0, fatG: 0, status, suggestedPartial: false, entries: 1 };
}

function exp(date: string, tdee: number, state: ExpenditurePoint["state"] = "updating"): ExpenditurePoint {
  return { date, tdee, state, trendKg: null, base: tdee, offset: 0, updatingDays: 1 };
}

describe("energy balance", () => {
  it("averages intake and the line over logged days only", () => {
    const days = [addDays(D, -2), addDays(D, -1), D];
    const series = [intake(days[0], 2000), intake(days[1], 1000, "partial"), intake(days[2], 2400)];
    const expSeries = days.map((d) => exp(d, 2500));
    const eb = energyBalance(series, expSeries, null, "expenditure", D, 3);
    expect(eb.points.map((p) => p.intakeKcal)).toEqual([2000, null, 2400]);
    expect(eb.daysLogged).toBe(2);
    expect(eb.avgIntakeKcal).toBe(2200);
    expect(eb.avgLineKcal).toBe(2500);
    expect(eb.differenceKcal).toBe(-300);
  });

  it("uses the program target as the line in targets mode", () => {
    const program: PhysiqueProgram = { id: "p", goalId: "g", schemaVersion: 1, history: [{ startDate: D, kcal: 1800, proteinG: 1, fatG: 1, carbsG: 1, source: "goal_start", acceptedAt: "x", tdeeAtAccept: 1 }] };
    const eb = energyBalance([intake(D, 2000)], [], program, "targets", D, 2);
    expect(eb.points[0].lineKcal).toBeNull();
    expect(eb.points[1].lineKcal).toBe(1800);
    expect(eb.differenceKcal).toBe(200);
  });

  it("is empty with no data", () => {
    const eb = energyBalance([], [], null, "expenditure", D);
    expect(eb.points).toHaveLength(30);
    expect(eb.avgIntakeKcal).toBeNull();
    expect(eb.differenceKcal).toBeNull();
  });
});

describe("expenditure page", () => {
  const series = Array.from({ length: 40 }, (_, i) => exp(addDays(D, -(39 - i)), 2500 + i * 2, i < 7 ? "holding" : "updating"));

  it("summarises the range", () => {
    const s = expenditureSummary(series, { from: addDays(D, -6), to: D });
    expect(s.points).toHaveLength(7);
    expect(s.differenceKcal).toBe(12);
    expect(s.averageKcal).toBe(2500 + 36 * 2);
    expect(expenditureSummary(series, { from: addDays(D, 5), to: addDays(D, 9) }).averageKcal).toBeNull();
  });

  it("reports changes per window and waits when the window is not covered", () => {
    const changes = expenditureChanges(series, D);
    expect(changes.map((c) => c.days)).toEqual([...CHANGE_WINDOWS_DAYS]);
    expect(changes[0]).toMatchObject({ days: 3, deltaKcal: 6, word: "Steady" });
    expect(changes[3]).toMatchObject({ days: 30, deltaKcal: 60, word: "Increase" });
    expect(changes[3].spark).toHaveLength(31);
    const short = expenditureChanges(series.slice(-5), D);
    expect(short[0].word).toBe("Steady");
    expect(short[1].word).toBe("Waiting");
    expect(expenditureChanges([], D).every((c) => c.word === "Waiting")).toBe(true);
  });

  it("formats signed kcal with a true minus", () => {
    expect(signedKcal(-35)).toBe("−35");
    expect(signedKcal(1200)).toBe("+1,200");
    expect(signedKcal(0.2)).toBe("0");
  });
});

describe("go-tos", () => {
  it("ranks foods logged near the hour, then the latest", () => {
    const oats = saved("oats", { lastUsedAt: `${D}T07:00:00Z` });
    const rice = saved("rice", { lastUsedAt: `${D}T19:00:00Z` });
    const whey = saved("whey", { lastUsedAt: `${addDays(D, -3)}T10:00:00Z` });
    const entries: FoodEntry[] = [];
    for (let i = 0; i < GO_TO_MIN_COUNT + 1; i++) entries.push(food({ id: `o${i}`, date: addDays(D, -i), time: "07:30", savedFoodId: "oats" }));
    for (let i = 0; i < GO_TO_MIN_COUNT; i++) entries.push(food({ id: `r${i}`, date: addDays(D, -i), time: "19:00", savedFoodId: "rice" }));
    entries.push(food({ id: "w0", date: D, time: "08:00", savedFoodId: "whey" })); // once: not a go-to
    const r = recentLists(entries, [oats, rice, whey], 8, D, TZ);
    expect(r.goTos.map((s) => s.id)).toEqual(["oats"]);
    expect(r.latest.map((s) => s.id)).toEqual(["rice", "whey"]);
    const evening = recentLists(entries, [oats, rice, whey], 19, D, TZ);
    expect(evening.goTos.map((s) => s.id)).toEqual(["rice"]);
  });

  it("filters saved foods and puts favourites first", () => {
    const list = [saved("apple", { useCount: 5 }), saved("apple pie", { favourite: true }), saved("rice")];
    expect(filterSaved(list, "app").map((s) => s.id)).toEqual(["apple pie", "apple"]);
    expect(filterSaved(list, "").length).toBe(3);
  });
});
