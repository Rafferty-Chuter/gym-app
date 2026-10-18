import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { buildWeekReport, defaultReportWeek, reportWeekStart } from "@/lib/physique/weekReport";

const FLAT_LIFTS = [
  { name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.02 },
  { name: "Bench Press", startE1rm: 110, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.02 },
];

describe("weekReport", () => {
  const sc = makeScenario({ seed: 7, days: 42, preDays: 7, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, lifts: FLAT_LIFTS, sleep: { meanH: 7.2, sdH: 0.3, source: "manual", loggedShare: 1 } });
  const now = { today: sc.today, tz: "UTC" };
  const exp = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: sc.goal ? [sc.goal] : [] }, now);
  const inputs = {
    weighIns: sc.weighIns,
    foodEntries: sc.foodEntries,
    dayFlags: sc.dayFlags,
    sleepNights: sc.sleepNights,
    workouts: sc.workouts,
    program: sc.program,
    goal: sc.goal,
    weightUnit: "kg" as const,
    expenditure: exp?.series ?? null,
    verdict: { title: "On track", detail: "Losing 0.6 %/wk.", state: "good" as const },
  };

  it("picks Monday weeks and a sensible default week", () => {
    expect(reportWeekStart("2026-10-17")).toBe("2026-10-12");
    expect(defaultReportWeek("2026-10-13")).toBe("2026-10-05"); // Tuesday: last week
    expect(defaultReportWeek("2026-10-15")).toBe("2026-10-12"); // Thursday: this week
  });

  it("summarises a complete week from seeded data", () => {
    const start = addDays(reportWeekStart(sc.today), -14);
    const r = buildWeekReport(inputs, start, now);
    expect(r.complete).toBe(true);
    expect(r.daysCovered).toBe(7);
    expect(r.weight.weighIns).toBe(7);
    expect(r.weight.missing).toEqual([]);
    expect(r.weight.startTrendKg).not.toBeNull();
    expect(r.weight.deltaKg).not.toBeNull();
    expect(r.weight.ratePctPerWeek).not.toBeNull();
    expect(r.expenditure.endKcal).not.toBeNull();
    expect(r.food.daysLogged).toBe(7);
    expect(r.food.unlogged).toEqual([]);
    expect(r.food.meanKcal).toBeGreaterThan(1500);
    expect(r.food.targetKcal).not.toBeNull();
    expect(r.food.proteinGPerKg).toBeGreaterThan(1);
    expect(r.training.sessions).toBeGreaterThan(0);
    expect(r.training.hardSets).toBeGreaterThan(0);
    expect(r.training.lifts.map((l) => l.name).sort()).toEqual(["Bench Press", "Squat"]);
    expect(r.training.lifts.every((l) => l.prevE1rmKg != null && l.changePct != null)).toBe(true);
    expect(r.sleep.nights).toBe(7);
    expect(r.sleep.meanH).toBeGreaterThan(6);
    expect(r.gaps).toEqual([]);
    expect(r.verdict?.title).toBe("On track");
  });

  it("carries one entry a day for the small charts, and protein days on target (W4)", () => {
    const start = addDays(reportWeekStart(sc.today), -14);
    const r = buildWeekReport(inputs, start, now);
    expect(r.days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
    expect(r.days.every((d) => d.trendKg != null && d.kcal != null && d.asleepH != null)).toBe(true);
    expect(r.days.reduce((n, d) => n + d.sessions, 0)).toBe(r.training.sessions);
    expect(r.days.reduce((n, d) => n + d.hardSets, 0)).toBe(r.training.hardSets);
    expect(r.food.proteinDaysHit).not.toBeNull();
    expect(r.food.proteinDaysHit!).toBeLessThanOrEqual(r.food.complete);
    // Seeded manual nights all wake at 07:00: no spread.
    expect(r.sleep.wakeSpreadMin).toBe(0);
  });

  it("lists gaps plainly and covers only elapsed days in the running week", () => {
    const start = reportWeekStart(sc.today);
    const elapsed = addDays(start, 2);
    const thin = {
      ...inputs,
      foodEntries: sc.foodEntries.filter((e) => e.date !== addDays(start, 1)),
      weighIns: sc.weighIns.filter((w) => w.date !== start),
      sleepNights: sc.sleepNights.filter((n) => n.date !== addDays(start, 2)),
    };
    const r = buildWeekReport(thin, start, { today: elapsed, tz: "UTC" });
    expect(r.complete).toBe(false);
    expect(r.daysCovered).toBe(3);
    expect(r.gaps).toEqual([
      { kind: "weight", date: start },
      { kind: "food", date: addDays(start, 1) },
      { kind: "sleep", date: addDays(start, 2) },
    ]);
  });

  it("is honest with nothing logged", () => {
    const r = buildWeekReport({ ...inputs, weighIns: [], foodEntries: [], sleepNights: [], workouts: [], expenditure: null, verdict: null }, "2026-10-05", { today: "2026-10-17", tz: "UTC" });
    expect(r.weight.startTrendKg).toBeNull();
    expect(r.food.meanKcal).toBeNull();
    expect(r.training.sessions).toBe(0);
    expect(r.sleep.meanH).toBeNull();
    expect(r.gaps).toEqual([]); // nothing ever logged is not 21 gaps
    expect(r.hasData).toBe(false);
  });

  it("counts gaps only from each kind's first record", () => {
    const base = (date: string) => ({ date, loggedAt: `${date}T08:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
    const r = buildWeekReport(
      { ...inputs, weighIns: [{ ...base("2026-10-07"), id: "w1", kg: 82 }], foodEntries: [], sleepNights: [{ ...base("2026-10-09"), id: "n1", asleepMin: 420 }], workouts: [], expenditure: null, verdict: null },
      "2026-10-05",
      { today: "2026-10-17", tz: "UTC" }
    );
    expect(r.hasData).toBe(true);
    expect(r.weight.missing).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(r.sleep.missing).toEqual(["2026-10-10", "2026-10-11"]);
    expect(r.food.unlogged).toEqual([]);
  });
});
