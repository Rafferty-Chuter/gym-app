import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { buildWeekReport, reportWeekStart, type WeekReport } from "@/lib/physique/weekReport";
import { coverageLine, INTAKE_ON_TARGET_KCAL, scorecard } from "@/lib/physique/weekScorecard";
import { bannedPhrasesIn } from "@/lib/physique/copy";

describe("weekly scorecard (W4)", () => {
  const sc = makeScenario({
    seed: 11,
    days: 42,
    preDays: 7,
    bodyweightKg: 85,
    trueTdeeKcal: 2800,
    intake: "toTarget",
    goal: { ratePctPerWeek: -0.6, targetKg: 78 },
    lifts: [{ name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 4, perWeek: 2, cv: 0.02 }],
    sleep: { meanH: 7.2, sdH: 0.3, source: "manual", loggedShare: 1 },
  });
  const now = { today: sc.today, tz: "UTC" };
  const inputs = { weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, workouts: sc.workouts, program: sc.program, goal: sc.goal, weightUnit: "kg" as const, expenditure: null };
  const start = addDays(reportWeekStart(sc.today), -7);
  const report = buildWeekReport(inputs, start, now);
  const prev = buildWeekReport(inputs, addDays(start, -7), now);

  it("gives six tiles in reading order, each with a value, a line and a link", () => {
    const tiles = scorecard({ report, prev, unit: "kg", goalType: "lose" });
    expect(tiles.map((t) => t.id)).toEqual(["weight", "calories", "protein", "training", "strength", "sleep"]);
    for (const t of tiles) {
      expect(t.value).not.toBe("");
      expect(t.sub.length).toBeGreaterThan(0);
      expect(t.href.startsWith("/")).toBe(true);
      expect(bannedPhrasesIn(`${t.value} ${t.sub} ${t.delta?.text ?? ""}`)).toEqual([]);
    }
  });

  it("tones weight by the goal's direction and calories by distance from the target", () => {
    const tiles = scorecard({ report, prev, unit: "kg", goalType: "lose" });
    const weight = tiles.find((t) => t.id === "weight")!;
    expect(weight.delta?.tone).toBe(report.weight.deltaKg! < 0 ? "good" : "watch");
    const gained = scorecard({ report, prev, unit: "kg", goalType: "gain" }).find((t) => t.id === "weight")!;
    expect(gained.delta?.tone).toBe(report.weight.deltaKg! > 0 ? "good" : "watch");
    const kcal = tiles.find((t) => t.id === "calories")!;
    expect(kcal.delta?.tone).toBe(Math.abs(report.food.deltaKcal!) <= INTAKE_ON_TARGET_KCAL ? "good" : "watch");
  });

  it("charts one value per day", () => {
    const tiles = scorecard({ report, prev, unit: "kg", goalType: "lose" });
    const kcal = tiles.find((t) => t.id === "calories")!;
    expect(kcal.chart.kind === "bars" && kcal.chart.values.length).toBe(7);
  });

  it("reads the main lifts from the strength engine, never its own week-on-week change (A1)", () => {
    const base = { baselineMissing: false, strOk: true, mainLifts: 2, liftsRead: 2 };
    const at = (strength: Parameters<typeof scorecard>[0]["strength"]) => scorecard({ report, prev, unit: "kg", goalType: "lose", strength }).find((t) => t.id === "strength")!;
    const rising = at({ ...base, status: "rising", lifts: [{ name: "Squat", changePct: 4 }, { name: "Bench Press", changePct: 1 }] });
    expect(rising).toMatchObject({ value: "Rising", sub: "e1RM since the phase began", href: "/exercises" });
    expect(rising.delta).toEqual({ text: "Squat +4%", tone: "good" });
    const oneDown = at({ ...base, status: "one-lift", lifts: [{ name: "Squat", changePct: -1 }, { name: "Bench Press", changePct: -8 }] });
    expect(oneDown.value).toBe("One down");
    expect(oneDown.delta).toEqual({ text: "Bench Press −8%", tone: "watch" });
    expect(at(null).value).toBe("–");
    expect(at({ ...base, status: "unclear", lifts: [] }).delta).toBeNull();
  });

  it("an empty week says so and stays neutral", () => {
    const empty: WeekReport = buildWeekReport({ ...inputs, weighIns: [], foodEntries: [], sleepNights: [], workouts: [] }, start, now);
    const tiles = scorecard({ report: empty, prev: null, unit: "kg", goalType: "lose" });
    expect(tiles.every((t) => t.delta == null || t.delta.tone === "neutral")).toBe(true);
    expect(tiles.find((t) => t.id === "weight")!.value).toBe("–");
    expect(coverageLine(empty)).toBe("0 of 7 days logged · 0 weigh-ins · 0 nights · 0 sessions");
  });
});
