import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { buildWeekReport } from "@/lib/physique/weekReport";
import { howItsGoing, pulseWindows, trainedRecently } from "@/lib/physique/howItsGoing";
import { pulseChart, WAKE_DOT_RANGE_MIN, WEIGHT_MIN_SPAN_KG } from "@/lib/physique/pulseCharts";
import { splitValue } from "@/components/physique/PulseTile";

describe("Home tile charts (H2)", () => {
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
  const reports = (over: Partial<typeof inputs> = {}) => {
    const i = { ...inputs, ...over };
    const { recentStart, foodStart } = pulseWindows(now.today);
    return { recent: buildWeekReport(i, recentStart, now), food: buildWeekReport(i, foodStart, now), workouts: i.workouts };
  };

  it("draws every row a cut shows, from the same reports as its words", () => {
    const { recent, food, workouts } = reports();
    const rows = howItsGoing({ recent, food, trainedRecently: trainedRecently(workouts, now), strength: "holding", goalType: "lose", planRatePct: -0.6 });
    for (const r of rows) expect(pulseChart(r.id, { recent, food })).not.toBeNull();
  });

  it("draws calories against the food week's own target, one bar a day through yesterday", () => {
    const { recent, food } = reports();
    const c = pulseChart("calories", { recent, food });
    expect(c?.kind).toBe("bars");
    if (c?.kind !== "bars") return;
    expect(c.values).toHaveLength(7);
    expect(c.target).toBe(food.food.targetKcal);
    expect(food.days.at(-1)?.date).toBe(addDays(now.today, -1));
  });

  it("keeps a flat week flat: the weight line spans at least the minimum range", () => {
    const { recent, food } = reports();
    const w = pulseChart("rate", { recent, food });
    expect(w).toMatchObject({ kind: "line", minSpan: WEIGHT_MIN_SPAN_KG });
  });

  it("stays silent without data: no line from one point, no bars from no days", () => {
    const { recent, food } = reports({ weighIns: sc.weighIns.filter((w) => w.date === now.today), foodEntries: [], sleepNights: [], workouts: [] });
    expect(pulseChart("rate", { recent, food })).toBeNull();
    expect(pulseChart("calories", { recent, food })).toBeNull();
    expect(pulseChart("sleep", { recent, food })).toBeNull();
    expect(pulseChart("training", { recent, food })).toBeNull();
    expect(pulseChart("waist", { recent, food, waist: [{ date: now.today, cm: 84 }] })).toBeNull();
  });

  it("draws wake times around the week's mean and the waist from the last four weeks only", () => {
    const { recent, food } = reports();
    const d = pulseChart("wake", { recent, food });
    if (d?.kind === "dots") {
      const vals = d.values.filter((v): v is number => v != null);
      expect(Math.abs(vals.reduce((s, v) => s + v, 0) / vals.length)).toBeLessThan(1e-9);
      expect(d.range).toBe(WAKE_DOT_RANGE_MIN);
    }
    const waist = [
      { date: addDays(now.today, -40), cm: 90 },
      { date: addDays(now.today, -20), cm: 86 },
      { date: addDays(now.today, -2), cm: 85 },
    ];
    expect(pulseChart("waist", { recent, food, waist })).toMatchObject({ kind: "line", values: [86, 85] });
  });

  it("splits a tile's value into the number and its quieter unit", () => {
    expect(splitValue("2,121 a day")).toEqual({ main: "2,121", suffix: " a day" });
    expect(splitValue("7h 23m a night")).toEqual({ main: "7h 23m", suffix: " a night" });
    expect(splitValue("−0.62 %/wk")).toEqual({ main: "−0.62", suffix: " %/wk" });
    expect(splitValue("81.00 kg")).toEqual({ main: "81.00", suffix: " kg" });
    expect(splitValue("No sessions")).toEqual({ main: "No sessions", suffix: "" });
  });
});
